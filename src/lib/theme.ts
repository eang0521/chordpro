/** Light, dark, or whatever the device is set to. */
export type ThemeChoice = 'auto' | 'light' | 'dark';

// index.html reads the same key before the page first draws, so it never flashes the wrong theme.
const STORAGE_KEY = 'r4e-theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export function getThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage blocked (a private window, say): fall back to the device setting.
  }
  return 'auto';
}

/** Shows the chosen theme by setting <html data-theme>, which the colors in index.css key off. */
export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === 'dark' || (choice === 'auto' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Not remembered, but it still applies for this visit.
  }
  applyTheme(choice);
}

/** Calls back when the device switches between light and dark (what "auto" follows). */
export function onSystemThemeChange(callback: () => void): () => void {
  darkQuery.addEventListener('change', callback);
  return () => darkQuery.removeEventListener('change', callback);
}
