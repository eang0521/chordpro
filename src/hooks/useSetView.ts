import { useState } from 'react';

export type SetView = 'charts' | 'lyrics';

const VIEW_KEY = 'chordpro.setView';

/** Charts or lyrics, as this viewer last chose (someone running slides keeps getting lyrics). */
export function useSetView(): [SetView, (view: SetView) => void] {
  const [view, setView] = useState<SetView>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'lyrics' ? 'lyrics' : 'charts';
    } catch {
      return 'charts';
    }
  });
  return [
    view,
    (next) => {
      setView(next);
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch {
        // Not remembered; it still switches.
      }
    },
  ];
}
