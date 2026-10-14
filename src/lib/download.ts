export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The file name for an exported chart: "Song Name [Key]", with every key for a song that changes
 * key ("Psalm 150 (Praise the Lord) [D-E].pdf"). Drops the characters Windows and macOS don't
 * allow in file names.
 */
export function chartFilename(title: string, keys: string[], extension: string): string {
  const name = (title.trim() || 'Untitled').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled';
  return `${name} [${keys.join('-')}].${extension}`;
}
