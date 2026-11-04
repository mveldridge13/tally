import { formatMoney } from '@tally/shared';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ActivityList } from '@/components/activity-list';
import { TallyMark } from '@/components/brand';
import { FilterChips, Gutter, HeroScreen, HeroTitle, onDeepMuted, TotalPill } from '@/components/dashboard';
import { Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { useTallyData } from '@/lib/data';
import { dayLabel } from '@/lib/format';
import { useWidthClass } from '@/lib/layout';
import { useActivity, type ActivityItem } from '@/store/hooks';
import { brand, space } from '@/theme';
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

  const header = (
    <>
      <HeroTitle eyebrow="Activity" title={hasAny ? `${month.label} so far` : 'Nothing yet'} />
      {hasAny ? (
        <>
          <View style={{ marginTop: space.xl, gap: space.xs }}>
            <Text variant="label" color={onDeepMuted}>
              Your share of spending
            </Text>
            <Text
              style={{
                fontSize: 40,
                fontWeight: '800',
                letterSpacing: -1,
                color: brand.onDeep,
                fontVariant: ['tabular-nums'],
              }}>
              {formatMoney(month.myShare, month.currency)}
            </Text>
            <Text variant="caption" color={onDeepMuted}>
              What you’ve spent this month, after splitting with others.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
            <TotalPill label="Expenses" value={String(month.expenses)} tone="owed" />
            <TotalPill label="Payments" value={String(month.payments)} tone="neutral" />
          </View>
        </>
      ) : (
        <View style={{ marginTop: space.xl, gap: space.sm }}>
          <TallyMark size={48} />
          <Text variant="body" color={onDeepMuted}>
            Expenses and payments from all your groups will appear here. Tap any item to see the details.
          </Text>
        </View>
      )}
    </>
  );

  // Filters and the feed, shared by the folded and unfolded layouts.
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
        <View style={{ gap: space.xs, flexShrink: 1 }}>
          <Text variant="body" color={onDeepMuted}>
            Activity
          </Text>
          <Text variant="title" color={brand.onDeep}>
            {hasAny ? `${month.label} so far` : 'Nothing yet'}
          </Text>
          {hasAny ? (
            <>
              <Text variant="label" color={onDeepMuted} style={{ marginTop: space.lg }}>
                Your share of spending
              </Text>
              <Text style={{ fontSize: 48, fontWeight: '800', letterSpacing: -1, color: brand.onDeep, fontVariant: ['tabular-nums'] }}>
                {formatMoney(month.myShare, month.currency)}
              </Text>
              <Text variant="caption" color={onDeepMuted}>
                What you’ve spent this month, after splitting with others.
              </Text>
            </>
          ) : (
            <Text variant="body" color={onDeepMuted} style={{ marginTop: space.lg }}>
              Expenses and payments from all your groups will appear here. Tap any item to see the details.
            </Text>
          )}
        </View>
        {hasAny ? (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ width: 180 }}>
              <TotalPill label="Expenses" value={String(month.expenses)} tone="owed" />
            </View>
            <View style={{ width: 180 }}>
              <TotalPill label="Payments" value={String(month.payments)} tone="neutral" />
            </View>
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <HeroScreen header={wideHeader} fullWidth refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      {body}
    </HeroScreen>
  );
}
