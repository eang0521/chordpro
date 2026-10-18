import type { SupabaseClient } from '@supabase/supabase-js';
import type { KeyName } from '../types';
import { songKeysOf } from './chordChart';
import { writersLine } from './credits';
import { newSongId, upgradeSongDocument, type SongDocument } from './songDocument';
import { NewerSongVersionError } from './songStore';

/** What the public list shows for a song. */
export interface PublicSongSummary {
  id: string;
  /** The song it's a version of, shared with every other version (public or private). */
  workId: string;
  versionName: string;
  title: string;
  keys: KeyName[];
  /** The "Words and music by ..." line, or ''. */
  writers: string;
  /** ISO timestamp of the latest publish. */
  updatedAt: string;
  /** ISO timestamp of the first publish. */
  publishedAt: string;
}

/** Where a library song's public snapshot is, and when it was last published. */
export interface PublishedCopy {
  id: string;
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
  /** Every public version of every song, one entry per version. */
  list(): Promise<PublicSongSummary[]>;
  /** The public versions of one song. */
  listVersions(workId: string): Promise<PublicSongSummary[]>;
  get(id: string): Promise<PublicSong | null>;
  /** Whether the signed-in user is on the publishers list. */
  isPublisher(): Promise<boolean>;
  /** The signed-in user's public copy of a library song, if they've published it. */
  findPublished(sourceSongId: string): Promise<PublishedCopy | null>;
  /** Every library song the signed-in user has published, by library song id. */
  listPublished(): Promise<Map<string, PublishedCopy>>;
  /** Publishes a library song, or updates its existing public copy. Returns the public id. */
  publish(doc: SongDocument): Promise<string>;
  unpublish(id: string): Promise<void>;
}

export function createSupabasePublicSongStore(client: SupabaseClient): PublicSongStore {
  const table = () => client.from('public_songs');

  async function findPublished(sourceSongId: string): Promise<PublishedCopy | null> {
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

  const SUMMARY = 'id, work_id, version_name, title, keys, writers, updated_at, published_at';
  const toSummary = (row: Record<string, unknown>): PublicSongSummary => ({
    id: row.id as string,
    workId: row.work_id as string,
    versionName: row.version_name as string,
    title: row.title as string,
    keys: (row.keys ?? []) as KeyName[],
    writers: row.writers as string,
    updatedAt: row.updated_at as string,
    publishedAt: row.published_at as string,
  });

  return {
    async list() {
      const { data, error } = await table().select(SUMMARY).order('title');
      if (error) throw error;
      return (data ?? []).map(toSummary);
    },

    async listVersions(workId) {
      // Oldest first, so the first version published is the one a song opens on by default.
      const { data, error } = await table().select(SUMMARY).eq('work_id', workId).order('published_at');
      if (error) throw error;
      return (data ?? []).map(toSummary);
    },

    async get(id) {
      const { data, error } = await table().select('document, publisher, work_id, version_name').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const result = upgradeSongDocument(data.document);
      if (!result.ok) {
        if (result.reason === 'newer') throw new NewerSongVersionError();
        throw new Error("This song's saved data couldn't be read.");
      }
      return {
        doc: { ...result.doc, id, workId: data.work_id as string, versionName: data.version_name as string },
        publisherId: (data.publisher as string | null) ?? null,
      };
    },

    async isPublisher() {
      const { data, error } = await client.rpc('is_publisher');
      if (error) throw error;
      return data === true;
    },

    findPublished,

    async listPublished() {
      const { data: auth } = await client.auth.getUser();
      const published = new Map<string, PublishedCopy>();
      if (!auth.user) return published;
      const { data, error } = await table()
        .select('id, source_song_id, updated_at')
        .eq('publisher', auth.user.id)
        .not('source_song_id', 'is', null);
      if (error) throw error;
      (data ?? []).forEach((row) =>
        published.set(row.source_song_id as string, { id: row.id as string, updatedAt: row.updated_at as string }),
      );
      return published;
    },

    async publish(doc) {
      const existing = await findPublished(doc.id);
      const id = existing?.id ?? newSongId();
      const { error } = await table().upsert({
        id,
        source_song_id: doc.id,
        work_id: doc.workId,
        version_name: doc.versionName.trim(),
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
