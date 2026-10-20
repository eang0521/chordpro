-- Capo charts: a song in a set can have a capo ({ "songId": "...", "key": "Eb", "capo": 3 }), so
-- its chart shows a guitarist the chord shapes they play. The entries column already holds it;
-- this passes it along to a shared set too. Otherwise the same as get_shared_set in 0003_sets.sql.

create or replace function public.get_shared_set(token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', s.name,
    'songs', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('key', e.entry ->> 'key', 'capo', e.entry -> 'capo', 'document', so.document)
          order by e.position
        )
        from jsonb_array_elements(s.entries) with ordinality as e (entry, position)
        join public.songs so on so.id = (e.entry ->> 'songId')::uuid and so.owner = s.owner
      ),
      '[]'::jsonb
    )
  )
  from public.sets s
  where s.share_token = token;
$$;
