import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { Btn, Card, Screen, Txt } from '@/components/ui';
import { checkForUpdate } from '@/lib/updates';

const APK = 'https://tenkodigital.com/splitty/downloads/splitty.apk';

export default function Settings() {
  const router = useRouter();
  const current = Constants.expoConfig?.version ?? '0.0.0';
  const [msg, setMsg] = useState('');
  const [apk, setApk] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    setApk(false);
    const r = await checkForUpdate(current);
    setBusy(false);
    if (r.status === 'error') setMsg(r.message);
    else if (r.status === 'current') setMsg(`You are up to date (version ${current}).`);
    else {
      setMsg(`Version ${r.latest.version} is available.${r.latest.notes ? ' ' + r.latest.notes : ''}`);
      setApk(true);
    }
  };

  return (
    <Screen>
      <Card style={{ gap: 6 }}>
        <Txt size={18} bold>Splitty</Txt>
        <Txt sub>Split bills with friends. Free, no ads, no account.</Txt>
      </Card>
      <Card style={{ gap: 8 }}>
        <Txt bold>Version {current}</Txt>
        <Btn label={busy ? 'Checking...' : 'Check for updates'} kind="ghost" onPress={check} disabled={busy} />
        {msg ? <Txt sub>{msg}</Txt> : null}
        {apk && Platform.OS === 'android' ? <Btn label="Download update" onPress={() => Linking.openURL(APK)} /> : null}
        {apk && Platform.OS === 'web' ? <Txt sub>Reload the page to get the new version.</Txt> : null}
        <Txt sub>Updates are never forced. You decide when to install.</Txt>
      </Card>
      <Card style={{ gap: 8 }}>
        <Txt bold>Ideas and bugs</Txt>
        <Btn label="Request a feature" kind="ghost" onPress={() => router.push('/feedback')} />
      </Card>
      <Card style={{ gap: 6 }}>
        <Txt bold>Your data stays on your device</Txt>
        <Txt sub>
          Groups, expenses and receipt photos are stored locally in a SQLite database on this phone. Nothing is uploaded
          and nothing is tracked. Uninstalling the app removes the data, so export a CSV from a group first if you want a copy.
        </Txt>
      </Card>
      <Card style={{ gap: 6 }}>
        <Txt bold>Permissions</Txt>
        <Txt sub>Camera, to scan receipts. Photos, to attach an existing receipt image. Both are optional.</Txt>
      </Card>
      <Card style={{ gap: 6 }}>
        <Txt bold>Currencies</Txt>
        <Txt sub>Enter the exchange rate yourself when an expense is in a different currency from the group.</Txt>
      </Card>
    </Screen>
  );
}
