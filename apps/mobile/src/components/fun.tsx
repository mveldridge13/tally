/**
 * The playful bits shared by Home, New group, a group and Pay back: buttons that bounce, a small
 * buzz on important taps, totals that count up, confetti, the 💸 moving between two people, and
 * slide-to-settle. Everything respects the phone's "reduce motion" setting.
 */
import { formatMoney } from '@tally/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated as RNAnimated,
  Pressable,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { brand, groupColor, radius, space, useColors } from '@/theme';
import { Avatar, Text } from './ui';

// Loaded defensively: a phone running an older build without the haptics module just doesn't buzz.
let Haptics: typeof import('expo-haptics') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}

/** A light tap for selections; a stronger pattern for finishing something (created, settled). */
export const buzz = {
  tap: () => void Haptics?.selectionAsync().catch(() => {}),
  nudge: () => void Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  success: () => void Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
};

/** A Pressable that springs down a little when pressed and bounces back. */
export function Bouncy({
  style,
  children,
  onPressIn,
  onPressOut,
  scaleTo = 0.95,
  grow,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  scaleTo?: number;
  /** Fill the space in a row or column (flex: 1), e.g. tiles side by side. */
  grow?: boolean;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      {...rest}
      style={grow ? { flex: 1 } : undefined}
      onPressIn={(e) => {
        scale.set(withTiming(scaleTo, { duration: 80 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 9, stiffness: 260 }));
        onPressOut?.(e);
      }}>
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Money that counts up from zero when it first appears (and to new values when it changes). */
export function CountUp({ cents, currency, style }: { cents: number; currency: string; style?: StyleProp<TextStyle> }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce) return;
    const start = Date.now();
    const begin = from.current;
    let frame = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - start) / 900);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(begin + (cents - begin) * eased);
      setShown(v);
      from.current = v;
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [cents, reduce]);
  return <Text style={style}>{formatMoney(reduce ? cents : shown, currency)}</Text>;
}

const CONFETTI_COLORS = [brand.coral, brand.coralWarm, brand.accent, brand.deep, brand.slash, '#F6C9A8', '#B9A6E0'];

function Piece({ index, width, height }: { index: number; width: number; height: number }) {
  const p = useMemo(() => {
    const r = (n: number) => ((Math.sin(index * 9301 + n * 49297) + 1) / 2) % 1;
    return {
      x: width / 2 + (r(1) - 0.5) * 80,
      dx: (r(2) - 0.5) * width * 1.1,
      up: 120 + r(3) * 220,
      w: 7 + r(4) * 6,
      h: 5 + r(5) * 4,
      spin: (r(6) - 0.5) * 1440,
      delay: r(7) * 120,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length]!,
    };
  }, [index, width]);
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(p.delay, withTiming(1, { duration: 2400, easing: Easing.linear })));
  }, [p.delay, t]);
  const style = useAnimatedStyle(() => {
    const v = t.get();
    // Up fast, then fall under "gravity": y = -up·4t(1−t) + fall·t²
    const y = height * 0.3 - p.up * 4 * v * (1 - v) + height * 0.75 * v * v;
    return {
      opacity: 1 - v * v,
      transform: [{ translateX: p.x + p.dx * v }, { translateY: y }, { rotate: `${p.spin * v}deg` }],
    };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', left: 0, top: 0, width: p.w, height: p.h, borderRadius: 2, backgroundColor: p.color }, style]}
    />
  );
}

function Burst({ width, height, seed }: { width: number; height: number; seed: number }) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOver(true), 2700);
    return () => clearTimeout(t);
  }, []);
  if (over) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
      {Array.from({ length: 70 }, (_, i) => (
        <Piece key={i} index={i + seed * 100} width={width} height={height} />
      ))}
    </View>
  );
}

/** A burst of confetti over the screen. Bump `fire` (a counter) to set it off again. */
export function Confetti({ fire }: { fire: number }) {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  if (!fire || reduce) return null;
  return <Burst key={fire} seed={fire} width={width} height={height} />;
}

/** Two faces with a 💸 travelling from the payer to the person being paid. */
export function MoneyFlow({ fromId, fromName, toId, toName }: { fromId: string; fromName: string; toId: string; toName: string }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  const [laneWidth, setLaneWidth] = useState(0);
  useEffect(() => {
    if (reduce) return;
    t.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, false));
  }, [reduce, t]);
  const coin = useAnimatedStyle(() => {
    const v = t.get();
    return {
      opacity: reduce ? 1 : v < 0.12 ? v / 0.12 : v > 0.88 ? (1 - v) / 0.12 : 1,
      transform: [{ translateX: reduce ? laneWidth / 2 - 15 : v * (laneWidth - 30) }],
    };
  });
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ alignItems: 'center', gap: space.xs }}>
        <Avatar name={fromName} size={60} color={groupColor(fromId)} />
        <Text variant="label">{fromName}</Text>
      </View>
      <View style={{ flex: 1, height: 44, justifyContent: 'center' }} onLayout={(e) => setLaneWidth(e.nativeEvent.layout.width)}>
        <View style={{ borderTopWidth: 3, borderStyle: 'dotted', borderColor: c.border, marginHorizontal: space.xs }} />
        <Animated.View style={[{ position: 'absolute', left: 0, top: 6 }, coin]}>
          <Text style={{ fontSize: 26 }}>💸</Text>
        </Animated.View>
      </View>
      <View style={{ alignItems: 'center', gap: space.xs }}>
        <Avatar name={toName} size={60} color={groupColor(toId)} />
        <Text variant="label">{toName}</Text>
      </View>
    </View>
  );
}

const KNOB = 56;
const PAD = 4;

/**
 * Slide the round button to the end to confirm. Screen readers get a plain button instead,
 * since dragging is hard with one.
 */
export function SlideToConfirm({ label, onConfirm, disabled }: { label: string; onConfirm: () => void; disabled?: boolean }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [screenReader, setScreenReader] = useState(false);
  const [x] = useState(() => new RNAnimated.Value(0));
  const max = Math.max(0, width - KNOB - PAD * 2);
  const done = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader, () => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);

  // Touch handling with React Native's responder props: plain event handlers, so they can read refs.
  const startX = useRef(0);
  const dx = useRef(0);
  const handlers = {
    onStartShouldSetResponder: () => !disabled && !done.current,
    onMoveShouldSetResponder: () => !disabled && !done.current,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      startX.current = e.nativeEvent.pageX;
      dx.current = 0;
      buzz.tap();
    },
    onResponderMove: (e: GestureResponderEvent) => {
      dx.current = e.nativeEvent.pageX - startX.current;
      x.setValue(Math.max(0, Math.min(max, dx.current)));
    },
    onResponderRelease: () => {
      if (dx.current > max * 0.85) {
        done.current = true;
        RNAnimated.timing(x, { toValue: max, duration: 120, useNativeDriver: false }).start(() => onConfirm());
      } else {
        RNAnimated.spring(x, { toValue: 0, bounciness: 12, useNativeDriver: false }).start();
      }
    },
    onResponderTerminate: () => RNAnimated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
  };

  if (screenReader) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        onPress={onConfirm}
        disabled={disabled}
        style={{ minHeight: 64, borderRadius: radius.pill, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="heading" color={c.onPrimary}>
          {label}
        </Text>
      </Pressable>
    );
  }

  const fill = x.interpolate({ inputRange: [0, Math.max(1, max)], outputRange: [KNOB + PAD * 2, width || KNOB], extrapolate: 'clamp' });
  const hint = x.interpolate({ inputRange: [0, Math.max(1, max * 0.6)], outputRange: [1, 0], extrapolate: 'clamp' });
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        height: KNOB + PAD * 2,
        borderRadius: radius.pill,
        backgroundColor: c.surfaceAlt,
        overflow: 'hidden',
        opacity: disabled ? 0.5 : 1,
      }}>
      <RNAnimated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: fill,
          borderRadius: radius.pill,
          backgroundColor: brand.coralSoft,
        }}
      />
      <RNAnimated.View
        pointerEvents="none"
        style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingLeft: KNOB, opacity: hint }}>
        <Text variant="heading" muted>
          {label}
        </Text>
      </RNAnimated.View>
      <RNAnimated.View
        {...handlers}
        style={{
          position: 'absolute',
          left: PAD,
          top: PAD,
          width: KNOB,
          height: KNOB,
          borderRadius: KNOB / 2,
          backgroundColor: c.primary,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateX: x }],
          elevation: 3,
        }}>
        <Text style={{ fontSize: 24, color: c.onPrimary, fontWeight: '700' }}>→</Text>
      </RNAnimated.View>
    </View>
  );
}

/** A guess at an emoji for an expense from its description ("Pizza at Gusto" → 🍕). */
export function expenseEmoji(title: string): string {
  const t = title.toLowerCase();
  const rules: [RegExp, string][] = [
    [/pizza/, '🍕'],
    [/burger/, '🍔'],
    [/sushi/, '🍣'],
    [/coffee|cafe|café/, '☕'],
    [/beer|pub|bar\b|drinks?/, '🍻'],
    [/wine/, '🍷'],
    [/dinner|lunch|breakfast|brunch|restaurant|meal|food|takeaway/, '🍽️'],
    [/grocer|supermarket|woolies|woolworths|coles|aldi|shopping/, '🛒'],
    [/rent|villa|airbnb|hotel|accommodation|house|room/, '🏡'],
    [/electric|power|energy|gas bill/, '💡'],
    [/water/, '🚰'],
    [/internet|wifi|nbn|phone/, '📶'],
    [/petrol|fuel|uber|taxi|car|parking|toll/, '🚗'],
    [/flight|plane|airport/, '✈️'],
    [/train|bus|metro|tram|ferry/, '🚆'],
    [/scooter|bike/, '🛵'],
    [/movie|cinema|film/, '🎬'],
    [/ticket|concert|gig|show/, '🎟️'],
    [/gift|present|birthday/, '🎁'],
    [/party|celebrat/, '🎉'],
    [/ice ?cream|dessert|cake/, '🍰'],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? '🧾';
}
