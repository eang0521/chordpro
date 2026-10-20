import type { SupabaseClient } from '@supabase/supabase-js';
import type { KeyName } from '../types';
import { KEY_NAMES } from './musicTheory';
import { upgradeSongDocument, type SongDocument } from './songDocument';

/** One song in a set, in the key it'll be played in. */
export interface SetEntry {
  songId: string;
  key: KeyName;
  /** The fret a guitarist capos at for this song (unset or 0 for none): its chart shows the chord
   * shapes they play, that many semitones below the key. */
  capo?: number;
}

/** The highest capo a set offers. */
export const MAX_CAPO = 9;

/** A song as a set plays it: in the set's key, with its capo if it has one. */
export type SetSongDocument = SongDocument & { capo?: number };

/** A set's songs as they're shown and printed: with their capos for capo charts, or every song
 * at the key played (no capo) for standard charts. */
export function inChartMode<T extends SetSongDocument | null>(songs: T[], capoCharts: boolean): T[] {
  return capoCharts ? songs : songs.map((s) => (s?.capo ? { ...s, capo: 0 } : s));
}

/** A capo as stored, or 0 for none (or anything that isn't a usable fret). */
export function readCapo(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_CAPO ? value : 0;
}

/** A named, ordered list of the user's own songs, for a service or a rehearsal. */
export interface SongSet {
  id: string;
  name: string;
  entries: SetEntry[];
  /** Set while the set is shared by link (see shareSetUrl); null otherwise. */
  shareToken: string | null;
}

export interface SetSummary {
  id: string;
  name: string;
  songCount: number;
  shared: boolean;
  /** ISO timestamp of the last save. */
  updatedAt: string;
}

/** A set opened from its share link: its songs as they are now, each in the set's key. */
export interface SharedSet {
  name: string;
  songs: SetSongDocument[];
}

/** Where sets live; like SongStore, saves are last-write-wins. */
export interface SetStore {
  list(): Promise<SetSummary[]>;
  /** null when there's no such set (or it belongs to someone else). */
  get(id: string): Promise<SongSet | null>;
  /** Creates the set, or replaces it if one with this id exists. */
  save(set: SongSet): Promise<void>;
  delete(id: string): Promise<void>;
  /** null when no set is shared under this token (never shared, or sharing turned off). */
  getShared(token: string): Promise<SharedSet | null>;
}

const isKeyName = (value: unknown): value is KeyName => KEY_NAMES.includes(value as KeyName);

function readEntries(value: unknown): SetEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is SetEntry => typeof e === 'object' && e !== null && typeof e.songId === 'string' && isKeyName(e.key))
    .map(({ songId, key, capo }) => (readCapo(capo) ? { songId, key, capo: readCapo(capo) } : { songId, key }));
}

/** The `sets` table and `get_shared_set` function from supabase/migrations/0003_sets.sql. */
export function createSupabaseSetStore(client: SupabaseClient): SetStore {
  const sets = () => client.from('sets');

  return {
    async list() {
      const { data, error } = await sets().select('id, name, entries, share_token, updated_at').order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(
        (row): SetSummary => ({
          id: row.id as string,
          name: row.name as string,
          songCount: readEntries(row.entries).length,
          shared: row.share_token !== null,
          updatedAt: row.updated_at as string,
        }),
      );
    },

    async get(id) {
      const { data, error } = await sets().select('id, name, entries, share_token').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id as string,
        name: data.name as string,
        entries: readEntries(data.entries),
        shareToken: (data.share_token as string | null) ?? null,
      };
    },

    async save(set) {
      const { error } = await sets().upsert({
        id: set.id,
        name: set.name.trim(),
        entries: set.entries,
        share_token: set.shareToken,
      });
      if (error) throw error;
    },

    async delete(id) {
      const { error } = await sets().delete().eq('id', id);
      if (error) throw error;
    },

    async getShared(token) {
      const { data, error } = await client.rpc('get_shared_set', { token });
      if (error) throw error;
      if (!data) return null;
      const songs: SetSongDocument[] = [];
      for (const song of (data.songs ?? []) as { key: unknown; capo?: unknown; document: unknown }[]) {
        const result = upgradeSongDocument(song.document);
        // A song saved by a newer app version than this one is skipped rather than failing the set.
        if (result.ok) {
          songs.push({ ...result.doc, key: isKeyName(song.key) ? song.key : result.doc.key, capo: readCapo(song.capo) });
        }
      }
      return { name: data.name as string, songs };
    },
  };
}

/** The address that opens a shared set, on whichever site this is running on. */
export function shareSetUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/set/${token}`;
}
