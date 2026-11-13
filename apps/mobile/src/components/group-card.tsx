/**
 * The card at the top of a group's page, in the group's own colour: its icon (tap to change),
 * the faces of everyone in it, how long it's been going, and what's been spent.
 *
 * Owners and co-owners see the group's total and can turn the card over to see who's paid what.
 * Members only see their own share: who paid what is private to the owner and co-owners.
 */
import { formatMoney, type Cents } from '@tally/shared';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { CardText, SummaryCard, useCardInk } from '@/components/dashboard';
import { buzz, CountUp } from '@/components/fun';
import { FlipCard } from '@/components/summary-flip';
import { Avatar } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { seesEverything, useNameOf, useTallyData, type Group } from '@/lib/data';
import { groupColor, groupTint, radius, space } from '@/theme';

/** "Since 8 Nov · 6 days", "Since today". */
function sinceText(createdAt: string): string {
  const start = new Date(createdAt);
  const days = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  const date = start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (days < 1) return 'Started today';
  if (days < 60) return `Since ${date} · ${days} ${days === 1 ? 'day' : 'days'}`;
  const months = Math.floor(days / 30);
  return `Since ${date} · ${months} months`;
}

const MAX_FACES = 4;

export function GroupCard({
  group,
  totalSpent,
  myShare,
  onIconPress,
}: {
  group: Group;
  /** Owner and co-owners only; null for members. */
  totalSpent: Cents | null;
  myShare: Cents;
  onIconPress: () => void;
}) {
  const myId = useMyId();
  const { data } = useTallyData();
  const name = useNameOf();
  const background = groupTint(group.id);
  const seesAll = seesEverything(group.myRole) && totalSpent !== null;

  // What each person has paid for, biggest first (owner and co-owners see every expense).
  const paid = useMemo(() => {
    const byPerson = new Map<string, Cents>(group.memberIds.map((id) => [id, 0]));
    for (const e of data.expenses) {
      if (e.groupId === group.id) byPerson.set(e.payerId, (byPerson.get(e.payerId) ?? 0) + e.amount);
    }
    return [...byPerson].map(([userId, amount]) => ({ userId, amount })).sort((a, b) => b.amount - a.amount);
  }, [data.expenses, group.id, group.memberIds]);
  const myPaid = paid.find((p) => p.userId === myId)?.amount ?? 0;
  const money = (cents: Cents) => formatMoney(cents, group.currency);

  const front = (
    <Front
      group={group}
      background={background}
      figureLabel={seesAll ? 'Spent together' : 'Your share so far'}
      figure={seesAll ? totalSpent : myShare}
      pills={seesAll ? [`Your share ${money(myShare)}`, `You paid ${money(myPaid)}`] : []}
      onIconPress={onIconPress}
    />
  );

  if (!seesAll) return <SummaryCard tone="light" background={background}>{front}</SummaryCard>;

  return (
    <FlipCard
      background={background}
      front={front}
      back={<WhoPaid paid={paid} money={money} total={totalSpent} name={(id) => (id === myId ? 'You' : name(id))} />}
      frontHint="bar-chart"
      frontLabel={`${group.name}: ${money(totalSpent)} spent together. Tap to see who’s paid what.`}
      backLabel={`Who’s paid what in ${group.name}. Tap to turn back.`}
    />
  );
}

function Front({
  group,
  background,
  figureLabel,
  figure,
  pills,
  onIconPress,
}: {
  group: Group;
  background: string;
  figureLabel: string;
  figure: Cents;
  pills: string[];
  onIconPress: () => void;
}) {
  const ink = useCardInk();
  const myId = useMyId();
  const name = useNameOf();
  // You first, then everyone else.
  const people = [myId, ...group.memberIds.filter((id) => id !== myId)].filter((id) => group.memberIds.includes(id));
  const more = people.length - MAX_FACES;

  const tilt = useSharedValue(-6);
  const tiltStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.get()}deg` }] }));
  const wiggleThenOpen = () => {
    buzz.tap();
    tilt.set(
      withSequence(
        withTiming(-18, { duration: 90 }),
        withTiming(8, { duration: 110 }),
        withTiming(-10, { duration: 100 }),
        withTiming(-6, { duration: 90 }),
      ),
    );
    setTimeout(onIconPress, 300);
  };

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingRight: space.xl }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change the group’s icon" onPress={wiggleThenOpen} hitSlop={6}>
          <Animated.View
            style={[
              {
                width: 64,
                height: 64,
                borderRadius: radius.lg + 4,
                backgroundColor: 'rgba(255,255,255,0.65)',
                alignItems: 'center',
                justifyContent: 'center',
              },
              tiltStyle,
            ]}>
            <CardText style={{ fontSize: group.icon ? 34 : 28, fontWeight: '800', lineHeight: 40 }}>
              {group.icon || group.name.slice(0, 1).toUpperCase()}
            </CardText>
          </Animated.View>
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <CardText variant="title" style={{ fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.5 }}>
            {group.name}
          </CardText>
          <CardText variant="caption" muted style={{ fontWeight: '600' }}>
            {sinceText(group.createdAt)}
          </CardText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center' }} accessibilityLabel={`${people.length} people`}>
        {people.slice(0, MAX_FACES).map((id, i) => (
          <View
            key={id}
            style={{ marginLeft: i === 0 ? 0 : -9, borderRadius: 18, borderWidth: 2.5, borderColor: background }}>
            <Avatar name={name(id)} size={30} color={groupColor(id)} />
          </View>
        ))}
        <CardText variant="label" muted style={{ marginLeft: space.sm, fontWeight: '700' }}>
          {more > 0 ? `+${more} · ` : ''}
          {people.length} {people.length === 1 ? 'person' : 'people'}
        </CardText>
      </View>

      <View>
        <CardText variant="label" muted style={{ fontWeight: '700' }}>
          {figureLabel}
        </CardText>
        <CountUp
          cents={figure}
          currency={group.currency}
          style={{ color: ink.text, fontSize: 36, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] }}
        />
      </View>

      {pills.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {pills.map((p) => (
            <View key={p} style={{ backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 }}>
              <CardText variant="label" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {p}
              </CardText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The back of the card: who's paid what so far, as bars. */
function WhoPaid({
  paid,
  money,
  total,
  name,
}: {
  paid: { userId: string; amount: Cents }[];
  money: (cents: Cents) => string;
  total: Cents;
  name: (id: string) => string;
}) {
  const ink = useCardInk();
  const max = Math.max(1, ...paid.map((p) => p.amount));
  return (
    <View style={{ gap: space.md, paddingRight: space.xl }}>
      <View style={{ gap: 2 }}>
        <CardText variant="heading" style={{ fontWeight: '800' }}>
          Who’s paid what
        </CardText>
        <CardText variant="caption" muted style={{ fontWeight: '600' }}>
          Of the {money(total)} spent so far
        </CardText>
      </View>
      {paid.slice(0, 8).map((p) => (
        <View key={p.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Avatar name={name(p.userId)} size={28} color={groupColor(p.userId)} />
          <View style={{ flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.45)', overflow: 'hidden' }}>
            <View style={{ width: `${(p.amount / max) * 100}%`, height: '100%', borderRadius: 6, backgroundColor: ink.text }} />
          </View>
          <CardText variant="label" style={{ fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 72, textAlign: 'right' }}>
            {p.amount ? money(p.amount) : 'nothing yet'}
          </CardText>
        </View>
      ))}
    </View>
  );
}
