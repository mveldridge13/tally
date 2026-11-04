import { create } from 'zustand';

/**
 * An invite opened (or a code entered) before signing in. It's kept on the phone so that
 * once the person creates an account or logs in, Tally joins them to the group automatically.
 * Used once, then cleared.
 */

const KEY = 'tally.pendingInvite';

// localStorage is provided by expo-sqlite (installed in lib/supabase); guard in case it's unavailable.
function read(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

function write(token: string | null) {
  try {
    if (token) globalThis.localStorage?.setItem(KEY, token);
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    // Not fatal: the invite just won't survive an app restart.
  }
}

export const usePendingInvite = create<{ token: string | null }>(() => ({ token: read() }));

/** Remember an invite until the person is signed in. */
export function savePendingInvite(token: string) {
  const clean = token.trim();
  if (!clean) return;
  write(clean);
  usePendingInvite.setState({ token: clean });
}

/** Take the saved invite (if any) and clear it, so it's only used once. */
export function takePendingInvite(): string | null {
  const token = usePendingInvite.getState().token ?? read();
  write(null);
  usePendingInvite.setState({ token: null });
  return token;
}
