export interface ChordFontOption {
  id: 'mono' | 'sans' | 'serif';
  label: string;
  /** Font stack for the on-screen preview — led by `wordFont` so the preview matches the doc. */
  cssFont: string;
  /** A single concrete font name Word understands, used both for the .docx text itself and
   * for measuring text width (via canvas) when computing tab-stop positions. */
  wordFont: string;
}

export const CHORD_FONT_OPTIONS: ChordFontOption[] = [
  { id: 'sans', label: 'Arial', cssFont: 'Arial, Helvetica, sans-serif', wordFont: 'Arial' },
  { id: 'serif', label: 'Times New Roman', cssFont: "'Times New Roman', Times, serif", wordFont: 'Times New Roman' },
  { id: 'mono', label: 'Consolas', cssFont: "Consolas, 'Courier New', monospace", wordFont: 'Consolas' },
];

export const DEFAULT_CHORD_FONT_ID: ChordFontOption['id'] = 'sans';

export function getChordFontOption(id: string): ChordFontOption {
  return CHORD_FONT_OPTIONS.find((f) => f.id === id) ?? CHORD_FONT_OPTIONS[0];
}
