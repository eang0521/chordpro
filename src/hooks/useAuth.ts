import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { authRedirectUrl, supabase } from '../lib/supabaseClient';

export type AuthState =
  /** No Supabase project configured: the app runs signed-out only. */
  | { status: 'disabled' }
  /** Still reading the saved session (or a sign-in link's token from the URL). */
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: User };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(supabase ? { status: 'loading' } : { status: 'disabled' });

  useEffect(() => {
    if (!supabase) return;
    // Fires once straight away with the current session (INITIAL_SESSION), then on every
    // sign-in, sign-out and token refresh — including ones made in other tabs.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((prev) => {
        if (!session) return prev.status === 'signedOut' ? prev : { status: 'signedOut' };
        // A token refresh hands over a new user object for the same person; keep the old state
        // so screens keyed on the user don't think someone new signed in.
        if (prev.status === 'signedIn' && prev.user.id === session.user.id) return prev;
        return { status: 'signedIn', user: session.user };
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}

export async function sendSignInLink(email: string): Promise<void> {
  if (!supabase) throw new Error('Accounts are not set up.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

/** Leaves the page for Google's sign-in, which comes back to authRedirectUrl. */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Accounts are not set up.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  // 'local' signs out only this browser; the default would also sign out every other device.
  await supabase?.auth.signOut({ scope: 'local' });
}
