import { syllabifyCore } from './syllabify';

/**
 * Words whose sung syllables usually differ from how they're spelled ("every" is sung eve-ry, not
 * ev-e-ry), plus any word the user has re-split themselves on the syllable step, which is
 * remembered for future songs. Both kinds are applied when lyrics are split, and highlighted on
 * the syllable step so they're easy to check against the melody — the same word can be sung
 * either way in different songs.
 */
const COMMON_SUNG_SYLLABLES: Record<string, string[]> = {
  every: ['eve', 'ry'],
  everything: ['eve', 'ry', 'thing'],
  everyone: ['eve', 'ry', 'one'],
  everybody: ['eve', 'ry', 'bod', 'y'],
  everywhere: ['eve', 'ry', 'where'],
  everyday: ['eve', 'ry', 'day'],
  evening: ['eve', 'ning'],
  // Each entry keeps every letter of the word: a dropped vowel goes with the syllable after it.
  different: ['dif', 'ferent'],
  difference: ['dif', 'ference'],
  several: ['sev', 'eral'],
  favorite: ['fav', 'orite'],
  interest: ['in', 'terest'],
  business: ['busi', 'ness'],
  family: ['fam', 'ily'],
  memory: ['mem', 'ory'],
  victory: ['vic', 'tory'],
  mystery: ['mys', 'tery'],
  finally: ['fi', 'nally'],
  deliverance: ['de', 'liv', 'erance'],
  // "-ering" words, often sung as two syllables (wan-d'ring) but sometimes three.
  wandering: ['wan', 'dering'],
  wondering: ['won', 'dering'],
  offering: ['of', 'fering'],
  offerings: ['of', 'ferings'],
  suffering: ['suf', 'fering'],
  gathering: ['gath', 'ering'],
  whispering: ['whis', 'pering'],
  wavering: ['wa', 'vering'],
  faltering: ['fal', 'tering'],
  shimmering: ['shim', 'mering'],
  glimmering: ['glim', 'mering'],
  hovering: ['hov', 'ering'],
  covering: ['cov', 'ering'],
  flickering: ['flick', 'ering'],
  thundering: ['thun', 'dering'],
  murmuring: ['mur', 'muring'],
  something: ['some', 'thing'],
  someone: ['some', 'one'],
  sometimes: ['some', 'times'],
  somewhere: ['some', 'where'],
  somehow: ['some', 'how'],
  power: ['pow', 'er'],
  israel: ['is', 'ra', 'el'],
  // Often sung as two syllables, sometimes one.
  lion: ['li', 'on'],
  lions: ['li', 'ons'],
};

const LEARNED_KEY = 'chordpro-syllable-overrides';

function loadLearned(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEARNED_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {}; // storage blocked or corrupt — fall back to the built-in list
  }
}

const learned = loadLearned();

/** The override for a word (letters only, any case), the user's own choice winning over the
 * built-in list, or null if it has none. */
export function syllableOverride(core: string): string[] | null {
  const key = core.toLowerCase();
  return learned[key] ?? COMMON_SUNG_SYLLABLES[key] ?? null;
}

/** Which list a word is on, for the syllable step's highlight: the user's own earlier edit, the
 * built-in list of commonly re-split words, or neither. */
export function overrideKind(core: string): 'learned' | 'common' | null {
  const key = core.toLowerCase();
  if (learned[key]) return 'learned';
  return COMMON_SUNG_SYLLABLES[key] ? 'common' : null;
}

/** How the word splits by spelling alone, ignoring both lists (shown as the alternative). */
export function spellingSplit(core: string): string[] {
  return syllabifyCore(core);
}

/** Strips a word's leading/trailing punctuation from its syllables, leaving just the letters. */
export function wordCore(syllables: string[]): { core: string; syllables: string[] } {
  const joined = syllables.join('');
  const lead = /^[^A-Za-z0-9]*/.exec(joined)![0].length;
  const trail = /[^A-Za-z0-9]*$/.exec(joined)![0].length;
  const trimmed = [...syllables];
  // Trim the punctuation off the outer syllables (never emptying the word).
  if (lead) trimmed[0] = trimmed[0].slice(lead);
  if (trail) trimmed[trimmed.length - 1] = trimmed[trimmed.length - 1].slice(0, -trail);
  const parts = trimmed.filter((s) => s.length > 0);
  return { core: parts.join(''), syllables: parts };
}

/**
 * Remembers how the user split words that differ from what the app would have done, so the next
 * song starts with their version. `before` and `after` are each word's syllables as the step
 * opened and as it was submitted, in the same order.
 */
export function rememberSyllableEdits(before: string[][], after: string[][]) {
  let changed = false;
  after.forEach((syllables, i) => {
    const was = before[i];
    if (!was || was.join('·') === syllables.join('·')) return;
    const { core, syllables: parts } = wordCore(syllables);
    if (!/^[A-Za-z']+$/.test(core) || parts.join('').toLowerCase() !== core.toLowerCase()) return;
    const lower = parts.map((p) => p.toLowerCase());
    const key = core.toLowerCase();
    // Back to the spelling split with no built-in entry: nothing worth remembering.
    if (!COMMON_SUNG_SYLLABLES[key] && lower.join('·') === spellingSplit(key).join('·')) {
      if (learned[key]) {
        delete learned[key];
        changed = true;
      }
      return;
    }
    learned[key] = lower;
    changed = true;
  });
  if (!changed) return;
  try {
    localStorage.setItem(LEARNED_KEY, JSON.stringify(learned));
  } catch {
    // Storage full or blocked: the edits still apply to this song, just aren't remembered.
  }
}

/** Applies a word's override to its letters, keeping the original capitalization ("Every" →
 * "Eve", "ry"), or returns null if it has none. */
export function applyOverride(core: string): string[] | null {
  const override = syllableOverride(core);
  if (!override || override.join('').toLowerCase() !== core.toLowerCase()) return null;
  let at = 0;
  return override.map((syl) => core.slice(at, (at += syl.length)));
}
