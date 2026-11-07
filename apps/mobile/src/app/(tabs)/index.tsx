import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { TallyMark } from '@/components/brand';
import { ToSettle } from '@/components/to-settle';
import { Gutter, HeroScreen, PositionFigure, QuickAction, StatRow, TotalPill, usePosition } from '@/components/dashboard';
import { Avatar, Card, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { useTallyData } from '@/lib/data';
import { firstName, greeting } from '@/lib/format';
import { useWidthClass } from '@/lib/layout';
import { usePullToRefresh } from '@/lib/pull-to-refresh';
import { useGroupSummaries } from '@/store/hooks';
import { brand, space, useColors } from '@/theme';

/**
 * Home: a greeting, the two main actions (Add expense, New group), where you stand overall,
 * and a collapsible list of who to settle with. Groups and history live on their own tabs.
 */
export default function HomeScreen() {
  const myId = useMyId();
  const c = useColors();
  const { data, isLoading, error, refetch } = useTallyData();
  const pull = usePullToRefresh(refetch);
  const summaries = useGroupSummaries();
  const wide = useWidthClass() === 'expanded';

  const { primary, owedTotal, oweTotal } = usePosition(summaries);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: brand.deep, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  const me = data.people[myId]?.name;
  const hasGroups = summaries.length > 0;

  const card = hasGroups ? (
    <>
      <PositionFigure summaries={summaries} />
      <StatRow>
        <TotalPill label="You’re owed" cents={owedTotal} currency={primary.currency} tone="owed" />
        <TotalPill label="You owe" cents={oweTotal} currency={primary.currency} tone="owe" />
      </StatRow>
    </>
  ) : (
    <View style={{ gap: space.sm }}>
      <TallyMark size={48} color={c.primary} />
      <Text variant="title">Let’s get you set up</Text>
      <Text variant="body" muted>
        Make a group for your flat, a trip or a night out.
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <HeroScreen
        nav="tab"
        title={`${greeting()}, ${firstName(me) || 'there'}`}
        subtitle={hasGroups ? 'Here’s where you stand with your groups.' : 'Welcome to Tally.'}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push('/profile')} hitSlop={8}>
            <Avatar name={me || '?'} size={44} />
          </Pressable>
        }
        actions={
          <>
            <QuickAction
              bold
              icon="add-circle-outline"
              label="Add expense"
              onPress={() => router.push(hasGroups ? '/add-expense' : '/new-group')}
            />
            <QuickAction bold icon="group-add" label="New group" onPress={() => router.push('/new-group')} />
          </>
        }
        card={card}
        cardTone="light"
        fullWidth={wide}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}>
        {error ? (
          <Gutter>
            <Notice>Couldn’t refresh. Pull down to try again.</Notice>
          </Gutter>
        ) : null}

        {hasGroups ? <ToSettle /> : null}

        {hasGroups ? null : (
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
