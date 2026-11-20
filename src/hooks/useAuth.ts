import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { authRedirectUrl, openedFromPasswordReset, supabase } from '../lib/supabaseClient';

export type AuthState =
  /** No Supabase project configured: the app runs signed-out only. */
  | { status: 'disabled' }
  /** Still reading the saved session (or an emailed link's token from the URL). */
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: User };

/** Passwords shorter than this are refused here; set the same minimum in Supabase (README step 3). */
export const MIN_PASSWORD_LENGTH = 8;

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

/**
 * Whether the person arrived from a password-reset email and still has to choose a new password.
 * The reset link signs them in, so this is what makes sure they're asked for one.
 */
export function usePasswordRecovery(): [boolean, () => void] {
  const [recovering, setRecovering] = useState(openedFromPasswordReset);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return [recovering, () => setRecovering(false)];
}

function requireSupabase() {
  if (!supabase) throw new Error('Accounts are not set up.');
  return supabase;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Creates an account and emails a link to confirm the address; the person is signed in once they
 * open it. If the address already has an account, Supabase sends nothing and reports success
 * anyway, so nobody can use this to find out who has an account.
 */
export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

/** Emails a link that signs the person in and asks for a new password (usePasswordRecovery). */
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
  if (error) throw error;
}

/**
 * Sets a new password for the signed-in person, then signs out their other devices: after a reset,
 * whoever might have known the old password shouldn't stay signed in.
 */
export async function setNewPassword(password: string): Promise<void> {
  const auth = requireSupabase().auth;
  const { error } = await auth.updateUser({ password });
  if (error) throw error;
  await auth.signOut({ scope: 'others' });
}

export async function signOut(): Promise<void> {
  // 'local' signs out only this browser; the default would also sign out every other device.
  await supabase?.auth.signOut({ scope: 'local' });
}

/** A message for a failed sign-in, sign-up or reset, rather than Supabase's raw error. */
export function authErrorMessage(err: unknown): string {
  const { code, status } = err as { code?: string; status?: number };
  switch (code) {
    case 'invalid_credentials':
      return 'That email and password don’t match. Check them, or use “Forgot password?”.';
    case 'email_not_confirmed':
      return 'Confirm your email first: open the link we sent when you created your account.';
    case 'weak_password':
      return `Choose a stronger password: at least ${MIN_PASSWORD_LENGTH} characters, and not a common one.`;
    case 'same_password':
      return 'That’s your current password. Choose a different one.';
    case 'signup_disabled':
      return 'New accounts can’t be created right now.';
  }
  // Supabase's built-in mailer allows only a few emails an hour, and sign-in attempts are limited too.
  if (status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return 'Too many attempts just now. Wait a few minutes and try again.';
  }
  return 'Something went wrong. Check your connection and try again.';
}
