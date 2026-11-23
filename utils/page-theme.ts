/**
 * Works out whether the host page is light or dark, so the extension's own
 * UI and highlights match it instead of always being dark.
 *
 * Reads the page's real colours rather than the OS setting: Reddit can be
 * dark on a light-mode computer, and Hacker News is always light.
 */

export type PageTheme = 'light' | 'dark';

/** Parse "rgb(r, g, b)" / "rgba(r, g, b, a)" as returned by getComputedStyle */
function parseRgb(value: string): { r: number; g: number; b: number; a: number } | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}

/** Perceived brightness, 0 (black) to 1 (white) */
function brightness(c: { r: number; g: number; b: number }): number {
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
}

export function detectPageTheme(): PageTheme {
  // 1. An opaque page background settles it
  for (const element of [document.body, document.documentElement]) {
    if (!element) continue;
    const background = parseRgb(getComputedStyle(element).backgroundColor);
    if (background && background.a > 0.5) {
      return brightness(background) < 0.45 ? 'dark' : 'light';
    }
  }

  // 2. Background set on some inner wrapper: light text means a dark page
  if (document.body) {
    const text = parseRgb(getComputedStyle(document.body).color);
    if (text) return brightness(text) > 0.6 ? 'dark' : 'light';
  }

  // 3. Nothing to go on: follow the OS
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Call `onChange` with the current theme now and whenever the page switches
 * (theme toggles usually flip a class or attribute on <html> or <body>).
 * Returns a cleanup function.
 */
export function watchPageTheme(onChange: (theme: PageTheme) => void): () => void {
  let current: PageTheme | null = null;
  let frame = 0;

  const check = () => {
    frame = 0;
    const next = detectPageTheme();
    if (next !== current) {
      current = next;
      onChange(next);
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(check);
  };

  check();

  const observer = new MutationObserver(schedule);
  const watched = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'theme'] };
  observer.observe(document.documentElement, watched);
  if (document.body) observer.observe(document.body, watched);

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', schedule);

  return () => {
    observer.disconnect();
    media.removeEventListener('change', schedule);
    if (frame) cancelAnimationFrame(frame);
  };
}
