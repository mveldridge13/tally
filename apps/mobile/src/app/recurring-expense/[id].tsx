/**
 * One recurring expense: a card in its own colour (like the group card), Pause / Edit / Stop,
 * the next three dates, and every expense it has added so far as chat bubbles.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { formatMoney } from '@tally/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';

import { CardText, Gutter, HeroScreen, SectionTitle, SummaryCard } from '@/components/dashboard';
import { Bouncy, buzz, expenseEmoji } from '@/components/fun';
import { Bubble, BubbleDays } from '@/components/group-visuals';
import { FREQUENCY_LABEL, headsUpLabel, recurringDate, shortDate, wash, whenText } from '@/components/recurring';
import { Button, Notice, Text } from '@/components/ui';
import { useMyId } from '@/lib/auth';
import { useNameOf, useRecurring, useRecurringHistory, useSetRecurringPaused, useStopRecurring, useTallyData } from '@/lib/data';
import type { ActivityItem } from '@/store/hooks';
import { brand, groupColor, radius, space, useColors } from '@/theme';

function ActionPill({ icon, label, onPress, danger, busy }: { icon: 'pause' | 'play-arrow' | 'edit' | 'stop-circle'; label: string; onPress: () => void; danger?: boolean; busy?: boolean }) {
  const c = useColors();
  return (
    <Bouncy
      grow
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={busy}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 46,
        borderRadius: radius.pill,
        backgroundColor: c.surfaceAlt,
        opacity: busy ? 0.6 : 1,
      }}>
      <MaterialIcons name={icon} size={20} color={danger ? c.danger : c.text} />
      <Text variant="label" color={danger ? c.danger : c.text} style={{ fontWeight: '700' }}>
        {label}
      </Text>
    </Bouncy>
  );
}

export default function RecurringExpenseScreen() {
  const c = useColors();
  const myId = useMyId();
  const name = useNameOf();
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId: string }>();
  const { data } = useTallyData();
  const { data: list, isLoading } = useRecurring(groupId);
  const r = list.find((x) => x.id === id);
  const history = useRecurringHistory(id);
  const pause = useSetRecurringPaused();
  const stop = useStopRecurring();
  const group = data.groups.find((g) => g.id === groupId);

  if (!r || !group) {
    return (
      <HeroScreen nav="back" title="Recurring">
        <Stack.Screen options={{ headerShown: false }} />
        <Gutter>
          <Notice tone="info">{isLoading ? 'Loading…' : 'This recurring expense has stopped.'}</Notice>
        </Gutter>
      </HeroScreen>
    );
  }

  const tint = wash(groupColor(r.id), 0.6);
  const ink = brand.onCoral;
  const payer = r.payerId === myId ? 'You pay' : `${name(r.payerId)} pays`;
  // The next three dates from where it's up to.
  const coming: string[] = [];
  for (let n = 0; coming.length < 3 && n < 1000; n++) {
    const d = recurringDate(r.startDate, r.frequency, n);
    if (d >= r.nextDate && (!r.endDate || d <= r.endDate)) coming.push(d);
    if (r.remaining !== null && coming.length >= r.remaining) break;
  }

  const confirmStop = () =>
    Alert.alert(`Stop ${r.description}?`, `No more will be added. The ${history.length} already added stay as they are.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Stop recurring',
        style: 'destructive',
        onPress: () => stop.mutate(r.id, { onSuccess: () => router.back(), onError: (e) => Alert.alert('Couldn’t stop it', e.message) }),
      },
    ]);

  const bubbles: ActivityItem[] = history.map((e) => ({
    kind: 'expense',
    id: e.id,
    groupId: e.groupId,
    at: e.occurredAt,
    title: e.description,
    amount: e.amount,
    actorId: e.payerId,
    myEffect: 0,
    involved: true,
  }));

  return (
    <HeroScreen nav="back" title={r.description} hideTitle>
      <Stack.Screen options={{ headerShown: false }} />

      <SummaryCard tone="light" background={tint}>
        {r.paused ? (
          <View style={{ position: 'absolute', top: space.lg, right: space.lg, backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: '4deg' }], zIndex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: ink }}>⏸ Paused</Text>
          </View>
        ) : null}
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingRight: space.xl }}>
            <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }] }}>
              <Text style={{ fontSize: 34 }}>{expenseEmoji(r.description)}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <CardText variant="label" muted style={{ fontWeight: '700' }}>
                {group.icon ? `${group.icon} ` : ''}
                {group.name} · Recurring
              </CardText>
              <CardText variant="title" style={{ fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.5 }}>
                {r.description}
              </CardText>
              <CardText variant="caption" muted style={{ fontWeight: '600' }}>
                {FREQUENCY_LABEL[r.frequency]}
                {r.variable ? ' · amount changes' : ''} · since {shortDate(r.startDate)}
              </CardText>
            </View>
          </View>
          <View>
            <CardText variant="label" muted style={{ fontWeight: '700' }}>
              Amount each time
            </CardText>
            <Text style={{ fontSize: 38, fontWeight: '800', letterSpacing: -1, color: ink, fontVariant: ['tabular-nums'] }}>
              {r.variable ? 'You’ll be asked' : formatMoney(r.amount ?? 0, group.currency)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {[payer, `🔔 Heads-up ${headsUpLabel(r.headsUpDays).toLowerCase()}`].map((p) => (
              <View key={p} style={{ backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 }}>
                <CardText variant="label" style={{ fontWeight: '700' }}>
                  {p}
                </CardText>
              </View>
            ))}
          </View>
        </View>
      </SummaryCard>

      <Gutter>
        {r.dueDate ? (
          <View style={{ gap: space.sm, padding: space.lg, borderRadius: radius.xl - 6, backgroundColor: c.surfaceAlt }}>
            <Text variant="heading">Waiting for this time’s amount</Text>
            <Text variant="caption" muted>
              Due {shortDate(r.dueDate)}. Enter it and it’s split the same way.
            </Text>
            <Button size="small" label="Add amount" onPress={() => router.push({ pathname: '/add-expense', params: { dueId: r.id, groupId: r.groupId } })} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <ActionPill
            icon={r.paused ? 'play-arrow' : 'pause'}
            label={r.paused ? 'Resume' : 'Pause'}
            busy={pause.isPending}
            onPress={() => {
              buzz.tap();
              pause.mutate({ id: r.id, paused: !r.paused }, { onError: (e) => Alert.alert('Couldn’t change it', e.message) });
            }}
          />
          <ActionPill icon="edit" label="Edit" onPress={() => router.push({ pathname: '/add-expense', params: { recurringId: r.id, groupId: r.groupId } })} />
          <ActionPill icon="stop-circle" label="Stop" danger busy={stop.isPending} onPress={confirmStop} />
        </View>
        <Text variant="caption" muted>
          Changes apply to future ones only. Expenses already added stay as they are.
        </Text>
      </Gutter>

      <View style={{ gap: space.md }}>
        <SectionTitle title="Coming up" />
        <Gutter>
          {r.paused ? (
            <Text muted>Paused. Nothing is coming up until you resume it.</Text>
          ) : coming.length === 0 ? (
            <Text muted>Nothing more is coming up: this was the last one.</Text>
          ) : (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {coming.map((d, i) => {
                const day = Number(d.slice(8, 10));
                const month = new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short' });
                const first = i === 0;
                return (
                  <View
                    key={d}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: space.sm + 2,
                      borderRadius: radius.lg - 2,
                      backgroundColor: first ? groupColor(r.id) : c.surface,
                      borderWidth: first ? 0 : 1,
                      borderColor: c.border,
                    }}>
                    <Text variant="caption" color={first ? '#FFFFFF' : c.textMuted} style={{ fontWeight: '700' }}>
                      {month}
                    </Text>
                    <Text style={{ fontSize: 26, fontWeight: '800', color: first ? '#FFFFFF' : c.text }}>{day}</Text>
                    <Text variant="caption" color={first ? '#FFFFFF' : c.textMuted} style={{ fontWeight: '700', minHeight: 16 }}>
                      {first ? whenText(d) : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Gutter>
      </View>

      <View style={{ gap: space.md }}>
        <SectionTitle title="Added so far" />
        <Gutter>
          {bubbles.length === 0 ? (
            <Text muted>Nothing added yet. The first one is on {shortDate(r.nextDate)}.</Text>
          ) : (
            <BubbleDays items={bubbles} render={(item) => <Bubble key={item.id} item={item} currency={group.currency} />} />
          )}
          {bubbles.length ? (
            <Text variant="caption" muted>
              Each one is a normal expense: tap it to edit or delete just that one.
            </Text>
          ) : null}
        </Gutter>
      </View>
    </HeroScreen>
  );
}
