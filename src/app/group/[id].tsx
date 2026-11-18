import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { Btn, Card, Field, Row, Screen, Txt } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { catIcon } from '@/lib/categories';
import {
  addMember, deleteGroup, getGroup, groupBalances, listExpenses, setArchived, type ExpenseRow, type Group, type Member,
} from '@/lib/db';
import { formatMoney, type Shares, type Transfer } from '@/lib/split';

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRouter();
  const t = useTheme();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [net, setNet] = useState<Shares>({});
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    const g = await getGroup(id);
    setGroup(g);
    setExpenses(await listExpenses(id));
    const b = await groupBalances(id);
    setMembers(b.members); setNet(b.net); setTransfers(b.transfers);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const name = (mid: string) => members.find((m) => m.id === mid)?.name ?? '?';
  if (!group) return <Screen><Txt sub>Loading…</Txt></Screen>;
  const cur = group.currency;

  async function exportCsv() {
    const rows = [['Date', 'Title', 'Category', 'Paid by', 'Amount', 'Currency', 'Group amount', 'Settlement']];
    for (const e of expenses) {
      rows.push([e.date, e.title, e.category, name(e.paid_by), (e.amount_cents / 100).toFixed(2), e.currency,
        (e.group_cents / 100).toFixed(2), e.is_settlement ? 'yes' : 'no']);
    }
    const csv = rows.map((x) => x.map(csvCell).join(',')).join('\n');
    const fname = `${group!.name.replace(/[^\w-]+/g, '_')}.csv`;
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = fname; a.click();
      return;
    }
    const f = new File(Paths.cache, fname);
    if (f.exists) f.delete();
    f.create(); f.write(csv);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'text/csv' });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: group.name }} />
      <Card style={{ gap: 6 }}>
        <Txt size={13} sub bold>Balances</Txt>
        {members.map((m) => {
          const v = net[m.id] ?? 0;
          return (
            <Row key={m.id} style={{ justifyContent: 'space-between' }}>
              <Txt>{m.name}</Txt>
              <Txt bold color={v > 0 ? t.pos : v < 0 ? t.neg : t.sub}>
                {v === 0 ? 'settled' : v > 0 ? `gets ${formatMoney(v, cur)}` : `owes ${formatMoney(-v, cur)}`}
              </Txt>
            </Row>
          );
        })}
      </Card>

      {transfers.length > 0 && (
        <Card style={{ gap: 8 }}>
          <Txt size={13} sub bold>Settle up</Txt>
          {transfers.map((x, i) => (
            <Row key={i} style={{ justifyContent: 'space-between' }}>
              <Txt style={{ flex: 1 }}>{name(x.from)} → {name(x.to)}</Txt>
              <Txt bold>{formatMoney(x.cents, cur)}</Txt>
              <Btn kind="ghost" label="Pay" style={{ paddingVertical: 6 }} onPress={() => r.push({
                pathname: '/settle',
                params: { groupId: id, from: x.from, to: x.to, cents: String(x.cents), fromName: name(x.from), toName: name(x.to), currency: cur },
              })} />
            </Row>
          ))}
        </Card>
      )}

      <Btn label="+ Add expense" onPress={() => r.push({ pathname: '/expense', params: { groupId: id } })} />

      <Txt size={13} sub bold>Expenses ({expenses.length})</Txt>
      {expenses.length === 0 && <Txt sub>Nothing yet. Add the first one.</Txt>}
      {expenses.map((e) => (
        <Card key={e.id} onPress={() => !e.is_settlement && r.push({ pathname: '/expense', params: { groupId: id, id: e.id } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt style={{ flex: 1 }} bold numberOfLines={1}>{e.is_settlement ? '🤝' : catIcon(e.category)} {e.title}</Txt>
            <Txt bold>{formatMoney(e.amount_cents, e.currency)}</Txt>
          </Row>
          <Txt size={13} sub>{e.date} · paid by {name(e.paid_by)}{e.recurrence !== 'none' ? ` · repeats ${e.recurrence}` : ''}</Txt>
        </Card>
      ))}

      <Txt size={13} sub bold>Add a person</Txt>
      <Row>
        <Field style={{ flex: 1 }} value={newName} onChangeText={setNewName} placeholder="Name" />
        <Btn kind="ghost" label="Add" onPress={async () => {
          if (!newName.trim()) return;
          await addMember(id, newName.trim()); setNewName(''); load();
        }} />
      </Row>

      <Btn kind="ghost" label="Export CSV" onPress={exportCsv} />
      <Btn kind="ghost" label={group.archived ? 'Unarchive group' : 'Archive group'} onPress={async () => { await setArchived(id, !group.archived); r.back(); }} />
      <Btn kind="danger" label="Delete group" onPress={() => Alert.alert('Delete this group and all its expenses?', 'This cannot be undone.', [
        { text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteGroup(id); r.back(); } },
      ])} />
    </Screen>
  );
}
