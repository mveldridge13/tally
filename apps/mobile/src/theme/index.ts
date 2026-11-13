import { useColorScheme } from 'react-native';

/**
 * Tally design tokens: Coral + Lavender.
 * Every colour, space and type size in the app comes from here.
 * Palette: coral pink #E4928A, warm coral #DFA3A8, lavender #E6DDF2, cream #FAF0EB, deep purple #605574.
 * Money isn't colour-coded red/green: the words ("Sam owes you", "You owe Leo") carry the meaning.
 * Readability: white on deep purple is 7:1; dark text on coral is 6:1.
 */

/** Brand constants, identical in light and dark mode. Change the palette here. */
export const brand = {
  /** Deep purple: the brand's strong colour (sign-in screens, the dark card, bold tiles, the logo). */
  deep: '#605574',
  /** Darker purple: pressed and emphasis states. */
  deeper: '#524866',
  deepest: '#3F3650',
  /** Lavender: soft tiles and highlights. */
  accent: '#E6DDF2',
  accentSoft: '#F3EEF9',
  /** Coral pink: the light summary card (Home's total). Dark text only. */
  coral: '#E4928A',
  /** Warm coral: decoration on coral surfaces. */
  coralWarm: '#DFA3A8',
  /** Soft coral: "owes you" cards and payments. Dark text only. */
  coralSoft: '#F7DDD8',
  onCoral: '#2F2838',
  /** Cream: the page background in light mode. */
  cream: '#FAF0EB',
  /** Red slash in the Tally mark: part of the logo in every palette. Logo only; never used for money states. */
  slash: '#EF4444',
  onDeep: '#FFFFFF',
  onAccent: '#2F2838',
  /** "You owe" on deep purple. */
  oweOnDeep: '#FFFFFF',
  /** Secondary text on deep purple. */
  onDeepMuted: 'rgba(255,255,255,0.82)',
  /** Translucent highlight on deep purple: avatars, the selected rail tab, notes. */
  tintOnDeep: 'rgba(230,221,242,0.24)',
} as const;

const palette = {
  light: {
    bg: brand.cream,
    surface: '#FFFFFF',
    surfaceAlt: brand.accent,
    /** Soft coral surface: "owes you" cards, payments. */
    warm: brand.coralSoft,
    border: '#EADDD7',
    text: '#2F2838',
    textMuted: '#6E6478',
    primary: brand.deep,
    onPrimary: brand.onDeep,
    accent: brand.accent,
    onAccent: brand.onAccent,
    focus: brand.deep,
    owed: brand.deep,
    owe: '#2F2838',
    settled: '#8A8091',
    /** Errors and destructive actions only (never money). */
    danger: '#B8433A',
  },
  dark: {
    bg: '#1E1A24',
    surface: '#28222F',
    surfaceAlt: '#3A3148',
    warm: '#4A3036',
    border: '#3E3548',
    text: '#F4ECF0',
    textMuted: '#B5A9BD',
    primary: '#CFC3E6',
    onPrimary: '#2A2238',
    accent: brand.accent,
    onAccent: brand.onAccent,
    focus: '#CFC3E6',
    owed: '#E9B4AD',
    owe: '#F4ECF0',
    settled: '#B5A9BD',
    danger: '#FF9C8F',
  },
} as const;

/** Distinct, brand-friendly colours for group avatars. Picked by groupColor(id). */
const GROUP_COLORS = ['#5B8BD9', '#3A9E9A', '#8A6CC9', '#D9785F', '#C9607A', '#5E9B6B', '#C1922E', '#6B7BE0'] as const;

export function groupColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length]!;
}

/** A light shade of a group's colour that dark text reads well on: the background of its cards. */
export function groupTint(id: string): string {
  const n = Number.parseInt(groupColor(id).slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.4);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r! << 16) | (g! << 8) | b!).toString(16).slice(1)}`;
}

export type Colors = { [K in keyof (typeof palette)['light']]: string };

/**
 * Delay (ms) before a pressed row shows its highlight. A scroll that starts within this time
 * cancels the press, so flicking through a list doesn't flash grey ripples on the rows touched.
 */
export const PRESS_DELAY = 90;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const type = {
  hero: { fontSize: 44, fontWeight: '800' as const, letterSpacing: -1 },
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  label: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}

/** Colour for a signed balance: positive = owed to you, negative = you owe. */
export function balanceColor(colors: Colors, cents: number): string {
  if (cents > 0) return colors.owed;
  if (cents < 0) return colors.owe;
  return colors.settled;
}
