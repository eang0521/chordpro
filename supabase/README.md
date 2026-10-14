# Setting up accounts and the song library (Supabase)

ChordPro Tapper is a static site, hosted on Vercel (GitHub Pages still works too). Signed-in
users' songs live in a Supabase project that the browser talks to directly; row-level security
keeps each person's songs private.
Until the project's URL and key are filled in (step 6), the app runs signed-out only, exactly as
before.

Everything here is done by hand in the Vercel, Supabase and Google dashboards. It's all free tier.

## 0. Host the site on Vercel

1. Go to <https://vercel.com/new>, sign in with GitHub, and import the `eang0521/chordpro` repo
   (allow Vercel access to it when GitHub asks).
2. Vercel detects **Vite**. Leave the defaults (build `npm run build`, output `dist`) and
   click **Deploy**. No environment variables are needed.
3. Note the production address it gives you, e.g. `https://chordpro.vercel.app` (yours may
   differ; it's under the project's **Domains**). Below it's called `<vercel-url>`.

From then on every push to `main` deploys to that address, and every other branch gets its own
preview address. The site is served from the root there (`/`), while GitHub Pages serves it
under `/chordpro/`; `vite.config.ts` picks the right one. Once you're happy with Vercel you can
switch GitHub Pages off (**Settings → Pages**) and delete `.github/workflows/deploy.yml`.

## 1. Create the Supabase project

1. Go to <https://supabase.com>, sign in (GitHub sign-in is fine) and click **New project**.
2. Pick your organization, name it `chordpro`, set a database password (keep it in your password
   manager; the app never needs it) and choose the region closest to you. Click **Create new project**.
3. Wait a minute or two for it to finish setting up.

Free projects are paused after about a week with no activity. Signing in or saving a song counts
as activity; if it does pause, **Restore** it from the dashboard and nothing is lost.

## 2. Create the songs table

1. **SQL Editor → New query**.
2. Paste all of [`migrations/0001_songs.sql`](migrations/0001_songs.sql) and click **Run**. It
   should say *Success. No rows returned*.
3. Check **Table Editor → songs** exists and is marked **RLS enabled**.

## 3. Sign-in by emailed link

1. **Authentication → Sign In / Providers**: leave **Allow new users to sign up** on (or nobody
   can make an account), and make sure **Email** is enabled. **Confirm email** can stay on; opening
   the link confirms the address.
2. Optional: **Authentication → Emails → Magic Link** to change the email's wording.

Supabase's built-in mailer only sends a few emails an hour and is meant for light use. That's
fine for you and a few friends; if more people use it, set up your own SMTP under
**Authentication → Emails → SMTP Settings** (Resend, Brevo and others have free tiers).

## 4. Redirect URLs

**Authentication → URL Configuration**:

- **Site URL**: `<vercel-url>/` (e.g. `https://chordpro.vercel.app/`)
- **Redirect URLs**: add
  - `<vercel-url>/`
  - `http://localhost:5173/chordpro/`
  - optionally `http://localhost:4173/chordpro/` for `npm run preview`
  - optionally `https://eang0521.github.io/chordpro/`, while GitHub Pages is still up
  - optionally `https://*-eang0521s-projects.vercel.app/**` to sign in on branch previews (check
    the exact team name in a preview address; Supabase allows the `*` and `**` wildcards)

The app asks to come back to whichever of these it's running on, and Supabase refuses any
address not on the list.

## 5. Sign-in with Google

You need a Google Cloud OAuth client. The **client secret goes only into the Supabase
dashboard**, never into this repo or the app.

1. In Supabase, open **Authentication → Sign In / Providers → Google** and copy the
   **Callback URL** it shows (`https://<project-ref>.supabase.co/auth/v1/callback`). Leave that
   tab open.
2. Go to <https://console.cloud.google.com>, and from the project picker at the top create a new
   project (e.g. `chordpro`).
3. Open **Google Auth Platform** (search "OAuth consent screen") and click **Get started**:
   - App name `ChordPro Tapper`, user support email: yours.
   - Audience: **External**.
   - Contact email: yours. Agree to the policy and **Create**.
4. **Branding**: under **Authorized domains** add `<project-ref>.supabase.co`. Save.
5. **Data access → Add or remove scopes**: tick `openid`, `.../auth/userinfo.email` and
   `.../auth/userinfo.profile`. Update, then Save.
6. **Audience**: click **Publish app** so anyone with a Google account can sign in. (While it's
   in *Testing*, only the test users you list there can.) These basic scopes don't need Google's
   verification.
7. **Clients → Create client**:
   - Application type: **Web application**, name `ChordPro Tapper`.
   - **Authorized JavaScript origins**: `<vercel-url>` and `http://localhost:5173` (plus
     `https://eang0521.github.io` while GitHub Pages is still up). With no trailing slash.
     Google only checks the redirect URI below for this sign-in flow, so these are a
     precaution.
   - **Authorized redirect URIs**: the Supabase callback URL from step 1.
   - **Create**, then copy the **Client ID** and **Client secret**.
8. Back in Supabase's **Google** provider: turn it on, paste the Client ID and Client secret,
   and **Save**.

Google's sign-in screen will say "to continue to `<project-ref>.supabase.co`". Showing your own
domain there needs a paid Supabase custom domain, so that's expected.

## 6. Connect the app

**Project Settings → API Keys** (or the **Connect** button):

- **Project URL**: `https://<project-ref>.supabase.co`
- **Publishable key** (`sb_publishable_…`), or the legacy **anon** key (`eyJ…`)

Put both in `SUPABASE_URL` and `SUPABASE_ANON_KEY` in
[`src/lib/supabaseClient.ts`](../src/lib/supabaseClient.ts). They are public by design;
row-level security is what protects the data. Never use the **secret** / **service_role**
key there: it bypasses row-level security.

## Checking row-level security

With two accounts (say, an emailed link in one browser and Google in another), each sees only
their own songs. Opening another account's song id gives "That song isn't in your library any
more". In the SQL editor you can also pick the **authenticated** role and impersonate one user
to see that `select * from songs` returns only theirs.
