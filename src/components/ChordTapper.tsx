import { useEffect, useRef, useState } from 'react';
import type { Chord, KeyName, ScaleDegree, SyllableToken } from '../types';
import { chordsEqual, diatonicChord, formatChord, isDiatonicChord, parseChord } from '../lib/musicTheory';
import { LyricFlow } from './LyricFlow';

interface Props {
  syllables: SyllableToken[];
  songKey: KeyName;
  /** The song's extra (non 1-7) chords, each bound to one of PALETTE_KEYS by position. */
  palette: Chord[];
  onPaletteChange: (palette: Chord[]) => void;
  onUpdateToken: (blockId: string, localIndex: number, updater: (tok: SyllableToken) => SyllableToken) => void;
  onBack: () => void;
  onSubmit: () => void;
}

const DEGREES: ScaleDegree[] = [1, 2, 3, 4, 5, 6, 7];
const PALETTE_KEYS = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];

/** Prefer `code` (layout-independent) but fall back to `key` since some input sources don't populate `code`. */
function resolveDegree(e: KeyboardEvent): ScaleDegree | null {
  const match = /^(?:Digit|Numpad)([1-7])$/.exec(e.code) ?? /^([1-7])$/.exec(e.key);
  return match ? (Number(match[1]) as ScaleDegree) : null;
}

function resolvePaletteSlot(e: KeyboardEvent): number {
  const letter = /^Key([A-Z])$/.exec(e.code)?.[1] ?? e.key.toUpperCase();
  return PALETTE_KEYS.indexOf(letter);
}

export function ChordTapper({
  syllables,
  songKey,
  palette,
  onPaletteChange,
  onUpdateToken,
  onBack,
  onSubmit,
}: Props) {
  const [index, setIndex] = useState(-1);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const warningTimerRef = useRef<number | null>(null);

  function flashWarning(message: string) {
    setWarning(message);
    if (warningTimerRef.current != null) window.clearTimeout(warningTimerRef.current);
    warningTimerRef.current = window.setTimeout(() => setWarning(null), 2000);
  }

  useEffect(
    () => () => {
      if (warningTimerRef.current != null) window.clearTimeout(warningTimerRef.current);
    },
    [],
  );

  function advance() {
    setIndex((i) => Math.min(i + 1, syllables.length - 1));
  }

  function setChord(chord: Chord | null) {
    if (index < 0) return;
    const syl = syllables[index];
    onUpdateToken(syl.blockId, syl.localIndex, (tok) => ({ ...tok, chord }));
  }

  // Placing a chord doubles as "move on" — no separate Space needed.
  function placeChord(chord: Chord) {
    if (index < 0) return;
    setChord(chord);
    advance();
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
    const chord = parseChord(songKey, typed);
    if (!chord) {
      flashWarning(`Couldn't read "${typed}" as a chord`);
      return;
    }
    const alreadyBound = isDiatonicChord(chord) || palette.some((c) => chordsEqual(c, chord));
    if (!alreadyBound && palette.length < PALETTE_KEYS.length) onPaletteChange([...palette, chord]);
    setTyping(false);
    placeChord(chord);
  }

  useEffect(() => {
    if (typing) return;
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Leave keys alone while a dialog (arrange sections, copy chords, ...) is open over the tapper.
      if (e.target instanceof Element && e.target.closest('.arrangement-overlay')) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        advance();
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
        setChord(null);
        return;
      }
      if (e.repeat) return;
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
  }, [index, syllables, palette, typing, songKey]);

  const finished = index >= syllables.length - 1 && syllables.length > 0;

  return (
    <div className="panel">
      <h2>3. Place chords</h2>
      <p className="hint">
        Press <kbd>Space</kbd> to move to the next syllable &mdash; skip any syllable that doesn't need a
        chord. On a highlighted syllable, press <kbd>1</kbd>&ndash;<kbd>7</kbd> for a chord, or{' '}
        <kbd>Enter</kbd> to type any chord (<code>Asus</code>, <code>D2</code>, <code>F#m/C#</code>, or
        numbers like <code>5sus</code>, <code>1/3</code>). Typed chords get a letter key below so you can reuse
        them. Placing a chord moves on automatically. <kbd>Backspace</kbd> clears the current syllable's
        chord. Click any syllable to jump to it.
      </p>
      <div className="chord-keys">
        {DEGREES.map((d) => (
          <ChordKey key={d} hotkey={String(d)} label={formatChord(songKey, diatonicChord(d))} onPlace={() => placeChord(diatonicChord(d))} disabled={index < 0} />
        ))}
        {palette.map((chord, i) => (
          <ChordKey
            key={`${i}-${formatChord(songKey, chord)}`}
            hotkey={PALETTE_KEYS[i]}
            label={formatChord(songKey, chord)}
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
              Chord for &ldquo;{syllables[index].text}&rdquo;:{' '}
              <input
                autoFocus
                value={typed}
                placeholder="e.g. Asus, F#m/C#, 5sus"
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setTyping(false);
                }}
              />
            </label>
            <span className="chord-entry-help">Enter to place &middot; Esc to cancel</span>
          </form>
        )}
        {warning && <span className="warning"> &mdash; {warning}</span>}
      </div>
      <div className="lyric-display">
        <LyricFlow syllables={syllables} currentIndex={index} songKey={songKey} showChords onSyllableClick={setIndex} />
      </div>
      <div className="actions">
        <button className="secondary" onClick={onBack}>
          &larr; Back
        </button>
        <button className="secondary" onClick={() => setIndex(-1)}>
          Restart
        </button>
        <button className="secondary" onClick={openTyping} disabled={index < 0}>
          Type a chord&hellip;
        </button>
        <button onClick={advance} disabled={finished}>
          Next syllable &#9654;
        </button>
        <button disabled={!finished} onClick={onSubmit}>
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
