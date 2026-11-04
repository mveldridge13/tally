import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { TallyMark } from '@/components/brand';
import {
  FilterChips,
  GroupListCard,
  Gutter,
  HeroScreen,
  HeroTitle,
  onDeepMuted,
  QuickAction,
  SectionTitle,
  TotalPill,
  BandAction,
} from '@/components/dashboard';
import { Button, Card, Field, Notice, Text } from '@/components/ui';
import { useTallyData } from '@/lib/data';
import { useWidthClass } from '@/lib/layout';
import { useGroupSummaries } from '@/store/hooks';
import { brand, space } from '@/theme';
import { inviteCodeFrom } from '@/lib/invite';
import { usePullToRefresh } from '@/lib/pull-to-refresh';

type Filter = 'all' | 'owed' | 'owe' | 'settled';

export default function GroupsScreen() {
  const { data, refetch, error } = useTallyData();
  const pull = usePullToRefresh(refetch);
  const summaries = useGroupSummaries();
  const [filter, setFilter] = useState<Filter>('all');
  const [code, setCode] = useState('');
  // Unfolded (expanded width): one full-width page; group cards two per row.
  const wide = useWidthClass() === 'expanded';
  const codeRef = useRef<TextInputInstance>(null);

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

  const join = () => {
    const token = inviteCodeFrom(code);
    if (!token) return;
    router.push(`/invite/${token}`);
    setCode('');
  };

  const header = (
    <>
      <HeroTitle
        eyebrow="Your groups"
        title={summaries.length ? `${summaries.length} ${summaries.length === 1 ? 'group' : 'groups'}` : 'Groups'}
      />

      {summaries.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.xl }}>
          <TotalPill label="Owe you" value={String(counts.owed)} tone="owed" />
          <TotalPill label="You owe" value={String(counts.owe)} tone="owe" />
          <TotalPill label="Settled" value={String(counts.settled)} tone="neutral" />
        </View>
      ) : (
        <View style={{ marginTop: space.xl, gap: space.sm }}>
          <TallyMark size={48} />
          <Text variant="body" color={onDeepMuted}>
            A group is the people you share costs with: a trip, your flat, a dinner club.
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', marginTop: space.xl }}>
        <QuickAction icon="+" label="New group" primary onPress={() => router.push('/new-group')} />
        <QuickAction icon="→" label="Join a group" onPress={() => codeRef.current?.focus()} />
        <QuickAction
          icon="$"
          label="Add expense"
          onPress={() => (summaries.length ? router.push('/add-expense') : router.push('/new-group'))}
        />
      </View>
    </>
  );

  // The list, filters and join card, shared by the folded and unfolded layouts.
  const body = (
    <>
      {error ? (
        <Gutter>
          <Notice>Couldn’t refresh. Pull down to try again.</Notice>
        </Gutter>
      ) : null}

      {summaries.length > 0 ? (
        <View style={{ gap: space.md }}>
          <FilterChips<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'owed', label: 'Owe you', count: counts.owed },
              { id: 'owe', label: 'You owe', count: counts.owe },
              { id: 'settled', label: 'Settled', count: counts.settled },
            ]}
          />
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

      <View style={{ gap: space.md }}>
        <SectionTitle title="Join a group" />
        <Gutter>
          <Card style={{ gap: space.md }}>
            <Text muted>Got an invite? Paste the code someone shared with you.</Text>
            <Field
              ref={codeRef}
              label="Invite code"
              value={code}
              onChangeText={setCode}
              placeholder="e.g. 3f9a1c…"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={join}
            />
            <Button label="Join group" onPress={join} disabled={!code.trim()} />
          </Card>
          <Button kind="secondary" label="Create a new group" onPress={() => router.push('/new-group')} />
        </Gutter>
      </View>
    </>
  );

  if (!wide) {
    return (
      <HeroScreen header={header} refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
        {body}
      </HeroScreen>
    );
  }

  // ─── Unfolded: the same page, full width, with the summary spread across it ──
  const wideHeader = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.xl }}>
        <View style={{ flexShrink: 1 }}>
          <Text variant="body" color={onDeepMuted}>
            Your groups
          </Text>
          <Text variant="title" color={brand.onDeep}>
            {summaries.length ? `${summaries.length} ${summaries.length === 1 ? 'group' : 'groups'}` : 'Groups'}
          </Text>
        </View>
        {summaries.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ width: 160 }}>
              <TotalPill label="Owe you" value={String(counts.owed)} tone="owed" />
            </View>
            <View style={{ width: 160 }}>
              <TotalPill label="You owe" value={String(counts.owe)} tone="owe" />
            </View>
            <View style={{ width: 160 }}>
              <TotalPill label="Settled" value={String(counts.settled)} tone="neutral" />
            </View>
          </View>
        ) : null}
      </View>
      {summaries.length === 0 ? (
        <Text variant="body" color={onDeepMuted} style={{ marginTop: space.lg }}>
          A group is the people you share costs with: a trip, your flat, a dinner club.
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xl }}>
        <BandAction icon="+" label="New group" primary onPress={() => router.push('/new-group')} />
        <BandAction icon="→" label="Join a group" onPress={() => codeRef.current?.focus()} />
        <BandAction
          icon="$"
          label="Add expense"
          onPress={() => (summaries.length ? router.push('/add-expense') : router.push('/new-group'))}
        />
      </View>
    </>
  );

  return (
    <HeroScreen header={wideHeader} fullWidth refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      {body}
    </HeroScreen>
  );
}
