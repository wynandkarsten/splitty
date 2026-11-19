import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform } from 'react-native';

import { Btn, Card, Chip, Field, Row, Screen, Txt } from '@/components/ui';
import { submitFeedback } from '@/lib/feedback';

export default function Feedback() {
  const [kind, setKind] = useState<'feature' | 'bug'>('feature');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ok = title.trim().length > 2 && !busy;

  const send = async () => {
    setBusy(true);
    setMsg(null);
    const r = await submitFeedback({ kind, title, details, version: Constants.expoConfig?.version ?? 'unknown', platform: Platform.OS });
    setBusy(false);
    if (r.ok) {
      setTitle('');
      setDetails('');
      setMsg({ ok: true, text: 'Thank you! Your suggestion was sent.' });
    } else {
      setMsg({ ok: false, text: r.error });
    }
  };

  return (
    <Screen>
      <Card style={{ gap: 10 }}>
        <Txt bold>Request a feature or report a bug</Txt>
        <Txt sub>
          Tell us what would make Splitty better. Only what you type here, the app version and your platform are sent. No
          account needed and no personal data is collected.
        </Txt>
        <Row>
          <Chip label="Feature" active={kind === 'feature'} onPress={() => setKind('feature')} />
          <Chip label="Bug" active={kind === 'bug'} onPress={() => setKind('bug')} />
        </Row>
        <Field label="Short title" value={title} onChangeText={setTitle} maxLength={120} />
        <Field label="Details" value={details} onChangeText={setDetails} multiline maxLength={2000} />
        <Btn label={busy ? 'Sending...' : 'Send'} onPress={send} disabled={!ok} />
        {msg ? <Txt bold={!msg.ok} sub={msg.ok}>{msg.text}</Txt> : null}
      </Card>
    </Screen>
  );
}
