import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Both values are public by design: they only identify the project, and row-level security
// (supabase/migrations) is what keeps each person's songs private. Never put the service_role
// / secret key here — it bypasses row-level security. Left empty, the app runs signed-out only,
// exactly as it did before accounts existed.
const SUPABASE_URL = 'https://bpsrqjjetfzadyahtpnj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eLjlNjZWTUZ_qiUMUIeYvw_HcJJH-OC';

/** True when this page was opened from a "reset your password" email. Read before the client
 * below reads the token from the URL and clears it, so it can't be missed. */
export const openedFromPasswordReset = /[#&]type=recovery(&|$)/.test(window.location.hash);

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          // The implicit flow lets an emailed link (confirming a new account, or resetting a
          // password) work in whichever browser opens it (often a phone's mail app), where PKCE
          // would need it to be the same browser that asked for the link.
          flowType: 'implicit',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

/** Where emailed links (account confirmation, password reset) send people back to: this app's own page, so it works the
 * same from Vercel and the local dev server (both must be in Supabase's redirect URLs). */
export function authRedirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}
