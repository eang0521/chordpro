import { useEffect, useRef, useState } from 'react';
import type { Chord, KeyName, ScaleDegree, SyllableToken } from '../types';
import type { BlockMap } from '../lib/arrangement';
import { updateBlockToken } from '../lib/arrangement';
import { insertTokens, lineEnd, makeChordLine, makeChordSlot, removeToken } from '../lib/chordSlots';
import { chordsEqual, diatonicChord, formatChord, isDiatonicChord, parseChord, transposeKey } from '../lib/musicTheory';
import { LyricFlow } from './LyricFlow';

interface Props {
  syllables: SyllableToken[];
  songKey: KeyName;
  /** The song's extra (non 1-7) chords, each bound to one of PALETTE_KEYS by position. */
  palette: Chord[];
  onPaletteChange: (palette: Chord[]) => void;
  onUpdateBlocks: (updater: (prev: BlockMap) => BlockMap) => void;
  onBack: () => void;
  onSubmit: () => void;
}

/** A copied chord, kept with its bar line. */
interface ChordMark {
  chord: Chord | null;
  bar: boolean;
}

const DEGREES: ScaleDegree[] = [1, 2, 3, 4, 5, 6, 7];
const PALETTE_KEYS = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
const UNDO_LIMIT = 100;

/** Prefer `code` (layout-independent) but fall back to `key` since some input sources don't populate `code`. */
function resolveDegree(e: KeyboardEvent): ScaleDegree | null {
  const match = /^(?:Digit|Numpad)([1-7])$/.exec(e.code) ?? /^([1-7])$/.exec(e.key);
  return match ? (Number(match[1]) as ScaleDegree) : null;
}

function resolvePaletteSlot(e: KeyboardEvent): number {
  const letter = /^Key([A-Z])$/.exec(e.code)?.[1] ?? e.key.toUpperCase();
  return PALETTE_KEYS.indexOf(letter);
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function ChordTapper({
  syllables,
  songKey,
  palette,
  onPaletteChange,
  onUpdateBlocks,
  onBack,
  onSubmit,
}: Props) {
  // The cursor, plus the other end of the highlighted range (equal to it when nothing extra is
  // highlighted). Clamped in case an undo or a removed slot leaves them past the end.
  const [rawIndex, setIndex] = useState(-1);
  const [rawAnchor, setAnchor] = useState(-1);
  const index = Math.min(rawIndex, syllables.length - 1);
  const anchor = Math.min(rawAnchor, syllables.length - 1);
  const selStart = Math.min(index, anchor);
  const selEnd = Math.max(index, anchor);
  const selCount = index < 0 ? 0 : selEnd - selStart + 1;
  // The key at the cursor, after any key changes: chord buttons show, and typed chords are read,
  // in this key.
  const cursorKey = index >= 0 ? transposeKey(songKey, syllables[index]?.keyShift ?? 0) : songKey;

  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const [clipboard, setClipboard] = useState<ChordMark[] | null>(null);
  const undoRef = useRef<BlockMap[]>([]);
  const draggingRef = useRef(false);
  // Clicking and highlighting only scroll the lyrics when the cursor goes off-screen; tapping
  // through with the keyboard keeps the current line centered (see LyricFlow).
  const [scrollMode, setScrollMode] = useState<'center' | 'reveal'>('center');

  function flash(text: string, isError = false) {
    setMessage({ text, isError });
    if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current = window.setTimeout(() => setMessage(null), isError ? 2000 : 2500);
  }

  useEffect(
    () => () => {
      if (messageTimerRef.current != null) window.clearTimeout(messageTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const stopDragging = () => {
      draggingRef.current = false;
    };
    window.addEventListener('mouseup', stopDragging);
    return () => window.removeEventListener('mouseup', stopDragging);
  }, []);

  /** Moves the cursor; with `extend`, the highlighted range grows or shrinks to follow it. */
  function moveTo(i: number, extend = false) {
    const clamped = Math.max(0, Math.min(i, syllables.length - 1));
    setIndex(clamped);
    if (!extend || anchor < 0) setAnchor(clamped);
  }

  function advance() {
    moveTo(index + 1);
  }

  /** Every change on this screen goes through here, so Ctrl+Z can step back through them. */
  function edit(change: (prev: BlockMap) => BlockMap) {
    onUpdateBlocks((prev) => {
      const next = change(prev);
      // StrictMode runs updaters twice with the same `prev`, so only record it once.
      if (next !== prev && undoRef.current[undoRef.current.length - 1] !== prev) {
        undoRef.current.push(prev);
        if (undoRef.current.length > UNDO_LIMIT) undoRef.current.shift();
      }
      return next;
    });
  }

  function undo() {
    const prev = undoRef.current.pop();
    if (!prev) {
      flash('Nothing to undo');
      return;
    }
    onUpdateBlocks(() => prev);
  }

  /** Applies `update` to each syllable from `start` to `end` (flat indexes), as one undo step. */
  function updateRange(start: number, end: number, update: (tok: SyllableToken, offset: number) => SyllableToken) {
    edit((prev) => {
      let next = prev;
      for (let i = start; i <= end; i++) {
        const syl = syllables[i];
        if (syl) next = updateBlockToken(next, syl.blockId, syl.localIndex, (tok) => update(tok, i - start));
      }
      return next;
    });
  }

  // Placing a chord doubles as "move on" — no separate Space needed.
  function placeChord(chord: Chord, bar?: boolean) {
    if (index < 0) return;
    updateRange(index, index, (tok) => ({ ...tok, chord, bar: bar ?? tok.bar }));
    advance();
  }

  function copySelection(): ChordMark[] | null {
    if (selCount === 0) return null;
    const marks = syllables.slice(selStart, selEnd + 1).map((s) => ({ chord: s.chord, bar: !!s.bar }));
    setClipboard(marks);
    return marks;
  }

  function copy() {
    const marks = copySelection();
    if (marks) flash(`Copied ${pluralize(marks.filter((m) => m.chord).length, 'chord')} from ${pluralize(marks.length, 'syllable')}`);
  }

  function cut() {
    const marks = copySelection();
    if (!marks) return;
    updateRange(selStart, selEnd, (tok) => ({ ...tok, chord: null, bar: false }));
    flash(`Cut ${pluralize(marks.filter((m) => m.chord).length, 'chord')} from ${pluralize(marks.length, 'syllable')}`);
  }

  /** Lays the copied chords out from the start of the highlight, one per syllable, replacing
   * what's there (including clearing syllables that had no chord when copied). */
  function paste() {
    if (!clipboard) {
      flash('Highlight some syllables and press Ctrl+C or Ctrl+X first', true);
      return;
    }
    if (index < 0) return;
    const end = Math.min(selStart + clipboard.length, syllables.length) - 1;
    updateRange(selStart, end, (tok, offset) => ({ ...tok, chord: clipboard[offset].chord, bar: clipboard[offset].bar }));
    setAnchor(selStart);
    setIndex(end);
    const pasted = end - selStart + 1;
    const notes: string[] = [];
    if (pasted < clipboard.length) notes.push(`the last ${clipboard.length - pasted} ran past the end of the song`);
    else if (selCount > 1 && selCount !== clipboard.length) notes.push(`you highlighted ${selCount}`);
    flash(`Pasted onto ${pluralize(pasted, 'syllable')}${notes.length ? ` (${notes.join('; ')})` : ''}`);
  }

  /** Backspace/Delete: clears the highlighted chords; on a single empty chord slot, removes it. */
  function clear() {
    if (index < 0) return;
    const syl = syllables[index];
    if (selCount === 1 && syl.isChordSlot && !syl.chord) {
      const sectionHasMore = syllables.some((s) => s.blockId === syl.blockId && s.localIndex !== syl.localIndex);
      if (!sectionHasMore) {
        flash('A section needs at least one slot', true);
        return;
      }
      edit((prev) => removeToken(prev, syl.blockId, syl.localIndex));
      moveTo(index - 1);
      return;
    }
    updateRange(selStart, selEnd, (tok) => ({ ...tok, chord: null, bar: false }));
  }

  /** Adds an empty chord slot (a chord with no lyric under it) right after the cursor. */
  function addSlot() {
    if (index < 0) return;
    const syl = syllables[index];
    edit((prev) => insertTokens(prev, syl.blockId, syl.localIndex, [makeChordSlot(syl.blockId, false)]));
    moveTo(index + 1);
  }

  /** Adds an empty chord slot before the first syllable of the cursor's line, for a chord that
   * comes before the first word (a pickup or a turnaround leading in). */
  function addSlotAtLineStart() {
    if (index < 0) return;
    let start = index;
    while (start > 0 && !syllables[start].isLineStart) start--;
    const first = syllables[start];
    edit((prev) => {
      const withSlot = insertTokens(prev, first.blockId, first.localIndex - 1, [makeChordSlot(first.blockId, true)]);
      // The old first syllable no longer starts the line.
      return updateBlockToken(withSlot, first.blockId, first.localIndex + 1, (tok) => ({ ...tok, isLineStart: false }));
    });
    moveTo(start);
  }

  /** Adds a line of empty chord slots after the cursor's line. */
  function addChordLine() {
    if (index < 0) return;
    const syl = syllables[index];
    let rest = 1; // syllables from the cursor to the end of its line
    while (index + rest < syllables.length && !syllables[index + rest].isLineStart) rest++;
    edit((prev) => {
      const block = prev[syl.blockId];
      if (!block) return prev;
      return insertTokens(prev, syl.blockId, lineEnd(block, syl.localIndex) - 1, makeChordLine(syl.blockId));
    });
    moveTo(index + rest);
  }

  function toggleBar() {
    if (index < 0) return;
    const syl = syllables[index];
    if (!syl.chord) {
      flash('Bar lines go before a chord — place one here first', true);
      return;
    }
    updateRange(index, index, (tok) => ({ ...tok, bar: !tok.bar }));
  }

  function openTyping() {
    if (index < 0) return;
    setTyped('');
    setTyping(true);
  }

  function submitTyped() {
    if (!typed.trim()) {
      setTyping(false);
      return;
    }
    // A leading "|" puts a bar line before the chord, as in "| Csus".
    const bar = /^\s*\|/.test(typed);
    const text = typed.replace(/^\s*\|\s*/, '');
    const chord = parseChord(cursorKey, text);
    if (!chord) {
      flash(`Couldn't read "${typed}" as a chord`, true);
      return;
    }
    const alreadyBound = isDiatonicChord(chord) || palette.some((c) => chordsEqual(c, chord));
    if (!alreadyBound && palette.length < PALETTE_KEYS.length) onPaletteChange([...palette, chord]);
    setTyping(false);
    placeChord(chord, bar);
  }

  useEffect(() => {
    if (typing) return;
    function handleKey(e: KeyboardEvent) {
      // Leave keys alone while a dialog (arrange sections, copy chords, ...) is open over the
      // tapper, or while typing in a field such as the key picker.
      if (e.target instanceof Element && e.target.closest('.arrangement-overlay, input, select, textarea')) return;
      if (e.altKey) return;
      // Shift+arrows highlight like dragging, and copy/paste/undo work on a highlight: none of
      // these should yank the lyrics around. Every other key taps through the song.
      const highlighting = (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) || e.ctrlKey || e.metaKey;
      setScrollMode(highlighting ? 'reveal' : 'center');

      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        const action = { c: copy, x: cut, v: paste, z: undo }[key];
        if (!action || e.shiftKey) return;
        // Only take over copy/cut/paste once a syllable is selected, so they still work normally
        // anywhere else.
        if (key !== 'z' && index < 0) return;
        e.preventDefault();
        action();
        return;
      }

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        advance();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        moveTo((index < 0 ? -1 : index) + (e.key === 'ArrowRight' ? 1 : -1), e.shiftKey);
        return;
      }
      if (index < 0) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        openTyping();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        clear();
        return;
      }
      if (e.repeat) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        addSlot();
        return;
      }
      if (e.key === '[') {
        e.preventDefault();
        addSlotAtLineStart();
        return;
      }
      if (e.key === '|' || e.key === '\\') {
        e.preventDefault();
        toggleBar();
        return;
      }
      const degree = resolveDegree(e);
      if (degree != null) {
        e.preventDefault();
        placeChord(diatonicChord(degree));
        return;
      }
      const slot = resolvePaletteSlot(e);
      if (slot >= 0 && slot < palette.length) {
        e.preventDefault();
        placeChord(palette[slot]);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, anchor, syllables, palette, typing, cursorKey, clipboard]);

  const finished = index >= syllables.length - 1 && syllables.length > 0;

  return (
    <div className="panel">
      <h2>3. Place chords</h2>
      <p className="hint">
        Press <kbd>Space</kbd> (or <kbd>&rarr;</kbd>) to move to the next syllable &mdash; skip any syllable that
        doesn't need a chord. On a highlighted syllable, press <kbd>1</kbd>&ndash;<kbd>7</kbd> for a chord, or{' '}
        <kbd>Enter</kbd> to type any chord (<code>Asus</code>, <code>D2</code>, <code>F#m/C#</code>, or numbers
        like <code>5sus</code>, <code>1/3</code>). Typed chords get a letter key below so you can reuse them.
        Placing a chord moves on automatically. <kbd>Backspace</kbd> clears a chord.
      </p>
      <p className="hint">
        <strong>Instrumentals:</strong> <kbd>+</kbd> adds a chord slot (a chord with no lyric under it) after the
        current syllable &mdash; use it for chords at the end of a line &mdash; and <kbd>[</kbd> adds one at the
        start of the line, for a chord before the first word. <kbd>|</kbd> puts a bar line before the
        current chord. <kbd>Backspace</kbd> on an empty slot removes it.{' '}
        <strong>Copy and paste:</strong> drag across syllables (or <kbd>Shift</kbd>+click,{' '}
        <kbd>Shift</kbd>+<kbd>&larr;</kbd>/<kbd>&rarr;</kbd>) to highlight them, then <kbd>Ctrl</kbd>+<kbd>C</kbd>{' '}
        to copy their chords or <kbd>Ctrl</kbd>+<kbd>X</kbd> to cut them. Highlight where they should go and
        press <kbd>Ctrl</kbd>+<kbd>V</kbd>. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes.
      </p>
      <div className="chord-keys">
        {DEGREES.map((d) => (
          <ChordKey key={d} hotkey={String(d)} label={formatChord(cursorKey, diatonicChord(d))} onPlace={() => placeChord(diatonicChord(d))} disabled={index < 0} />
        ))}
        {palette.map((chord, i) => (
          <ChordKey
            key={`${i}-${formatChord(cursorKey, chord)}`}
            hotkey={PALETTE_KEYS[i]}
            label={formatChord(cursorKey, chord)}
            onPlace={() => placeChord(chord)}
            onRemove={() => onPaletteChange(palette.filter((_, j) => j !== i))}
            disabled={index < 0}
          />
        ))}
      </div>
      <div className="recorder-status">
        {index === -1 && <span>Press Space to begin.</span>}
        {index >= 0 && !typing && (
          <span>
            Syllable {index + 1} / {syllables.length}
            {cursorKey !== songKey && <> &middot; key of {cursorKey}</>}
            {selCount > 1 && <> &middot; {selCount} highlighted</>}
            {clipboard && <> &middot; {pluralize(clipboard.length, 'syllable')} of chords copied</>}
          </span>
        )}
        {index >= 0 && typing && (
          <form
            className="chord-entry"
            onSubmit={(e) => {
              e.preventDefault();
              submitTyped();
            }}
          >
            <label>
              Chord for {syllables[index].isChordSlot ? 'this slot' : <>&ldquo;{syllables[index].text}&rdquo;</>}:{' '}
              <input
                autoFocus
                value={typed}
                placeholder="e.g. Asus, F#m/C#, 5sus, | C"
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setTyping(false);
                }}
              />
            </label>
            <span className="chord-entry-help">Enter to place &middot; Esc to cancel</span>
          </form>
        )}
        {message && <span className={message.isError ? 'warning' : 'notice'}> &mdash; {message.text}</span>}
      </div>
      <div className="lyric-display">
        <LyricFlow
          syllables={syllables}
          currentIndex={index}
          selection={selCount > 1 ? [selStart, selEnd] : null}
          scrollMode={scrollMode}
          songKey={songKey}
          showChords
          onSyllableMouseDown={(i, e) => {
            e.preventDefault();
            draggingRef.current = true;
            setScrollMode('reveal');
            moveTo(i, e.shiftKey);
          }}
          onSyllableMouseEnter={(i) => {
            if (draggingRef.current) moveTo(i, true);
          }}
        />
      </div>
      <div className="actions">
        <button className="secondary" onClick={onBack}>
          &larr; Back
        </button>
        <button
          className="secondary"
          onClick={() => {
            setIndex(-1);
            setAnchor(-1);
          }}
        >
          Restart
        </button>
        <button className="secondary" onClick={openTyping} disabled={index < 0}>
          Type a chord&hellip;
        </button>
        <button className="secondary" onClick={addSlot} disabled={index < 0} title="Add a chord with no lyric under it after this syllable (+)">
          + Chord slot
        </button>
        <button
          className="secondary"
          onClick={addSlotAtLineStart}
          disabled={index < 0}
          title="Add a chord slot before this line's first word ([)"
        >
          + Slot at line start
        </button>
        <button className="secondary" onClick={addChordLine} disabled={index < 0} title="Add a line of chord slots after this line">
          + Chord line
        </button>
        <button onClick={advance} disabled={finished}>
          Next syllable &#9654;
        </button>
        {/* Always available, so a quick fix to one chord doesn't mean stepping through the rest. */}
        <button disabled={syllables.length === 0} onClick={onSubmit}>
          Continue to export &rarr;
        </button>
      </div>
    </div>
  );
}

interface ChordKeyProps {
  hotkey: string;
  label: string;
  onPlace: () => void;
  onRemove?: () => void;
  disabled: boolean;
}

function ChordKey({ hotkey, label, onPlace, onRemove, disabled }: ChordKeyProps) {
  return (
    <span className="chord-key">
      {/* Keep focus off the chip so a following Space advances instead of re-clicking it. */}
      <button className="secondary" onClick={onPlace} onMouseDown={(e) => e.preventDefault()} disabled={disabled}>
        <kbd>{hotkey}</kbd> {label}
      </button>
      {onRemove && (
        <button className="chord-key-remove" onClick={onRemove} aria-label={`Remove ${label}`}>
          &times;
        </button>
      )}
    </span>
  );
}
