import { requireOptionalNativeModule } from 'expo';
import type * as ClipboardModule from 'expo-clipboard';

/**
 * Copy text to the clipboard. Returns false if this build of the app doesn't include the
 * clipboard module (an older development build), instead of crashing on load.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!requireOptionalNativeModule('ExpoClipboard')) return false;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Clipboard = require('expo-clipboard') as typeof ClipboardModule;
  return Clipboard.setStringAsync(text);
}
