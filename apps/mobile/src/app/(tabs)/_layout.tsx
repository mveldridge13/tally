import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TallyMark } from '@/components/brand';
import { Text } from '@/components/ui';
import { useSyncDeviceCurrency } from '@/lib/data';
import { takePendingInvite } from '@/lib/pending-invite';
import { NAV_RAIL_SIDE, NAV_RAIL_WIDTH, useWidthClass } from '@/lib/layout';
import { brand, radius, space, useColors } from '@/theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

const TABS: { name: string; href: '/' | '/groups' | '/activity' | '/profile'; label: string; icon: IconName }[] = [
  { name: 'index', href: '/', label: 'Home', icon: 'home' },
  { name: 'groups', href: '/groups', label: 'Groups', icon: 'groups' },
  { name: 'activity', href: '/activity', label: 'Activity', icon: 'receipt-long' },
  { name: 'profile', href: '/profile', label: 'Profile', icon: 'account-circle' },
];

/** One tab: icon in a pill (filled when selected) with its label underneath. Same look in the bar and the rail. */
function TabButton(allProps: TabTriggerSlotProps & { icon: IconName; label: string; onNavy?: boolean }) {
  // The trigger forwards a ref typed for a plain View; this button doesn't need it.
  const { isFocused, icon, label, onNavy, ref, ...props } = allProps;
  void ref;
  const c = useColors();
  // On the navy rail: sky-blue selected pill, light icons. On the light bottom bar: the usual surface colours.
  const pill = onNavy ? brand.tintOnDeep : c.surfaceAlt;
  const iconOn = onNavy ? brand.accent : c.primary;
  const iconOff = onNavy ? brand.onDeepMuted : c.textMuted;
  const textOn = onNavy ? brand.onDeep : c.text;
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      accessibilityLabel={label}
      style={{ alignItems: 'center', gap: 4, paddingVertical: space.sm, flex: 1 }}>
      <View
        style={{
          width: 64,
          height: 32,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isFocused ? pill : 'transparent',
        }}>
        <MaterialIcons name={icon} size={24} color={isFocused ? iconOn : iconOff} />
      </View>
      <Text variant="caption" color={isFocused ? textOn : iconOff} style={{ fontWeight: isFocused ? '700' : '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Tab navigation. Folded (compact/medium width): a bottom bar. Unfolded (expanded width): a side rail,
 * on the left for Galaxy Folds and on the right on iOS (the iPhone Duo placeholder).
 * It's one navigator either way, so folding or unfolding keeps you on the same tab.
 */
export default function TabsLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  useSyncDeviceCurrency();
  // An invite opened or pasted before signing in: join it now, once.
  useEffect(() => {
    const token = takePendingInvite();
    if (token) router.push({ pathname: '/invite/[token]', params: { token } });
  }, []);
  const rail = useWidthClass() === 'expanded';
  const railOnRight = NAV_RAIL_SIDE === 'right';

  const triggers = TABS.map((t) => (
    <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
      <TabButton icon={t.icon} label={t.label} onNavy={rail} />
    </TabTrigger>
  ));

  const list = rail ? (
    <TabList
      style={{
        flexDirection: 'column',
        justifyContent: 'flex-start',
        width: NAV_RAIL_WIDTH + (railOnRight ? insets.right : insets.left),
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.lg,
        gap: space.sm,
        // Navy, like the header beside it: it runs under the status bar, whose clock and icons are white.
        backgroundColor: brand.deep,
      }}>
      <View style={{ alignItems: 'center', paddingBottom: space.lg }} pointerEvents="none">
        <TallyMark size={36} />
      </View>
      {triggers}
    </TabList>
  ) : (
    <TabList
      style={{
        flexDirection: 'row',
        backgroundColor: c.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: c.border,
        paddingBottom: insets.bottom,
        paddingHorizontal: space.sm,
      }}>
      {triggers}
    </TabList>
  );

  const slot = (
    <View style={{ flex: 1 }}>
      <TabSlot />
    </View>
  );

  return (
    <Tabs style={{ flex: 1, flexDirection: rail ? 'row' : 'column', backgroundColor: brand.deep }}>
      {rail && !railOnRight ? list : null}
      {slot}
      {!rail || railOnRight ? list : null}
    </Tabs>
  );
}
