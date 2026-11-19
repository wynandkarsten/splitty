import Constants from 'expo-constants';
import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { Btn, Card, Chip, Field, Row, Screen, Txt } from '@/components/ui';
import { featureRequestUrl } from '@/lib/feedback';

export default function Feedback() {
  const [kind, setKind] = useState<'feature' | 'bug'>('feature');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const ok = title.trim().length > 2;

  const send = () =>
    Linking.openURL(
      featureRequestUrl({ title, details, kind, version: Constants.expoConfig?.version ?? 'unknown', platform: Platform.OS }),
    );

  return (
    <Screen>
      <Card style={{ gap: 10 }}>
        <Txt bold>Request a feature or report a bug</Txt>
        <Txt sub>
          This opens a pre-filled issue on GitHub (a free GitHub account is needed to submit it). Nothing is sent from the app
          itself, and no personal data is included, only the app version and platform.
        </Txt>
        <Row>
          <Chip label="Feature" active={kind === 'feature'} onPress={() => setKind('feature')} />
          <Chip label="Bug" active={kind === 'bug'} onPress={() => setKind('bug')} />
        </Row>
        <Field label="Short title" value={title} onChangeText={setTitle} />
        <Field label="Details" value={details} onChangeText={setDetails} multiline />
        <Btn label="Open on GitHub" onPress={send} disabled={!ok} />
      </Card>
    </Screen>
  );
}
