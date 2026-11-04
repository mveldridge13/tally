import { Platform, useWindowDimensions } from 'react-native';

/**
 * Android window size classes, by width in dp (not by device model), so the layout follows
 * the screen it's on: Fold8 cover (475 dp) = compact, Fold8 inner held wide (933 dp) = expanded,
 * the inner screen rotated (704 dp) or split screen = medium.
 */
export type WidthClass = 'compact' | 'medium' | 'expanded';

export const BREAKPOINT_MEDIUM = 600;
export const BREAKPOINT_EXPANDED = 840;

/** Widest a single column of content gets on medium/expanded screens, so cards don't stretch edge to edge. */
export const CONTENT_MAX_WIDTH = 680;

/** Width of the left pane in two-pane layouts. */
export const LIST_PANE_WIDTH = 400;

export function widthClassFor(width: number): WidthClass {
  if (width >= BREAKPOINT_EXPANDED) return 'expanded';
  if (width >= BREAKPOINT_MEDIUM) return 'medium';
  return 'compact';
}

export function useWidthClass(): WidthClass {
  const { width } = useWindowDimensions();
  return widthClassFor(width);
}

/**
 * Which side the navigation rail sits on when unfolded. Galaxy Folds: left.
 * iPhone Duo (placeholder, not yet announced): navigation on the right, so iOS mirrors the rail.
 */
export const NAV_RAIL_SIDE: 'left' | 'right' = Platform.OS === 'ios' ? 'right' : 'left';

/** Width of the navigation rail on expanded screens. */
export const NAV_RAIL_WIDTH = 88;
