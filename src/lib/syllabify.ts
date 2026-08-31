/**
 * Heuristic English syllabifier based on vowel-group / consonant-cluster analysis, tuned
 * for splitting sung lyrics into syllables. Deliberately NOT based on print-hyphenation
 * dictionaries (e.g. TeX/Hypher patterns) — those are tuned for safe line-wrap points and
 * skip many real syllable breaks in short, common words ("mighty", "singing", "holy").
 *
 * Not phonetically perfect (English spelling doesn't allow that without a pronouncing
 * dictionary), but handles the common cases well; anything it gets wrong is a quick manual
 * "·" edit away in the syllable review step.
 */

// A legal way to START a syllable — the whole cluster moves to the NEXT syllable.
const ONSET_CLUSTERS = new Set([
  'bl', 'br', 'ch', 'cl', 'cr', 'dr', 'dw', 'fl', 'fr', 'gl', 'gr', 'ph', 'pl', 'pr',
  'qu', 'sc', 'sh', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'th', 'tr', 'tw', 'wh', 'wr',
  'sch', 'scr', 'shr', 'spl', 'spr', 'squ', 'str', 'thr',
]);

// Never a legal syllable onset in English — the whole cluster stays with the PREVIOUS syllable.
const CODA_ONLY_CLUSTERS = new Set(['ng', 'ck']);

// Common separable prefixes: the prefix boundary always wins over an onset-cluster heuristic
// that would otherwise bridge it (e.g. "up" + "hold" → the "p"+"h" isn't the digraph in
// "phone", so "upholding" must not become "u-phol-ding"). Excludes prefixes like "fore-" that
// have too many non-prefixed collisions (forest, foreign) to apply safely.
const SEPARABLE_PREFIXES = ['under', 'over', 'out', 'down', 'back', 'off', 'up'];

// A small closed set of words where "-ed" keeps its own syllable as an adjective (naked,
// wicked, ...) even though the general silent-"-ed" rule below would otherwise drop it —
// there's essentially no common verb reading of these to conflict with.
const RETAINS_ED_SYLLABLE = new Set([
  'naked', 'wicked', 'ragged', 'rugged', 'jagged', 'crooked', 'sacred', 'wretched', 'dogged',
]);

type Span = [start: number, end: number];

function splitCluster(cluster: string): [staysWithPrev: string, movesToNext: string] {
  if (cluster.length <= 1) return ['', cluster];
  const lower = cluster.toLowerCase();
  if (cluster.length === 2) {
    if (CODA_ONLY_CLUSTERS.has(lower)) return [cluster, ''];
    return ONSET_CLUSTERS.has(lower) ? ['', cluster] : [cluster.slice(0, 1), cluster.slice(1)];
  }
  const last3 = lower.slice(-3);
  const last2 = lower.slice(-2);
  if (ONSET_CLUSTERS.has(last3)) return [cluster.slice(0, -3), cluster.slice(-3)];
  if (ONSET_CLUSTERS.has(last2)) return [cluster.slice(0, -2), cluster.slice(-2)];
  return [cluster.slice(0, -1), cluster.slice(-1)];
}

function isVowelAt(letters: string[], i: number): boolean {
  const ch = letters[i].toLowerCase();
  if ('aeiou'.includes(ch)) return true;
  if (ch !== 'y') return false;
  // y is a vowel except word-initial ("yellow") or right after another vowel letter,
  // where it acts as a glide/consonant onset ("beyond"; "boy"/"day" stay 1 syllable anyway).
  if (i === 0) return false;
  return !'aeiou'.includes(letters[i - 1].toLowerCase());
}

/** Splits one alphabetic word (no punctuation) into syllables. */
export function syllabifyCore(core: string): string[] {
  const lower = core.toLowerCase();
  for (const prefix of SEPARABLE_PREFIXES) {
    if (lower.length <= prefix.length || !lower.startsWith(prefix)) continue;
    const remainder = core.slice(prefix.length);
    // Only split here if what's left can actually carry its own syllable (guards against
    // false positives — a word that merely starts with these letters but has no vowel left over).
    if (!/[aeiouy]/i.test(remainder)) continue;
    return [...syllabifyCore(core.slice(0, prefix.length)), ...syllabifyCore(remainder)];
  }

  const letters = core.split('');
  const n = letters.length;

  const groups: Span[] = [];
  let i = 0;
  while (i < n) {
    if (isVowelAt(letters, i)) {
      const start = i;
      while (i < n && isVowelAt(letters, i)) i++;
      groups.push([start, i - 1]);
    } else {
      i++;
    }
  }

  // "-ing" almost always forms its own syllable, even when the stem ends in a vowel letter
  // that would otherwise merge with the suffix's "i" into one run (cry+ing, go+ing, be+ing).
  if (core.length > 3 && core.slice(-3).toLowerCase() === 'ing') {
    const ingStart = core.length - 3;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0] < ingStart && lastGroup[1] >= ingStart) {
      groups[groups.length - 1] = [lastGroup[0], ingStart - 1];
      groups.push([ingStart, ingStart]);
    }
  }

  if (groups.length <= 1) return [core];

  // Silent trailing "e": drop it as its own syllable, unless it's a syllabic "-Cle" ending
  // (little, apple, candle), which the cluster-splitting below handles specially.
  let syllabicEIndex = -1;
  const last = groups[groups.length - 1];
  if (last[0] === last[1] && last[1] === n - 1 && letters[last[1]].toLowerCase() === 'e') {
    const isSyllabicLe = last[0] >= 2 && letters[last[0] - 1].toLowerCase() === 'l' && !isVowelAt(letters, last[0] - 2);
    if (!isSyllabicLe) groups.pop();
    else syllabicEIndex = groups.length - 1;
  } else if (
    last[0] === last[1] &&
    last[1] === n - 2 &&
    last[0] >= 1 &&
    letters[last[1]].toLowerCase() === 'e' &&
    letters[n - 1].toLowerCase() === 'd' &&
    !RETAINS_ED_SYLLABLE.has(core.toLowerCase())
  ) {
    // "-ed" is silent after most stems (filled, called, walked, loved) but forms its own
    // syllable when the stem ends in t/d (wanted, needed) — the double consonant sound
    // would otherwise be unpronounceable.
    const stemFinal = letters[last[0] - 1].toLowerCase();
    if (stemFinal !== 't' && stemFinal !== 'd') groups.pop();
  }

  if (groups.length <= 1) return [core];

  const syllables: string[] = [];
  let syllableStart = 0;
  for (let g = 1; g < groups.length; g++) {
    const clusterStart = groups[g - 1][1] + 1;
    const clusterEnd = groups[g][0] - 1;
    const cluster = letters.slice(clusterStart, clusterEnd + 1).join('');

    let staysWithPrev: string;
    if (g === syllabicEIndex && cluster.length >= 3) {
      staysWithPrev = cluster.slice(0, -2);
    } else {
      [staysWithPrev] = splitCluster(cluster);
    }

    const boundary = clusterStart + staysWithPrev.length;
    syllables.push(letters.slice(syllableStart, boundary).join(''));
    syllableStart = boundary;
  }
  syllables.push(letters.slice(syllableStart).join(''));

  return syllables;
}
