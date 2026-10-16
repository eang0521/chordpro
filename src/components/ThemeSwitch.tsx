import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ThemeChoice } from '../lib/theme';
import { applyTheme, getThemeChoice, onSystemThemeChange, saveThemeChoice } from '../lib/theme';

// Small line icons drawn in the text color: a half-filled circle for the device's setting, a
// sun for light, a moon for dark.
const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const OPTIONS: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  {
    value: 'auto',
    label: 'Match device',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
      </svg>
    ),
  },
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg {...iconProps}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
    ),
  },
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
          aria-label={opt.label}
          title={opt.label}
          className={choice === opt.value ? 'active' : undefined}
          onClick={() => {
            setChoice(opt.value);
            saveThemeChoice(opt.value);
          }}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
