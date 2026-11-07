import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Gutter, HeroScreen } from '@/components/dashboard';
import { GroupIcon } from '@/components/friendly';
import { Card, Divider, Notice, Text } from '@/components/ui';
import { useMarkNotificationsRead, useNotifications, type AppNotification } from '@/lib/data';
import { relativeTime } from '@/lib/format';
import { usePullToRefresh } from '@/lib/pull-to-refresh';
import { space, useColors } from '@/theme';

function Row({ n }: { n: AppNotification }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/group/${n.group.id}`)}
      android_ripple={{ color: c.surfaceAlt }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
      <GroupIcon group={n.group} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">
          <Text variant="body" style={{ fontWeight: '700' }}>
            {n.actorName}
          </Text>{' '}
          added you to{' '}
          <Text variant="body" style={{ fontWeight: '700' }}>
            {n.group.name}
          </Text>
        </Text>
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
            <Text muted>{isLoading ? 'Loading…' : 'Nothing yet. You’ll see it here when someone adds you to a group.'}</Text>
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
