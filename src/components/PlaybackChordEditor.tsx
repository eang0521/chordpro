import { useEffect, useRef, useState } from 'react';
import type { KeyName, ScaleDegree, SyllableToken } from '../types';
import { resolveChordLabel } from '../lib/musicTheory';
import { useChordKeys } from '../hooks/useChordKeys';
import { LyricFlow } from './LyricFlow';

interface Props {
  syllables: SyllableToken[];
  songKey: KeyName;
  onBack: () => void;
  onSubmit: (finished: SyllableToken[]) => void;
}

export function PlaybackChordEditor({ syllables, songKey, onBack, onSubmit }: Props) {
  const [current, setCurrent] = useState<SyllableToken[]>(syllables);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const warningTimerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleFrom(startIndex: number) {
    if (startIndex >= current.length) {
      setPlaying(false);
      return;
    }
    setIndex(startIndex);
    const next = startIndex + 1;
    if (next >= current.length) {
      setPlaying(false);
      return;
    }
    const delay = Math.max(0, (current[next].offsetMs ?? 0) - (current[startIndex].offsetMs ?? 0));
    timerRef.current = window.setTimeout(() => {
      scheduleFrom(next);
    }, delay);
  }

  function play() {
    if (playing || current.length === 0) return;
    setPlaying(true);
    scheduleFrom(index <= 0 ? 0 : index);
  }

  function pause() {
    clearTimer();
    setPlaying(false);
  }

  function restart() {
    clearTimer();
    setPlaying(false);
    setIndex(-1);
  }

  useEffect(() => () => clearTimer(), []);

  function flashWarning(message: string) {
    setWarning(message);
    if (warningTimerRef.current != null) window.clearTimeout(warningTimerRef.current);
    warningTimerRef.current = window.setTimeout(() => setWarning(null), 1500);
  }

  function assignChord(degrees: ScaleDegree[]) {
    if (index < 0) return;
    const label = resolveChordLabel(songKey, degrees);
    if (!label) {
      flashWarning(`No chord defined for keys ${degrees.join(' + ')}`);
      return;
    }
    setCurrent((prev) => prev.map((s, i) => (i === index ? { ...s, chordDegrees: degrees } : s)));
    // In manual (no-timing) mode, placing a chord doubles as "move on" — no separate Space needed.
    if (!hasTiming) manualAdvance();
  }

  useChordKeys(assignChord, index >= 0);

  useEffect(() => {
    function handleClear(e: KeyboardEvent) {
      const isClearKey = e.code === 'Backspace' || e.code === 'Delete' || e.key === 'Backspace' || e.key === 'Delete';
      if (isClearKey && index >= 0) {
        e.preventDefault();
        setCurrent((prev) => prev.map((s, i) => (i === index ? { ...s, chordDegrees: [] } : s)));
      }
    }
    window.addEventListener('keydown', handleClear);
    return () => window.removeEventListener('keydown', handleClear);
  }, [index]);

  function jumpTo(i: number) {
    if (playing) return;
    clearTimer();
    setIndex(i);
  }

  // If pace-recording was skipped, every syllable's offsetMs is still null — fall back to a
  // manual walkthrough (Space advances one syllable at a time) instead of timed playback.
  const hasTiming = current.length > 0 && current.every((s) => s.offsetMs !== null);

  function manualAdvance() {
    setIndex((i) => Math.min(i + 1, current.length - 1));
  }

  useEffect(() => {
    if (hasTiming) return;
    function handleSpace(e: KeyboardEvent) {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        manualAdvance();
      }
    }
    window.addEventListener('keydown', handleSpace);
    return () => window.removeEventListener('keydown', handleSpace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTiming, current.length]);

  const finished = index >= current.length - 1 && current.length > 0;

  return (
    <div className="panel">
      <h2>4. Place chords</h2>
      <p className="hint">
        {hasTiming ? (
          <>
            Press <kbd>Play</kbd> to step through the recorded pace.{' '}
          </>
        ) : (
          <>
            Pace recording was skipped, so press <kbd>Space</kbd> (or click the lyrics) to move to the
            next syllable &mdash; skip any syllable that doesn't need a chord. Placing a chord moves on
            automatically.{' '}
          </>
        )}
        While a syllable is highlighted, press <kbd>1</kbd>&ndash;<kbd>7</kbd> for a chord (2, 3, 6 are
        minor, 7 is diminished). Hold <kbd>1</kbd>+<kbd>3</kbd>, <kbd>1</kbd>+<kbd>5</kbd>,{' '}
        <kbd>4</kbd>+<kbd>6</kbd>, <kbd>5</kbd>+<kbd>7</kbd>, or <kbd>5</kbd>+<kbd>2</kbd> together for a
        slash-chord inversion. <kbd>Backspace</kbd> clears the current syllable's chord. Click any past
        syllable to jump back to it{hasTiming ? ' while paused' : ''}.
      </p>
      <div className="recorder-status">
        {index === -1 && <span>{hasTiming ? 'Press Play to begin.' : 'Press Space to begin.'}</span>}
        {index >= 0 && (
          <span>
            Syllable {index + 1} / {current.length}
            {hasTiming ? (playing ? ' (playing)' : ' (paused)') : ''}
          </span>
        )}
        {warning && <span className="warning"> &mdash; {warning}</span>}
      </div>
      <div className="lyric-display">
        <LyricFlow
          syllables={current}
          currentIndex={index}
          songKey={songKey}
          showChords
          onSyllableClick={playing ? undefined : jumpTo}
        />
      </div>
      <div className="actions">
        <button className="secondary" onClick={onBack}>
          &larr; Back
        </button>
        <button className="secondary" onClick={restart}>
          Restart
        </button>
        {hasTiming ? (
          !playing ? (
            <button onClick={play}>Play &#9654;</button>
          ) : (
            <button onClick={pause}>Pause &#10074;&#10074;</button>
          )
        ) : (
          <button onClick={manualAdvance} disabled={finished}>
            Next syllable &#9654;
          </button>
        )}
        <button disabled={!finished} onClick={() => onSubmit(current)}>
          Continue to export &rarr;
        </button>
      </div>
    </div>
  );
}
