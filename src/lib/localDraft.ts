import { upgradeSongDocument, type SongDocument } from './songDocument';

// The one song kept in this browser while signed out. The pre-library draft used
// 'chordpro-draft-v4', which loadLocalDraft still reads (and upgrades) once.
const STORAGE_KEY = 'chordpro-draft-v5';
const LEGACY_KEY = 'chordpro-draft-v4';
const DRAFT_KEY_PREFIX = 'chordpro-draft-';
// The local draft the user already uploaded or said "not now" to, so signing in again
// doesn't keep asking about the same song.
// Deliberately not under DRAFT_KEY_PREFIX, which removeOldDrafts sweeps.
const UPLOAD_OFFERED_KEY = 'chordpro-upload-offered';

export function loadLocalDraft(): SongDocument | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const result = upgradeSongDocument(JSON.parse(raw));
    return result.ok ? result.doc : null;
  } catch {
    return null;
  }
}

/** Drafts saved by older versions of the app are never read again once the current one exists,
 * so drop them — storage is capped at ~5MB per site. Call after loadLocalDraft
 * has had its chance to upgrade. */
export function removeOldDrafts() {
  try {
    if (localStorage.getItem(STORAGE_KEY) === null) return;
    Object.keys(localStorage)
      .filter((k) => k.startsWith(DRAFT_KEY_PREFIX) && k !== STORAGE_KEY)
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // Storage unavailable (e.g. blocked in a private window) — nothing to clean up.
  }
}

/** Returns false instead of throwing when storage is full or unavailable, so a failed autosave
 * never takes the whole app down. */
export function saveLocalDraft(doc: SongDocument): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage unavailable — there's no saved draft to clear.
  }
}

export function wasUploadOffered(draftId: string): boolean {
  try {
    return localStorage.getItem(UPLOAD_OFFERED_KEY) === draftId;
  } catch {
    return false;
  }
}

export function markUploadOffered(draftId: string) {
  try {
    localStorage.setItem(UPLOAD_OFFERED_KEY, draftId);
  } catch {
    // Storage unavailable — at worst the offer shows again next sign-in.
  }
}
