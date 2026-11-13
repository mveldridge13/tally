/**
 * "Sam owes you $42.50 [Nudge]" and "You owe Leo $18.25 [Pay back]": one card per person you're
 * settling with, used on Home (across groups) and on a group's page. The action sits on the card.
 */
import { formatMoney, type Cents } from '@tally/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { useMyId } from '@/lib/auth';
import { seesEverything, useNameOf, useRecentlyReminded, useRemindToSettle, useTallyData, type Group } from '@/lib/data';
import { groupColor, radius, space, useColors } from '@/theme';
import { Bouncy, buzz } from './fun';
import { Avatar, Text } from './ui';

function Pill({ label, solid, onPress, icon }: { label: string; solid?: boolean; onPress: () => void; icon?: string }) {
  const c = useColors();
  const tilt = useSharedValue(0);
  const bell = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.get()}deg` }] }));
  return (
    <Bouncy
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        if (icon)
          tilt.set(
            withSequence(
              withTiming(-16, { duration: 70 }),
              withTiming(14, { duration: 90 }),
              withTiming(-8, { duration: 80 }),
              withTiming(0, { duration: 80 }),
            ),
          );
        onPress();
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: space.sm + 2,
        paddingHorizontal: space.md + 2,
        borderRadius: radius.pill,
        backgroundColor: solid ? c.primary : c.surface,
      }}>
      {icon ? <Animated.Text style={[{ fontSize: 14 }, bell]}>{icon}</Animated.Text> : null}
      <Text variant="label" color={solid ? c.onPrimary : c.text} style={{ fontWeight: '700' }}>
        {label}
      </Text>
    </Bouncy>
  );
}

/** One person you owe, or who owes you, in one group. */
export function YouCard({
  group,
  other,
  amount,
  iOwe,
  showGroup,
}: {
  group: Group;
  other: string;
  amount: Cents;
  iOwe: boolean;
  /** On Home: say which group it's from. */
  showGroup?: boolean;
}) {
  const c = useColors();
  const myId = useMyId();
  const name = useNameOf();
  const { data } = useTallyData();
  const canRemind = !iOwe && seesEverything(group.myRole) && !data.people[other]?.isGuest;
  const recently = useRecentlyReminded(group.id, canRemind);
  const remind = useRemindToSettle();
  const [justNudged, setJustNudged] = useState(false);
  const nudged = justNudged || recently.has(other);
  const who = name(other);

  const payBack = () =>
    router.push({
      pathname: '/settle',
      // Less anything already sent and waiting to be confirmed.
      params: { groupId: group.id, from: iOwe ? myId : other, to: iOwe ? other : myId, amount: String(amount - sent) },
    });

  // You've already recorded paying them back and it's waiting for them to confirm: say so
  // instead of offering Pay back again (it doesn't count towards the balance until confirmed).
  const sent = iOwe
    ? data.pendingPayments
        .filter((p) => p.groupId === group.id && p.fromUserId === myId && p.toUserId === other)
        .reduce((sum, p) => sum + p.amount, 0)
    : 0;

  return (
    <Bouncy
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityHint="Shows how this adds up"
      onPress={() => router.push({ pathname: '/balance/[groupId]', params: { groupId: group.id, with: other } })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md + 2,
        borderRadius: radius.xl - 6,
        backgroundColor: iOwe ? c.surfaceAlt : c.warm,
      }}>
      <Avatar name={who} size={46} color={groupColor(other)} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label" muted numberOfLines={1}>
          {iOwe ? `You owe ${who}` : `${who} owes you`}
        </Text>
        <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.4, fontVariant: ['tabular-nums'] }} color={c.text}>
          {formatMoney(amount, group.currency)}
        </Text>
        {showGroup ? (
          <Text variant="caption" muted numberOfLines={1}>
            {group.icon ? `${group.icon} ` : ''}
            {group.name}
          </Text>
        ) : null}
        {sent > 0 ? (
          <Text variant="caption" muted numberOfLines={2}>
            ⏳ {formatMoney(sent, group.currency)} sent, waiting for {who} to confirm
          </Text>
        ) : null}
      </View>
      {iOwe ? (
        sent >= amount ? null : <Pill label={sent > 0 ? 'Pay the rest' : 'Pay back'} solid onPress={payBack} />
      ) : canRemind ? (
        nudged ? (
          <Text variant="label" muted>
            Nudged ✓
          </Text>
        ) : (
          <Pill
            label="Nudge"
            icon="🔔"
            onPress={() => {
              buzz.nudge();
              remind.mutate(
                { groupId: group.id, userId: other },
                {
                  onSuccess: () => setJustNudged(true),
                  onError: (e) => Alert.alert('Couldn’t send the nudge', e instanceof Error ? e.message : 'Please try again.'),
                },
              );
            }}
          />
        )
      ) : null}
    </Bouncy>
  );
}

/** Shown instead of the cards when nobody owes anybody. */
export function AllSquareCard({ line = 'Nobody owes anybody right now.' }: { line?: string }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.xl - 6,
        backgroundColor: c.surfaceAlt,
      }}>
      <Text style={{ fontSize: 30 }}>🎉</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading">You’re all square</Text>
        <Text muted>{line}</Text>
      </View>
    </View>
  );
}

/** Every transfer involving you in `groups`, biggest first, as YouCards. */
export function myTransfers(
  summaries: { group: Group; transfers: { fromUserId: string; toUserId: string; amount: Cents }[] }[],
  myId: string,
) {
  return summaries
    .flatMap((s) =>
      s.transfers
        .filter((t) => t.fromUserId === myId || t.toUserId === myId)
        .map((t) => ({
          group: s.group,
          amount: t.amount,
          iOwe: t.fromUserId === myId,
          other: t.fromUserId === myId ? t.toUserId : t.fromUserId,
        })),
    )
    .sort((a, b) => b.amount - a.amount);
}
