import { useEffect, useRef, useState } from 'react';
import type { KeyName, ScaleDegree, SyllableToken } from '../types';
import { resolveChordLabel } from '../lib/musicTheory';
import { useChordKeys } from '../hooks/useChordKeys';
import { LyricFlow } from './LyricFlow';

interface Props {
  syllables: SyllableToken[];
  songKey: KeyName;
  onUpdateToken: (blockId: string, localIndex: number, updater: (tok: SyllableToken) => SyllableToken) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function ChordTapper({ syllables, songKey, onUpdateToken, onBack, onSubmit }: Props) {
  const [index, setIndex] = useState(-1);
  const [warning, setWarning] = useState<string | null>(null);
  const warningTimerRef = useRef<number | null>(null);

  function flashWarning(message: string) {
    setWarning(message);
    if (warningTimerRef.current != null) window.clearTimeout(warningTimerRef.current);
    warningTimerRef.current = window.setTimeout(() => setWarning(null), 1500);
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

  function assignChord(degrees: ScaleDegree[]) {
    if (index < 0) return;
    const label = resolveChordLabel(songKey, degrees);
    if (!label) {
      flashWarning(`No chord defined for keys ${degrees.join(' + ')}`);
      return;
    }
    const syl = syllables[index];
    onUpdateToken(syl.blockId, syl.localIndex, (tok) => ({ ...tok, chordDegrees: degrees }));
    // Placing a chord doubles as "move on" — no separate Space needed.
    advance();
  }

  useChordKeys(assignChord, index >= 0);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        advance();
        return;
      }
      const isClearKey = e.code === 'Backspace' || e.code === 'Delete' || e.key === 'Backspace' || e.key === 'Delete';
      if (isClearKey && index >= 0) {
        e.preventDefault();
        const syl = syllables[index];
        onUpdateToken(syl.blockId, syl.localIndex, (tok) => ({ ...tok, chordDegrees: [] }));
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, syllables]);

  const finished = index >= syllables.length - 1 && syllables.length > 0;

  return (
    <div className="panel">
      <h2>3. Place chords</h2>
      <p className="hint">
        Press <kbd>Space</kbd> to move to the next syllable &mdash; skip any syllable that doesn't need a
        chord. While a syllable is highlighted, press <kbd>1</kbd>&ndash;<kbd>7</kbd> for a chord (2, 3, 6
        are minor, 7 is diminished); placing a chord moves on automatically. Hold <kbd>1</kbd>+<kbd>3</kbd>,{' '}
        <kbd>1</kbd>+<kbd>5</kbd>, <kbd>4</kbd>+<kbd>6</kbd>, <kbd>5</kbd>+<kbd>7</kbd>, or{' '}
        <kbd>5</kbd>+<kbd>2</kbd> together for a slash-chord inversion. <kbd>Backspace</kbd> clears the
        current syllable's chord. Click any syllable to jump to it.
      </p>
      <div className="recorder-status">
        {index === -1 && <span>Press Space to begin.</span>}
        {index >= 0 && (
          <span>
            Syllable {index + 1} / {syllables.length}
          </span>
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
