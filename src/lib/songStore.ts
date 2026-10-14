import type { KeyName } from '../types';
import type { SongDocument } from './songDocument';

/** What the library list shows for a song, without downloading the whole thing. */
export interface SongSummary {
  id: string;
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
  list(): Promise<SongSummary[]>;
  /** null when there's no such song (or it belongs to someone else). */
  get(id: string): Promise<SongDocument | null>;
  /** Creates the song, or replaces it if one with this id exists. */
  save(doc: SongDocument): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Thrown by get() for a song saved by a newer version of the app than this one. */
export class NewerSongVersionError extends Error {
  constructor() {
    super('This song was saved by a newer version of ChordPro Tapper. Reload the page to get it.');
    this.name = 'NewerSongVersionError';
  }
}
