import { useEffect, useState } from 'react';
import type { ThemeChoice } from '../lib/theme';
import { applyTheme, getThemeChoice, onSystemThemeChange, saveThemeChoice } from '../lib/theme';

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Light / dark / auto (the device's setting), remembered in this browser. */
export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice);

  // On auto, follow the device when it switches (at sunset, say) without a reload.
  useEffect(() => (choice === 'auto' ? onSystemThemeChange(() => applyTheme('auto')) : undefined), [choice]);

  return (
    <div className="theme-switch" role="radiogroup" aria-label="Color theme">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={choice === opt.value}
          className={choice === opt.value ? 'active' : undefined}
          onClick={() => {
            setChoice(opt.value);
            saveThemeChoice(opt.value);
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
