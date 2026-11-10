import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { TallyMark } from '@/components/brand';
import { CardText, Gutter, HeroScreen, StatRow, TotalPill } from '@/components/dashboard';
import { GroupIcon, Sheet } from '@/components/friendly';
import { Bouncy, buzz, CountUp } from '@/components/fun';
import { Bubble } from '@/components/group-visuals';
import { Card, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { useTallyData } from '@/lib/data';
import { dayLabel } from '@/lib/format';
import { useWidthClass } from '@/lib/layout';
import { useActivity, type ActivityItem } from '@/store/hooks';
import { brand, radius, space, useColors, type Colors } from '@/theme';
import { usePullToRefresh } from '@/lib/pull-to-refresh';

type Kind = 'all' | 'expenses' | 'payments' | 'mine';

/** The friendly empty card: a big emoji and a line. */
function Empty({ emoji, text }: { emoji: string; text: string }) {
  return (
    <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
      <Text muted style={{ textAlign: 'center' }}>
        {text}
      </Text>
    </Card>
  );
}

/** One big tile in the "Show activity from" panel. */
function GroupTile({
  c,
  icon,
  label,
  count,
  selected,
  onPress,
}: {
  c: Colors;
  icon: ReactNode;
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <View style={{ width: '48%' }}>
      <Bouncy
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${label}, ${count} ${count === 1 ? 'item' : 'items'}`}
        onPress={onPress}
        style={{
          alignItems: 'center',
          gap: space.sm,
          paddingVertical: space.lg,
          paddingHorizontal: space.md,
          borderRadius: radius.xl - 6,
          backgroundColor: selected ? c.primary : c.surfaceAlt,
        }}>
        {icon}
        <Text variant="heading" color={selected ? c.onPrimary : c.text} numberOfLines={1} style={{ fontWeight: '700' }}>
          {label}
        </Text>
        <Text variant="caption" color={selected ? c.onPrimary : c.textMuted}>
          {selected ? 'Showing now' : `${count} ${count === 1 ? 'item' : 'items'}`}
        </Text>
      </Bouncy>
    </View>
  );
}
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
  const pickedGroup = groupId === 'all' ? undefined : data.groups.find((g) => g.id === groupId);
  const groupName = pickedGroup?.name ?? 'All groups';
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
      <CardText variant="label" muted>
        Your share of spending in {month.label}
      </CardText>
      <CountUp
        cents={month.myShare}
        currency={month.currency}
        style={{
          fontSize: 40,
          lineHeight: 48,
          fontWeight: '800',
          letterSpacing: -1.2,
          color: brand.onCoral,
          fontVariant: ['tabular-nums'],
        }}
      />
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
          <Bouncy
            accessibilityRole="button"
            accessibilityLabel={`Group: ${groupName}. Change`}
            onPress={() => {
              buzz.tap();
              setPickingGroup(true);
            }}
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingVertical: 6,
              paddingLeft: 6,
              paddingRight: space.md,
              borderRadius: radius.pill,
              backgroundColor: c.surfaceAlt,
            }}>
            {pickedGroup ? (
              <GroupIcon group={pickedGroup} size={30} />
            ) : (
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: c.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{ fontSize: 15 }}>🌈</Text>
              </View>
            )}
            <Text variant="label" numberOfLines={1} style={{ maxWidth: 220, fontWeight: '700' }}>
              {groupName}
            </Text>
            <MaterialIcons name="expand-more" size={20} color={c.textMuted} />
          </Bouncy>
        </Gutter>
      ) : null}

      {hasAny && sections.length === 0 ? (
        <Gutter>
          <Empty emoji="🔍" text="Nothing matches these filters." />
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
            {s.items.map((item, i) => (
              <Animated.View key={item.id} entering={FadeInDown.delay(Math.min(i, 6) * 35).duration(220)}>
                <Bubble item={item} showGroup={groupId === 'all'} />
              </Animated.View>
            ))}
          </Gutter>
        </View>
      ))}

      {!hasAny ? (
        <Gutter>
          <Empty
            emoji="🧾"
            text="No activity yet. Once someone adds an expense or records a payment in one of your groups, it’ll show up here."
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.md }}>
          {[{ id: 'all', name: 'All groups', icon: null }, ...data.groups].map((g) => (
            <GroupTile
              key={g.id}
              c={c}
              icon={
                g.id === 'all' ? (
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: c.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text style={{ fontSize: 24 }}>🌈</Text>
                  </View>
                ) : (
                  <GroupIcon group={g} size={48} />
                )
              }
              label={g.name}
              count={g.id === 'all' ? all.length : all.filter((i) => i.groupId === g.id).length}
              selected={g.id === groupId}
              onPress={() => {
                buzz.tap();
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
