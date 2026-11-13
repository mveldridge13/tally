import { requireOptionalNativeModule } from 'expo';
import type * as Localization from 'expo-localization';

/**
 * Currencies Tally offers for groups. All amounts are stored as integer cents, which
 * assumes 2 decimal places, so zero-decimal currencies (JPY, KRW, …) are deliberately
 * excluded until the money layer supports per-currency precision.
 */
export const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'NZD', 'CAD', 'SGD', 'INR'] as const;

export type Currency = (typeof CURRENCIES)[number];

export function isSupportedCurrency(code: string | null | undefined): code is Currency {
  return !!code && (CURRENCIES as readonly string[]).includes(code);
}

/**
 * The currency of the phone's region (Settings → language & region), e.g. AUD in Australia.
 * Returns null when the region's currency isn't one Tally supports yet.
 */
export function deviceCurrency(): Currency | null {
  // Only load expo-localization if this build includes its native module. An older
  // development build without it would otherwise report "Cannot find native module".
  if (!requireOptionalNativeModule('ExpoLocalization')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLocales } = require('expo-localization') as typeof Localization;
    for (const locale of getLocales()) {
      if (isSupportedCurrency(locale.currencyCode)) return locale.currencyCode;
    }
  } catch {
    // Fall through: keep the server default.
  }
  return null;
}

/** The phone's time zone, e.g. "Australia/Sydney", or null if it can't be read. */
export function deviceTimeZone(): string | null {
  if (requireOptionalNativeModule('ExpoLocalization')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCalendars } = require('expo-localization') as typeof Localization;
      const tz = getCalendars()[0]?.timeZone;
      if (tz) return tz;
    } catch {
      // Fall back to Intl below.
    }
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
