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

// Suffixes that keep their own syllables after a stem ending in a silent "e" (sure+ly, like+ness,
// hope+less+ly): the stem is split on its own, so its "e" stays silent instead of being read as a
// vowel ("su-re-ly"). Longest first, so "lessly" wins over "ly".
const SILENT_E_SUFFIXES: [suffix: string, syllables: string[]][] = [
  ['lessness', ['less', 'ness']],
  ['fulness', ['ful', 'ness']],
  ['lessly', ['less', 'ly']],
  ['liness', ['li', 'ness']],
  ['fully', ['ful', 'ly']],
  ['ments', ['ments']],
  ['ness', ['ness']],
  ['less', ['less']],
  ['ment', ['ment']],
  ['ful', ['ful']],
  ['ly', ['ly']],
];

// Words that look like stem + suffix above but aren't (el-e-ment, not "ele" + "ment").
const NOT_SILENT_E_STEMS = new Set(['element', 'elements']);

/** The stem + suffix split for a word like "surely" or "hopelessly", or null if it isn't one. */
function splitSilentESuffix(core: string): [stem: string, suffixSyllables: string[]] | null {
  const lower = core.toLowerCase();
  if (NOT_SILENT_E_STEMS.has(lower)) return null;
  for (const [suffix, syllables] of SILENT_E_SUFFIXES) {
    if (!lower.endsWith(suffix)) continue;
    const stem = core.slice(0, core.length - suffix.length);
    const s = stem.toLowerCase();
    // A real silent-e stem: at least 3 letters, ending consonant + "e" ("sure", "gentle"), with a
    // vowel earlier on to carry the syllable ("free"+"ly" and "re"+"ly" don't qualify).
    if (s.length < 3 || !s.endsWith('e') || 'aeiou'.includes(s[s.length - 2])) continue;
    if (!/[aeiouy]/.test(s.slice(0, -2))) continue;
    // Cut the suffix's own syllables out of the original text, keeping its capitalization.
    let at = stem.length;
    return [stem, syllables.map((syl) => core.slice(at, (at += syl.length)))];
  }
  return null;
}

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

  const silentESplit = splitSilentESuffix(core);
  if (silentESplit) return [...syllabifyCore(silentESplit[0]), ...silentESplit[1]];

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

  // "create"/"creation"/"creator"/"recreate"/"uncreated"/... have a genuine break between the
  // root's "e" and "a" (cre-ate) that the vowel scan can't see, since "ea" usually IS one vowel
  // sound (bread, eat, ahead). Two forms keep it merged instead: "creature(s)" — there "eat"+"ure"
  // is the "-ture" suffix (nature, picture, future) — and "create's" own silent-e-plus-s plural
  // ("creates" adds no syllable, same as "bikes"), where forcing the split would over-count.
  const creatMatch = /creat/i.exec(core);
  if (creatMatch) {
    const suffix = core.slice(creatMatch.index + 5).toLowerCase();
    const keepsMerged = suffix === 'ure' || suffix === 'ures' || suffix === 'es';
    if (!keepsMerged) {
      const eaStart = creatMatch.index + 2;
      const eaGroupIndex = groups.findIndex(([start, end]) => start === eaStart && end === eaStart + 1);
      if (eaGroupIndex !== -1) groups.splice(eaGroupIndex, 1, [eaStart, eaStart], [eaStart + 1, eaStart + 1]);
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
  } else if (
    last[0] === last[1] &&
    last[1] === n - 2 &&
    last[0] >= 1 &&
    letters[last[1]].toLowerCase() === 'e' &&
    letters[n - 1].toLowerCase() === 's'
  ) {
    // Likewise "-es" after a silent-e stem adds no syllable (likes, lives, times) except after a
    // hissing sound, where it does (places, roses, judges, boxes, churches, wishes).
    const stemFinal = letters[last[0] - 1].toLowerCase();
    const beforeFinal = last[0] >= 2 ? letters[last[0] - 2].toLowerCase() : '';
    const hissing = 'cgszx'.includes(stemFinal) || (stemFinal === 'h' && 'cs'.includes(beforeFinal));
    if (!hissing) groups.pop();
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
