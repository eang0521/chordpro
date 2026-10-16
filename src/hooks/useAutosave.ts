import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'saving' | 'error';

/**
 * Saves `doc` (a song, or a set) a moment after it stops changing. The first version seen for
 * each id counts as already saved (it was just opened), so opening it doesn't write it straight back.
 * Saves run one at a time, in order, so a slow early save can't land after a later one.
 * Pass null while no library song is open.
 *
 * `save` must be stable across renders (e.g. a method of a module-level store).
 */
export function useAutosave<T extends { id: string }>(doc: T | null, save: (doc: T) => Promise<void>, delayMs = 1000) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  // JSON of the last version known to be saved, per song.
  const savedJson = useRef<{ id: string; json: string } | null>(null);
  const pending = useRef<T | null>(null);
  const currentId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());

  /** Saves any waiting change now. Resolves true once everything is saved, false if a save
   * failed (the change stays pending, so the next edit or flush retries it). */
  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next) {
      queue.current = queue.current.then(async () => {
        const json = JSON.stringify(next);
        try {
          await save(next);
          if (next.id === currentId.current) savedJson.current = { id: next.id, json };
          if (!pending.current) setStatus('saved');
        } catch {
          // Keep it for a retry, unless a newer edit (or another song) has taken its place.
          if (!pending.current && next.id === currentId.current) pending.current = next;
          setStatus('error');
        }
      });
    }
    return queue.current.then(() => pending.current === null);
  }, [save]);

  useEffect(() => {
    if (!doc || doc.id !== currentId.current) {
      // Leaving a song: get its last edit on its way before forgetting it. (Callers flush and
      // check the result first, so a failure here only happens if they chose to leave anyway.)
      if (pending.current) void flush();
      currentId.current = doc?.id ?? null;
      savedJson.current = doc ? { id: doc.id, json: JSON.stringify(doc) } : null;
      // A fresh song starts out saved, whatever happened to the last one.
      // oxlint-disable-next-line react/set-state-in-effect
      if (!pending.current) setStatus('saved');
      return;
    }
    if (JSON.stringify(doc) === savedJson.current?.json) {
      pending.current = null;
      clearTimeout(timer.current);
      return;
    }
    pending.current = doc;
    // Shows the pending write to an external system (the library) as it starts — the effect
    // that notices the change is the only place that knows a save is now due.
    // oxlint-disable-next-line react/set-state-in-effect
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delayMs);
  }, [doc, flush, delayMs]);

  // Closing the tab with an edit still unsaved would lose it, so ask first.
  useEffect(() => {
    if (status === 'saved') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { status, flush };
}
