import type { Chord, KeyName, ScaleDegree, ScaleNote } from '../types';

export const KEY_NAMES: KeyName[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

// The same keys in pitch order, for stepping up or down a half step at a time.
const CHROMATIC_KEYS: KeyName[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** The key `semitones` half steps above (or, if negative, below) the given one. */
export function transposeKey(key: KeyName, semitones: number): KeyName {
  const i = CHROMATIC_KEYS.indexOf(key);
  return CHROMATIC_KEYS[(((i + semitones) % 12) + 12) % 12];
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
// Semitone steps of the major scale from the tonic — which is also the pitch of each natural
// letter above C, so this one table serves both purposes.
const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];

// Diatonic triad suffix per scale degree (1-indexed via degree - 1).
const DIATONIC_SUFFIX = ['', 'm', 'm', '', '', 'm', 'dim'];

const ALL_DEGREES: ScaleDegree[] = [1, 2, 3, 4, 5, 6, 7];

/** Maps any integer to -6..5, so a pitch difference reads as the smallest number of sharps/flats. */
function wrapSemitones(n: number): number {
  return ((((n + 6) % 12) + 12) % 12) - 6;
}

function parseNoteName(name: string): { letter: number; pitch: number } | null {
  const match = /^([A-Ga-g])([#b]*)$/.exec(name);
  if (!match) return null;
  const letter = LETTERS.indexOf(match[1].toUpperCase());
  const accidental = [...match[2]].reduce((sum, c) => sum + (c === '#' ? 1 : -1), 0);
  return { letter, pitch: MAJOR_SCALE_STEPS[letter] + accidental };
}

function tonicOf(key: KeyName) {
  return parseNoteName(key)!;
}

/** Spells a key-relative note as a letter name, e.g. degree 3 in D -> "F#", flat 7 in C -> "Bb". */
export function spellNote(key: KeyName, note: ScaleNote): string {
  const tonic = tonicOf(key);
  const letter = (tonic.letter + note.degree - 1) % 7;
  const pitch = tonic.pitch + MAJOR_SCALE_STEPS[note.degree - 1] + note.accidental;
  const offset = wrapSemitones(pitch - MAJOR_SCALE_STEPS[letter]);
  return LETTERS[letter] + (offset > 0 ? '#'.repeat(offset) : 'b'.repeat(-offset));
}

/** Inverse of `spellNote`: which scale degree (plus sharp/flat) a letter name is in the given key. */
function noteFromName(key: KeyName, name: string): ScaleNote | null {
  const parsed = parseNoteName(name);
  if (!parsed) return null;
  const tonic = tonicOf(key);
  const degree = (((parsed.letter - tonic.letter) % 7) + 7) % 7 + 1;
  const diatonicPitch = tonic.pitch + MAJOR_SCALE_STEPS[degree - 1];
  return { degree: degree as ScaleDegree, accidental: wrapSemitones(parsed.pitch - diatonicPitch) };
}

function noteFromNumber(accidental: string, degree: string): ScaleNote {
  return { degree: Number(degree) as ScaleDegree, accidental: accidental === '#' ? 1 : accidental === 'b' ? -1 : 0 };
}

/** The plain triad on a scale degree — what pressing 1-7 places (2, 3, 6 minor; 7 diminished). */
export function diatonicChord(degree: ScaleDegree): Chord {
  return { root: { degree, accidental: 0 }, suffix: DIATONIC_SUFFIX[degree - 1] };
}

export function formatChord(key: KeyName, chord: Chord): string {
  const bass = chord.bass ? `/${spellNote(key, chord.bass)}` : '';
  return spellNote(key, chord.root) + chord.suffix + bass;
}

/**
 * Reads a typed chord symbol, either as letters ("Asus", "D2", "F#m/C#") or as Nashville-style
 * numbers ("5sus", "1/3", "b7", "6m7"). A bare number with no suffix follows the 1-7 keys (so "6"
 * is the minor six); anything else is taken literally. Numbers are checked first, so "b7" means
 * the flat-seven chord rather than B7. Returns null if the text isn't a chord.
 */
export function parseChord(key: KeyName, text: string): Chord | null {
  const trimmed = text.trim().replace(/♯/g, '#').replace(/♭/g, 'b');

  const numeric = /^([#b]?)([1-7])([^/]*)(?:\/([#b]?)([1-7]))?$/.exec(trimmed);
  if (numeric) {
    const [, acc, degree, suffix, bassAcc, bassDegree] = numeric;
    const root = noteFromNumber(acc, degree);
    const chord: Chord =
      suffix === '' && root.accidental === 0 ? diatonicChord(root.degree) : { root, suffix };
    if (bassDegree) chord.bass = noteFromNumber(bassAcc, bassDegree);
    return chord;
  }

  const lettered = /^([A-Ga-g][#b]*)([^/]*)(?:\/([A-Ga-g][#b]*))?$/.exec(trimmed);
  if (!lettered) return null;
  const [, rootName, suffix, bassName] = lettered;
  const root = noteFromName(key, rootName);
  if (!root) return null;
  const chord: Chord = { root, suffix };
  if (bassName) {
    const bass = noteFromName(key, bassName);
    if (!bass) return null;
    chord.bass = bass;
  }
  return chord;
}

export function chordsEqual(a: Chord, b: Chord): boolean {
  const sameNote = (x?: ScaleNote, y?: ScaleNote) =>
    x === y || (!!x && !!y && x.degree === y.degree && x.accidental === y.accidental);
  return sameNote(a.root, b.root) && a.suffix === b.suffix && sameNote(a.bass, b.bass);
}

/** True if one of the 1-7 keys already produces this chord, so it doesn't need a palette slot. */
export function isDiatonicChord(chord: Chord): boolean {
  return ALL_DEGREES.some((d) => chordsEqual(chord, diatonicChord(d)));
}
