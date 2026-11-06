import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { TallyMark } from '@/components/brand';
import { Gutter, HeroScreen, HeroTitle, onDeepMuted, SectionTitle } from '@/components/dashboard';
import { balanceSentence, FloatingButton, GroupRow } from '@/components/friendly';
import { Avatar, Card, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { netByCurrency, useNameOf, useTallyData } from '@/lib/data';
import { firstName, greeting } from '@/lib/format';
import { useWidthClass } from '@/lib/layout';
import { usePullToRefresh } from '@/lib/pull-to-refresh';
import { soleOther, useGroupSummaries } from '@/store/hooks';
import { brand, space } from '@/theme';

/**
 * Home: a greeting, one sentence about where you stand overall, and your groups.
 * Everything else (history, settling) is one tap away inside a group or on the Activity tab.
 */
export default function HomeScreen() {
  const myId = useMyId();
  const name = useNameOf();
  const { data, isLoading, error, refetch } = useTallyData();
  const pull = usePullToRefresh(refetch);
  const summaries = useGroupSummaries();
  const wide = useWidthClass() === 'expanded';

  // The currency with the biggest balance leads; any others are listed quietly underneath.
  const { primary, others } = useMemo(() => {
    const totals = netByCurrency(summaries);
    const main = [...totals].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    return { primary: main ?? { currency: 'USD', amount: 0 }, others: totals.filter((t) => t !== main) };
  }, [summaries]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: brand.deep, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  const me = data.people[myId]?.name;
  const hasGroups = summaries.length > 0;

  const header = (
    <>
      <HeroTitle
        eyebrow={`${greeting()},`}
        title={firstName(me) || 'there'}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push('/profile')} hitSlop={8}>
            <Avatar name={me || '?'} size={44} color={brand.tintOnDeep} />
          </Pressable>
        }
      />
      {hasGroups ? (
        <View style={{ marginTop: space.xl, gap: space.xs }}>
          <Text variant="display" color={brand.onDeep} style={{ fontSize: 30 }}>
            {balanceSentence(primary.amount, primary.currency)}
          </Text>
          <Text variant="body" color={onDeepMuted}>
            {summaries.length === 1 ? 'in your group' : `across ${summaries.length} groups`}
            {others.length > 0
              ? ` · also ${others.map((o) => `${o.amount >= 0 ? '+' : '−'}${formatMoney(Math.abs(o.amount), o.currency)}`).join(', ')}`
              : ''}
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: space.xl, gap: space.sm }}>
          <TallyMark size={48} />
          <Text variant="title" color={brand.onDeep}>
            Let’s get you set up
          </Text>
          <Text variant="body" color={onDeepMuted}>
            Make a group for your flat, a trip or a night out.
          </Text>
        </View>
      )}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <HeroScreen header={header} fullWidth={wide} refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
        {error ? (
          <Gutter>
            <Notice>Couldn’t refresh. Pull down to try again.</Notice>
          </Gutter>
        ) : null}

        {hasGroups ? (
          <View style={{ gap: space.md }}>
            <SectionTitle title="Your groups" action="+ New" onAction={() => router.push('/new-group')} />
            <Gutter>
              <View style={wide ? { flexDirection: 'row', flexWrap: 'wrap', gap: space.md } : { gap: space.md }}>
                {summaries.map((s) => {
                  const other = soleOther(s, myId);
                  return (
                    <View key={s.group.id} style={wide ? { width: 360 } : undefined}>
                      <GroupRow
                        group={s.group}
                        myBalance={s.myBalance}
                        other={other ? name(other) : undefined}
                        onPress={() => router.push(`/group/${s.group.id}`)}
                      />
                    </View>
                  );
                })}
              </View>
            </Gutter>
          </View>
        ) : (
          <Gutter>
            <Card>
              <Pressable onPress={() => router.push('/groups')} style={{ gap: space.xs }}>
                <Text variant="heading">Got an invite?</Text>
                <Text muted>Paste the code on the Groups tab to join.</Text>
              </Pressable>
            </Card>
          </Gutter>
        )}

        {/* Room so the last group isn't hidden behind the floating button. */}
        <View style={{ height: 72 }} />
      </HeroScreen>

      <FloatingButton
        label={hasGroups ? 'Add expense' : 'New group'}
        onPress={() => router.push(hasGroups ? '/add-expense' : '/new-group')}
      />
    </View>
  );
}
