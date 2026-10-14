import type { ArrangementEntry, Chord, KeyName, SongCredits, Step } from '../types';
import type { Section, WordGroup } from './syllables';
import type { BlockMap } from './arrangement';
import { DEFAULT_CHORD_FONT_ID } from './chordFonts';
import { EMPTY_CREDITS } from './credits';

/** Bump this, and add a step to upgradeSongDocument, whenever the saved shape changes — songs
 * saved by older versions are migrated on load instead of being thrown away. */
export const SONG_SCHEMA_VERSION = 2;

/**
 * Everything needed to reopen a song exactly where it was left, in the format it is saved in
 * (the local draft and the cloud library both use it). Unlike a .cho export it keeps linked
 * repeated sections, key-change entries, the chord palette and the chart settings.
 */
export interface SongDocument {
  schemaVersion: typeof SONG_SCHEMA_VERSION;
  id: string;
  step: Step;
  title: string;
  key: KeyName;
  lyrics: string;
  wordGroups: WordGroup[];
  sections: Section[];
  blocks: BlockMap;
  arrangement: ArrangementEntry[];
  palette: Chord[];
  chartFontId: string;
  lineSpacing: number;
  /** Added in version 2. */
  credits: SongCredits;
}

export type UpgradeResult =
  | { ok: true; doc: SongDocument }
  /** 'newer': saved by a newer version of the app than this one, so opening (and then
   * autosaving) it here could silently drop whatever the newer version added. */
  | { ok: false; reason: 'invalid' | 'newer' };

/** A UUID, which the songs table uses as its primary key. crypto.randomUUID only exists on
 * https and localhost pages, so build one from random bytes anywhere else. */
export function newSongId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function emptySongDocument(id = newSongId()): SongDocument {
  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    id,
    step: 'input',
    title: '',
    key: 'C',
    lyrics: '',
    wordGroups: [],
    sections: [],
    blocks: {},
    arrangement: [],
    palette: [],
    chartFontId: DEFAULT_CHORD_FONT_ID,
    lineSpacing: 1,
    credits: EMPTY_CREDITS,
  };
}

/** Nothing typed yet — not worth saving, or offering to upload. */
export function isBlankSong(doc: SongDocument): boolean {
  return !doc.title.trim() && !doc.lyrics.trim() && doc.arrangement.length === 0;
}

const STEPS: Step[] = ['input', 'edit-syllables', 'chords', 'export'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCredits(raw: unknown): SongCredits {
  if (!isRecord(raw)) return EMPTY_CREDITS;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    wordsBy: text(raw.wordsBy),
    musicBy: text(raw.musicBy),
    separateMusic: raw.separateMusic === true,
    copyright: text(raw.copyright),
  };
}

/**
 * Turns anything previously saved into a current SongDocument, or says why it can't.
 * Version 0 is the single local draft from before the library existed ('chordpro-draft-v4'):
 * the same song fields with no id, no version and no chart settings. Version 2 added credits.
 */
export function upgradeSongDocument(raw: unknown): UpgradeResult {
  if (!isRecord(raw)) return { ok: false, reason: 'invalid' };
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version > SONG_SCHEMA_VERSION) return { ok: false, reason: 'newer' };
  // Without these there's no song to show; everything else has a sensible default.
  if (!isRecord(raw.blocks) || !Array.isArray(raw.arrangement)) return { ok: false, reason: 'invalid' };

  const base = emptySongDocument(typeof raw.id === 'string' && raw.id ? raw.id : undefined);
  const doc: SongDocument = {
    ...base,
    step: STEPS.includes(raw.step as Step) ? (raw.step as Step) : base.step,
    title: typeof raw.title === 'string' ? raw.title : base.title,
    key: typeof raw.key === 'string' ? (raw.key as KeyName) : base.key,
    lyrics: typeof raw.lyrics === 'string' ? raw.lyrics : base.lyrics,
    wordGroups: Array.isArray(raw.wordGroups) ? (raw.wordGroups as WordGroup[]) : base.wordGroups,
    sections: Array.isArray(raw.sections) ? (raw.sections as Section[]) : base.sections,
    blocks: raw.blocks as BlockMap,
    arrangement: raw.arrangement as ArrangementEntry[],
    palette: Array.isArray(raw.palette) ? (raw.palette as Chord[]) : base.palette,
    chartFontId: typeof raw.chartFontId === 'string' ? raw.chartFontId : base.chartFontId,
    lineSpacing: typeof raw.lineSpacing === 'number' && raw.lineSpacing > 0 ? raw.lineSpacing : base.lineSpacing,
    // Version 1 had no credits; they start blank.
    credits: readCredits(raw.credits),
  };
  // Future migrations go here, one `if (version < N)` step each, oldest first.
  return { ok: true, doc };
}
