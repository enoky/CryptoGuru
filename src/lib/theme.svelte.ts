import { lsGet, lsSet } from './storage';

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'theme';
const media = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-color-scheme: dark)');

export const theme = $state({ choice: lsGet<ThemeChoice>(KEY, 'system'), systemDark: media?.matches ?? false });

export const isDark = () => (theme.choice === 'system' ? theme.systemDark : theme.choice === 'dark');

export function applyTheme() {
  const root = document.documentElement;
  if (theme.choice === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme.choice;
  document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', isDark() ? '#0b0f17' : '#f7f8fa');
}

export function startTheme() {
  applyTheme();
  media?.addEventListener('change', (e) => {
    theme.systemDark = e.matches;
    applyTheme();
  });
}

/** system → the opposite of the system theme → back to system */
export function cycleTheme() {
  theme.choice = theme.choice === 'system' ? (theme.systemDark ? 'light' : 'dark') : 'system';
  lsSet(KEY, theme.choice);
  applyTheme();
}
