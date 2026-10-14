-- The song library: one row per song, the whole song as a versioned JSON document (see
-- src/lib/songDocument.ts). The site talks to this table straight from the browser with the
-- public anon key, so row-level security is what keeps each person's songs private.

create table public.songs (
  id uuid primary key,
  -- Filled in from the signed-in user, so the client can't claim someone else's id.
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Copied out of the document so the library list doesn't have to download every song.
  title text not null default '',
  keys text[] not null default '{}',
  document jsonb not null,
  updated_at timestamptz not null default now()
);

create index songs_owner_updated_idx on public.songs (owner, updated_at desc);

-- Stamped by the database rather than the browser, so "last edited" is right even when a
-- device's clock is off.
create function public.songs_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger songs_touch_updated_at
  before insert or update on public.songs
  for each row execute function public.songs_touch_updated_at();

alter table public.songs enable row level security;

-- Only signed-in users get any access, and only to their own rows. `(select auth.uid())` is
-- evaluated once per query instead of once per row.
create policy "Owners read their songs" on public.songs
  for select to authenticated using (owner = (select auth.uid()));

create policy "Owners add their songs" on public.songs
  for insert to authenticated with check (owner = (select auth.uid()));

create policy "Owners change their songs" on public.songs
  for update to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

create policy "Owners delete their songs" on public.songs
  for delete to authenticated using (owner = (select auth.uid()));
