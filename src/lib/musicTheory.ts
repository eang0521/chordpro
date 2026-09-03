import type { KeyName, ScaleDegree } from '../types';

const SHARP_CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_CHROMATIC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const KEY_INFO: Record<KeyName, { tonicIndex: number; useFlats: boolean }> = {
  C: { tonicIndex: 0, useFlats: false },
  G: { tonicIndex: 7, useFlats: false },
  D: { tonicIndex: 2, useFlats: false },
  A: { tonicIndex: 9, useFlats: false },
  E: { tonicIndex: 4, useFlats: false },
  B: { tonicIndex: 11, useFlats: false },
  'F#': { tonicIndex: 6, useFlats: false },
  Db: { tonicIndex: 1, useFlats: true },
  Ab: { tonicIndex: 8, useFlats: true },
  Eb: { tonicIndex: 3, useFlats: true },
  Bb: { tonicIndex: 10, useFlats: true },
  F: { tonicIndex: 5, useFlats: true },
};

export const KEY_NAMES: KeyName[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

// Semitone steps of the major scale from the tonic.
const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];

// Diatonic triad quality per scale degree (1-indexed via degree - 1).
const DEGREE_QUALITY: Array<'maj' | 'min' | 'dim'> = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];

/** The recognized simultaneous-keypress combos and how they map to a slash chord. */
const COMBO_MAP: Record<string, { primary: ScaleDegree; bass: ScaleDegree }> = {
  '1,3': { primary: 1, bass: 3 },
  '1,5': { primary: 1, bass: 5 },
  '4,6': { primary: 4, bass: 6 },
  '5,7': { primary: 5, bass: 7 },
  '2,5': { primary: 5, bass: 2 },
};

export function getDegreeNote(key: KeyName, degree: ScaleDegree): string {
  const info = KEY_INFO[key];
  const semitone = (info.tonicIndex + MAJOR_SCALE_STEPS[degree - 1]) % 12;
  const chromatic = info.useFlats ? FLAT_CHROMATIC : SHARP_CHROMATIC;
  return chromatic[semitone];
}

export function getDegreeQuality(degree: ScaleDegree): 'maj' | 'min' | 'dim' {
  return DEGREE_QUALITY[degree - 1];
}

export function getChordLabel(key: KeyName, degree: ScaleDegree): string {
  const note = getDegreeNote(key, degree);
  const quality = getDegreeQuality(degree);
  const suffix = quality === 'min' ? 'm' : quality === 'dim' ? 'dim' : '';
  return note + suffix;
}

/**
 * Resolves a set of simultaneously-held scale degrees to a chord label.
 * Single degree -> plain diatonic triad. Recognized pairs -> slash chord
 * (primary triad over the plain bass note of the second degree).
 * Returns null for unrecognized combinations.
 */
export function resolveChordLabel(key: KeyName, degrees: ScaleDegree[]): string | null {
  if (degrees.length === 0) return null;
  if (degrees.length === 1) return getChordLabel(key, degrees[0]);
  if (degrees.length === 2) {
    const sorted = [...degrees].sort((a, b) => a - b);
    const combo = COMBO_MAP[sorted.join(',')];
    if (!combo) return null;
    const primary = getChordLabel(key, combo.primary);
    const bass = getDegreeNote(key, combo.bass);
    return `${primary}/${bass}`;
  }
  return null;
}

const ALL_DEGREES: ScaleDegree[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * Inverse of `resolveChordLabel`: recovers the scale degree(s) a hand-typed chord symbol (e.g.
 * from an edited ChordPro export) represents in the given key. Only recognizes the exact plain
 * diatonic triads and slash-chord combos this app itself produces — any other chord spelling
 * (extensions, borrowed chords, a typo) returns null, since it has no scale-degree representation
 * in this app's model.
 */
export function parseChordLabel(key: KeyName, label: string): ScaleDegree[] | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const [primaryPart, bassPart] = trimmed.split('/');

  const primaryDegree = ALL_DEGREES.find((d) => getChordLabel(key, d) === primaryPart);
  if (primaryDegree === undefined) return null;
  if (bassPart === undefined) return [primaryDegree];

  const bassDegree = ALL_DEGREES.find((d) => getDegreeNote(key, d) === bassPart);
  if (bassDegree === undefined) return null;

  const degrees: ScaleDegree[] = [primaryDegree, bassDegree];
  // Round-trip through resolveChordLabel to confirm this is one of the recognized combos —
  // not every primary/bass pairing is a valid slash chord in this app's model.
  return resolveChordLabel(key, degrees) === trimmed ? degrees : null;
}
