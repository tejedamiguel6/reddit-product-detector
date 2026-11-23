/**
 * Styles for highlighted product names. These are injected into the host
 * page, because the highlights live inside the page's own comments, and are
 * reused by the welcome page demo.
 *
 * A highlight is an underline, not a block of colour, so a thread stays
 * readable. The line carries the commenter's sentiment in both colour and
 * shape (so it does not depend on telling red from green):
 *   solid green  = recommended
 *   dashed red   = warned against
 *   dotted grey  = just mentioned
 * New highlights arrive with a soft glow that fades out.
 */

import type { PageTheme } from './page-theme';

/** "r, g, b" triplets per theme, tuned for contrast on that background */
const COLORS: Record<PageTheme, { neutral: string; positive: string; negative: string }> = {
  light: { neutral: '104, 114, 135', positive: '22, 135, 84', negative: '204, 56, 47' },
  dark: { neutral: '150, 161, 184', positive: '62, 207, 142', negative: '240, 98, 90' },
};

function colorRules(theme: PageTheme): string {
  const c = COLORS[theme];
  return `
.pd-highlight { --pd-hl: ${c.neutral}; }
.pd-highlight.pd-positive { --pd-hl: ${c.positive}; }
.pd-highlight.pd-negative { --pd-hl: ${c.negative}; }
`;
}

const BASE_RULES = `
.pd-highlight {
  text-decoration-line: underline !important;
  text-decoration-style: dotted !important;
  text-decoration-color: rgb(var(--pd-hl)) !important;
  text-decoration-thickness: 2px !important;
  text-underline-offset: 3px !important;
  cursor: pointer !important;
  border-radius: 3px;
  background-color: rgba(var(--pd-hl), 0);
  transition: background-color 0.15s ease;
  animation: pd-arrive 1s ease-out;
}
.pd-highlight.pd-positive { text-decoration-style: solid !important; }
.pd-highlight.pd-negative { text-decoration-style: dashed !important; }
.pd-highlight:hover { background-color: rgba(var(--pd-hl), 0.18) !important; }
@keyframes pd-arrive {
  from { background-color: rgba(var(--pd-hl), 0.34); }
  to { background-color: rgba(var(--pd-hl), 0); }
}
.pd-flash {
  animation: pd-flash 1.8s ease-out !important;
  border-radius: 6px;
}
@keyframes pd-flash {
  0%, 35% { box-shadow: 0 0 0 6px rgba(62, 207, 142, 0.28); background-color: rgba(62, 207, 142, 0.12); }
  100% { box-shadow: 0 0 0 6px rgba(62, 207, 142, 0); background-color: transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .pd-highlight { animation: none; transition: none; }
  .pd-flash { animation-duration: 0.01s !important; }
}
`;

function highlightCss(theme: PageTheme): string {
  return colorRules(theme) + BASE_RULES;
}

/** Self-theming version for extension pages: follows the OS light/dark setting */
export const HIGHLIGHT_CSS =
  highlightCss('light') + `@media (prefers-color-scheme: dark) {${colorRules('dark')}}`;

let styleElement: HTMLStyleElement | null = null;
let currentTheme: PageTheme = 'light';

/** Add the highlight styles to the host page (once) */
export function injectHighlightStyles(): void {
  if (styleElement?.isConnected) return;
  styleElement = document.createElement('style');
  styleElement.textContent = highlightCss(currentTheme);
  document.head.appendChild(styleElement);
}

/** Switch highlight colours to suit a light or dark host page */
export function setHighlightTheme(theme: PageTheme): void {
  currentTheme = theme;
  if (styleElement) styleElement.textContent = highlightCss(theme);
}

/** Scroll a comment into view and briefly glow it, for "Show comment" */
export function flashComment(element: Element): void {
  injectHighlightStyles();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  element.classList.remove('pd-flash');
  // Force a reflow so the animation restarts when the same comment is shown twice
  void (element as HTMLElement).offsetWidth;
  element.classList.add('pd-flash');
  window.setTimeout(() => element.classList.remove('pd-flash'), 1900);
}
