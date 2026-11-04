import { formatMoney, type Cents } from '@tally/shared';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { ActivityList } from '@/components/activity-list';
import { TallyMark } from '@/components/brand';
import {
  GroupCard,
  Gutter,
  HeroScreen,
  HeroTitle,
  NewGroupCard,
  onDeepMuted,
  oweOnDeep,
  QuickAction,
  SectionTitle,
  TotalPill,
  BandAction,
} from '@/components/dashboard';
import { Avatar, Card, Divider, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { netByCurrency, useNameOf, useTallyData } from '@/lib/data';
import { firstName, greeting } from '@/lib/format';
import { useWidthClass } from '@/lib/layout';
import { useGroupSummaries } from '@/store/hooks';
import { PRESS_DELAY, brand, radius, space, useColors } from '@/theme';

interface PendingPayment {
  groupId: string;
  groupName: string;
  currency: string;
  fromUserId: string;
  toUserId: string;
  amount: Cents;
}

export default function HomeScreen() {
  const c = useColors();
  const myId = useMyId();
  const name = useNameOf();
  const { data, isLoading, isRefetching, error, refetch } = useTallyData();
  const summaries = useGroupSummaries();
  // Unfolded (expanded width): one full-width scrolling page, with the summary spread across the width.
  const wide = useWidthClass() === 'expanded';

  const { primary, others, owed, owe } = useMemo(() => {
    const totals = netByCurrency(summaries);
    const main = [...totals].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    const currency = main?.currency ?? 'USD';
    let owedSum = 0;
    let oweSum = 0;
    for (const s of summaries) {
      if (s.group.currency !== currency) continue;
      if (s.myBalance > 0) owedSum += s.myBalance;
      else oweSum -= s.myBalance;
    }
    return {
      primary: main ?? { currency, amount: 0 },
      others: totals.filter((t) => t !== main),
      owed: owedSum,
      owe: oweSum,
    };
  }, [summaries]);

  const pending: PendingPayment[] = useMemo(
    () =>
      summaries
        .flatMap((s) =>
          s.transfers
            .filter((t) => t.fromUserId === myId || t.toUserId === myId)
            .map((t) => ({
              ...t,
              groupId: s.group.id,
              groupName: s.group.name,
              currency: s.group.currency,
            })),
        )
        // Debts you owe first, then the largest amounts.
        .sort((a, b) => Number(b.fromUserId === myId) - Number(a.fromUserId === myId) || b.amount - a.amount),
    [summaries, myId],
  );

  const settle = (p: PendingPayment) =>
    router.push({
      pathname: '/settle',
      params: {
        groupId: p.groupId,
        from: p.fromUserId,
        to: p.toUserId,
        amount: String(p.amount),
      },
    });

  const me = data.people[myId]?.name;
  const hasGroups = summaries.length > 0;

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: brand.deep,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  const header = (
    <>
      <HeroTitle
        eyebrow={`${greeting()},`}
        title={firstName(me) || 'there'}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push('/profile')} hitSlop={8}>
            <Avatar name={me || '?'} size={44} color="rgba(124,196,255,0.25)" />
          </Pressable>
        }
      />

      {hasGroups ? (
        <>
          <View style={{ marginTop: space.xl, gap: space.xs }}>
            <Text variant="label" color={onDeepMuted}>
              Your net balance
            </Text>
            <Text
              style={{
                fontSize: 44,
                fontWeight: '800',
                letterSpacing: -1,
                color: brand.onDeep,
                fontVariant: ['tabular-nums'],
              }}>
              {primary.amount > 0 ? '+' : primary.amount < 0 ? '−' : ''}
              {formatMoney(Math.abs(primary.amount), primary.currency)}
            </Text>
            <Text variant="body" color={primary.amount === 0 ? onDeepMuted : primary.amount > 0 ? brand.accent : oweOnDeep}>
              {primary.amount === 0
                ? 'You’re all settled up'
                : primary.amount > 0
                  ? 'Overall, you’re owed money'
                  : 'Overall, you owe money'}
            </Text>
            {others.length > 0 ? (
              <Text variant="caption" color={onDeepMuted}>
                Also: {others.map((o) => `${o.amount >= 0 ? '+' : '−'}${formatMoney(Math.abs(o.amount), o.currency)}`).join(' · ')}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
            <TotalPill label="You’re owed" cents={owed} currency={primary.currency} tone="owed" />
            <TotalPill label="You owe" cents={owe} currency={primary.currency} tone="owe" />
          </View>
        </>
      ) : (
        <View style={{ marginTop: space.xl, gap: space.sm }}>
          <TallyMark size={48} />
          <Text variant="title" color={brand.onDeep}>
            Let’s get you set up
          </Text>
          <Text variant="body" color={onDeepMuted}>
            Create a group for a trip, your flat or a night out, then add what everyone spends.
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', marginTop: space.xl }}>
        <QuickAction
          icon="+"
          label="Add expense"
          primary
          onPress={() => (hasGroups ? router.push('/add-expense') : router.push('/new-group'))}
        />
        <QuickAction icon="⇄" label="Settle up" onPress={() => (pending[0] ? settle(pending[0]) : router.push('/groups'))} />
        <QuickAction icon="◎" label="New group" onPress={() => router.push('/new-group')} />
      </View>
    </>
  );

  const groupsSection = hasGroups ? (
    <View style={{ gap: space.md }}>
      <SectionTitle title="Your groups" action="See all" onAction={() => router.push('/groups')} />
      {wide ? (
        // A grid that wraps across the full width instead of a sideways carousel.
        <Gutter>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {summaries.map((s) => (
              <GroupCard key={s.group.id} summary={s} />
            ))}
            <NewGroupCard />
          </View>
        </Gutter>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
          {summaries.map((s) => (
            <GroupCard key={s.group.id} summary={s} />
          ))}
          <NewGroupCard />
        </ScrollView>
      )}
    </View>
  ) : null;

  const activitySection = hasGroups ? (
    <View style={{ gap: space.md }}>
      <SectionTitle title="Recent activity" action="See all" onAction={() => router.push('/activity')} />
      <Gutter>
        <ActivityList limit={wide ? 10 : 6} />
      </Gutter>
    </View>
  ) : null;

  const errorSection = error ? (
    <Gutter>
      <Notice>Couldn’t refresh. Pull down to try again.</Notice>
    </Gutter>
  ) : null;

  const startSection = !hasGroups ? (
    <Gutter>
      <Card>
        <Pressable onPress={() => router.push('/new-group')} style={{ gap: space.xs }}>
          <Text variant="heading">Create a group</Text>
          <Text muted>For a trip, a flat, a dinner club, anything shared.</Text>
        </Pressable>
      </Card>
      <Card>
        <Pressable onPress={() => router.push('/groups')} style={{ gap: space.xs }}>
          <Text variant="heading">Join with an invite code</Text>
          <Text muted>Someone shared a Tally group with you? Paste the code on the Groups tab.</Text>
        </Pressable>
      </Card>
    </Gutter>
  ) : null;

  const settleSection =
    pending.length > 0 ? (
      <View style={{ gap: space.md }}>
        <SectionTitle title="Settle up" />
        <Gutter>
          <Card style={{ paddingVertical: 0 }}>
            {pending.slice(0, 4).map((p, i) => {
              const iOwe = p.fromUserId === myId;
              const other = iOwe ? p.toUserId : p.fromUserId;
              return (
                <View key={`${p.groupId}-${p.fromUserId}-${p.toUserId}`}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    onPress={() => settle(p)}
                    android_ripple={{ color: c.surfaceAlt }}
                    unstable_pressDelay={PRESS_DELAY}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      paddingVertical: space.md,
                    }}>
                    <Avatar name={name(other)} size={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="heading" numberOfLines={1}>
                        {iOwe ? `You owe ${name(other)}` : `${name(other)} owes you`}
                      </Text>
                      <Text variant="caption" muted numberOfLines={1}>
                        {p.groupName}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: space.xs }}>
                      <Text variant="heading" color={iOwe ? c.owe : c.owed} style={{ fontVariant: ['tabular-nums'] }}>
                        {formatMoney(p.amount, p.currency)}
                      </Text>
                      <View
                        style={{
                          backgroundColor: iOwe ? c.primary : c.surfaceAlt,
                          borderRadius: radius.pill,
                          paddingHorizontal: space.md,
                          paddingVertical: 4,
                        }}>
                        <Text variant="caption" color={iOwe ? c.onPrimary : c.text} style={{ fontWeight: '600' }}>
                          {iOwe ? 'Pay' : 'Record'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </Gutter>
      </View>
    ) : null;

  // ─── Unfolded: the same scrolling page, full width, with a summary laid out for the room ──
  if (wide) {
    const balanceWord =
      primary.amount === 0 ? 'You’re all settled up' : primary.amount > 0 ? 'Overall, you’re owed money' : 'Overall, you owe money';
    const wideHeader = (
      <>
        <Text variant="body" color={onDeepMuted}>{`${greeting()},`}</Text>
        <Text variant="title" color={brand.onDeep} numberOfLines={1}>
          {firstName(me) || 'there'}
        </Text>
        {hasGroups ? (
          <View
            style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.xl, marginTop: space.xl }}>
            <View style={{ gap: space.xs, flexShrink: 1 }}>
              <Text variant="label" color={onDeepMuted}>
                Your net balance
              </Text>
              <Text style={{ fontSize: 48, fontWeight: '800', letterSpacing: -1, color: brand.onDeep, fontVariant: ['tabular-nums'] }}>
                {primary.amount > 0 ? '+' : primary.amount < 0 ? '−' : ''}
                {formatMoney(Math.abs(primary.amount), primary.currency)}
              </Text>
              <Text variant="body" color={primary.amount === 0 ? onDeepMuted : primary.amount > 0 ? brand.accent : oweOnDeep}>
                {balanceWord}
              </Text>
              {others.length > 0 ? (
                <Text variant="caption" color={onDeepMuted}>
                  Also: {others.map((o) => `${o.amount >= 0 ? '+' : '−'}${formatMoney(Math.abs(o.amount), o.currency)}`).join(' · ')}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ width: 200 }}>
                <TotalPill label="You’re owed" cents={owed} currency={primary.currency} tone="owed" />
              </View>
              <View style={{ width: 200 }}>
                <TotalPill label="You owe" cents={owe} currency={primary.currency} tone="owe" />
              </View>
            </View>
          </View>
        ) : (
          <View style={{ marginTop: space.xl, gap: space.sm }}>
            <TallyMark size={48} />
            <Text variant="title" color={brand.onDeep}>
              Let’s get you set up
            </Text>
            <Text variant="body" color={onDeepMuted}>
              Create a group for a trip, your flat or a night out, then add what everyone spends.
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xl }}>
          <BandAction
            icon="+"
            label="Add expense"
            primary
            onPress={() => (hasGroups ? router.push('/add-expense') : router.push('/new-group'))}
          />
          <BandAction icon="⇄" label="Settle up" onPress={() => (pending[0] ? settle(pending[0]) : router.push('/groups'))} />
          <BandAction icon="◎" label="New group" onPress={() => router.push('/new-group')} />
        </View>
      </>
    );
    return (
      <HeroScreen header={wideHeader} fullWidth refreshing={isRefetching} onRefresh={() => void refetch()}>
        {errorSection}
        {startSection}
        {settleSection}
        {groupsSection}
        {activitySection}
      </HeroScreen>
    );
  }

  // ─── Folded: navy header and one scrolling column ────────────────────────
  return (
    <HeroScreen header={header} refreshing={isRefetching} onRefresh={() => void refetch()}>
      {errorSection}
      {startSection}
      {settleSection}
      {groupsSection}
      {activitySection}
    </HeroScreen>
  );
}
