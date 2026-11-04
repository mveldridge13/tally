import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { relativeTime } from '@/lib/format';
import { useNameOf, useTallyData } from '@/lib/data';
import { useActivity, type ActivityItem } from '@/store/hooks';
import { PRESS_DELAY, balanceColor, groupColor, radius, space, useColors } from '@/theme';
import { Card, Divider, Text } from './ui';

/** Right-hand column: what this item did to your balance. */
function Effect({ item, currency }: { item: ActivityItem; currency: string }) {
  const c = useColors();
  if (!item.involved || item.myEffect === 0) {
    return (
      <Text variant="caption" muted style={{ textAlign: 'right' }}>
        {item.involved ? 'settled' : 'not involved'}
      </Text>
    );
  }
  const label =
    item.kind === 'settlement' ? (item.myEffect > 0 ? 'you paid' : 'you received') : item.myEffect > 0 ? 'you lent' : 'you borrowed';
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text variant="caption" color={balanceColor(c, item.myEffect)}>
        {label}
      </Text>
      <Text variant="heading" color={balanceColor(c, item.myEffect)} style={{ fontVariant: ['tabular-nums'] }}>
        {formatMoney(Math.abs(item.myEffect), currency)}
      </Text>
    </View>
  );
}

/** Pass `items` to render a pre-filtered list; otherwise shows all activity (optionally for one group). */
export function ActivityList({
  groupId,
  limit,
  bare,
  items: given,
  emptyText = 'No activity yet. Add an expense to get started.',
  onSelect,
  selectedId,
}: {
  groupId?: string;
  limit?: number;
  bare?: boolean;
  items?: ActivityItem[];
  emptyText?: string;
  /** Two-pane layouts: select the item in the detail pane instead of opening a new screen. */
  onSelect?: (item: ActivityItem) => void;
  selectedId?: string;
}) {
  const c = useColors();
  const all = useActivity(groupId);
  const items = (given ?? all).slice(0, limit);
  const { data } = useTallyData();
  const name = useNameOf();

  if (items.length === 0) {
    return (
      <Card>
        <Text muted>{emptyText}</Text>
      </Card>
    );
  }

  const rows = items.map((item, i) => {
    const group = data.groups.find((g) => g.id === item.groupId);
    const currency = group?.currency ?? 'USD';
    const where = groupId ? '' : `${group?.name ?? ''} · `;
    const isExpense = item.kind === 'expense';
    const tint = isExpense ? groupColor(item.groupId) : c.owed;

    const title = isExpense ? item.title : `${name(item.fromUserId)} paid ${name(item.toUserId) === 'You' ? 'you' : name(item.toUserId)}`;
    const subtitle = isExpense
      ? `${name(item.actorId)} paid ${formatMoney(item.amount, currency)} · ${where}${relativeTime(item.at)}`
      : `Payment of ${formatMoney(item.amount, currency)} · ${where}${relativeTime(item.at)}`;

    return (
      <View key={item.id}>
        {i > 0 ? <Divider /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityHint={isExpense ? 'Opens expense details' : 'Opens payment details'}
          accessibilityState={{ selected: item.id === selectedId }}
          onPress={() =>
            onSelect
              ? onSelect(item)
              : isExpense
                ? router.push({
                    pathname: '/expense/[id]',
                    params: { id: item.id },
                  })
                : router.push({
                    pathname: '/payment/[id]',
                    params: { id: item.id },
                  })
          }
          android_ripple={{ color: c.surfaceAlt }}
          unstable_pressDelay={PRESS_DELAY}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            paddingVertical: space.md,
            // Highlight the item open in the detail pane (extends into the card's padding).
            marginHorizontal: -space.lg,
            paddingHorizontal: space.lg,
            backgroundColor: item.id === selectedId ? c.surfaceAlt : 'transparent',
          }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: radius.md,
              backgroundColor: tint + '22',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: tint }}>{isExpense ? item.title.slice(0, 1).toUpperCase() : '⇄'}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" numberOfLines={1}>
              {title}
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          <Effect item={item} currency={currency} />
        </Pressable>
      </View>
    );
  });

  return bare ? <View>{rows}</View> : <Card style={{ paddingVertical: 0 }}>{rows}</Card>;
}
