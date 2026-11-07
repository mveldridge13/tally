import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, type ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { brand, radius, space, useColors } from '@/theme';
import { usePendingInvite } from '@/lib/pending-invite';
import { Notice, Text } from './ui';

/**
 * The Tally mark: four hand-drawn strokes crossed by a red fifth.
 * Paths are shared with scripts/generate-icons.mjs, which renders the app icon and splash.
 */
const MARK_STROKES = [
  { d: 'M29 21.5 C 27.6 40, 30.2 58, 28.6 79', w: 7.4 },
  { d: 'M43 19.5 C 44.6 38, 41.8 60, 43.4 80.5', w: 6.8 },
  { d: 'M57.2 22 C 55.6 40, 58.2 59, 56.6 79', w: 7.2 },
  { d: 'M71 20.5 C 72.2 39, 69.8 58, 71.4 80', w: 6.6 },
];
const MARK_SLASH = {
  d: 'M15 70.5 C 33 61.5, 51 50.5, 65 41.5 S 80.5 31.5, 87 29',
  w: 7.8,
};

export function TallyMark({
  size = 48,
  color = brand.accent,
  slashColor = brand.slash,
}: {
  size?: number;
  color?: string;
  slashColor?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Tally">
      {MARK_STROKES.map((s) => (
        <Path key={s.d} d={s.d} stroke={color} strokeWidth={s.w} strokeLinecap="round" fill="none" />
      ))}
      <Path d={MARK_SLASH.d} stroke={slashColor} strokeWidth={MARK_SLASH.w} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Logo lock-up: mark + wordmark, written in lower case with a full stop ("tally."). */
export function Wordmark({ size = 28, color = brand.onDeep, markColor }: { size?: number; color?: string; markColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <TallyMark size={size * 1.25} color={markColor} />
      <Text
        style={{
          fontSize: size,
          fontWeight: '800',
          letterSpacing: -0.5,
          color,
        }}
        accessibilityLabel="Tally">
        tally.
      </Text>
    </View>
  );
}

/** White status-bar icons while a navy screen (sign in, welcome) is in front. */
export function useLightStatusBar() {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
    }, []),
  );
}

/** Soft decorative circles for navy hero areas. */
export function HeroGlow({ color = brand.accent, strength = 1 }: { color?: string; strength?: number } = {}) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute',
          width: 320,
          height: 320,
          borderRadius: 160,
          backgroundColor: color,
          opacity: 0.1 * strength,
          top: -120,
          right: -100,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: color,
          opacity: 0.07 * strength,
          top: 140,
          left: -120,
        }}
      />
    </View>
  );
}

/**
 * Layout for sign-in screens: navy header with logo and title,
 * then a light rounded sheet holding the form.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const c = useColors();
  const pendingInvite = usePendingInvite((state) => state.token);
  const insets = useSafeAreaInsets();
  // While typing, collapse the header to just the title so the form has room above the keyboard.
  const typing = useKeyboardState((state) => state.isVisible);
  useLightStatusBar();
  return (
    <View style={{ flex: 1, backgroundColor: brand.deep }}>
      <HeroGlow />
      <View
        style={{
          paddingTop: insets.top + (typing ? space.md : space.xl),
          paddingHorizontal: space.xl,
          paddingBottom: typing ? space.xl + space.sm : space.xxl + space.lg,
          gap: space.lg,
        }}>
        {typing ? null : <TallyMark size={56} />}
        <View style={{ gap: space.xs }}>
          <Text variant={typing ? 'title' : 'display'} color={brand.onDeep}>
            {title}
          </Text>
          {typing ? null : (
            <Text variant="body" color="rgba(255,255,255,0.75)">
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        bottomOffset={space.xl}
        style={{
          flex: 1,
          backgroundColor: c.bg,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          marginTop: -space.lg,
        }}
        contentContainerStyle={{
          padding: space.xl,
          paddingBottom: insets.bottom + space.xl,
          gap: space.lg,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled">
        {pendingInvite ? (
          <Notice tone="info">You’ve been invited to a group. Create an account or log in and you’ll be added straight away.</Notice>
        ) : null}
        {children}
        {footer ? (
          <View
            style={{
              marginTop: 'auto',
              paddingTop: space.lg,
              alignItems: 'center',
            }}>
            {footer}
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}
