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

// Words that start with one of those prefixes without being built on it (u-pon, not "up-on").
const NOT_PREFIXED = new Set(['upon']);

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
  ['some', ['some']],
  ['ful', ['ful']],
  ['ly', ['ly']],
];

// Words that look like stem + suffix above but aren't (el-e-ment, not "ele" + "ment").
const NOT_SILENT_E_STEMS = new Set(['element', 'elements']);

// The ones that also keep their own syllables after a consonant (kind+ness, care+less is above):
// without this, "righteousness" would read as "righ-teou-sness", the "sn" taken as an onset.
// "-ly" is left out, since after a consonant it's usually not a suffix at all (holy, family).
const CONSONANT_STEM_SUFFIXES = new Set(['lessness', 'fulness', 'lessly', 'fully', 'ments', 'ness', 'less', 'ment', 'some', 'ful']);

/** The stem + suffix split for a word like "surely", "hopelessly" or "kindness", or null if it
 * isn't one. */
function splitSilentESuffix(core: string): [stem: string, suffixSyllables: string[]] | null {
  const lower = core.toLowerCase();
  if (NOT_SILENT_E_STEMS.has(lower)) return null;
  for (const [suffix, syllables] of SILENT_E_SUFFIXES) {
    if (!lower.endsWith(suffix)) continue;
    const stem = core.slice(0, core.length - suffix.length);
    const s = stem.toLowerCase();
    // A stem ending in a consonant (kind+ness, faith+ful), with a vowel to carry its own syllable.
    // A double consonant is left to the regular rules: it splits there anyway (bless, wit-ness).
    const last = s[s.length - 1];
    if (CONSONANT_STEM_SUFFIXES.has(suffix) && s.length >= 3 && /[b-df-hj-np-tv-z]/.test(last ?? '') && /[aeiouy]/.test(s) && last !== suffix[0]) {
      let at = stem.length;
      return [stem, syllables.map((syl) => core.slice(at, (at += syl.length)))];
    }
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

/** A lone "w" between "o"/"e" and "e"/"i" belongs with the vowel before it, which it rounds off
 * (pow-er, flow-ing, view-er, new-ing). Not after a first-letter "e", where it starts the next
 * syllable of a prefixed word (be-wil-der, re-wind). */
function keepsGlideW(letters: string[], clusterStart: number, cluster: string): boolean {
  if (cluster.toLowerCase() !== 'w') return false;
  const before = letters[clusterStart - 1].toLowerCase();
  const after = letters[clusterStart + 1]?.toLowerCase() ?? '';
  if (!'ei'.includes(after) || !after) return false;
  return before === 'o' || (before === 'e' && clusterStart - 1 > 1);
}

// Contraction endings that never add a syllable: there's, we're, I've, we'll, he'd, I'm, and the
// old poetic o'er / e'er / ne'er.
const CONTRACTION_RE = /^(.*[a-z])('(?:s|re|ve|ll|d|m|er))$/i;
// "n't" is its own syllable after a consonant (did-n't, could-n't, is-n't), but joins the word
// after a vowel (don't, can't, won't) or "are"/"were" (aren't, weren't). Other silent-e stems
// keep the regular rules (hav-en't).
const NOT_RE = /^(.*[a-z])(n't)$/i;

/** Splits one alphabetic word (no punctuation) into syllables. */
export function syllabifyCore(core: string): string[] {
  // Split the word without its contraction ending, so a silent e stays silent ("there's", not
  // "the-re's"), then put the ending back.
  const notMatch = NOT_RE.exec(core);
  if (notMatch) {
    const [, stem, ending] = notMatch;
    if (/[b-df-hj-np-tv-z]$/i.test(stem) && /[aeiouy]/i.test(stem)) return [...syllabifyCore(stem), ending];
    if (/[aiouy]$/i.test(stem) || /^(?:a|we)re$/i.test(stem)) {
      const syllables = syllabifyCore(stem);
      syllables[syllables.length - 1] += ending;
      return syllables;
    }
  }
  const contraction = CONTRACTION_RE.exec(core);
  if (contraction) {
    const stem = syllabifyCore(contraction[1]);
    stem[stem.length - 1] += contraction[2];
    return stem;
  }

  const lower = core.toLowerCase();
  // "right" keeps its whole "ght" before "-eous" (right-eous, not "righ-teous").
  const ghteous = lower.indexOf('ghteous');
  if (ghteous > 0) return [...syllabifyCore(core.slice(0, ghteous + 3)), ...syllabifyCore(core.slice(ghteous + 3))];

  for (const prefix of NOT_PREFIXED.has(lower) ? [] : SEPARABLE_PREFIXES) {
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

  // "iu" is two vowel sounds, never one (tri-umph, sta-di-um, me-di-um), so it always splits.
  for (let g = 0; g < groups.length; g++) {
    const [start, end] = groups[g];
    for (let k = start; k < end; k++) {
      if (letters[k].toLowerCase() === 'i' && letters[k + 1].toLowerCase() === 'u') {
        groups.splice(g, 1, [start, k], [k + 1, end]);
        break;
      }
    }
  }

  // A final "-gue"/"-que" is silent after a vowel or "n" (league, vague, tongue, unique,
  // technique): its "ue" belongs to the syllable before. After another consonant it's sung
  // (ar-gue), so that stays as it is.
  const silentUe = /[aeiouyn][gq](ue)s?$/i.exec(core);
  if (silentUe) {
    const ueStart = silentUe.index + 2;
    const lastGroup = groups[groups.length - 1];
    if (groups.length > 1 && lastGroup[0] === ueStart && lastGroup[1] === ueStart + 1) groups.pop();
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
    } else if (keepsGlideW(letters, clusterStart, cluster)) {
      staysWithPrev = cluster;
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
