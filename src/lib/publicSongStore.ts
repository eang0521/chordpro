import type { SupabaseClient } from '@supabase/supabase-js';
import type { KeyName } from '../types';
import { songKeysOf } from './chordChart';
import { writersLine } from './credits';
import { newSongId, upgradeSongDocument, type SongDocument } from './songDocument';
import { NewerSongVersionError } from './songStore';

/** What the public list shows for a song. */
export interface PublicSongSummary {
  id: string;
  title: string;
  keys: KeyName[];
  /** The "Words and music by ..." line, or ''. */
  writers: string;
  /** ISO timestamp of the latest publish. */
  updatedAt: string;
}

export interface PublicSong {
  doc: SongDocument;
  /** User id of whoever published it (null if that account was deleted). */
  publisherId: string | null;
}

/**
 * The public song database: readable by anyone, writable only by publishers (enforced by
 * row-level security in supabase/migrations/0002_public_songs.sql, not just by the UI).
 * Each public song is a snapshot of one of its publisher's library songs.
 */
export interface PublicSongStore {
  list(): Promise<PublicSongSummary[]>;
  get(id: string): Promise<PublicSong | null>;
  /** Whether the signed-in user is on the publishers list. */
  isPublisher(): Promise<boolean>;
  /** The signed-in user's public copy of a library song, if they've published it. */
  findPublished(sourceSongId: string): Promise<{ id: string; updatedAt: string } | null>;
  /** Publishes a library song, or updates its existing public copy. Returns the public id. */
  publish(doc: SongDocument): Promise<string>;
  unpublish(id: string): Promise<void>;
}

export function createSupabasePublicSongStore(client: SupabaseClient): PublicSongStore {
  const table = () => client.from('public_songs');

  async function findPublished(sourceSongId: string) {
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return null;
    const { data, error } = await table()
      .select('id, updated_at')
      .eq('source_song_id', sourceSongId)
      .eq('publisher', auth.user.id)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.id as string, updatedAt: data.updated_at as string } : null;
  }

  return {
    async list() {
      const { data, error } = await table().select('id, title, keys, writers, updated_at').order('title');
      if (error) throw error;
      return (data ?? []).map(
        (row): PublicSongSummary => ({
          id: row.id as string,
          title: row.title as string,
          keys: (row.keys ?? []) as KeyName[],
          writers: row.writers as string,
          updatedAt: row.updated_at as string,
        }),
      );
    },

    async get(id) {
      const { data, error } = await table().select('document, publisher').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const result = upgradeSongDocument(data.document);
      if (!result.ok) {
        if (result.reason === 'newer') throw new NewerSongVersionError();
        throw new Error("This song's saved data couldn't be read.");
      }
      return { doc: { ...result.doc, id }, publisherId: (data.publisher as string | null) ?? null };
    },

    async isPublisher() {
      const { data, error } = await client.rpc('is_publisher');
      if (error) throw error;
      return data === true;
    },

    findPublished,

    async publish(doc) {
      const existing = await findPublished(doc.id);
      const id = existing?.id ?? newSongId();
      const { error } = await table().upsert({
        id,
        source_song_id: doc.id,
        title: doc.title.trim(),
        keys: songKeysOf(doc.blocks, doc.arrangement, doc.key),
        writers: writersLine(doc.credits),
        // Opens on the finished chart, whatever step the publisher was on.
        document: { ...doc, id, step: 'export' },
      });
      if (error) throw error;
      return id;
    },

    async unpublish(id) {
      const { error } = await table().delete().eq('id', id);
      if (error) throw error;
    },
  };
}
