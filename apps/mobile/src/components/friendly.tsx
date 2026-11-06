/**
 * Building blocks for the calmer layout: group icons, the floating "Add expense" button,
 * slide-up sheets, and plain-language balance sentences.
 */
import { formatMoney, type Cents } from '@tally/shared';
import { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brand, groupColor, radius, space, useColors } from '@/theme';
import { Text } from './ui';

/** Emoji choices offered for a group. Any single emoji works; these are the quick picks. */
export const GROUP_ICONS = ['🏠', '✈️', '🍽️', '🛒', '🎉', '🚗', '🏖️', '⛺', '☕', '🎁', '💡', '🐶'] as const;

/** A group's emoji on a soft tint of its colour, or its first letter when it has no emoji. */
export function GroupIcon({ group, size = 44 }: { group: { id: string; name: string; icon?: string | null }; size?: number }) {
  const tint = groupColor(group.id);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        // Hex alpha: a soft wash of the group's colour behind the emoji, solid behind a letter.
        backgroundColor: group.icon ? `${tint}2E` : tint,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontSize: size * (group.icon ? 0.5 : 0.42), fontWeight: '700', color: brand.onDeep }}>
        {group.icon || group.name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * "You're owed $40.00", "You owe $18.00" or "You're all square".
 * Pass `other` when exactly one person is involved: "Sam owes you $12.50".
 */
export function balanceSentence(cents: Cents, currency: string, other?: string): string {
  const money = formatMoney(Math.abs(cents), currency);
  if (cents === 0) return 'You’re all square';
  if (other) return cents > 0 ? `${other} owes you ${money}` : `You owe ${other} ${money}`;
  return cents > 0 ? `You’re owed ${money}` : `You owe ${money}`;
}

/** The one main action on a screen, floating above the bottom-right corner. */
export function FloatingButton({ label, onPress, bottom = 0 }: { label: string; onPress: () => void; bottom?: number }) {
  const c = useColors();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: space.lg, bottom: bottom + space.lg }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        android_ripple={{ color: 'rgba(255,255,255,0.2)', foreground: true }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          height: 56,
          paddingHorizontal: space.xl,
          borderRadius: radius.pill,
          backgroundColor: c.primary,
          overflow: 'hidden',
          opacity: pressed ? 0.9 : 1,
          elevation: 6,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        })}>
        <Text style={{ fontSize: 22, fontWeight: '600', color: c.onPrimary, lineHeight: 24 }}>+</Text>
        <Text variant="heading" color={c.onPrimary}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

/** A panel that slides up from the bottom over a dimmed screen. Tap outside or the handle area to close. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Pinned under the scrolling content, e.g. a Done button. */
  footer?: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
        <Animated.View
          entering={SlideInDown.duration(220)}
          style={{
            maxHeight: '88%',
            backgroundColor: c.bg,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingBottom: insets.bottom + space.lg,
          }}>
          <View style={{ alignItems: 'center', paddingTop: space.sm, paddingBottom: space.xs }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.border }} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, gap: space.lg }}>
            {title ? (
              <Text variant="title" style={{ fontSize: 22 }}>
                {title}
              </Text>
            ) : null}
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A tappable row inside a sheet or menu: a label, optional detail, and a chevron. */
export function MenuRow({ label, detail, onPress, danger }: { label: string; detail?: string; onPress: () => void; danger?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      android_ripple={{ color: c.surfaceAlt }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md + 2 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading" color={danger ? c.owe : c.text} style={{ fontWeight: '500' }}>
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" muted>
            {detail}
          </Text>
        ) : null}
      </View>
      {danger ? null : (
        <Text muted style={{ fontSize: 20 }}>
          ›
        </Text>
      )}
    </Pressable>
  );
}

/** One group in a list: icon, name and a sentence about where you stand. */
export function GroupRow({
  group,
  myBalance,
  other,
  onPress,
  selected,
}: {
  group: { id: string; name: string; icon?: string | null; currency: string };
  myBalance: Cents;
  /** The one person you owe or who owes you, when there's exactly one. */
  other?: string;
  onPress: () => void;
  selected?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      android_ripple={{ color: c.surfaceAlt }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: selected ? c.surfaceAlt : c.surface,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? c.focus : c.border,
        overflow: 'hidden',
        opacity: pressed ? 0.92 : 1,
      })}>
      <GroupIcon group={group} size={48} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="heading" numberOfLines={1}>
          {group.name}
        </Text>
        <Text variant="caption" color={myBalance === 0 ? c.textMuted : myBalance > 0 ? c.owed : c.owe} numberOfLines={1}>
          {balanceSentence(myBalance, group.currency, other)}
        </Text>
      </View>
      <Text muted style={{ fontSize: 22 }}>
        ›
      </Text>
    </Pressable>
  );
}
