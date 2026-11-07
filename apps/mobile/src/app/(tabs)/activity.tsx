import { formatMoney } from '@tally/shared';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActivityList } from '@/components/activity-list';
import { TallyMark } from '@/components/brand';
import { CardFigure, CardText, Gutter, HeroScreen, StatRow, TotalPill } from '@/components/dashboard';
import { MenuRow, Sheet } from '@/components/friendly';
import { Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { useTallyData } from '@/lib/data';
import { dayLabel } from '@/lib/format';
import { useWidthClass } from '@/lib/layout';
import { useActivity, type ActivityItem } from '@/store/hooks';
import { brand, radius, space, useColors } from '@/theme';
import { usePullToRefresh } from '@/lib/pull-to-refresh';

type Kind = 'all' | 'expenses' | 'payments' | 'mine';
const KIND_WORDS: Record<Exclude<Kind, 'all'>, string> = { expenses: 'expenses', payments: 'payments', mine: 'items with you in them' };

export default function ActivityScreen() {
  const c = useColors();
  const myId = useMyId();
  const { data, refetch, error } = useTallyData();
  const pull = usePullToRefresh(refetch);
  const all = useActivity();
  const [kind, setKind] = useState<Kind>('all');
  const [groupId, setGroupId] = useState<string>('all');
  const [pickingGroup, setPickingGroup] = useState(false);
  // Tap a figure on the card to show only those items; tap it again to show everything.
  const toggle = (k: Exclude<Kind, 'all'>) => setKind((cur) => (cur === k ? 'all' : k));
  const groupName = groupId === 'all' ? 'All groups' : (data.groups.find((g) => g.id === groupId)?.name ?? 'All groups');
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

  // How many of each kind are in the feed (for the chosen group), shown on the card.
  const counts = useMemo(() => {
    const inGroup = all.filter((i) => groupId === 'all' || i.groupId === groupId);
    return {
      expenses: inGroup.filter((i) => i.kind === 'expense').length,
      payments: inGroup.filter((i) => i.kind === 'settlement').length,
      mine: inGroup.filter((i) => i.involved).length,
    };
  }, [all, groupId]);

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
      <CardFigure label={`Your share of spending in ${month.label}`} value={formatMoney(month.myShare, month.currency)} />
      <StatRow>
        <TotalPill
          label="Expenses"
          value={String(counts.expenses)}
          tone="neutral"
          selected={kind === 'expenses'}
          onPress={() => toggle('expenses')}
        />
        <TotalPill
          label="Payments"
          value={String(counts.payments)}
          tone="neutral"
          selected={kind === 'payments'}
          onPress={() => toggle('payments')}
        />
        <TotalPill label="With you" value={String(counts.mine)} tone="neutral" selected={kind === 'mine'} onPress={() => toggle('mine')} />
      </StatRow>
      <CardText variant="caption" muted style={{ marginTop: space.sm }}>
        {kind === 'all' ? 'Tap a figure to filter' : `Showing ${KIND_WORDS[kind]} · tap again for all`}
      </CardText>
    </>
  ) : (
    <View style={{ gap: space.sm }}>
      <TallyMark size={48} color={brand.deep} />
      <CardText muted>Expenses and payments from all your groups will appear here. Tap any item to see the details.</CardText>
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

      {/* One compact group picker instead of a row of chips per group. */}
      {hasAny && data.groups.length > 1 ? (
        <Gutter>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Group: ${groupName}. Change`}
            onPress={() => setPickingGroup(true)}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              paddingVertical: space.sm,
              paddingLeft: space.md,
              paddingRight: space.sm,
              borderRadius: radius.pill,
              backgroundColor: c.surfaceAlt,
              opacity: pressed ? 0.8 : 1,
            })}>
            <Text variant="label" numberOfLines={1} style={{ maxWidth: 240 }}>
              {groupName}
            </Text>
            <MaterialIcons name="expand-more" size={20} color={c.textMuted} />
          </Pressable>
        </Gutter>
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
    <View style={{ flex: 1 }}>
      <HeroScreen
        nav="tab"
        title="Activity"
        subtitle={hasAny ? 'Across all your groups' : 'Nothing yet'}
        card={card}
        cardTone="light"
        fullWidth={wide}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}>
        {body}
      </HeroScreen>

      <Sheet visible={pickingGroup} onClose={() => setPickingGroup(false)} title="Show activity from">
        <View>
          {[{ id: 'all', name: 'All groups' }, ...data.groups].map((g) => (
            <MenuRow
              key={g.id}
              label={g.name}
              detail={g.id === groupId ? 'Showing now' : undefined}
              onPress={() => {
                setGroupId(g.id);
                setPickingGroup(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}
