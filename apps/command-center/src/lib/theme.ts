export type ThemeChoice = 'auto' | 'day' | 'night';

/** Puts the Appearance setting on <html>, where theme.css reads it. Auto follows the OS. */
export function applyTheme(choice: ThemeChoice) {
  if (choice === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}
