/**
 * A group's page, drawn rather than listed: who owes whom as arrows between faces, and what's been
 * happening as a chat-style feed (bubbles from whoever paid; yours on the right).
 */
import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useMyId } from '@/lib/auth';
import { useNameOf, useTallyData } from '@/lib/data';
import { firstName } from '@/lib/format';
import { useActivity, type ActivityItem } from '@/store/hooks';
import { groupColor, radius, space, useColors } from '@/theme';
import { Bouncy, expenseEmoji } from './fun';
import { Avatar, Card, Text } from './ui';

type Transfer = { fromUserId: string; toUserId: string; amount: number };

/** Faces around an oval with an arrow from each person who owes to the person they owe. You sit on the left. */
export function OweWeb({ memberIds, transfers, currency }: { memberIds: string[]; transfers: Transfer[]; currency: string }) {
  const c = useColors();
  const myId = useMyId();
  const name = useNameOf();
  const { data } = useTallyData();
  const [width, setWidth] = useState(0);
  // Only people in at least one arrow, you first.
  const people = memberIds
    .filter((id) => transfers.some((t) => t.fromUserId === id || t.toUserId === id))
    .sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));
  const n = people.length;
  const R = n > 6 ? 18 : 22;
  const height = n <= 2 ? 130 : n <= 4 ? 210 : 250;
  const cx = width / 2;
  const cy = height / 2 - 6;
  const rx = Math.max(0, width / 2 - R - 30);
  const ry = Math.max(0, height / 2 - R - 22);
  const pos = new Map<string, [number, number]>();
  people.forEach((id, i) => {
    const a = Math.PI + (i * 2 * Math.PI) / n; // you start at the far left
    pos.set(id, [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  });

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {transfers.map((t) => {
            const [x1, y1] = pos.get(t.fromUserId) ?? [0, 0];
            const [x2, y2] = pos.get(t.toUserId) ?? [0, 0];
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const sx = x1 + ux * (R + 5);
            const sy = y1 + uy * (R + 5);
            const ex = x2 - ux * (R + 6);
            const ey = y2 - uy * (R + 6);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const mine = t.fromUserId === myId || t.toUserId === myId;
            const col = mine ? c.primary : c.textMuted;
            const head = `M ${ex} ${ey} L ${ex - ux * 10 - uy * 6} ${ey - uy * 10 + ux * 6} L ${ex - ux * 10 + uy * 6} ${ey - uy * 10 - ux * 6} Z`;
            const label = formatMoney(t.amount, currency);
            const w = label.length * 7 + 16;
            return (
              <G key={`${t.fromUserId}-${t.toUserId}`}>
                <Line
                  x1={sx}
                  y1={sy}
                  x2={ex}
                  y2={ey}
                  stroke={col}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeDasharray={mine ? undefined : '5 5'}
                />
                <Path d={head} fill={col} />
                <Rect x={mx - w / 2} y={my - 12} width={w} height={24} rx={12} fill={c.surface} stroke={c.border} />
                <SvgText x={mx} y={my + 4.5} textAnchor="middle" fontSize={12.5} fontWeight="700" fill={col}>
                  {label}
                </SvgText>
              </G>
            );
          })}
          {people.map((id) => {
            const [x, y] = pos.get(id)!;
            const who = id === myId ? 'You' : firstName(name(id));
            return (
              <G key={id}>
                <Circle cx={x} cy={y} r={R} fill={groupColor(id)} />
                <SvgText x={x} y={y + R * 0.27} textAnchor="middle" fontSize={R * 0.75} fontWeight="700" fill="#FFFFFF">
                  {(data.people[id]?.name ?? '?').slice(0, 1).toUpperCase()}
                </SvgText>
                <SvgText x={x} y={y + R + 15} textAnchor="middle" fontSize={12} fontWeight="600" fill={c.textMuted}>
                  {who}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(today) - start(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

/** One expense or payment as a chat bubble. `showGroup` (Activity) adds which group it's from. */
export function Bubble({ item, currency: given, showGroup }: { item: ActivityItem; currency?: string; showGroup?: boolean }) {
  const c = useColors();
  const myId = useMyId();
  const name = useNameOf();
  const { data } = useTallyData();
  const group = data.groups.find((g) => g.id === item.groupId);
  const currency = given ?? group?.currency ?? 'USD';
  const who = item.kind === 'expense' ? item.actorId : item.fromUserId;
  const mine = who === myId;
  const money = (v: number) => formatMoney(v, currency);

  let emoji: string;
  let title: string;
  let line: string;
  let right: { big: string; small?: string };
  if (item.kind === 'expense') {
    const share = data.expenses.find((e) => e.id === item.id)?.splits.find((s) => s.userId === myId)?.amount ?? 0;
    emoji = expenseEmoji(item.title);
    title = item.title;
    line = `${mine ? 'You' : firstName(name(item.actorId))} paid ${money(item.amount)}`;
    right = share > 0 ? { big: money(share), small: 'your share' } : { big: '—', small: 'not in it' };
  } else {
    const to = item.toUserId === myId ? 'you' : firstName(name(item.toUserId));
    emoji = '💸';
    title = `${mine ? 'You' : firstName(name(item.fromUserId))} paid ${to} back`;
    line = 'Settled up';
    right = { big: money(item.amount) };
  }
  if (showGroup && group) line = `${line} · ${group.icon ? `${group.icon} ` : ''}${group.name}`;

  return (
    <View style={{ flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: space.sm }}>
      <Avatar name={name(who)} size={34} color={groupColor(who)} />
      <Bouncy
        grow
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${line}. ${right.big} ${right.small ?? ''}`}
        onPress={() => router.push({ pathname: item.kind === 'expense' ? '/expense/[id]' : '/payment/[id]', params: { id: item.id } })}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          padding: space.md,
          borderRadius: 20,
          borderBottomLeftRadius: mine ? 20 : 6,
          borderBottomRightRadius: mine ? 6 : 20,
          backgroundColor: item.kind === 'settlement' ? c.warm : mine ? c.surfaceAlt : c.surface,
          borderWidth: item.kind === 'expense' && !mine ? 1 : 0,
          borderColor: c.border,
        }}>
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="heading" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {line}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="label" style={{ fontVariant: ['tabular-nums'], fontWeight: '700' }}>
            {right.big}
          </Text>
          {right.small ? (
            <Text variant="caption" muted style={{ fontSize: 11 }}>
              {right.small}
            </Text>
          ) : null}
        </View>
      </Bouncy>
    </View>
  );
}

/** The group's expenses and payments as a chat, newest first, grouped by day. */
export function GroupFeed({ groupId, currency, emptyText }: { groupId: string; currency: string; emptyText: string }) {
  const items = useActivity(groupId);
  if (items.length === 0) {
    return (
      <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
        <Text style={{ fontSize: 36 }}>🧾</Text>
        <Text muted style={{ textAlign: 'center' }}>
          {emptyText}
        </Text>
      </Card>
    );
  }
  const days: { label: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.at);
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(item);
    else days.push({ label, items: [item] });
  }
  return (
    <View style={{ gap: space.md }}>
      {days.map((d) => (
        <View key={d.label} style={{ gap: space.sm + 2 }}>
          <Text variant="caption" muted style={{ fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: space.xs }}>
            {d.label}
          </Text>
          {d.items.map((item) => (
            <Bubble key={item.id} item={item} currency={currency} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** "Just me" / "Everyone" switch. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: c.surfaceAlt }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Bouncy
            key={o.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: space.md,
              borderRadius: radius.pill,
              backgroundColor: on ? c.surface : 'transparent',
            }}>
            <Text variant="caption" color={on ? c.text : c.textMuted} style={{ fontWeight: '600' }}>
              {o.label}
            </Text>
          </Bouncy>
        );
      })}
    </View>
  );
}
