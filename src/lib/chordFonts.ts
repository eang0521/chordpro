import atkinsonRegular from '../assets/fonts/atkinson/AtkinsonHyperlegible-Regular.ttf?url';
import atkinsonBold from '../assets/fonts/atkinson/AtkinsonHyperlegible-Bold.ttf?url';
import atkinsonItalic from '../assets/fonts/atkinson/AtkinsonHyperlegible-Italic.ttf?url';
import atkinsonBoldItalic from '../assets/fonts/atkinson/AtkinsonHyperlegible-BoldItalic.ttf?url';

/** URLs of a bundled font's four TrueType files. */
export interface FontFiles {
  regular: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

export interface ChordFontOption {
  id: 'atkinson' | 'mono' | 'sans' | 'serif';
  label: string;
  /** Font stack for the on-screen preview — led by `wordFont` so the preview matches the doc. */
  cssFont: string;
  /** A single concrete font name Word understands, used both for the .docx text itself and
   * for measuring text width (via canvas) when computing tab-stop positions. */
  wordFont: string;
  /** Set for fonts the app ships itself (rather than relying on the computer having them):
   * these get embedded in the .docx and PDF so they print right anywhere. The preview loads
   * the same files through @font-face in index.css. */
  files?: FontFiles;
}

export const CHORD_FONT_OPTIONS: ChordFontOption[] = [
  {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible',
    cssFont: "'Atkinson Hyperlegible', Arial, sans-serif",
    wordFont: 'Atkinson Hyperlegible',
    files: { regular: atkinsonRegular, bold: atkinsonBold, italic: atkinsonItalic, boldItalic: atkinsonBoldItalic },
  },
  { id: 'sans', label: 'Arial', cssFont: 'Arial, Helvetica, sans-serif', wordFont: 'Arial' },
  { id: 'serif', label: 'Times New Roman', cssFont: "'Times New Roman', Times, serif", wordFont: 'Times New Roman' },
  { id: 'mono', label: 'Consolas', cssFont: "Consolas, 'Courier New', monospace", wordFont: 'Consolas' },
];

export const DEFAULT_CHORD_FONT_ID: ChordFontOption['id'] = 'atkinson';

export function getChordFontOption(id: string): ChordFontOption {
  return CHORD_FONT_OPTIONS.find((f) => f.id === id) ?? CHORD_FONT_OPTIONS[0];
}

/** Waits until every style of a bundled font is loaded, so canvas text measurement (which
 * silently falls back to another font until then) gives this font's real widths. */
export async function loadChordFont(option: ChordFontOption): Promise<void> {
  if (!option.files) return;
  await Promise.all(
    ['400 normal', '700 normal', '400 italic', '700 italic'].map((s) => {
      const [weight, style] = s.split(' ');
      return document.fonts.load(`${style} ${weight} 16px "${option.wordFont}"`);
    }),
  );
}

const fileCache = new Map<string, Promise<Uint8Array>>();

/** Fetches a bundled font file's bytes (once per file) for embedding in an export. */
export function fetchFontFile(url: string): Promise<Uint8Array> {
  let bytes = fileCache.get(url);
  if (!bytes) {
    bytes = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Couldn't load font file ${url}`);
        return r.arrayBuffer();
      })
      .then((b) => new Uint8Array(b));
    fileCache.set(url, bytes);
    bytes.catch(() => fileCache.delete(url));
  }
  return bytes;
}
