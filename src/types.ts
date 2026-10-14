export type ScaleDegree = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A note relative to the song's key, e.g. { degree: 7, accidental: -1 } is the flat seven. */
export interface ScaleNote {
  degree: ScaleDegree;
  /** Sharps (positive) or flats (negative) applied to the degree. */
  accidental: number;
}

/**
 * A chord stored relative to the song's key (Nashville-number style), so changing the key
 * transposes it while keeping the spelling the user chose (E/G# stays E/G#, not E/Ab).
 */
export interface Chord {
  root: ScaleNote;
  /** Everything after the root, kept as typed: "", "m", "sus", "2", "m7", "maj7", "dim"... */
  suffix: string;
  /** Bass note for a slash chord. */
  bass?: ScaleNote;
}

export type KeyName =
  | 'C' | 'G' | 'D' | 'A' | 'E' | 'B' | 'F#'
  | 'Db' | 'Ab' | 'Eb' | 'Bb' | 'F';

/** 'instrumental' covers chord-only parts: intro, turn, midtro, tag, interlude, outro, ... */
export type SectionType = 'verse' | 'chorus' | 'bridge' | 'instrumental' | 'other';

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
  /** The chord placed on this syllable, or null for none. */
  chord: Chord | null;
  /** A bar line before this syllable's chord, as in "G C | Csus | C". */
  bar?: boolean;
  /** A chord slot with no lyric under it (text is ''), for instrumental chords: a turnaround
   * after a line's last word, or a whole chord-only line such as a turn or intro. */
  isChordSlot?: boolean;
  /** Set only on the flattened song (see deriveFlatSyllables): semitones above the song's key
   * that this syllable is played in, after any key changes before it. */
  keyShift?: number;
  /** Set only on the flattened song: this is the first syllable after a key change. */
  keyChange?: boolean;
  /** Set on the first syllable of a section occurrence to mark where a heading goes when rendered. */
  section?: SectionLabel;
  /** Which block this token canonically belongs to, and its index within that block's syllable list. */
  blockId: string;
  localIndex: number;
}

/**
 * A named piece of song content (a verse, the chorus, a bridge, ...) with its own lyrics
 * and chords. A block is the single source of truth for its content — it can appear
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

/**
 * A key change (modulation) in the arrangement: everything after it, up to the next one, is
 * played in a new key. Stored as semitones above the song's key rather than as a key name, so
 * transposing the song moves the key change along with it.
 */
export interface KeyChange {
  kind: 'keyChange';
  id: string;
  /** 0-11 semitones above the song's key. */
  semitones: number;
}

/** One entry in the song's arrangement: a block id (blocks may repeat) or a key change. */
export type ArrangementEntry = string | KeyChange;

/** Who wrote the song and who holds the copyright, printed in every chart page's footer. */
export interface SongCredits {
  /** Writers of the words — and of the music too, unless `separateMusic` is on. */
  wordsBy: string;
  /** Used only when `separateMusic` is on. */
  musicBy: string;
  separateMusic: boolean;
  /** As typed, e.g. "2025 This Group Inc."; a © is added when printed if it has none. */
  copyright: string;
}

export interface Song {
  title: string;
  key: KeyName;
  syllables: SyllableToken[];
  credits?: SongCredits;
}

export type Step = 'input' | 'edit-syllables' | 'chords' | 'export';
