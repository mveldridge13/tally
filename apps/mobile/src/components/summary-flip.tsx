/**
 * Home's summary card turns over when tapped: the front is your total position, the back is a
 * donut of the kinds of group you were active in this month (trips, home, dining…), with your
 * share of what was spent in each.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { formatMoney, type Cents } from '@tally/shared';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { CardText, SummaryCard, useCardInk } from '@/components/dashboard';
import { buzz } from '@/components/fun';
import { GROUP_TYPES, groupTypeOf } from '@/lib/group-types';
import { brand, space } from '@/theme';

/** Slice colours, biggest slice first. All readable on the coral card. */
const SLICE_COLORS = [brand.deep, '#FFFFFF', brand.onCoral, brand.accent, '#9C8FB3', '#8A4A5E'];

type Slice = {
  id: string;
  label: string;
  emoji: string | null;
  count: number;
  /** Your share spent this month, per currency (most groups have one); null if unknown. */
  spent: Map<string, Cents> | null;
  color: string;
};

/** A group you were active in this month and your share of its spending. */
export type MonthGroup = { icon: string | null; currency: string; spent: Cents | null };

/** Count the groups by type, biggest first (ties keep the New group order), adding up what you spent. */
export function groupTypeSlices(groups: MonthGroup[]): Slice[] {
  const byType = new Map<string, { count: number; spent: Map<string, Cents> | null }>();
  for (const g of groups) {
    const t = groupTypeOf(g.icon);
    const entry = byType.get(t.id) ?? { count: 0, spent: g.spent === null ? null : new Map<string, Cents>() };
    entry.count += 1;
    if (entry.spent && g.spent !== null) entry.spent.set(g.currency, (entry.spent.get(g.currency) ?? 0) + g.spent);
    byType.set(t.id, entry);
  }
  return GROUP_TYPES.filter((t) => byType.has(t.id))
    .map((t) => ({ id: t.id, label: t.label, emoji: t.emoji, ...byType.get(t.id)! }))
    .sort((a, b) => b.count - a.count)
    .map((s, i) => ({ ...s, color: SLICE_COLORS[i % SLICE_COLORS.length]! }));
}

/** "$120.00", or "$120.00 + €40.00" when a type has groups in more than one currency. */
function spentText(spent: Map<string, Cents>): string {
  return [...spent].map(([currency, cents]) => formatMoney(cents, currency)).join(' + ');
}

function Donut({ slices, size = 116, stroke = 20 }: { slices: Slice[]; size?: number; stroke?: number }) {
  const ink = useCardInk();
  const total = slices.reduce((n, s) => n + s.count, 0);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 3 : 0;
  const lengths = slices.map((s) => (s.count / total) * circ);
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {slices.map((s, i) => (
            <Circle
              key={s.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, lengths[i]! - gap)} ${circ}`}
              strokeDashoffset={-starts[i]!}
            />
          ))}
        </G>
      </Svg>
      <CardText style={{ fontSize: 26, lineHeight: 30, fontWeight: '800', color: ink.text }}>{total}</CardText>
      <CardText variant="caption" muted>
        {total === 1 ? 'group' : 'groups'}
      </CardText>
    </View>
  );
}

function GroupTypesBack({ slices }: { slices: Slice[] }) {
  const ink = useCardInk();
  const top = slices[0];
  const month = new Date().toLocaleDateString(undefined, { month: 'long' });
  return (
    <>
      <CardText variant="label" muted>
        {month} · your groups and your share
      </CardText>
      {slices.length === 0 ? (
        <View style={{ gap: space.xs, marginTop: space.sm, paddingRight: space.xl }}>
          <CardText style={{ fontSize: 22, lineHeight: 28, fontWeight: '800' }}>Nothing yet this month</CardText>
          <CardText muted>Add an expense and your groups will show up here.</CardText>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.sm }}>
          <Donut slices={slices} />
          <View style={{ flex: 1, gap: 4 }}>
            {slices.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color, borderWidth: 1, borderColor: ink.line }} />
                <View style={{ flex: 1 }}>
                  <CardText style={{ fontWeight: '600' }}>
                    {s.emoji ? `${s.emoji} ` : ''}
                    {s.label} · {s.count}
                  </CardText>
                </View>
                {s.spent ? <CardText style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{spentText(s.spent)}</CardText> : null}
              </View>
            ))}
          </View>
        </View>
      )}
      {top && slices.length > 1 && top.count > slices[1]!.count ? (
        <CardText variant="caption" muted style={{ marginTop: space.sm }}>
          Mostly {top.label.toLowerCase()} groups this month
        </CardText>
      ) : null}
    </>
  );
}

/** Small corner hint that the card turns over. */
type IconName = ComponentProps<typeof MaterialIcons>['name'];

function FlipHint({ icon }: { icon: IconName }) {
  const ink = useCardInk();
  return (
    <View style={{ position: 'absolute', top: space.lg, right: space.lg }}>
      <MaterialIcons name={icon} size={22} color={ink.muted} />
    </View>
  );
}

/**
 * A light summary card that turns over when tapped. Both faces take the taller one's height.
 * Buttons on the front (e.g. a group's icon) still work: the front only stops taking touches
 * while it's turned away.
 */
export function FlipCard({
  front,
  back,
  frontHint,
  frontLabel,
  backLabel,
  background,
}: {
  front: ReactNode;
  back: ReactNode;
  /** Icon in the corner of the front, hinting at what's on the back. */
  frontHint: IconName;
  frontLabel: string;
  backLabel: string;
  background?: string;
}) {
  const reduce = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const [frontH, setFrontH] = useState(0);
  const [backH, setBackH] = useState(0);
  const turn = useSharedValue(0);

  const frontStyle = useAnimatedStyle(() => ({
    opacity: turn.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(turn.value, [0, 1], [0, 180])}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: turn.value < 0.5 ? 0 : 1,
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(turn.value, [0, 1], [180, 360])}deg` }],
  }));

  const toggle = () => {
    buzz.tap();
    const next = !flipped;
    setFlipped(next);
    turn.set(withTiming(next ? 1 : 0, { duration: reduce ? 0 : 450, easing: Easing.inOut(Easing.cubic) }));
  };

  const tall = Math.max(frontH, backH) || undefined;

  return (
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={flipped ? backLabel : frontLabel}>
      <Animated.View style={[{ backfaceVisibility: 'hidden' }, frontStyle]} pointerEvents={flipped ? 'none' : 'box-none'}>
        <View onLayout={(e) => setFrontH(e.nativeEvent.layout.height)} pointerEvents="box-none">
          <SummaryCard tone="light" background={background} style={{ minHeight: tall }}>
            <FlipHint icon={frontHint} />
            {front}
          </SummaryCard>
        </View>
      </Animated.View>
      <Animated.View
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, backfaceVisibility: 'hidden' }, backStyle]}
        pointerEvents="none">
        <View onLayout={(e) => setBackH(e.nativeEvent.layout.height)}>
          <SummaryCard tone="light" background={background} style={{ minHeight: tall }}>
            <FlipHint icon="sync" />
            {back}
          </SummaryCard>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** The light summary card, which flips to the group-type donut when tapped. */
export function FlippingSummaryCard({ front, groups }: { front: ReactNode; groups: MonthGroup[] }) {
  const slices = useMemo(() => groupTypeSlices(groups), [groups]);
  return (
    <FlipCard
      front={front}
      back={<GroupTypesBack slices={slices} />}
      frontHint="donut-small"
      frontLabel="Your total position. Tap to see your groups by type this month."
      backLabel="Your groups by type this month. Tap to see your total position."
    />
  );
}
