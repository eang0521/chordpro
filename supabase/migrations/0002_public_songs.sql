-- The public song database: anyone (signed in or not) can browse it, but only people whose
-- email is on the publishers list can add songs, and each publisher can change or remove only
-- the songs they published. A published song is a snapshot of a library song (see
-- src/lib/songDocument.ts), updated only when its publisher publishes it again.

-- Who may publish. Managed by hand in the Supabase dashboard (Table Editor), which bypasses
-- row-level security. With RLS on and no policies, the site itself can neither read nor change
-- this list, so nobody can add themselves or see who else is on it.
create table public.publishers (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);

alter table public.publishers enable row level security;

-- Whether the signed-in user may publish. Runs with its owner's rights so it can read the
-- list the caller can't; the email comes from the verified sign-in token, so it can't be faked.
create function public.is_publisher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.publishers p
    where p.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke execute on function public.is_publisher() from public;
grant execute on function public.is_publisher() to anon, authenticated;

create table public.public_songs (
  id uuid primary key,
  -- Filled in from the signed-in user, so nobody can publish under someone else's name. Kept
  -- (as null) if that account is ever deleted, so the song stays public.
  publisher uuid default auth.uid() references auth.users (id) on delete set null,
  -- The library song this was published from, so publishing it again updates this snapshot
  -- instead of adding a second copy.
  source_song_id uuid,
  -- Copied out of the document so the list doesn't have to download every song.
  title text not null default '',
  keys text[] not null default '{}',
  writers text not null default '',
  document jsonb not null,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (publisher, source_song_id)
);

create index public_songs_title_idx on public.public_songs (lower(title));

-- Reuses the trigger function from 0001_songs.sql: the database stamps updated_at.
create trigger public_songs_touch_updated_at
  before insert or update on public.public_songs
  for each row execute function public.songs_touch_updated_at();

alter table public.public_songs enable row level security;

create policy "Anyone reads public songs" on public.public_songs
  for select to anon, authenticated using (true);

create policy "Publishers add songs" on public.public_songs
  for insert to authenticated
  with check (publisher = (select auth.uid()) and (select public.is_publisher()));

-- Publishers change and remove only their own songs, and only while still on the list.
create policy "Publishers change their songs" on public.public_songs
  for update to authenticated
  using (publisher = (select auth.uid()) and (select public.is_publisher()))
  with check (publisher = (select auth.uid()) and (select public.is_publisher()));

create policy "Publishers remove their songs" on public.public_songs
  for delete to authenticated
  using (publisher = (select auth.uid()) and (select public.is_publisher()));
