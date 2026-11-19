import type { PaperSize, PrintOptions } from '../lib/pageLayout';

interface Props {
  value: PrintOptions;
  onChange: (value: PrintOptions) => void;
}

/** Full or half sheet, and on a half sheet whether only the first verse keeps its chords. */
export function PrintOptionsControls({ value, onChange }: Props) {
  return (
    <>
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
      {value.paper === 'half' && (
        <label className="chart-line-spacing chart-check" title="Later verses print just their lyrics, to save room">
          <input
            type="checkbox"
            checked={value.collapseVerseChords}
            onChange={(e) => onChange({ ...value, collapseVerseChords: e.target.checked })}
          />
          <span>Chords on first verse only</span>
        </label>
      )}
    </>
  );
}
