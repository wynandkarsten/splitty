import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { Btn, Card, Field, Screen, Txt } from '@/components/ui';
import { getGroup, saveExpense } from '@/lib/db';
import { formatMoney, parseMoney } from '@/lib/split';

export default function Settle() {
  const { groupId, from, to, cents, fromName, toName, currency } =
    useLocalSearchParams<{ groupId: string; from: string; to: string; cents: string; fromName: string; toName: string; currency: string }>();
  const r = useRouter();
  const [amt, setAmt] = useState((Number(cents) / 100).toFixed(2));
  const parsed = parseMoney(amt);
  return (
    <Screen>
      <Card>
        <Txt size={18} bold>{fromName} pays {toName}</Txt>
        <Txt sub>Suggested: {formatMoney(Number(cents), currency)}</Txt>
      </Card>
      <Field label="Amount paid" value={amt} onChangeText={setAmt} keyboardType="decimal-pad" />
      <Btn label="Record payment" disabled={!parsed || parsed <= 0} onPress={async () => {
        const g = await getGroup(groupId);
        await saveExpense({
          groupId, title: `Payment: ${fromName} → ${toName}`, amountCents: parsed as number, currency: g?.currency ?? currency, rate: 1,
          paidBy: from, category: 'general', note: '', date: new Date().toISOString().slice(0, 10), splitType: 'exact',
          shares: { [to]: parsed as number }, isSettlement: true,
        });
        r.back();
      }} />
    </Screen>
  );
}
