import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { TallyMark } from '@/components/brand';
import { GroupListCard, PositionFigure, Gutter, HeroScreen, CardText, QuickAction, StatRow, TotalPill } from '@/components/dashboard';
import { Sheet } from '@/components/friendly';
import { Button, Card, Field, Notice, Text } from '@/components/ui';
import { inviteCodeFrom } from '@/lib/invite';
import { useTallyData } from '@/lib/data';
import { useWidthClass } from '@/lib/layout';
import { useGroupSummaries } from '@/store/hooks';
import { brand, space } from '@/theme';
import { usePullToRefresh } from '@/lib/pull-to-refresh';

type Filter = 'all' | 'owed' | 'owe' | 'settled';
const FILTER_WORDS: Record<Exclude<Filter, 'all'>, string> = {
  owed: 'groups that owe you',
  owe: 'groups you owe',
  settled: 'settled groups',
};

export default function GroupsScreen() {
  const { data, refetch, error } = useTallyData();
  const pull = usePullToRefresh(refetch);
  const summaries = useGroupSummaries();
  const [filter, setFilter] = useState<Filter>('all');
  // Tap a figure on the card to show only those groups; tap it again to show them all.
  const toggle = (f: Exclude<Filter, 'all'>) => setFilter((cur) => (cur === f ? 'all' : f));
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const closeJoin = () => {
    setJoining(false);
    setCode('');
  };
  const join = () => {
    const token = inviteCodeFrom(code);
    if (!token) return;
    closeJoin();
    router.push(`/invite/${token}`);
  };
  // Unfolded (expanded width): one full-width page; group cards two per row.
  const wide = useWidthClass() === 'expanded';

  // Most recent expense or payment per group, for "2h ago" and sorting.
  const lastActivity = useMemo(() => {
    const latest = new Map<string, string>();
    for (const item of [
      ...data.expenses.map((e) => ({ g: e.groupId, at: e.occurredAt })),
      ...data.settlements.map((s) => ({ g: s.groupId, at: s.occurredAt })),
    ]) {
      const prev = latest.get(item.g);
      if (!prev || item.at > prev) latest.set(item.g, item.at);
    }
    return latest;
  }, [data]);

  const counts = useMemo(
    () => ({
      all: summaries.length,
      owed: summaries.filter((s) => s.myBalance > 0).length,
      owe: summaries.filter((s) => s.myBalance < 0).length,
      settled: summaries.filter((s) => s.myBalance === 0).length,
    }),
    [summaries],
  );

  const visible = useMemo(
    () =>
      summaries
        .filter((s) =>
          filter === 'all' ? true : filter === 'owed' ? s.myBalance > 0 : filter === 'owe' ? s.myBalance < 0 : s.myBalance === 0,
        )
        // Most recently active first; groups with no activity keep creation order at the end.
        .sort((a, b) => (lastActivity.get(b.group.id) ?? '').localeCompare(lastActivity.get(a.group.id) ?? '')),
    [summaries, filter, lastActivity],
  );

  const card =
    summaries.length > 0 ? (
      <>
        <PositionFigure summaries={summaries} />
        <StatRow>
          <TotalPill label="Owe you" value={String(counts.owed)} tone="owed" selected={filter === 'owed'} onPress={() => toggle('owed')} />
          <TotalPill label="You owe" value={String(counts.owe)} tone="owe" selected={filter === 'owe'} onPress={() => toggle('owe')} />
          <TotalPill
            label="Settled"
            value={String(counts.settled)}
            tone="neutral"
            selected={filter === 'settled'}
            onPress={() => toggle('settled')}
          />
        </StatRow>
        <CardText variant="caption" muted style={{ marginTop: space.sm }}>
          {filter === 'all' ? 'Tap a figure to filter your groups' : `Showing ${FILTER_WORDS[filter]} · tap again for all`}
        </CardText>
      </>
    ) : (
      <View style={{ gap: space.sm }}>
        <TallyMark size={48} color={brand.deep} />
        <CardText muted>A group is the people you share costs with: a trip, your flat, a dinner club.</CardText>
      </View>
    );

  // The list (filtered by tapping a figure on the card).
  const body = (
    <>
      {error ? (
        <Gutter>
          <Notice>Couldn’t refresh. Pull down to try again.</Notice>
        </Gutter>
      ) : null}

      {summaries.length > 0 ? (
        <View style={{ gap: space.md }}>
          <Gutter>
            {visible.length === 0 ? (
              <Card>
                <Text muted>No groups here.</Text>
              </Card>
            ) : (
              <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: space.md }}>
                {visible.map((s) => (
                  <View key={s.group.id} style={{ width: wide ? '48.8%' : '100%' }}>
                    <GroupListCard summary={s} lastActivity={lastActivity.get(s.group.id)} />
                  </View>
                ))}
              </View>
            )}
          </Gutter>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <HeroScreen
        nav="tab"
        title="Your groups"
        subtitle={summaries.length ? `${summaries.length} ${summaries.length === 1 ? 'group' : 'groups'}` : 'No groups yet'}
        actions={
          <>
            <QuickAction bold icon="group-add" label="New group" onPress={() => router.push('/new-group')} />
            <QuickAction bold icon="link" label="Join group" onPress={() => setJoining(true)} />
          </>
        }
        card={card}
        cardTone="light"
        fullWidth={wide}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}>
        {body}
      </HeroScreen>

      {/* Join with a code or link someone shared, for when tapping the link didn't open Tally. */}
      <Sheet
        visible={joining}
        onClose={closeJoin}
        title="Join a group"
        footer={<Button label="Join group" onPress={join} disabled={!inviteCodeFrom(code)} />}>
        <Field
          label="Invite code or link"
          value={code}
          onChangeText={setCode}
          placeholder="Paste it here"
          autoCapitalize="none"
          autoCorrect={false}
          // Keyboard opens with the sheet, so the panel and keyboard rise together in one movement.
          autoFocus
          returnKeyType="go"
          onSubmitEditing={join}
        />
      </Sheet>
    </View>
  );
}
