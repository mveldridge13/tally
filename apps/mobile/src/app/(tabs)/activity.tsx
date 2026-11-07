import { formatMoney } from '@tally/shared';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ActivityList } from '@/components/activity-list';
import { TallyMark } from '@/components/brand';
import { CardFigure, FilterChips, Gutter, HeroScreen, onDeepMuted, StatRow, TotalPill } from '@/components/dashboard';
import { Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { useTallyData } from '@/lib/data';
import { dayLabel } from '@/lib/format';
import { useWidthClass } from '@/lib/layout';
import { useActivity, type ActivityItem } from '@/store/hooks';
import { space } from '@/theme';
import { usePullToRefresh } from '@/lib/pull-to-refresh';

type Kind = 'all' | 'expenses' | 'payments' | 'mine';

export default function ActivityScreen() {
  const myId = useMyId();
  const { data, refetch, error } = useTallyData();
  const pull = usePullToRefresh(refetch);
  const all = useActivity();
  const [kind, setKind] = useState<Kind>('all');
  const [groupId, setGroupId] = useState<string>('all');
  // Unfolded (expanded width): one full-width page.
  const wide = useWidthClass() === 'expanded';

  // This month's figures, in the currency you use most.
  const month = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonth = data.expenses.filter((e) => e.occurredAt >= start);
    const byCurrency = new Map<string, number>();
    for (const e of thisMonth) {
      const currency = data.groups.find((g) => g.id === e.groupId)?.currency ?? 'USD';
      const share = e.splits.find((s) => s.userId === myId)?.amount ?? 0;
      byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + share);
    }
    const [currency, myShare] = [...byCurrency].sort((a, b) => b[1] - a[1])[0] ?? ['USD', 0];
    return {
      label: now.toLocaleDateString(undefined, { month: 'long' }),
      currency,
      myShare,
      expenses: thisMonth.length,
      payments: data.settlements.filter((s) => s.occurredAt >= start).length,
    };
  }, [data, myId]);

  const filtered = useMemo(
    () =>
      all.filter(
        (i) =>
          (groupId === 'all' || i.groupId === groupId) &&
          (kind === 'all' ||
            (kind === 'expenses' && i.kind === 'expense') ||
            (kind === 'payments' && i.kind === 'settlement') ||
            (kind === 'mine' && i.involved)),
      ),
    [all, kind, groupId],
  );

  // Split into day sections, keeping the newest-first order.
  const sections = useMemo(() => {
    const out: { label: string; items: ActivityItem[] }[] = [];
    for (const item of filtered) {
      const label = dayLabel(item.at);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [filtered]);

  const hasAny = all.length > 0;

  const card = hasAny ? (
    <>
      <CardFigure
        label="Your share of spending"
        value={formatMoney(month.myShare, month.currency)}
        note="What you’ve spent this month, after splitting with others."
      />
      <StatRow>
        <TotalPill label="Expenses" value={String(month.expenses)} tone="neutral" />
        <TotalPill label="Payments" value={String(month.payments)} tone="neutral" />
      </StatRow>
    </>
  ) : (
    <View style={{ gap: space.sm }}>
      <TallyMark size={48} />
      <Text variant="body" color={onDeepMuted}>
        Expenses and payments from all your groups will appear here. Tap any item to see the details.
      </Text>
    </View>
  );

  // Filters and the feed.
  const body = (
    <>
      {error ? (
        <Gutter>
          <Notice>Couldn’t refresh. Pull down to try again.</Notice>
        </Gutter>
      ) : null}

      {hasAny ? (
        <View style={{ gap: space.sm }}>
          <FilterChips<Kind>
            value={kind}
            onChange={setKind}
            options={[
              { id: 'all', label: 'All' },
              { id: 'expenses', label: 'Expenses' },
              { id: 'payments', label: 'Payments' },
              { id: 'mine', label: 'Only mine' },
            ]}
          />
          {data.groups.length > 1 ? (
            <FilterChips<string>
              value={groupId}
              onChange={setGroupId}
              options={[{ id: 'all', label: 'All groups' }, ...data.groups.map((g) => ({ id: g.id, label: g.name }))]}
            />
          ) : null}
        </View>
      ) : null}

      {hasAny && sections.length === 0 ? (
        <Gutter>
          <ActivityList items={[]} emptyText="Nothing matches these filters." />
        </Gutter>
      ) : null}

      {sections.map((s) => (
        <View key={s.label} style={{ gap: space.sm }}>
          <Text
            variant="label"
            muted
            style={{
              paddingHorizontal: space.lg,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              fontSize: 12,
            }}>
            {s.label}
          </Text>
          <Gutter>
            <ActivityList items={s.items} />
          </Gutter>
        </View>
      ))}

      {!hasAny ? (
        <Gutter>
          <ActivityList
            items={[]}
            emptyText="No activity yet. Once someone adds an expense or records a payment in one of your groups, it’ll show up here."
          />
        </Gutter>
      ) : null}
    </>
  );

  return (
    <HeroScreen
      nav="tab"
      title="Activity"
      subtitle={hasAny ? `${month.label} so far` : 'Nothing yet'}
      card={card}
      fullWidth={wide}
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}>
      {body}
    </HeroScreen>
  );
}
