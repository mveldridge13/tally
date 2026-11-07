import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { LayoutAnimation, Pressable, View } from 'react-native';

import { useMyId } from '@/lib/auth';
import { useNameOf } from '@/lib/data';
import { useGroupSummaries } from '@/store/hooks';
import { PRESS_DELAY, radius, space, useColors } from '@/theme';
import { Avatar, Card, Text } from './ui';

/**
 * Home's collapsible "To settle" list: who you owe and who owes you, across groups, biggest first
 * (from each group's simplified debts). It starts closed (header only); tap the header to open it.
 */
export function ToSettle() {
  const c = useColors();
  const myId = useMyId();
  const name = useNameOf();
  const summaries = useGroupSummaries();
  const [open, setOpen] = useState(false);

  const items = summaries
    .flatMap((sum) =>
      sum.transfers
        .filter((t) => t.fromUserId === myId || t.toUserId === myId)
        .map((t) => ({
          group: sum.group,
          transfer: t,
          iOwe: t.fromUserId === myId,
          other: t.fromUserId === myId ? t.toUserId : t.fromUserId,
        })),
    )
    .sort((a, b) => b.transfer.amount - a.transfer.amount);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <View style={{ paddingHorizontal: space.lg }}>
      <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: 'hidden' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`To settle, ${items.length} ${items.length === 1 ? 'item' : 'items'}. ${open ? 'Collapse' : 'Expand'}`}
          onPress={toggle}
          android_ripple={{ color: c.surfaceAlt }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg }}>
          <Text variant="heading" style={{ flex: 1, fontSize: 19, fontWeight: '700' }}>
            To settle
          </Text>
          {items.length > 0 ? (
            <View style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 }}>
              <Text variant="label">{items.length}</Text>
            </View>
          ) : null}
          <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={26} color={c.textMuted} />
        </Pressable>

        {open ? (
          <View style={{ paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm }}>
            {items.length === 0 ? (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <MaterialIcons name="check-circle" size={28} color={c.owed} />
                <View style={{ flex: 1 }}>
                  <Text variant="heading">You’re all square</Text>
                  <Text muted>Nobody owes anybody right now.</Text>
                </View>
              </Card>
            ) : (
              items.map(({ group, transfer, iOwe, other }) => (
                <Pressable
                  key={`${group.id}-${transfer.fromUserId}-${transfer.toUserId}`}
                  accessibilityRole="button"
                  onPress={() =>
                    iOwe
                      ? router.push({
                          pathname: '/settle',
                          params: { groupId: group.id, from: transfer.fromUserId, to: transfer.toUserId, amount: String(transfer.amount) },
                        })
                      : router.push({ pathname: '/balance/[groupId]', params: { groupId: group.id, with: other } })
                  }
                  android_ripple={{ color: c.surfaceAlt }}
                  unstable_pressDelay={PRESS_DELAY}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    padding: space.md,
                    borderRadius: radius.md,
                    backgroundColor: c.bg,
                    overflow: 'hidden',
                  }}>
                  <Avatar name={name(other)} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="heading" numberOfLines={1}>
                      {iOwe ? `You owe ${name(other)}` : `${name(other)} owes you`}
                    </Text>
                    <Text variant="caption" muted numberOfLines={1}>
                      {group.name} · {iOwe ? 'Tap to settle up' : 'Tap to see why'}
                    </Text>
                  </View>
                  <Text variant="heading" color={iOwe ? c.owe : c.owed} style={{ fontVariant: ['tabular-nums'] }}>
                    {formatMoney(transfer.amount, group.currency)}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}
