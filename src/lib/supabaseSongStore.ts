import type { SupabaseClient } from '@supabase/supabase-js';
import type { KeyName } from '../types';
import { songKeysOf } from './chordChart';
import { upgradeSongDocument, type SongDocument } from './songDocument';
import { NewerSongVersionError, type SongStore, type SongSummary } from './songStore';

/** The `songs` table from supabase/migrations/0001_songs.sql. Row-level security limits every
 * query to the signed-in user's own rows, so none of these need to filter by owner. */
export function createSupabaseSongStore(client: SupabaseClient): SongStore {
  const songs = () => client.from('songs');
  const SUMMARY = 'id, work_id, version_name, title, keys, updated_at';
  const toSummary = (row: Record<string, unknown>): SongSummary => ({
    id: row.id as string,
    workId: row.work_id as string,
    versionName: row.version_name as string,
    title: row.title as string,
    keys: (row.keys ?? []) as KeyName[],
    updatedAt: row.updated_at as string,
  });

  return {
    async list() {
      const { data, error } = await songs().select(SUMMARY).order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toSummary);
    },

    async listVersions(workId) {
      const { data, error } = await songs().select(SUMMARY).eq('work_id', workId).order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toSummary);
    },

    async get(id) {
      const { data, error } = await songs().select('document, work_id, version_name').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const result = upgradeSongDocument(data.document);
      if (!result.ok) {
        if (result.reason === 'newer') throw new NewerSongVersionError();
        throw new Error("This song's saved data couldn't be read.");
      }
      // The row is the source of truth for which version of which song this is, in case a
      // document was copied between rows (and older documents don't say).
      return { ...result.doc, id, workId: data.work_id as string, versionName: data.version_name as string };
    },

    async save(doc: SongDocument) {
      const { error } = await songs().upsert({
        id: doc.id,
        work_id: doc.workId,
        version_name: doc.versionName.trim(),
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
