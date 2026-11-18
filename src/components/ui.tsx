import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps,
  type TextStyle, View, type ViewStyle,
} from 'react-native';

import { useTheme } from '@/constants/theme';

export function Screen({ children, scroll = true, pad = true }: { children: ReactNode; scroll?: boolean; pad?: boolean }) {
  const t = useTheme();
  const inner = pad ? { padding: 16, paddingBottom: 96, gap: 12 } : undefined;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {scroll ? (
        <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </KeyboardAvoidingView>
  );
}

export function Txt({ children, style, size = 16, bold, sub, color, numberOfLines }: {
  children: ReactNode; style?: TextStyle; size?: number; bold?: boolean; sub?: boolean; color?: string; numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: color ?? (sub ? t.sub : t.text), fontSize: size, fontWeight: bold ? '700' : '400' }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const t = useTheme();
  const s: ViewStyle = { backgroundColor: t.card, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line };
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s, style, pressed && { opacity: 0.7 }]}>{children}</Pressable>;
  return <View style={[s, style]}>{children}</View>;
}

export function Btn({ label, onPress, kind = 'primary', disabled, style }: {
  label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.primary : kind === 'danger' ? t.danger : t.chip;
  const fg = kind === 'ghost' ? t.text : kind === 'danger' ? '#fff' : t.onPrimary;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={({ pressed }) => [{ backgroundColor: bg, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }, style]}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 4 }}>
      {label ? <Txt size={13} sub bold>{label}</Txt> : null}
      <TextInput placeholderTextColor={t.sub} {...rest}
        style={[{ backgroundColor: t.card, color: t.text, borderRadius: 10, borderWidth: 1, borderColor: t.line, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 }, style]} />
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: active ? t.primary : t.chip }}>
      <Text style={{ color: active ? t.onPrimary : t.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}
export function Wrap({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}
