import type { PaperSize, PrintOptions } from '../lib/pageLayout';

interface Props {
  value: PrintOptions;
  onChange: (value: PrintOptions) => void;
  /** Offers Fit to page (not for a set, where each song keeps its own setting). */
  showFit?: boolean;
  /** Offers double-sided printing on full sheets (for a set). */
  showDoubleSided?: boolean;
}

/** Full or half sheet, fitting to the page, and on a half sheet whether only the first verse keeps
 * its chords and whether two go on each landscape sheet. */
export function PrintOptionsControls({ value, onChange, showFit = true, showDoubleSided = false }: Props) {
  const check = (label: string, title: string, field: 'fitToPage' | 'collapseVerseChords' | 'twoUp' | 'doubleSided') => (
    <label className="chart-line-spacing chart-check" title={title}>
      <input type="checkbox" checked={value[field]} onChange={(e) => onChange({ ...value, [field]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
  return (
    <>
      {showFit && check('Fit to page', 'Pick the line spacing that fits the song on 1 page, or 2 if it must', 'fitToPage')}
      <select
        className="chart-font-select"
        aria-label="Paper size"
        title="The sheet the PDF prints on. A half sheet is the same chart, shrunk to fit."
        value={value.paper}
        onChange={(e) => onChange({ ...value, paper: e.target.value as PaperSize })}
      >
        <option value="letter">Full sheet (8.5 &times; 11)</option>
        <option value="half">Half sheet (5.5 &times; 8.5)</option>
      </select>
      {showDoubleSided &&
        value.paper === 'letter' &&
        check('Double-sided', 'Blank pages added so the printed set opens like a book, each song all in view', 'doubleSided')}
      {value.paper === 'half' && (
        <>
          {check('2 per page', 'Two half sheets side by side on each landscape letter page, to cut in half', 'twoUp')}
          {check('Chords on first verse only', 'Later verses print just their lyrics, to save room', 'collapseVerseChords')}
        </>
      )}
    </>
  );
}
