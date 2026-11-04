import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  /** False until the stored session has been read from disk. */
  ready: boolean;
}

export const useAuth = create<AuthState>(() => ({ session: null, ready: false }));

supabase.auth.getSession().then(({ data }) => {
  useAuth.setState({ session: data.session, ready: true });
});
supabase.auth.onAuthStateChange((_event, session) => {
  useAuth.setState({ session, ready: true });
});

/** The signed-in user's id. Only call from screens behind the auth guard. */
export function useMyId(): string {
  return useAuth((s) => s.session?.user.id ?? '');
}

export function useMyEmail(): string {
  return useAuth((s) => s.session?.user.email ?? '');
}
