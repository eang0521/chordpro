-- Versions: a song (a "work", like "Jesus Paid It All") can have several named versions (the
-- Original Hymn, the Passion arrangement, ...). Every row in songs and public_songs is one
-- version; work_id groups the versions of the same song. Each user's versions stay private to
-- them, and public versions are visible to all, but both carry the same work_id, so a song page
-- can list the public versions alongside the signed-in user's own.
--
-- There's no table of works: a work is just the id its versions share. The row-level security
-- already on both tables still decides who sees and changes each version.

alter table public.songs
  add column work_id uuid,
  add column version_name text not null default '';

-- Every existing song starts as its own song with one version; grouping is done by hand.
update public.songs set work_id = id where work_id is null;
-- The default only matters for a browser tab still running the app from before versions,
-- which doesn't send work_id: a new song it saves becomes a song of its own.
alter table public.songs alter column work_id set not null, alter column work_id set default gen_random_uuid();

create index songs_owner_work_idx on public.songs (owner, work_id);

alter table public.public_songs
  add column work_id uuid,
  add column version_name text not null default '';

-- A public song joins the song it was published from, so the publisher's own version and the
-- public one show up together; any other public song is its own song.
update public.public_songs set work_id = coalesce(source_song_id, id) where work_id is null;
alter table public.public_songs alter column work_id set not null, alter column work_id set default gen_random_uuid();

create index public_songs_work_idx on public.public_songs (work_id);
