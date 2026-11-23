/**
 * Styles for everything the extension draws itself (summary panel, hover
 * card, setup prompt). Rendered as a <style> inside the shadow root, so the
 * host site's CSS cannot reach it and this cannot leak out.
 *
 * Colours are custom properties on the shadow host. Dark is the default;
 * the host gets data-pd-theme="light" on light pages (see utils/page-theme.ts).
 */
export const UI_CSS = `
:host {
  --pd-bg: #1b1c1e;
  --pd-bg-raised: #26272a;
  --pd-border: #3a3b3f;
  --pd-text: #ecedee;
  --pd-muted: #9a9ca1;
  --pd-pos: #3ecf8e;
  --pd-neg: #f0625a;
  --pd-neu: #7f8aa3;
  --pd-warn: #e0a84a;
  --pd-accent: #3ecf8e;
  --pd-accent-text: #0d1f17;
  --pd-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

:host([data-pd-theme='light']) {
  --pd-bg: #ffffff;
  --pd-bg-raised: #f3f4f2;
  --pd-border: #dfe1e4;
  --pd-text: #1b1c1e;
  --pd-muted: #62666d;
  --pd-pos: #1a8f5a;
  --pd-neg: #cf3b32;
  --pd-neu: #8a93a6;
  --pd-warn: #a8690f;
  --pd-accent: #1f6f4f;
  --pd-accent-text: #ffffff;
  --pd-shadow: 0 12px 32px rgba(15, 20, 30, 0.18);
}

.pd {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--pd-text);
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}

.pd *,
.pd *::before,
.pd *::after {
  box-sizing: border-box;
}

.pd button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.pd button:focus-visible,
.pd a:focus-visible {
  outline: 2px solid var(--pd-accent);
  outline-offset: 2px;
}

@keyframes pd-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ─── Hover card ───────────────────────────────────────── */

.pd-card {
  position: fixed;
  z-index: 2147483647;
  width: 320px;
  max-width: calc(100vw - 16px);
  background: var(--pd-bg);
  border: 1px solid var(--pd-border);
  border-radius: 12px;
  box-shadow: var(--pd-shadow);
  overflow: hidden;
  pointer-events: auto;
  animation: pd-fade 0.12s ease-out;
}

@keyframes pd-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.pd-card-head {
  display: flex;
  gap: 12px;
  padding: 12px;
}

.pd-card-tile {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--pd-bg-raised);
  overflow: hidden;
}

.pd-card-monogram {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--pd-muted);
}

.pd-card-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.pd-card-img-ready {
  opacity: 1;
}

.pd-card-title {
  min-width: 0;
  flex: 1;
}

.pd-card-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.pd-card-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}

.pd-chip {
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--pd-bg-raised);
  color: var(--pd-muted);
  font-size: 11px;
  text-transform: capitalize;
}

.pd-chip-pos,
.pd-chip-neg {
  font-weight: 600;
  text-transform: none;
}

.pd-chip-pos {
  color: var(--pd-pos);
  background: color-mix(in srgb, var(--pd-pos) 14%, transparent);
}

.pd-chip-neg {
  color: var(--pd-neg);
  background: color-mix(in srgb, var(--pd-neg) 14%, transparent);
}

.pd-card-thread {
  padding: 10px 12px 12px;
  border-top: 1px solid var(--pd-border);
}

.pd-card-quote {
  margin: 4px 0 0;
  color: var(--pd-muted);
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pd-card-links {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--pd-border);
  background: var(--pd-bg-raised);
}

.pd-card-link {
  flex: 1;
  padding: 7px 8px;
  border: 1px solid var(--pd-border);
  border-radius: 8px;
  background: var(--pd-bg);
  color: var(--pd-text);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  text-decoration: none;
  transition: border-color 0.15s ease;
}

.pd-card-link:hover {
  border-color: var(--pd-muted);
}

.pd-card-note {
  padding: 0 12px 10px;
  background: var(--pd-bg-raised);
  color: var(--pd-muted);
  font-size: 10px;
  line-height: 1.35;
}

/* ─── Setup prompt ─────────────────────────────────────── */

.pd-nudge {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483646;
  width: 300px;
  padding: 14px 16px;
  background: var(--pd-bg);
  border: 1px solid var(--pd-border);
  border-radius: 12px;
  box-shadow: var(--pd-shadow);
  animation: pd-rise 0.22s ease-out;
}

.pd-nudge-title {
  font-weight: 600;
  font-size: 14px;
  margin: 0 0 4px;
}

.pd-nudge-text {
  color: var(--pd-muted);
  margin: 0 0 12px;
}

.pd-nudge-actions {
  display: flex;
  gap: 8px;
}

.pd-btn {
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--pd-accent);
  background: var(--pd-accent);
  color: var(--pd-accent-text) !important;
  font-weight: 600;
}

.pd-btn-quiet {
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--pd-border);
  background: transparent;
  color: var(--pd-muted) !important;
}

/* ─── Summary pill ─────────────────────────────────────── */

.pd-pill {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 300px;
  padding: 8px 10px 8px 14px;
  background: var(--pd-bg);
  color: var(--pd-text);
  border: 1px solid var(--pd-border);
  border-radius: 999px;
  box-shadow: var(--pd-shadow);
  text-align: left;
  animation: pd-rise 0.25s ease-out;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.pd-pill:hover {
  transform: translateY(-1px);
  border-color: var(--pd-muted);
}

.pd-pill-mark {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pd-pos);
  flex-shrink: 0;
}

.pd-pill-ring {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  background: conic-gradient(var(--pd-pos) var(--pd-progress, 0%), var(--pd-border) 0);
  -webkit-mask: radial-gradient(circle, transparent 4px, #000 4.5px);
  mask: radial-gradient(circle, transparent 4px, #000 4.5px);
}

.pd-pill-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pd-pill-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--pd-muted);
}

.pd-pill-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pd-pill-count {
  min-width: 24px;
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--pd-bg-raised);
  color: var(--pd-muted);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
  flex-shrink: 0;
  animation: pd-bump 0.3s ease-out;
}

@keyframes pd-bump {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.18);
    color: var(--pd-text);
  }
  100% {
    transform: scale(1);
  }
}

/* ─── Summary panel ────────────────────────────────────── */

.pd-panel {
  position: fixed;
  right: 20px;
  bottom: 76px;
  z-index: 2147483646;
  width: 360px;
  max-width: calc(100vw - 40px);
  max-height: min(70vh, 580px);
  display: flex;
  flex-direction: column;
  background: var(--pd-bg);
  border: 1px solid var(--pd-border);
  border-radius: 14px;
  box-shadow: var(--pd-shadow);
  overflow: hidden;
  transform-origin: bottom right;
  animation: pd-rise 0.18s ease-out;
}

.pd-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 12px 12px 16px;
  border-bottom: 1px solid var(--pd-border);
}

.pd-panel-title {
  font-size: 15px;
  font-weight: 600;
}

.pd-panel-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--pd-muted);
}

.pd-panel-head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.pd-head-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--pd-border);
  border-radius: 8px;
  background: transparent;
  color: var(--pd-muted) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

.pd-head-btn:hover {
  color: var(--pd-text) !important;
  border-color: var(--pd-muted);
}

.pd-scan {
  padding: 8px 16px;
  border-bottom: 1px solid var(--pd-border);
  font-size: 12px;
  color: var(--pd-muted);
  font-variant-numeric: tabular-nums;
}

.pd-scan-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pd-scan-track {
  height: 4px;
  margin: 6px 0;
  border-radius: 2px;
  background: var(--pd-bg-raised);
  overflow: hidden;
}

.pd-scan-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--pd-pos);
  transition: width 0.3s ease;
}

.pd-scan-note {
  font-size: 11px;
}

.pd-icon-btn {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--pd-muted) !important;
  font-size: 18px !important;
  line-height: 1;
}

.pd-icon-btn:hover {
  background: var(--pd-bg-raised);
}

.pd-panel-list {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
}

.pd-row {
  border-radius: 10px;
}

.pd-row + .pd-row {
  margin-top: 2px;
}

.pd-row-featured {
  background: var(--pd-bg-raised);
  margin-bottom: 6px;
}

.pd-row-summary {
  display: block;
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  text-align: left;
}

.pd-row-toggle:hover {
  background: var(--pd-bg-raised);
}

.pd-row-tag {
  margin-bottom: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--pd-pos);
}

.pd-row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.pd-row-name {
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pd-row-featured .pd-row-name {
  font-size: 16px;
}

.pd-verdict {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
}

.pd-verdict-recommended {
  color: var(--pd-pos);
}

.pd-verdict-divisive {
  color: var(--pd-warn);
}

.pd-verdict-warned {
  color: var(--pd-neg);
}

.pd-verdict-mentioned {
  color: var(--pd-muted);
  font-weight: 400;
}

.pd-bar {
  display: flex;
  gap: 2px;
  height: 5px;
  margin: 7px 0 6px;
  border-radius: 3px;
  overflow: hidden;
}

.pd-bar span {
  flex-basis: 0;
  transition: flex-grow 0.3s ease;
}

.pd-bar-pos {
  background: var(--pd-pos);
}

.pd-bar-neg {
  background: var(--pd-neg);
}

.pd-bar-neu {
  background: var(--pd-neu);
  opacity: 0.45;
}

.pd-row-meta {
  font-size: 12px;
  color: var(--pd-muted);
  font-variant-numeric: tabular-nums;
}

.pd-row-detail {
  padding: 0 10px 10px;
  animation: pd-rise 0.15s ease-out;
}

.pd-quote {
  margin: 0 0 8px;
  padding-left: 10px;
  border-left: 2px solid var(--pd-border);
  color: var(--pd-text);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.pd-row-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pd-text-btn {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 4px 0;
  border: none;
  background: none;
  color: var(--pd-accent) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

.pd-text-btn:hover,
.pd-text-link:hover {
  text-decoration: underline;
}

.pd-text-link {
  color: var(--pd-muted);
  font-size: 12px;
  text-decoration: none;
}

@media (prefers-reduced-motion: reduce) {
  .pd-nudge,
  .pd-card,
  .pd-pill,
  .pd-pill-count,
  .pd-panel,
  .pd-row-detail {
    animation: none;
  }
  .pd-pill,
  .pd-bar span {
    transition: none;
  }
}
`;
