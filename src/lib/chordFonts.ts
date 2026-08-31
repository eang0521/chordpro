export interface ChordFontOption {
  id: 'mono' | 'sans' | 'serif';
  label: string;
  /** Font stack for the on-screen preview. */
  cssFont: string;
  /** A single concrete font name Word understands, used both for the .docx text itself and
   * for measuring text width (via canvas) when computing tab-stop positions. */
  wordFont: string;
}

export const CHORD_FONT_OPTIONS: ChordFontOption[] = [
  { id: 'mono', label: 'Monospace', cssFont: "'Cascadia Code', Consolas, 'Courier New', monospace", wordFont: 'Consolas' },
  { id: 'sans', label: 'Sans-serif', cssFont: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif", wordFont: 'Calibri' },
  { id: 'serif', label: 'Serif', cssFont: "Georgia, 'Times New Roman', serif", wordFont: 'Times New Roman' },
];

export const DEFAULT_CHORD_FONT_ID: ChordFontOption['id'] = 'mono';

export function getChordFontOption(id: string): ChordFontOption {
  return CHORD_FONT_OPTIONS.find((f) => f.id === id) ?? CHORD_FONT_OPTIONS[0];
}
