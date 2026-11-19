import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useTheme } from '@/constants/theme';
import { getDb, runRecurring } from '@/lib/db';

export default function Layout() {
  const t = useTheme();
  useEffect(() => {
    getDb().then(() => runRecurring()).catch((e) => console.warn('db init failed', e));
  }, []);
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="index" options={{ title: 'Splitty' }} />
        <Stack.Screen name="new-group" options={{ title: 'New group', presentation: 'modal' }} />
        <Stack.Screen name="group/[id]" options={{ title: 'Group' }} />
        <Stack.Screen name="expense" options={{ title: 'Expense', presentation: 'modal' }} />
        <Stack.Screen name="settle" options={{ title: 'Settle up', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="feedback" options={{ title: 'Request a feature' }} />
      </Stack>
    </>
  );
}
