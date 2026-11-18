import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Btn, Chip, Field, Row, Screen, Txt, Wrap } from '@/components/ui';
import { CURRENCIES } from '@/lib/categories';
import { createGroup } from '@/lib/db';

export default function NewGroup() {
  const r = useRouter();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('ZAR');
  const [members, setMembers] = useState<string[]>(['', '']);
  const valid = name.trim().length > 0 && members.filter((m) => m.trim()).length >= 1;
  return (
    <Screen>
      <Field label="Group name" value={name} onChangeText={setName} placeholder="Cape Town trip" />
      <Txt size={13} sub bold>Currency</Txt>
      <Wrap>{CURRENCIES.map((c) => <Chip key={c} label={c} active={c === currency} onPress={() => setCurrency(c)} />)}</Wrap>
      <Txt size={13} sub bold>People (include yourself)</Txt>
      {members.map((m, i) => (
        <Field key={i} value={m} placeholder={`Person ${i + 1}`}
          onChangeText={(v) => setMembers((arr) => arr.map((x, j) => (j === i ? v : x)))} />
      ))}
      <Row>
        <Btn kind="ghost" label="+ Add person" onPress={() => setMembers((a) => [...a, ''])} style={{ flex: 1 }} />
        <Btn label="Create" disabled={!valid} style={{ flex: 1 }} onPress={async () => {
          const id = await createGroup(name, currency, members);
          r.replace(`/group/${id}`);
        }} />
      </Row>
    </Screen>
  );
}
