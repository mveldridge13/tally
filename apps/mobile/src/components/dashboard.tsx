/**
 * Shared building blocks for every screen: the light header, the dark summary card with its
 * figures, action tiles, section titles and group cards.
 * Everything here takes its colours from the theme so the screens stay consistent.
 */
import { formatMoney, type Cents } from '@tally/shared';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { Children, createContext, useCallback, useContext, useMemo, type ComponentProps, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { netByCurrency, type GroupSummary } from '@/lib/data';
import { relativeTime } from '@/lib/format';
import { PRESS_DELAY, balanceColor, brand, radius, space, useColors } from '@/theme';
import { CONTENT_MAX_WIDTH, useWidthClass } from '@/lib/layout';
import { HeroGlow, Wordmark } from './brand';
import { GroupIcon } from './friendly';
import { Text } from './ui';

/** Secondary text on navy (re-exported from the theme for convenience). */
export const onDeepMuted = brand.onDeepMuted;
/** "You owe" accent on navy. */
export const oweOnDeep = brand.oweOnDeep;

type NavMode = 'tab' | 'back' | 'close' | 'none';

/**
 * Every screen's layout: a light header that stays put (logo on tabs, ‹ on pushed screens, ✕ on
 * forms; then a small label, the title and a short line), with everything below it scrolling.
 * `card` is the screen's dark summary card, the first thing in the scrolling area; anything in it
 * is drawn on sage, so use white text (brand.onDeep / onDeepMuted).
 */
export function HeroScreen({
  nav,
  eyebrow,
  title,
  subtitle,
  subtitleNode,
  leading,
  right,
  card,
  actions,
  cardTone = 'dark',
  children,
  refreshing,
  onRefresh,
  variant = 'full',
  fullWidth = false,
  hideTitle = false,
}: {
  nav: NavMode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Replaces `subtitle` when the line needs more than text (a total that counts up). */
  subtitleNode?: ReactNode;
  /** Beside the title, on the left (a group's icon). */
  leading?: ReactNode;
  /** Top-right corner (avatar, ⋯ menu). */
  right?: ReactNode;
  card?: ReactNode;
  /** QuickAction tiles (pass them bold). Shown under a "Quick actions" heading, above the card. */
  actions?: ReactNode;
  /** `light` when the screen has actions, so the bold tiles stand out (Home's pattern). */
  cardTone?: CardTone;
  children?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** `card`: shown in a pane beside a list when unfolded (no status-bar padding). */
  variant?: 'full' | 'card';
  /** Use the whole width on wide screens instead of a centred column. */
  fullWidth?: boolean;
  /** Leave out the title row, for a screen whose first card already says what it is (a group's page). */
  hideTitle?: boolean;
}) {
  const c = useColors();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const rail = useWidthClass() === 'expanded';
  const column = { width: '100%', maxWidth: fullWidth ? undefined : CONTENT_MAX_WIDTH, alignSelf: 'center' } as const;

  // Dark status-bar icons on the light header (the sign-in screens switch them back to white).
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(scheme === 'dark' ? 'light' : 'dark');
    }, [scheme]),
  );

  // Above the bottom tab bar, the bar already clears the phone's navigation area, so the page
  // doesn't leave room for it again. (Sheets and other screens still use the full inset.)
  const bottomInset = nav === 'tab' && !rail ? 0 : insets.bottom;

  // The logo row shows on the tabs, except when unfolded: the side rail already carries the logo.
  const showLogo = nav === 'tab' && !rail;
  const topRow = showLogo || nav === 'back' || nav === 'close' || right;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{
          paddingTop: (variant === 'card' ? 0 : insets.top) + space.md,
          paddingHorizontal: space.lg,
          paddingBottom: space.lg,
        }}>
        <View style={[column, { gap: space.md }]}>
          {topRow ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
              {showLogo ? (
                <Wordmark size={24} color={c.primary} markColor={c.primary} />
              ) : nav === 'back' ? (
                <HeroIconButton icon="back" />
              ) : (
                <View />
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                {right}
                {nav === 'close' ? <HeroIconButton icon="close" /> : null}
              </View>
            </View>
          ) : null}
          {hideTitle ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            {leading}
            <View style={{ flex: 1, gap: 2 }}>
              {eyebrow ? (
                <Text variant="label" muted numberOfLines={1}>
                  {eyebrow}
                </Text>
              ) : null}
              <Text variant="title" color={c.primary} numberOfLines={2} style={{ fontSize: 28, lineHeight: 34 }}>
                {title}
              </Text>
              {subtitleNode ??
                (subtitle ? (
                  <Text variant="body" muted numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null)}
            </View>
          </View>
          )}
        </View>
      </View>

      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        bottomOffset={space.xl}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: space.xs, paddingBottom: bottomInset + space.xl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[c.primary]} /> : undefined}>
        <View style={[column, { gap: space.xl }]}>
          {actions ? (
            <View style={{ gap: space.md }}>
              <SectionTitle title="Quick actions" />
              <ActionRow>{actions}</ActionRow>
            </View>
          ) : null}
          {card ? <SummaryCard tone={cardTone}>{card}</SummaryCard> : null}
          {children}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

/** The dark sage card at the top of every screen's content: the screen's key numbers or main input. */
/**
 * `light`: a lighter shade of the sage tiles with dark text, for a screen where the tiles should catch the eye first
 * (Home, where the bold action tiles lead). CardFigure, StatRow and TotalPill follow the tone.
 */
export function SummaryCard({
  children,
  tone = 'dark',
  style,
  background,
}: {
  children: ReactNode;
  tone?: CardTone;
  style?: ComponentProps<typeof View>['style'];
  /** A light card in another colour than coral (a group's own colour). Keep it light: the text is dark. */
  background?: string;
}) {
  return (
    <CardToneContext.Provider value={tone}>
      <View
        style={[
          {
            marginHorizontal: space.lg,
            backgroundColor: background ?? (tone === 'dark' ? brand.deep : brand.coral),
            borderRadius: radius.xl,
            paddingVertical: space.lg,
            paddingHorizontal: space.xl,
            overflow: 'hidden',
          },
          style,
        ]}>
        {tone === 'dark' ? <HeroGlow /> : <HeroGlow color={brand.accent} strength={4} />}
        {children}
      </View>
    </CardToneContext.Provider>
  );
}

type CardTone = 'dark' | 'light';
const CardToneContext = createContext<CardTone>('dark');

/** Text colours for whatever summary card this sits in. */
export function useCardInk() {
  return useContext(CardToneContext) === 'dark'
    ? {
        text: brand.onDeep,
        muted: onDeepMuted,
        owed: brand.accent,
        owe: oweOnDeep,
        line: 'rgba(255,255,255,0.25)',
        select: 'rgba(255,255,255,0.18)',
        press: 'rgba(255,255,255,0.1)',
      }
    : // On coral (both themes): dark text, at least 5:1 contrast.
      {
        text: brand.onCoral,
        muted: '#4A3F52',
        owed: brand.onCoral,
        owe: brand.onCoral,
        line: 'rgba(47,40,56,0.25)',
        select: 'rgba(255,255,255,0.55)',
        press: 'rgba(255,255,255,0.3)',
      };
}

/** Text inside a summary card, coloured for the card's tone (white on dark, dark on light). */
export function CardText({
  muted,
  variant = 'body',
  style,
  children,
}: {
  muted?: boolean;
  variant?: ComponentProps<typeof Text>['variant'];
  style?: ComponentProps<typeof Text>['style'];
  children: ReactNode;
}) {
  const ink = useCardInk();
  return (
    <Text variant={variant} color={muted ? ink.muted : ink.text} style={style}>
      {children}
    </Text>
  );
}

/** Round back ‹ or close ✕ button for the light header. */
export function HeroIconButton({ icon, label, onPress }: { icon: 'back' | 'close'; label?: string; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? (icon === 'back' ? 'Back' : 'Close')}
      onPress={onPress ?? (() => router.back())}
      hitSlop={12}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      <MaterialIcons name={icon === 'back' ? 'arrow-back' : 'close'} size={22} color={c.text} />
    </Pressable>
  );
}

/** Round ⋯ button for the header's top-right corner. */
export function HeaderMenuButton({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="More options"
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      <MaterialIcons name="more-horiz" size={22} color={c.text} />
    </Pressable>
  );
}

/** Big number inside a summary card, with an optional label above and a line below. */
export function CardFigure({ label, value, note, noteColor }: { label?: string; value: string; note?: string; noteColor?: string }) {
  const ink = useCardInk();
  return (
    <View style={{ gap: 2 }}>
      {label ? (
        <Text variant="label" color={ink.muted}>
          {label}
        </Text>
      ) : null}
      <Text
        style={{ fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8, color: ink.text, fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {value}
      </Text>
      {note ? (
        <Text variant="caption" color={noteColor ?? ink.muted} style={{ fontSize: 14 }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Your overall position across groups: the currency with the biggest balance leads, any others are
 * listed quietly after it; owed/owe are the totals in that leading currency.
 */
export function usePosition(summaries: GroupSummary[]) {
  return useMemo(() => {
    const totals = netByCurrency(summaries);
    const main = [...totals].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    const primary = main ?? { currency: 'USD', amount: 0 };
    const inPrimary = summaries.filter((s) => s.group.currency === primary.currency);
    return {
      primary,
      others: totals.filter((t) => t !== main),
      owedTotal: inPrimary.reduce((sum, s) => sum + Math.max(0, s.myBalance), 0),
      oweTotal: inPrimary.reduce((sum, s) => sum + Math.max(0, -s.myBalance), 0),
    };
  }, [summaries]);
}

/** "Your total position" figure, shared by Home and Groups so they always agree. */
export function PositionFigure({ summaries }: { summaries: GroupSummary[] }) {
  const { primary, others } = usePosition(summaries);
  const where = summaries.length === 1 ? 'in your group' : `across ${summaries.length} groups`;
  const sign = primary.amount > 0 ? '+' : primary.amount < 0 ? '−' : '';
  return (
    <CardFigure
      label="Your total position"
      value={`${sign}${formatMoney(Math.abs(primary.amount), primary.currency)}`}
      note={
        (primary.amount === 0 ? 'You’re all square' : primary.amount > 0 ? `You’re owed ${where}` : `You owe ${where}`) +
        (others.length > 0
          ? ` · also ${others.map((o) => `${o.amount >= 0 ? '+' : '−'}${formatMoney(Math.abs(o.amount), o.currency)}`).join(', ')}`
          : '')
      }
    />
  );
}

/** The divided row of figures along the bottom of a summary card. Children are TotalPills. */
export function StatRow({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  const ink = useCardInk();
  return (
    <View
      style={{
        flexDirection: 'row',
        marginTop: space.md,
        paddingTop: space.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: ink.line,
      }}>
      {items.map((child, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            paddingLeft: i === 0 ? 0 : space.md,
            borderLeftWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
            borderLeftColor: ink.line,
          }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** One figure in a StatRow. Pass `cents` for money or `value` for plain text. */
export function TotalPill({
  label,
  cents,
  currency,
  value,
  tone,
  onPress,
  selected,
}: {
  label: string;
  cents?: Cents;
  currency?: string;
  value?: string;
  tone: 'owed' | 'owe' | 'neutral';
  /** Makes the figure a button (Groups: tap a figure to filter the list by it). */
  onPress?: () => void;
  selected?: boolean;
}) {
  const ink = useCardInk();
  const color = tone === 'owed' ? ink.owed : tone === 'owe' ? ink.owe : ink.text;
  const content = (
    <>
      <Text variant="caption" color={tone === 'owe' ? ink.owe : ink.muted} numberOfLines={1}>
        {label}
      </Text>
      <Text
        variant="heading"
        color={color}
        style={{ fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {value ?? formatMoney(cents ?? 0, currency ?? 'USD')}
      </Text>
    </>
  );
  if (!onPress) return <View style={{ gap: 2 }}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={`${label}: ${value ?? ''}. ${selected ? 'Showing these. Tap to show all' : 'Tap to show only these'}`}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        gap: 2,
        // The highlight stays inside its own column, clear of the dividers either side.
        marginRight: space.sm,
        paddingHorizontal: space.sm,
        paddingVertical: space.xs,
        borderRadius: radius.md,
        backgroundColor: selected ? ink.select : pressed ? ink.press : 'transparent',
      })}>
      {content}
    </Pressable>
  );
}

type IconName = ComponentProps<typeof MaterialIcons>['name'];

/** A row of pale sage action tiles under the summary card. Children are QuickActions. */
export function ActionRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg }}>{children}</View>;
}

/** `bold`: solid sage with white text, for the main actions on a screen (Home). */
export function QuickAction({
  icon,
  label,
  onPress,
  danger,
  bold,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  bold?: boolean;
  /** Dimmed and untappable (e.g. Settle up when everyone's square). */
  disabled?: boolean;
}) {
  const c = useColors();
  const color = bold ? brand.onDeep : danger ? c.danger : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: space.xs,
        paddingVertical: bold ? space.lg : space.md,
        borderRadius: radius.lg,
        backgroundColor: bold ? (danger ? c.danger : brand.deep) : c.surfaceAlt,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}>
      <MaterialIcons name={icon} size={bold ? 28 : 24} color={color} />
      <Text variant="label" color={color} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
        {group.myRole === 'owner' || group.myRole === 'admin' ? (
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
              {group.myRole === 'owner' ? 'Owner' : 'Co-owner'}
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
