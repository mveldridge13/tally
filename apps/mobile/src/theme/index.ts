import { useColorScheme } from 'react-native';

/**
 * Tally design tokens: Navy + Sky Blue.
 * Every colour, space and type size in the app comes from here.
 * Owed (green) and owe (orange) colours are reserved for money direction only,
 * so they never compete with the blue brand colours.
 */

/** Brand constants, identical in light and dark mode. Change the palette here. */
export const brand = {
  /** Navy: primary brand colour, used for hero backgrounds and primary buttons. */
  deep: '#14284B',
  deeper: '#0E1D38',
  deepest: '#081226',
  /** Sky blue: accent, used for highlights and buttons on navy. */
  accent: '#7CC4FF',
  accentSoft: '#E3F1FF',
  /** Red slash in the Tally mark. Logo only; never used for money states. */
  slash: '#F2555A',
  onDeep: '#FFFFFF',
  onAccent: '#081226',
  /** "You owe" orange on navy (the light-mode owe colour is too dark there). */
  oweOnDeep: '#FDBA74',
  /** Secondary text on navy. */
  onDeepMuted: 'rgba(255,255,255,0.7)',
} as const;

const palette = {
  light: {
    bg: '#F4F7FC',
    surface: '#FFFFFF',
    surfaceAlt: '#E8EFF9',
    border: '#D5E0F0',
    text: '#0E1B33',
    textMuted: '#5A6B85',
    primary: brand.deep,
    onPrimary: brand.onDeep,
    accent: brand.accent,
    onAccent: brand.onAccent,
    focus: '#2F7DE1',
    owed: '#15803D',
    owe: '#C2410C',
    settled: '#6B7A90',
  },
  dark: {
    bg: '#0A1222',
    surface: '#111C31',
    surfaceAlt: '#18263F',
    border: '#22334F',
    text: '#EAF1FB',
    textMuted: '#94A6C2',
    primary: brand.accent,
    onPrimary: brand.onAccent,
    accent: brand.accent,
    onAccent: brand.onAccent,
    focus: brand.accent,
    owed: '#4ADE80',
    owe: '#FDBA74',
    settled: '#94A6C2',
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
