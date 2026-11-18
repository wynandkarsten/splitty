import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';

import { Btn, Card, Chip, Field, Row, Screen, Txt, Wrap } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { CATEGORIES, CURRENCIES } from '@/lib/categories';
import {
  deleteExpense, getExpense, getGroup, listMembers, saveExpense, type Group, type Member,
} from '@/lib/db';
import { deleteReceiptFile, pickReceipt, scanReceipt } from '@/lib/receipts';
import type { Recurrence } from '@/lib/recurring';
import {
  convertCents, distribute, formatMoney, parseMoney, splitEqual, splitExact, splitItemised, splitPercent, splitShares,
  type Item, type Shares, type SplitType,
} from '@/lib/split';

type ItemDraft = { name: string; price: string; memberIds: string[] };
const TYPES: { id: SplitType; label: string }[] = [
  { id: 'equal', label: 'Equally' }, { id: 'exact', label: 'Exact' }, { id: 'percent', label: '%' },
  { id: 'shares', label: 'Shares' }, { id: 'itemised', label: 'Itemised' },
];
const RECS: Recurrence[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

export default function ExpenseScreen() {
  const { groupId, id } = useLocalSearchParams<{ groupId: string; id?: string }>();
  const r = useRouter();
  const t = useTheme();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('ZAR');
  const [rate, setRate] = useState('1');
  const [paidBy, setPaidBy] = useState('');
  const [category, setCategory] = useState('general');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [rec, setRec] = useState<Recurrence>('none');
  const [type, setType] = useState<SplitType>('equal');
  const [included, setIncluded] = useState<string[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ItemDraft[]>([{ name: '', price: '', memberIds: [] }]);
  const [extras, setExtras] = useState('');
  const [receipts, setReceipts] = useState<string[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const g = await getGroup(groupId);
      const m = await listMembers(groupId);
      setGroup(g); setMembers(m);
      setCurrency(g?.currency ?? 'ZAR');
      setPaidBy(m[0]?.id ?? '');
      setIncluded(m.map((x) => x.id));
      if (id) {
        const e = await getExpense(id);
        if (e) {
          const row = e.row;
          setTitle(row.title); setAmount((row.amount_cents / 100).toFixed(2)); setCurrency(row.currency);
          setRate(String(row.rate)); setPaidBy(row.paid_by); setCategory(row.category); setDate(row.date);
          setNote(row.note); setRec(row.recurrence); setType(row.split_type);
          setIncluded(Object.keys(e.shares));
          setVals(Object.fromEntries(Object.entries(e.shares).map(([k, v]) => [k, (v / 100).toFixed(2)])));
          if (e.items.length) setItems(e.items.map((i) => ({ name: i.name, price: (i.priceCents / 100).toFixed(2), memberIds: i.memberIds })));
          setReceipts(e.receipts.map((x) => x.uri));
          // exact/percent/shares original inputs are not stored; show amounts as exact on edit
          if (row.split_type === 'percent' || row.split_type === 'shares') setType('exact');
        }
      }
    })();
  }, [groupId, id]);

  const foreign = !!group && currency !== group.currency;
  const rateNum = foreign ? Number(rate.replace(',', '.')) : 1;

  const calc = useMemo(() => {
    const ids = included.length ? included : members.map((m) => m.id);
    try {
      let origTotal: number;
      let shares: Shares;
      let itemList: Item[] | undefined;
      if (type === 'itemised') {
        itemList = items.filter((i) => i.name.trim() || i.price.trim()).map((i) => ({
          name: i.name.trim() || 'Item', priceCents: parseMoney(i.price) ?? NaN, memberIds: i.memberIds,
        }));
        if (itemList.some((i) => Number.isNaN(i.priceCents))) throw new Error('Check item prices');
        const ex = extras.trim() ? parseMoney(extras) : 0;
        if (ex === null) throw new Error('Check tax/tip amount');
        const s = splitItemised(itemList, ex, members.map((m) => m.id));
        origTotal = s.total;
        if (origTotal <= 0) throw new Error('Add at least one item');
        if (!(rateNum > 0)) throw new Error('Exchange rate must be above 0');
        const groupTotal = convertCents(origTotal, rateNum);
        shares = distribute(groupTotal, s.shares);
        return { ok: true as const, origTotal, groupTotal, shares, itemList };
      }
      const a = parseMoney(amount);
      if (a === null || a <= 0) throw new Error('Enter an amount');
      origTotal = a;
      if (!(rateNum > 0)) throw new Error('Exchange rate must be above 0');
      const groupTotal = convertCents(a, rateNum);
      if (ids.length === 0) throw new Error('Pick who shares it');
      if (type === 'equal') shares = splitEqual(groupTotal, ids);
      else if (type === 'shares') {
        const w: Record<string, number> = {};
        for (const i of ids) w[i] = Number(vals[i]?.replace(',', '.') || 1);
        shares = splitShares(groupTotal, w);
      } else if (type === 'percent') {
        const w: Record<string, number> = {};
        for (const i of ids) w[i] = Number(vals[i]?.replace(',', '.') || 0);
        shares = splitPercent(groupTotal, w);
      } else {
        const amounts: Shares = {};
        for (const i of ids) {
          const c = vals[i]?.trim() ? parseMoney(vals[i]) : 0;
          if (c === null) throw new Error('Check the amounts');
          amounts[i] = c;
        }
        // exact amounts are typed in the expense currency; scale to group currency
        const sum = Object.values(amounts).reduce((x, y) => x + y, 0);
        if (sum !== a) throw new Error(`Amounts add to ${formatMoney(sum, currency)}, need ${formatMoney(a, currency)}`);
        shares = foreign ? distribute(groupTotal, amounts) : splitExact(groupTotal, amounts);
      }
      return { ok: true as const, origTotal, groupTotal, shares, itemList: undefined };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [type, included, members, items, extras, amount, vals, rateNum, foreign, currency]);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function addReceipt(kind: 'scan' | 'pick') {
    const uri = kind === 'scan' ? await scanReceipt() : await pickReceipt();
    if (uri) setReceipts((x) => [...x, uri]);
    else if (kind === 'scan') setErr('Camera permission denied or cancelled');
  }

  async function save() {
    if (!title.trim()) return setErr('Give it a title');
    if (!calc.ok) return setErr(calc.error);
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return setErr('Date must be YYYY-MM-DD');
    setErr('');
    await saveExpense({
      groupId, title, amountCents: calc.origTotal, currency, rate: rateNum, paidBy, category, note, date,
      splitType: type, shares: calc.shares, items: calc.itemList, recurrence: rec, receiptUris: receipts,
    }, id);
    r.back();
  }

  if (!group) return <Screen><Txt sub>Loading…</Txt></Screen>;
  const ids = included;

  return (
    <Screen>
      <Field label="What was it for?" value={title} onChangeText={setTitle} placeholder="Dinner at Kloof Street" />
      {type !== 'itemised' ? (
        <Field label={`Amount (${currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
      ) : (
        <Card><Txt sub>Total from items: {calc.ok ? formatMoney(calc.origTotal, currency) : '—'}</Txt></Card>
      )}
      <Wrap>{[group.currency, ...CURRENCIES.filter((c) => c !== group.currency)].map((c) =>
        <Chip key={c} label={c} active={c === currency} onPress={() => setCurrency(c)} />)}</Wrap>
      {foreign && (
        <Field label={`Exchange rate: 1 ${currency} = ? ${group.currency}`} value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
      )}

      <Txt size={13} sub bold>Paid by</Txt>
      <Wrap>{members.map((m) => <Chip key={m.id} label={m.name} active={m.id === paidBy} onPress={() => setPaidBy(m.id)} />)}</Wrap>

      <Txt size={13} sub bold>Split</Txt>
      <Wrap>{TYPES.map((x) => <Chip key={x.id} label={x.label} active={x.id === type} onPress={() => setType(x.id)} />)}</Wrap>

      {type !== 'itemised' && (
        <Card style={{ gap: 8 }}>
          {members.map((m) => {
            const on = ids.includes(m.id);
            return (
              <Row key={m.id} style={{ justifyContent: 'space-between' }}>
                <Pressable onPress={() => setIncluded((l) => toggle(l, m.id))} style={{ flex: 1 }}>
                  <Txt bold={on} sub={!on}>{on ? '☑' : '☐'} {m.name}</Txt>
                </Pressable>
                {on && type !== 'equal' && (
                  <Field style={{ width: 100, paddingVertical: 6 }} value={vals[m.id] ?? ''} keyboardType="decimal-pad"
                    placeholder={type === 'percent' ? '%' : type === 'shares' ? '1' : '0.00'}
                    onChangeText={(v) => setVals((o) => ({ ...o, [m.id]: v }))} />
                )}
                {on && type === 'equal' && calc.ok && <Txt sub>{formatMoney(calc.shares[m.id] ?? 0, group.currency)}</Txt>}
              </Row>
            );
          })}
        </Card>
      )}

      {type === 'itemised' && (
        <View style={{ gap: 10 }}>
          {items.map((it, idx) => (
            <Card key={idx} style={{ gap: 8 }}>
              <Row>
                <Field style={{ flex: 1 }} value={it.name} placeholder="Item" onChangeText={(v) => setItems((a) => a.map((x, j) => j === idx ? { ...x, name: v } : x))} />
                <Field style={{ width: 90 }} value={it.price} placeholder="0.00" keyboardType="decimal-pad" onChangeText={(v) => setItems((a) => a.map((x, j) => j === idx ? { ...x, price: v } : x))} />
              </Row>
              <Txt size={12} sub>Shared by (none selected = everyone)</Txt>
              <Wrap>{members.map((m) => (
                <Chip key={m.id} label={m.name} active={it.memberIds.includes(m.id)}
                  onPress={() => setItems((a) => a.map((x, j) => j === idx ? { ...x, memberIds: toggle(x.memberIds, m.id) } : x))} />
              ))}</Wrap>
              {items.length > 1 && <Btn kind="ghost" label="Remove item" onPress={() => setItems((a) => a.filter((_, j) => j !== idx))} />}
            </Card>
          ))}
          <Btn kind="ghost" label="+ Add item" onPress={() => setItems((a) => [...a, { name: '', price: '', memberIds: [] }])} />
          <Field label="Tax / tip (shared in proportion)" value={extras} onChangeText={setExtras} keyboardType="decimal-pad" placeholder="0.00" />
        </View>
      )}

      {!calc.ok && <Txt size={13} color={t.sub}>{calc.error}</Txt>}

      <Txt size={13} sub bold>Category</Txt>
      <Wrap>{CATEGORIES.map((c) => <Chip key={c.id} label={`${c.icon} ${c.label}`} active={c.id === category} onPress={() => setCategory(c.id)} />)}</Wrap>

      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <Txt size={13} sub bold>Repeats</Txt>
      <Wrap>{RECS.map((x) => <Chip key={x} label={x === 'none' ? 'Never' : x} active={x === rec} onPress={() => setRec(x)} />)}</Wrap>
      <Field label="Note" value={note} onChangeText={setNote} multiline />

      <Txt size={13} sub bold>Receipts</Txt>
      <Wrap>
        {receipts.map((u, i) => (
          <Pressable key={u + i} onLongPress={() => Alert.alert('Remove receipt?', undefined, [
            { text: 'Cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => { deleteReceiptFile(u); setReceipts((x) => x.filter((_, j) => j !== i)); } },
          ])}>
            <Image source={{ uri: u }} style={{ width: 84, height: 112, borderRadius: 8, backgroundColor: t.chip }} />
          </Pressable>
        ))}
      </Wrap>
      {receipts.length > 0 && <Txt size={12} sub>Long-press a receipt to remove it.</Txt>}
      <Row>
        <Btn kind="ghost" label="📷 Scan" onPress={() => addReceipt('scan')} style={{ flex: 1 }} />
        <Btn kind="ghost" label="🖼 From gallery" onPress={() => addReceipt('pick')} style={{ flex: 1 }} />
      </Row>

      {!!err && <Txt color={t.danger}>{err}</Txt>}
      <Btn label={id ? 'Save changes' : 'Add expense'} onPress={save} />
      {id && (
        <Btn kind="danger" label="Delete expense" onPress={() => Alert.alert('Delete this expense?', undefined, [
          { text: 'Cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => { await deleteExpense(id); r.back(); } },
        ])} />
      )}
    </Screen>
  );
}
