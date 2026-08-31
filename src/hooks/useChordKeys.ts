import { useEffect, useRef } from 'react';
import type { ScaleDegree } from '../types';

const DIGIT_CODES: Record<string, ScaleDegree> = {
  Digit1: 1,
  Digit2: 2,
  Digit3: 3,
  Digit4: 4,
  Digit5: 5,
  Digit6: 6,
  Digit7: 7,
  Numpad1: 1,
  Numpad2: 2,
  Numpad3: 3,
  Numpad4: 4,
  Numpad5: 5,
  Numpad6: 6,
  Numpad7: 7,
};

const DIGIT_KEYS: Record<string, ScaleDegree> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
};

/** Prefer `code` (layout-independent) but fall back to `key` since some input sources don't populate `code`. */
function resolveDegree(e: KeyboardEvent): ScaleDegree | null {
  return DIGIT_CODES[e.code] ?? DIGIT_KEYS[e.key] ?? null;
}

const COMBO_WINDOW_MS = 90;

/**
 * Listens for 1-7 keypresses and reports either a single degree or a combo of degrees
 * pressed within a short window of each other (used for slash-chord inversions).
 *
 * Deliberately keyed off keydown timing rather than "currently held" state: a real quick
 * tap (or a synthetic one) can release before a held-state check would fire, which would
 * silently drop ordinary single-chord presses.
 */
export function useChordKeys(onDegrees: (degrees: ScaleDegree[]) => void, enabled: boolean) {
  const bufferRef = useRef<ScaleDegree[]>([]);
  const timerRef = useRef<number | null>(null);
  const onDegreesRef = useRef(onDegrees);

  useEffect(() => {
    onDegreesRef.current = onDegrees;
  }, [onDegrees]);

  useEffect(() => {
    if (!enabled) return;

    function flush() {
      if (bufferRef.current.length > 0) {
        onDegreesRef.current(bufferRef.current);
      }
      bufferRef.current = [];
      timerRef.current = null;
    }

    function handleKeyDown(e: KeyboardEvent) {
      const degree = resolveDegree(e);
      if (degree == null) return;
      e.preventDefault();
      if (e.repeat) return;
      if (!bufferRef.current.includes(degree)) {
        bufferRef.current.push(degree);
      }
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, COMBO_WINDOW_MS);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      bufferRef.current = [];
    };
  }, [enabled]);
}
