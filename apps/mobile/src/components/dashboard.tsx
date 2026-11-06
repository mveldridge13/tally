/**
 * Shared building blocks for the tab "dashboard" screens (Home, Groups, …):
 * navy hero header, overlapping light sheet, totals pills, section titles and group cards.
 * Everything here takes its colours from the theme so the screens stay consistent.
 */
import { formatMoney, type Cents } from '@tally/shared';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GroupSummary } from '@/lib/data';
import { relativeTime } from '@/lib/format';
import { PRESS_DELAY, balanceColor, brand, radius, space, useColors } from '@/theme';
import { CONTENT_MAX_WIDTH } from '@/lib/layout';
import { HeroGlow } from './brand';
import { GroupIcon } from './friendly';
import { Text } from './ui';

/** Secondary text on navy (re-exported from the theme for convenience). */
export const onDeepMuted = brand.onDeepMuted;
/** "You owe" accent on navy. */
export const oweOnDeep = brand.oweOnDeep;

/** Scrollable screen: navy header on top, light rounded sheet overlapping it below. */
export function HeroScreen({
  header,
  children,
  refreshing,
  onRefresh,
  variant = 'full',
  fullWidth = false,
}: {
  header: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** `card`: shown in a column beside a list when unfolded; the navy header becomes a rounded card on the light page. */
  variant?: 'full' | 'card';
  /** Use the whole width on wide screens instead of a centred column (Home when unfolded). */
  fullWidth?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  if (variant === 'card') {
    return (
      <KeyboardAwareScrollView
        bottomOffset={space.xl}
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingTop: space.lg, paddingBottom: insets.bottom + space.xxl, gap: space.xl }}
        keyboardShouldPersistTaps="handled">
        <View
          style={{
            marginHorizontal: space.lg,
            backgroundColor: brand.deep,
            borderRadius: radius.xl,
            padding: space.xl,
            overflow: 'hidden',
          }}>
          <HeroGlow />
          {header}
        </View>
        {children}
      </KeyboardAwareScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      bottomOffset={space.xl}
      // Navy, not the page colour: during a fast fling Android can skip drawing the header for a
      // frame once it has scrolled off-screen, and a light background flashed as a grey bar at the top.
      style={{ flex: 1, backgroundColor: brand.deep }}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[c.primary]} progressViewOffset={insets.top} />
        ) : undefined
      }>
      <View
        style={{
          backgroundColor: brand.deep,
          paddingTop: insets.top + space.lg,
          paddingHorizontal: space.xl,
          paddingBottom: space.xxl + space.xl,
          overflow: 'hidden',
        }}>
        <HeroGlow />
        {/* Centred and capped on wide screens (unfolded foldables) so nothing stretches edge to edge. */}
        <View style={{ width: '100%', maxWidth: fullWidth ? undefined : CONTENT_MAX_WIDTH, alignSelf: 'center' }}>{header}</View>
      </View>
      <View
        style={{
          // Grows to the bottom of the screen on short pages, so the navy background never shows below it.
          flexGrow: 1,
          marginTop: -space.xl,
          backgroundColor: c.bg,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingTop: space.xl,
          paddingBottom: insets.bottom + space.xxl,
        }}>
        <View style={{ width: '100%', maxWidth: fullWidth ? undefined : CONTENT_MAX_WIDTH, alignSelf: 'center', gap: space.xl }}>
          {children}
        </View>
      </View>
    </KeyboardAwareScrollView>
  );
}

/** Round translucent button for the navy header (back ‹ or close ✕). */
export function HeroIconButton({ icon, label, onPress }: { icon: 'back' | 'close'; label?: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? (icon === 'back' ? 'Back' : 'Close')}
      onPress={onPress ?? (() => router.back())}
      hitSlop={12}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {icon === 'back' ? (
        <Text
          style={{
            color: brand.onDeep,
            fontSize: 26,
            lineHeight: 28,
            marginTop: -2,
          }}>
          ‹
        </Text>
      ) : (
        <Text style={{ color: brand.onDeep, fontSize: 18, fontWeight: '600' }}>✕</Text>
      )}
    </Pressable>
  );
}

/**
 * Top row of a pushed or modal navy screen. `back` puts ‹ on the left (pushed screens);
 * `close` puts ✕ on the right (modals); `none` shows neither (a screen shown inside a pane).
 * `leading` sits between the back button and the titles.
 */
export function HeroNav({
  mode,
  eyebrow,
  title,
  leading,
}: {
  mode: 'back' | 'close' | 'none';
  eyebrow?: string;
  title: string;
  leading?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      {mode === 'back' ? <HeroIconButton icon="back" /> : null}
      {leading}
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <Text variant="caption" color={onDeepMuted} numberOfLines={1}>
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="title" color={brand.onDeep} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {mode === 'close' ? <HeroIconButton icon="close" /> : null}
    </View>
  );
}

/** Small label + large title used at the top of a hero header. */
export function HeroTitle({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
      <View style={{ flexShrink: 1 }}>
        <Text variant="body" color={onDeepMuted}>
          {eyebrow}
        </Text>
        <Text variant="title" color={brand.onDeep} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function QuickAction({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: space.sm,
        opacity: pressed ? 0.7 : 1,
      })}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.lg,
          backgroundColor: primary ? brand.accent : 'rgba(255,255,255,0.1)',
          borderWidth: primary ? 0 : 1,
          borderColor: 'rgba(255,255,255,0.14)',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: '600',
            color: primary ? brand.onAccent : brand.onDeep,
            lineHeight: 28,
          }}>
          {icon}
        </Text>
      </View>
      <Text variant="caption" color={brand.onDeep} style={{ fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Glassy stat pill on the navy header. Pass `cents` for money or `value` for plain text. */
export function TotalPill({
  label,
  cents,
  currency,
  value,
  tone,
}: {
  label: string;
  cents?: Cents;
  currency?: string;
  value?: string;
  tone: 'owed' | 'owe' | 'neutral';
}) {
  const dot = tone === 'owed' ? brand.accent : tone === 'owe' ? oweOnDeep : onDeepMuted;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderRadius: radius.md,
        paddingVertical: space.md,
        paddingHorizontal: space.md,
        gap: 2,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        <Text variant="caption" color={onDeepMuted} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="heading" color={brand.onDeep} style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {value ?? formatMoney(cents ?? 0, currency ?? 'USD')}
      </Text>
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: space.lg,
      }}>
      <Text variant="heading" style={{ fontSize: 19, fontWeight: '700' }}>
        {title}
      </Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text variant="label" color={c.focus}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Pads its children to the standard horizontal gutter. */
export function Gutter({ children }: { children: ReactNode }) {
  return <View style={{ paddingHorizontal: space.lg, gap: space.md }}>{children}</View>;
}

function balanceStatus(cents: Cents) {
  return cents === 0 ? 'All square' : cents > 0 ? 'You’re owed' : 'You owe';
}

/** Compact card for horizontal carousels (Home). */
export function GroupCard({ summary }: { summary: GroupSummary }) {
  const c = useColors();
  const { group, myBalance } = summary;
  return (
    <Pressable
      onPress={() => router.push(`/group/${group.id}`)}
      style={({ pressed }) => ({
        width: 168,
        backgroundColor: c.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: c.border,
        padding: space.lg,
        gap: space.md,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <GroupIcon group={group} size={40} />
        <Text variant="caption" muted>
          {group.memberIds.length} {group.memberIds.length === 1 ? 'person' : 'people'}
        </Text>
      </View>
      <Text variant="heading" numberOfLines={1}>
        {group.name}
      </Text>
      <View style={{ gap: 2 }}>
        <Text variant="caption" muted>
          {balanceStatus(myBalance)}
        </Text>
        <Text variant="title" color={balanceColor(c, myBalance)} style={{ fontSize: 20, fontVariant: ['tabular-nums'] }}>
          {formatMoney(Math.abs(myBalance), group.currency)}
        </Text>
      </View>
    </Pressable>
  );
}

/** Full-width row card for lists (Groups tab). */
/** `onPress` overrides opening the group screen (two-pane layouts select it instead); `selected` highlights it. */
export function GroupListCard({
  summary,
  lastActivity,
  onPress,
  selected,
}: {
  summary: GroupSummary;
  lastActivity?: string;
  onPress?: () => void;
  selected?: boolean;
}) {
  const c = useColors();
  const { group, myBalance } = summary;
  const people = `${group.memberIds.length} ${group.memberIds.length === 1 ? 'person' : 'people'}`;
  return (
    <Pressable
      accessibilityState={{ selected: !!selected }}
      onPress={onPress ?? (() => router.push(`/group/${group.id}`))}
      android_ripple={{ color: c.surfaceAlt }}
      unstable_pressDelay={PRESS_DELAY}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        backgroundColor: selected ? c.surfaceAlt : c.surface,
        borderRadius: radius.lg,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? c.focus : c.border,
        padding: space.lg,
        opacity: pressed ? 0.9 : 1,
        overflow: 'hidden',
      })}>
      <GroupIcon group={group} size={48} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="heading" numberOfLines={1}>
          {group.name}
        </Text>
        <Text variant="caption" muted numberOfLines={1}>
          {people} · {group.currency}
          {lastActivity ? ` · ${relativeTime(lastActivity)}` : ''}
        </Text>
        {group.myRole === 'owner' ? (
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: c.surfaceAlt,
              borderRadius: radius.pill,
              paddingHorizontal: space.sm,
              paddingVertical: 2,
              marginTop: 2,
            }}>
            <Text variant="caption" style={{ fontSize: 11, fontWeight: '600' }}>
              Owner
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text variant="caption" color={myBalance === 0 ? c.settled : balanceColor(c, myBalance)}>
          {balanceStatus(myBalance)}
        </Text>
        {myBalance !== 0 ? (
          <Text variant="heading" color={balanceColor(c, myBalance)} style={{ fontVariant: ['tabular-nums'] }}>
            {formatMoney(Math.abs(myBalance), group.currency)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function NewGroupCard() {
  const c = useColors();
  return (
    <Pressable
      onPress={() => router.push('/new-group')}
      style={({ pressed }) => ({
        width: 132,
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Text style={{ fontSize: 28, color: c.focus }}>+</Text>
      <Text variant="label" color={c.focus}>
        New group
      </Text>
    </Pressable>
  );
}

/** Pill-shaped filter tabs ("All", "Owes you", …). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const c = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              paddingVertical: space.sm,
              paddingHorizontal: space.md,
              borderRadius: radius.pill,
              backgroundColor: selected ? c.primary : c.surface,
              borderWidth: 1,
              borderColor: selected ? c.primary : c.border,
            }}>
            <Text variant="label" color={selected ? c.onPrimary : c.text}>
              {o.label}
            </Text>
            {o.count != null ? (
              <Text variant="caption" color={selected ? c.onPrimary : c.textMuted} style={{ opacity: 0.8 }}>
                {o.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Compact pill action for wide (unfolded) headers ("+ Add expense"). */
export function BandAction({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        height: 44,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        backgroundColor: primary ? brand.accent : 'rgba(255,255,255,0.1)',
        borderWidth: primary ? 0 : 1,
        borderColor: 'rgba(255,255,255,0.16)',
        opacity: pressed ? 0.75 : 1,
      })}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: primary ? brand.onAccent : brand.onDeep }}>{icon}</Text>
      <Text variant="label" color={primary ? brand.onAccent : brand.onDeep}>
        {label}
      </Text>
    </Pressable>
  );
}
