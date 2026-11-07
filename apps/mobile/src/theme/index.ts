import { useColorScheme } from 'react-native';

/**
 * Tally design tokens: Sage & White.
 * Every colour, space and type size in the app comes from here.
 * Money colours are reserved for money direction only: green = owed to you, muted red = you owe.
 * Readability: white on the sage header is 5.7:1, white on the button colour 7.3:1, and the
 * money and secondary-text colours all pass WCAG AA (4.5:1) on their backgrounds.
 */

/** Brand constants, identical in light and dark mode. Change the palette here. */
export const brand = {
  /** Sage: primary brand colour, used for header backgrounds and the logo. */
  deep: '#4E6E5D',
  /** Deep sage: primary buttons (stronger contrast with white text than the header colour). */
  deeper: '#3F5D4E',
  deepest: '#2F473B',
  /** Pale sage: accent, used for highlights and the main action on the header. */
  accent: '#D3E5DA',
  accentSoft: '#E8F1EB',
  /** Lighter shade of the sage tiles (sage mixed 50% with white): Home's summary card. Dark text only. */
  sageLight: '#A6B6AE',
  /** Red slash in the Tally mark: part of the logo in every palette. Logo only; never used for money states. */
  slash: '#F2555A',
  onDeep: '#FFFFFF',
  onAccent: '#26302B',
  /** "You owe" on the sage header (the light-mode owe colour is too dark there). */
  oweOnDeep: '#FFC7BE',
  /** Secondary text on the header. */
  onDeepMuted: 'rgba(255,255,255,0.82)',
  /** Translucent highlight on the header: avatars, the selected rail tab, notes. */
  tintOnDeep: 'rgba(211,229,218,0.24)',
} as const;

const palette = {
  light: {
    bg: '#FFFFFF',
    surface: '#F7FAF8',
    surfaceAlt: '#E8F1EB',
    border: '#E2EAE5',
    text: '#26302B',
    textMuted: '#66736C',
    primary: brand.deeper,
    onPrimary: brand.onDeep,
    accent: brand.accent,
    onAccent: brand.onAccent,
    focus: '#3F5D4E',
    owed: '#1A7A50',
    owe: '#B8433A',
    settled: '#7A857F',
  },
  dark: {
    bg: '#111714',
    surface: '#18201C',
    surfaceAlt: '#212C26',
    border: '#2B3832',
    text: '#EAF1EC',
    textMuted: '#9CAEA4',
    primary: '#A9CDB8',
    onPrimary: '#14201A',
    accent: brand.accent,
    onAccent: brand.onAccent,
    focus: '#A9CDB8',
    owed: '#6FD39C',
    owe: '#FF9C8F',
    settled: '#9CAEA4',
  },
} as const;

/** Distinct, brand-friendly colours for group avatars. Picked by groupColor(id). */
const GROUP_COLORS = ['#2F7DE1', '#0EA5A4', '#7C5CDB', '#E07A3F', '#D6457A', '#3D9A5B', '#C99A1C', '#4F6BED'] as const;

export function groupColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length]!;
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
