import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useNotifications } from '@/lib/data';
import { brand, useColors } from '@/theme';
import { Text } from './ui';

/** Round bell for the header. Shows a red count when there are notifications you haven't seen. */
export function NotificationBell() {
  const c = useColors();
  const { unread } = useNotifications();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} new` : 'Notifications'}
      onPress={() => router.push('/notifications')}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      <MaterialIcons name={unread ? 'notifications-active' : 'notifications-none'} size={24} color={c.text} />
      {unread ? (
        <View
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: brand.slash,
            borderWidth: 2,
            borderColor: c.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800', lineHeight: 12 }}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
