import type { SupabaseClient } from '@supabase/supabase-js';
import type { KeyName } from '../types';
import { songKeysOf } from './chordChart';
import { upgradeSongDocument, type SongDocument } from './songDocument';
import { NewerSongVersionError, type SongStore, type SongSummary } from './songStore';

/** The `songs` table from supabase/migrations/0001_songs.sql. Row-level security limits every
 * query to the signed-in user's own rows, so none of these need to filter by owner. */
export function createSupabaseSongStore(client: SupabaseClient): SongStore {
  const songs = () => client.from('songs');

  return {
    async list() {
      const { data, error } = await songs()
        .select('id, title, keys, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(
        (row): SongSummary => ({
          id: row.id as string,
          title: row.title as string,
          keys: (row.keys ?? []) as KeyName[],
          updatedAt: row.updated_at as string,
        }),
      );
    },

    async get(id) {
      const { data, error } = await songs().select('document').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const result = upgradeSongDocument(data.document);
      if (!result.ok) {
        if (result.reason === 'newer') throw new NewerSongVersionError();
        throw new Error("This song's saved data couldn't be read.");
      }
      // The row id is the source of truth, in case a document was ever copied between rows.
      return { ...result.doc, id };
    },

    async save(doc: SongDocument) {
      const { error } = await songs().upsert({
        id: doc.id,
        title: doc.title.trim(),
        keys: songKeysOf(doc.blocks, doc.arrangement, doc.key),
        document: doc,
      });
      if (error) throw error;
    },

    async delete(id) {
      const { error } = await songs().delete().eq('id', id);
      if (error) throw error;
    },
  };
}
