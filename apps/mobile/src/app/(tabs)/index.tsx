import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { TallyMark } from '@/components/brand';
import { NotificationBell } from '@/components/notification-bell';
import { CardText, Gutter, HeroScreen, SectionTitle, StatRow, SummaryCard, TotalPill, usePosition } from '@/components/dashboard';
import { Bouncy, buzz, CountUp } from '@/components/fun';
import { Avatar, Card, Notice, Text } from '@/components/ui';
import { AllSquareCard, myTransfers, YouCard } from '@/components/you-cards';
import { useMyId } from '@/lib/auth';
import { useTallyData } from '@/lib/data';
import { firstName, greeting } from '@/lib/format';
import { useWidthClass } from '@/lib/layout';
import { usePullToRefresh } from '@/lib/pull-to-refresh';
import { useGroupSummaries } from '@/store/hooks';
import { brand, radius, space, useColors } from '@/theme';

/**
 * Home's collapsible "To settle": who you owe and who owes you, across groups, biggest first.
 * Starts closed (header and count only); tap the header to open the cards.
 */
function ToSettle({ items }: { items: ReturnType<typeof myTransfers> }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <Gutter>
      <Bouncy
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`To settle, ${items.length} ${items.length === 1 ? 'item' : 'items'}. ${open ? 'Collapse' : 'Expand'}`}
        onPress={() => {
          buzz.tap();
          setOpen((o) => !o);
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          padding: space.lg,
          borderRadius: radius.xl - 6,
          backgroundColor: c.surfaceAlt,
        }}>
        <Text style={{ fontSize: 22 }}>🤝</Text>
        <Text variant="heading" style={{ flex: 1, fontSize: 19, fontWeight: '700' }}>
          To settle
        </Text>
        {items.length > 0 ? (
          <View style={{ backgroundColor: brand.deep, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 2 }}>
            <Text variant="label" color={brand.onDeep} style={{ fontWeight: '700' }}>
              {items.length}
            </Text>
          </View>
        ) : null}
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={26} color={c.textMuted} />
      </Bouncy>

      {open
        ? items.length === 0
          ? (
              <Animated.View entering={FadeInDown.duration(220)}>
                <AllSquareCard />
              </Animated.View>
            )
          : items.map((t, i) => (
              <Animated.View key={`${t.group.id}-${t.other}-${t.iOwe}`} entering={FadeInDown.delay(i * 40).duration(220)}>
                <YouCard {...t} showGroup />
              </Animated.View>
            ))
        : null}
    </Gutter>
  );
}

/**
 * Home: a greeting, Add expense, where you stand overall, and a collapsible list of who to settle
 * with. Groups and history live on their own tabs.
 */
export default function HomeScreen() {
  const myId = useMyId();
  const c = useColors();
  const { data, isLoading, error, refetch } = useTallyData();
  const pull = usePullToRefresh(refetch);
  const summaries = useGroupSummaries();
  const wide = useWidthClass() === 'expanded';

  const { primary, others, owedTotal, oweTotal } = usePosition(summaries);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: brand.deep, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  const me = data.people[myId]?.name;
  const hasGroups = summaries.length > 0;
  const where = summaries.length === 1 ? 'in your group' : `across ${summaries.length} groups`;
  const sign = primary.amount > 0 ? '+' : primary.amount < 0 ? '−' : '';
  const big = { fontSize: 40, lineHeight: 48, fontWeight: '800', letterSpacing: -1.2, fontVariant: ['tabular-nums'] } as const;

  return (
    <View style={{ flex: 1 }}>
      <HeroScreen
        nav="tab"
        title={`${greeting()}, ${firstName(me) || 'there'} 👋`}
        subtitle={hasGroups ? 'Here’s where you stand with your groups.' : 'Welcome to Tally.'}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <NotificationBell />
            <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push('/profile')} hitSlop={8}>
              <Avatar name={me || '?'} size={44} color={brand.deep} />
            </Pressable>
          </View>
        }
        fullWidth={wide}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}>
        {error ? (
          <Gutter>
            <Notice>Couldn’t refresh. Pull down to try again.</Notice>
          </Gutter>
        ) : null}

        <View style={{ gap: space.md }}>
          <SectionTitle title="Quick actions" />
          <Gutter>
            <Bouncy
              accessibilityRole="button"
              accessibilityLabel="Add expense"
              onPress={() => router.push(hasGroups ? '/add-expense' : '/new-group')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.sm,
                paddingVertical: space.lg + 2,
                borderRadius: radius.xl - 6,
                backgroundColor: brand.deep,
              }}>
              <MaterialIcons name="add-circle-outline" size={28} color={brand.onDeep} />
              <Text variant="heading" color={brand.onDeep} style={{ fontWeight: '700', fontSize: 18 }}>
                Add expense
              </Text>
            </Bouncy>
          </Gutter>
        </View>

        {hasGroups ? (
          <SummaryCard tone="light">
            <CardText variant="label" muted>
              Your total position
            </CardText>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
              {sign ? <CardText style={big}>{sign}</CardText> : null}
              <CountUp cents={Math.abs(primary.amount)} currency={primary.currency} style={[big, { color: brand.onCoral }]} />
            </View>
            <CardText variant="caption" muted>
              {(primary.amount === 0 ? 'You’re all square 🎉' : primary.amount > 0 ? `You’re owed ${where}` : `You owe ${where}`) +
                (others.length > 0
                  ? ` · also ${others.map((o) => `${o.amount >= 0 ? '+' : '−'}${formatMoney(Math.abs(o.amount), o.currency)}`).join(', ')}`
                  : '')}
            </CardText>
            <StatRow>
              <TotalPill label="You’re owed" cents={owedTotal} currency={primary.currency} tone="owed" />
              <TotalPill label="You owe" cents={oweTotal} currency={primary.currency} tone="owe" />
            </StatRow>
          </SummaryCard>
        ) : (
          <Gutter>
            <Card style={{ gap: space.sm }}>
              <TallyMark size={48} color={c.primary} />
              <Text variant="title">Let’s get you set up</Text>
              <Text variant="body" muted>
                Make a group for your flat, a trip or a night out.
              </Text>
            </Card>
          </Gutter>
        )}

        {hasGroups ? (
          <ToSettle items={myTransfers(summaries, myId)} />
        ) : (
          <Gutter>
            <Card style={{ gap: space.xs }}>
              <Text variant="heading">Got an invite?</Text>
              <Text muted>Tap the link in the message you were sent and you’ll join the group.</Text>
            </Card>
          </Gutter>
        )}
      </HeroScreen>
    </View>
  );
}
