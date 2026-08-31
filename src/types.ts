export type ScaleDegree = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type KeyName =
  | 'C' | 'G' | 'D' | 'A' | 'E' | 'B' | 'F#'
  | 'Db' | 'Ab' | 'Eb' | 'Bb' | 'F';

export type SectionType = 'verse' | 'chorus' | 'bridge' | 'other';

export interface SectionLabel {
  type: SectionType;
  /** Original heading text as written, e.g. "Verse 1", "BRIDGE", "Tag". */
  label: string;
}

export interface SyllableToken {
  id: string;
  text: string;
  isWordStart: boolean;
  isLineStart: boolean;
  /** Milliseconds from the start of the recording when this syllable was reached. Null until recorded. */
  offsetMs: number | null;
  /** Scale degrees held to produce the current chord, e.g. [1] or [1, 3]. Empty = no chord placed. */
  chordDegrees: ScaleDegree[];
  /** Set on the first syllable of a section occurrence to mark where a heading goes when rendered. */
  section?: SectionLabel;
  /** Which block this token canonically belongs to, and its index within that block's syllable list. */
  blockId: string;
  localIndex: number;
}

/**
 * A named piece of song content (a verse, the chorus, a bridge, ...) with its own lyrics,
 * timing, and chords. A block is the single source of truth for its content — it can appear
 * more than once in the song's arrangement, and every occurrence stays in sync since they all
 * read from (and write back to) the same block.
 */
export interface Block {
  id: string;
  type: SectionType;
  /** Display label, e.g. "Verse 1", "Chorus", "" for an unlabeled leading block. */
  label: string;
  syllables: SyllableToken[];
}

export interface Song {
  title: string;
  key: KeyName;
  syllables: SyllableToken[];
}

export type Step = 'input' | 'edit-syllables' | 'record' | 'playback' | 'export';
