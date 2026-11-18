import { Card, Screen, Txt } from '@/components/ui';

export default function Settings() {
  return (
    <Screen>
      <Card style={{ gap: 6 }}>
        <Txt size={18} bold>Splitty</Txt>
        <Txt sub>Split bills with friends. Free, no ads, no account.</Txt>
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
