import { formatMoney } from '@tally/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Gutter, HeroScreen } from '@/components/dashboard';
import { GroupIcon } from '@/components/friendly';
import { Card, Divider, Notice, Text } from '@/components/ui';
import { useMarkNotificationsRead, useNotifications, type AppNotification } from '@/lib/data';
import { useMyId } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import { usePullToRefresh } from '@/lib/pull-to-refresh';
import { useGroupSummaries } from '@/store/hooks';
import { space, useColors } from '@/theme';

function Row({ n }: { n: AppNotification }) {
  const c = useColors();
  const myId = useMyId();
  const summaries = useGroupSummaries();
  const reminder = n.kind === 'settle_reminder';

  function open() {
    if (reminder) {
      // Straight to Settle up with what you owe now; if you've already settled, the group instead.
      const mine = summaries.find((s) => s.group.id === n.group.id)?.transfers.find((t) => t.fromUserId === myId);
      if (mine) {
        router.push({
          pathname: '/settle',
          params: { groupId: n.group.id, from: mine.fromUserId, to: mine.toUserId, amount: String(mine.amount) },
        });
        return;
      }
    }
    router.push(`/group/${n.group.id}`);
  }

  const bold = (t: string) => (
    <Text variant="body" style={{ fontWeight: '700' }}>
      {t}
    </Text>
  );

  return (
    <Pressable
      accessibilityRole="button"
      onPress={open}
      android_ripple={{ color: c.surfaceAlt }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
      <GroupIcon group={n.group} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        {reminder ? (
          <Text variant="body">
            {bold(n.actorName)} reminded you to settle up in {bold(n.group.name)}
            {n.amount ? ` · You owe ${formatMoney(n.amount, n.group.currency)}` : ''}
          </Text>
        ) : (
          <Text variant="body">
            {bold(n.actorName)} added you to {bold(n.group.name)}
          </Text>
        )}
        <Text variant="caption" muted>
          {relativeTime(n.at)}
        </Text>
      </View>
      {/* Dot for ones that were new when you opened the screen. */}
      {!n.read ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.owe }} /> : null}
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { data, refetch, isLoading, error } = useNotifications();
  const pull = usePullToRefresh(refetch);
  const markRead = useMarkNotificationsRead();
  // What was unread on arrival keeps its dot while you're here; the bell clears straight away.
  const [unreadOnArrival, setUnreadOnArrival] = useState<Set<string> | null>(null);
  if (unreadOnArrival === null && !isLoading) setUnreadOnArrival(new Set(data.filter((n) => !n.read).map((n) => n.id)));

  const { mutate } = markRead;
  const hasUnread = data.some((n) => !n.read);
  useEffect(() => {
    if (hasUnread) mutate();
  }, [hasUnread, mutate]);

  return (
    <HeroScreen nav="back" title="Notifications" refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      <Gutter>
        {error ? <Notice>Couldn’t load notifications. Pull down to try again.</Notice> : null}
        {data.length === 0 ? (
          <Card>
            <Text muted>
              {isLoading ? 'Loading…' : 'Nothing yet. You’ll see it here when someone adds you to a group or reminds you to settle up.'}
            </Text>
          </Card>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {data.map((n, i) => (
              <View key={n.id}>
                {i > 0 ? <Divider /> : null}
                <Row n={{ ...n, read: !unreadOnArrival?.has(n.id) }} />
              </View>
            ))}
          </Card>
        )}
      </Gutter>
    </HeroScreen>
  );
}
