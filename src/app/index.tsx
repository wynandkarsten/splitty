import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Btn, Card, Row, Screen, Txt } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { listGroups, type Group } from '@/lib/db';

type G = Group & { member_count: number; expense_count: number };

export default function Home() {
  const r = useRouter();
  const t = useTheme();
  const [groups, setGroups] = useState<G[]>([]);
  const [loaded, setLoaded] = useState(false);
  useFocusEffect(useCallback(() => {
    listGroups().then((g) => { setGroups(g); setLoaded(true); });
  }, []));
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size={22} bold>Your groups</Txt>
        <Pressable onPress={() => r.push('/settings')}><Txt color={t.primary} bold>Settings</Txt></Pressable>
      </Row>
      {loaded && groups.length === 0 && (
        <Card>
          <Txt bold>No groups yet</Txt>
          <Txt sub>Make a group for a trip, a flat or a dinner, add the people, then log what everyone paid. Everything stays on your phone.</Txt>
        </Card>
      )}
      {groups.map((g) => (
        <Card key={g.id} onPress={() => r.push(`/group/${g.id}`)}>
          <Txt size={18} bold>{g.name}</Txt>
          <View style={{ height: 4 }} />
          <Txt sub>{g.member_count} people · {g.expense_count} expenses · {g.currency}</Txt>
        </Card>
      ))}
      <Btn label="+ New group" onPress={() => r.push('/new-group')} />
    </Screen>
  );
}
