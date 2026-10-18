import type { KeyName } from '../types';
import type { SongDocument } from './songDocument';

/** What the library list shows for one version of a song, without downloading the whole thing. */
export interface SongSummary {
  id: string;
  /** The song it's a version of, shared by all its versions. */
  workId: string;
  versionName: string;
  title: string;
  /** The song's key, then each key it changes to, in order. */
  keys: KeyName[];
  /** ISO timestamp of the last save. */
  updatedAt: string;
}

/**
 * Where library songs live. The app only talks to this interface, so the backend (Supabase
 * today) can be swapped without touching the screens. Saves are last-write-wins.
 */
export interface SongStore {
  /** Every version of every song, one entry per version. */
  list(): Promise<SongSummary[]>;
  /** The user's own versions of one song. */
  listVersions(workId: string): Promise<SongSummary[]>;
  /** null when there's no such song (or it belongs to someone else). */
  get(id: string): Promise<SongDocument | null>;
  /** Creates the song, or replaces it if one with this id exists. */
  save(doc: SongDocument): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Thrown by get() for a song saved by a newer version of the app than this one. */
export class NewerSongVersionError extends Error {
  constructor() {
    super('This song was saved by a newer version of R4E ChordPro. Reload the page to get it.');
    this.name = 'NewerSongVersionError';
  }
}

/** A version's name as a suffix for lists that mix versions, e.g. " (Passion)", or ''. */
export function versionSuffix(song: { versionName: string }): string {
  const name = song.versionName.trim();
  return name ? ` (${name})` : '';
}
