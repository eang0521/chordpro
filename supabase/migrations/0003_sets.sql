-- Sets: a named, ordered list of a user's own songs, each in the key it'll be played in, for a
-- service or rehearsal. A set is private to its owner, like their songs, but can be shared by
-- link: turning sharing on gives it a random share token, and anyone with the link can read the
-- set and its songs (nothing else) until sharing is turned off again.

create table public.sets (
  id uuid primary key,
  -- Filled in from the signed-in user, so the client can't claim someone else's id.
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  -- The songs in order, each with the key to play it in: [{ "songId": "...", "key": "G" }, ...].
  entries jsonb not null default '[]',
  -- Set while the set is shared by link; null otherwise. Unguessable, unlike the set's id.
  share_token uuid unique,
  updated_at timestamptz not null default now()
);

create index sets_owner_updated_idx on public.sets (owner, updated_at desc);

-- Reuses the trigger function from 0001_songs.sql: the database stamps updated_at.
create trigger sets_touch_updated_at
  before insert or update on public.sets
  for each row execute function public.songs_touch_updated_at();

alter table public.sets enable row level security;

create policy "Owners read their sets" on public.sets
  for select to authenticated using (owner = (select auth.uid()));

create policy "Owners add their sets" on public.sets
  for insert to authenticated with check (owner = (select auth.uid()));

create policy "Owners change their sets" on public.sets
  for update to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

create policy "Owners delete their sets" on public.sets
  for delete to authenticated using (owner = (select auth.uid()));

-- A shared set, by its share token: its name and its songs in order, each with the key it's
-- set in and the song itself. Runs with its owner's rights so a link holder can read the set's
-- songs, which row-level security otherwise keeps private; it only ever returns songs that are
-- in the set and belong to the set's owner. Songs deleted since they were added are left out.
-- Null when no set is shared under that token.
create function public.get_shared_set(token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', s.name,
    'songs', coalesce(
      (
        select jsonb_agg(jsonb_build_object('key', e.entry ->> 'key', 'document', so.document) order by e.position)
        from jsonb_array_elements(s.entries) with ordinality as e (entry, position)
        join public.songs so on so.id = (e.entry ->> 'songId')::uuid and so.owner = s.owner
      ),
      '[]'::jsonb
    )
  )
  from public.sets s
  where s.share_token = token;
$$;

revoke execute on function public.get_shared_set(uuid) from public;
grant execute on function public.get_shared_set(uuid) to anon, authenticated;
