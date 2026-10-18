// The version of each song last opened in this browser, so a song reopens on it (from My Songs
// or Public songs) instead of on whichever version happens to come first. Just a convenience:
// losing it only means a song opens on its default version.
const KEY = 'r4e-last-version';

export interface VersionRef {
  kind: 'own' | 'public';
  id: string;
}

function load(): Record<string, VersionRef> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function lastVersion(workId: string): VersionRef | null {
  return load()[workId] ?? null;
}

export function rememberVersion(workId: string, version: VersionRef) {
  const all = load();
  all[workId] = version;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: songs just open on their default version.
  }
}
