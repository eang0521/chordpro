import { useEffect, useRef } from 'react';

/**
 * Calls `onEscape` when Escape is pressed, for closing a dialog the way clicking outside it does.
 * Pass null while the dialog isn't open.
 */
export function useEscapeKey(onEscape: (() => void) | null) {
  // The latest handler, so an inline arrow doesn't re-add the listener on every render.
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  });

  const active = onEscape !== null;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      handler.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
