import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Both values are public by design: they only identify the project, and row-level security
// (supabase/migrations) is what keeps each person's songs private. Never put the service_role
// / secret key here — it bypasses row-level security. Left empty, the app runs signed-out only,
// exactly as it did before accounts existed.
const SUPABASE_URL = 'https://bpsrqjjetfzadyahtpnj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eLjlNjZWTUZ_qiUMUIeYvw_HcJJH-OC';

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          // The implicit flow lets an emailed sign-in link work in whichever browser opens it
          // (often a phone's mail app), where PKCE would need it to be the same browser that
          // asked for the link.
          flowType: 'implicit',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

/** Where sign-in links send people back to: this app's own page, so it works the
 * same from Vercel, GitHub Pages and the local dev server (all must be in Supabase's redirect URLs). */
export function authRedirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}
