import { useState, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';

import { brand, PRESS_DELAY, radius, space, type, useColors } from '@/theme';

type Variant = keyof typeof type;

export function Text({
  variant = 'body',
  muted,
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const c = useColors();
  return <RNText style={[type[variant], { color: color ?? (muted ? c.textMuted : c.text) }, style]} {...rest} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
          padding: space.lg,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/** Initial in a circle (people) or rounded square (groups). Pass `color` for a solid tinted avatar. */
export function Avatar({ name, size = 40, color, square }: { name: string; size?: number; color?: string; square?: boolean }) {
  const c = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: square ? size * 0.3 : size / 2,
        backgroundColor: color ?? c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text variant="label" color={color ? brand.onDeep : c.text} style={{ fontSize: size * 0.42, fontWeight: '700' }}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'accent' | 'outlineLight';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  size = 'regular',
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  /** 'small': a compact pill for secondary actions that sit side by side. */
  size?: 'regular' | 'small';
}) {
  const small = size === 'small';
  const c = useColors();
  const styles: Record<ButtonKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.primary, fg: c.onPrimary },
    secondary: { bg: c.surfaceAlt, fg: c.text },
    accent: { bg: brand.accent, fg: brand.onAccent },
    outlineLight: {
      bg: 'transparent',
      fg: brand.onDeep,
      border: 'rgba(255,255,255,0.45)',
    },
  };
  const k = styles[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      android_ripple={{
        color: kind === 'outlineLight' ? 'rgba(255,255,255,0.15)' : c.surfaceAlt,
        foreground: true,
      }}
      unstable_pressDelay={PRESS_DELAY}
      style={{
        backgroundColor: k.bg,
        borderWidth: k.border ? 1.5 : 0,
        borderColor: k.border,
        opacity: disabled && !loading ? 0.5 : 1,
        borderRadius: radius.pill,
        minHeight: small ? 40 : 54,
        paddingHorizontal: small ? space.lg : space.xl,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: space.sm,
        overflow: 'hidden',
      }}>
      {loading ? <ActivityIndicator color={k.fg} size={small ? 'small' : undefined} /> : null}
      <Text variant={small ? 'label' : 'heading'} color={k.fg}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Text-only button, e.g. "Forgot password?". */
export function LinkButton({ label, onPress, color }: { label: string; onPress: () => void; color?: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={12} style={{ alignSelf: 'center', paddingVertical: space.xs }}>
      <Text variant="label" color={color ?? c.focus}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingVertical: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? c.primary : c.border,
        backgroundColor: selected ? c.primary : c.surface,
      }}>
      <Text variant="label" color={selected ? c.onPrimary : c.text}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

/** Labelled text input used across forms. Highlights on focus; password fields get a Show/Hide toggle. */
export function Field({
  label,
  error,
  hint,
  style,
  secureTextEntry,
  onFocus,
  onBlur,
  ref,
  ...rest
}: TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<TextInputInstance>;
}) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? c.danger : focused ? c.focus : c.border;
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: c.surface,
          borderRadius: radius.md,
          borderWidth: focused || error ? 2 : 1,
          borderColor,
          paddingHorizontal: focused || error ? space.lg - 1 : space.lg,
          minHeight: 54,
        }}>
        <TextInput
          ref={ref}
          placeholderTextColor={c.textMuted}
          selectionColor={c.focus}
          cursorColor={c.focus}
          secureTextEntry={secureTextEntry && !revealed}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[{ ...type.body, color: c.text, flex: 1, paddingVertical: space.md }, style]}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed((r) => !r)}
            hitSlop={10}>
            <Text variant="label" color={c.focus}>
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color={c.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Inline message box for form errors and notices. */
export function Notice({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) {
  const c = useColors();
  const error = tone === 'error';
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: error ? 'rgba(184,67,58,0.08)' : c.surfaceAlt,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: error ? 'rgba(184,67,58,0.3)' : c.border,
        padding: space.md,
      }}>
      <Text variant="label" color={error ? c.danger : c.text}>
        {children}
      </Text>
    </View>
  );
}
