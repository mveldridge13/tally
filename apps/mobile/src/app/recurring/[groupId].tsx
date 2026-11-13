/**
 * A group's recurring expenses (group page → ⋯ → Recurring): a coral card adding up what recurs,
 * then one tile per recurring expense in its own colour. Members see the ones they set up;
 * owners and co-owners see all of them.
 */
import { formatMoney } from '@tally/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { CardText, Gutter, HeroScreen, StatRow, SummaryCard, TotalPill } from '@/components/dashboard';
import { Bouncy, expenseEmoji } from '@/components/fun';
import { FREQUENCY_LABEL, FREQUENCY_PER, shortDate, wash, whenText } from '@/components/recurring';
import { Avatar, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { useNameOf, useRecurring, useTallyData, type RecurringExpense } from '@/lib/data';
import { brand, groupColor, radius, space, useColors } from '@/theme';

/** Roughly what a fixed recurring expense comes to each month. */
const PER_MONTH = { weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 } as const;

function Tile({ r, currency }: { r: RecurringExpense; currency: string }) {
  const myId = useMyId();
  const name = useNameOf();
  const ink = brand.onCoral;
  const payer = r.payerId === myId ? 'You pay' : `${name(r.payerId)} pays`;
  return (
    <Bouncy
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${r.description}, ${r.variable ? 'amount changes' : formatMoney(r.amount ?? 0, currency)} ${FREQUENCY_LABEL[r.frequency].toLowerCase()}${r.paused ? ', paused' : ''}`}
      onPress={() => router.push({ pathname: '/recurring-expense/[id]', params: { id: r.id, groupId: r.groupId } })}
      style={{ borderRadius: radius.xl - 4, padding: space.lg, gap: space.sm + 2, backgroundColor: wash(groupColor(r.id), 0.78) }}>
      {r.paused ? (
        <View style={{ position: 'absolute', top: space.md, right: space.md, backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: '4deg' }], zIndex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: ink }}>⏸ Paused</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 18,
            backgroundColor: 'rgba(255,255,255,0.7)',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: '-6deg' }],
            opacity: r.paused ? 0.6 : 1,
          }}>
          <Text style={{ fontSize: 28 }}>{expenseEmoji(r.description)}</Text>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: ink }} numberOfLines={1}>
            {r.description}
          </Text>
          <Text variant="caption" style={{ fontWeight: '600', color: '#4A3F52' }}>
            {r.variable ? `${FREQUENCY_LABEL[r.frequency]} · amount changes` : FREQUENCY_LABEL[r.frequency]}
          </Text>
        </View>
        {r.paused ? null : <Avatar name={name(r.payerId)} size={30} color={groupColor(r.payerId)} />}
      </View>
      <Text style={{ fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: ink, fontVariant: ['tabular-nums'] }}>
        {r.variable ? 'You’ll be asked' : formatMoney(r.amount ?? 0, currency)}
        {r.variable ? null : <Text style={{ fontSize: 15, fontWeight: '600', color: '#4A3F52' }}> / {FREQUENCY_PER[r.frequency]}</Text>}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(r.paused
          ? ['Nothing new until you resume it']
          : [r.dueDate ? '⚡ Waiting for this time’s amount' : `📅 ${shortDate(r.nextDate)} · ${whenText(r.nextDate)}`, payer]
        ).map((p) => (
          <View key={p} style={{ backgroundColor: 'rgba(255,255,255,0.62)', borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: ink }}>{p}</Text>
          </View>
        ))}
      </View>
    </Bouncy>
  );
}

export default function RecurringListScreen() {
  const c = useColors();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { data } = useTallyData();
  const { data: list, isLoading, error } = useRecurring(groupId);
  const group = data.groups.find((g) => g.id === groupId);
  const currency = group?.currency ?? 'USD';

  const active = list.filter((r) => !r.paused);
  const perMonth = Math.round(active.filter((r) => !r.variable).reduce((t, r) => t + (r.amount ?? 0) * PER_MONTH[r.frequency], 0));
  const next = [...active].sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1))[0];
  const fixedNames = active.filter((r) => !r.variable).map((r) => r.description);
  const variableNames = active.filter((r) => r.variable).map((r) => r.description);

  return (
    <HeroScreen nav="back" eyebrow={group ? `${group.icon ? `${group.icon} ` : ''}${group.name}` : undefined} title="Recurring">
      <Stack.Screen options={{ headerShown: false }} />
      {error ? (
        <Gutter>
          <Notice>Couldn’t load recurring expenses. Pull down to try again.</Notice>
        </Gutter>
      ) : null}

      {list.length > 0 ? (
        <SummaryCard tone="light">
          <CardText variant="label" muted style={{ fontWeight: '700' }}>
            About this much a month
          </CardText>
          <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: -1.2, color: brand.onCoral, fontVariant: ['tabular-nums'] }}>
            {formatMoney(perMonth, currency)}
          </Text>
          <CardText variant="caption" muted>
            {[fixedNames.join(', '), variableNames.length ? `plus ${variableNames.join(', ')} when the bill comes` : '']
              .filter(Boolean)
              .join(', ') || 'Nothing active right now'}
          </CardText>
          <StatRow>
            <TotalPill label="Active" value={String(active.length)} tone="neutral" />
            <TotalPill label="Paused" value={String(list.length - active.length)} tone="neutral" />
            <TotalPill label="Next" value={next ? `${next.description} · ${whenText(next.nextDate)}` : '—'} tone="neutral" />
          </StatRow>
        </SummaryCard>
      ) : null}

      <Gutter>
        {list.length === 0 && !isLoading ? (
          <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ fontSize: 36 }}>🔁</Text>
            <Text muted style={{ textAlign: 'center', paddingHorizontal: space.lg }}>
              Nothing recurring yet. Rent, bills and subscriptions can add themselves: turn on Recurring when you add one.
            </Text>
          </View>
        ) : null}
        {list.map((r) => (
          <Tile key={r.id} r={r} currency={currency} />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/add-expense', params: { groupId, recurring: '1' } })}
          style={{
            alignItems: 'center',
            padding: space.lg,
            borderRadius: radius.xl - 4,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: c.border,
          }}>
          <Text variant="label" color={c.primary} style={{ fontWeight: '700', fontSize: 15 }}>
            ＋ New recurring expense
          </Text>
        </Pressable>
      </Gutter>
    </HeroScreen>
  );
}
