export type ScaleDegree = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type KeyName =
  | 'C' | 'G' | 'D' | 'A' | 'E' | 'B' | 'F#'
  | 'Db' | 'Ab' | 'Eb' | 'Bb' | 'F';

export interface SyllableToken {
  id: string;
  text: string;
  isWordStart: boolean;
  isLineStart: boolean;
  /** Milliseconds from the start of the recording when this syllable was reached. Null until recorded. */
  offsetMs: number | null;
  /** Scale degrees held to produce the current chord, e.g. [1] or [1, 3]. Empty = no chord placed. */
  chordDegrees: ScaleDegree[];
}

export interface Song {
  title: string;
  key: KeyName;
  syllables: SyllableToken[];
}

export type Step = 'input' | 'edit-syllables' | 'record' | 'playback' | 'export';
