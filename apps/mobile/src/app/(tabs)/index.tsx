import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { TallyMark } from '@/components/brand';
import { NotificationBell } from '@/components/notification-bell';
import { FlippingSummaryCard } from '@/components/summary-flip';
import { CardText, Gutter, HeroScreen, StatRow, TotalPill, usePosition } from '@/components/dashboard';
import { Bouncy, buzz, CountUp } from '@/components/fun';
import { Avatar, Card, Notice, Text } from '@/components/ui';
import { AllSquareCard, myTransfers, YouCard } from '@/components/you-cards';
import { useMyId } from '@/lib/auth';
import { useMonthSpending, usePaymentsToConfirm, useRecurringDue, useTallyData } from '@/lib/data';
import { DueBillCard } from '@/components/recurring';
import { ConfirmPaymentCard } from '@/components/confirm-payment';
import { firstName, greeting } from '@/lib/format';
import { useWidthClass } from '@/lib/layout';
import { usePullToRefresh } from '@/lib/pull-to-refresh';
import { useGroupSummaries } from '@/store/hooks';
import { brand, radius, space, useColors } from '@/theme';

/**
 * Home's collapsible "To settle": who you owe and who owes you, across groups, biggest first.
 * Starts closed (header and count only); tap the header to open the cards.
 *
 * The cards stay rendered and the section's height animates between 0 and their measured height,
 * so the page below slides instead of jumping when it opens or closes.
 */
function ToSettle({ items }: { items: ReturnType<typeof myTransfers> }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const drawer = useAnimatedStyle(() => ({
    height: progress.get() * contentHeight.get(),
    opacity: progress.get(),
  }));
  const toggle = () => {
    buzz.tap();
    const next = !open;
    setOpen(next);
    progress.set(withTiming(next ? 1 : 0, { duration: reduce ? 0 : 280, easing: Easing.out(Easing.cubic) }));
  };
  return (
    <Gutter>
      <View>
      <Bouncy
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`To settle, ${items.length} ${items.length === 1 ? 'item' : 'items'}. ${open ? 'Collapse' : 'Expand'}`}
        onPress={toggle}
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

      <Animated.View
        style={[{ overflow: 'hidden' }, drawer]}
        pointerEvents={open ? 'auto' : 'none'}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
        {/* Measured at its natural height, whatever the drawer's current height. */}
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: space.md, gap: space.md }}
          onLayout={(e) => contentHeight.set(e.nativeEvent.layout.height)}>
          {items.length === 0 ? (
            <AllSquareCard />
          ) : (
            items.map((t) => <YouCard key={`${t.group.id}-${t.other}-${t.iOwe}`} {...t} showGroup />)
          )}
        </View>
      </Animated.View>
      </View>
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
  const { data: toConfirm } = usePaymentsToConfirm();
  const { data: dueBills } = useRecurringDue();
  const wide = useWidthClass() === 'expanded';

  const { primary, others, owedTotal, oweTotal } = usePosition(summaries);
  // Groups you were active in this calendar month (made, or had an expense or payment you can
  // see, or you have a share of an expense in it), with your share of this month's spending.
  const monthSpending = useMonthSpending();
  const monthGroups = useMemo(() => {
    const now = new Date();
    const inMonth = (iso: string) => {
      const d = new Date(iso);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    };
    const active = new Set<string>(Object.keys(monthSpending ?? {}));
    for (const e of data.expenses) if (inMonth(e.occurredAt)) active.add(e.groupId);
    for (const s of data.settlements) if (inMonth(s.occurredAt)) active.add(s.groupId);
    return data.groups
      .filter((g) => active.has(g.id) || inMonth(g.createdAt))
      .map((g) => ({ icon: g.icon, currency: g.currency, spent: monthSpending ? (monthSpending[g.id] ?? 0) : null }));
  }, [data, monthSpending]);

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
          <Gutter>
            <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.border }} />
          </Gutter>
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
          <FlippingSummaryCard
            groups={monthGroups}
            front={
              <>
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
              </>
            }
          />
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

        {/* Payments people say they made to you: confirm them so they count. */}
        {toConfirm.length > 0 ? (
          <Gutter>
            {toConfirm.map((p) => (
              <ConfirmPaymentCard key={p.id} payment={p} />
            ))}
          </Gutter>
        ) : null}

        {/* Recurring bills whose amount changes, due and waiting for it. */}
        {dueBills.length > 0 ? (
          <Gutter>
            {dueBills.map((b) => (
              <DueBillCard key={b.id} bill={b} group={data.groups.find((g) => g.id === b.groupId)} />
            ))}
          </Gutter>
        ) : null}

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
