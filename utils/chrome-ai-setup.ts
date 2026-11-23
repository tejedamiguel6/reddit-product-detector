/**
 * Chrome built-in AI setup helpers for extension pages (welcome page).
 *
 * These run in a page, not the service worker, on purpose: starting the model
 * download needs a user gesture (a click), and only a page can report real
 * download progress back to the person who clicked.
 */

export type ChromeAIAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  /** This Chrome has no built-in AI API at all (too old, or not desktop Chrome) */
  | 'unsupported';

export async function getChromeAIAvailability(): Promise<ChromeAIAvailability> {
  if (typeof LanguageModel === 'undefined') return 'unsupported';
  try {
    return await LanguageModel.availability();
  } catch {
    return 'unavailable';
  }
}

/**
 * Start (or join) the model download and resolve when the model is usable.
 * Must be called from a click handler. `onProgress` receives 0..1.
 */
export async function downloadChromeAI(onProgress: (fraction: number) => void): Promise<void> {
  const session = await LanguageModel.create({
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        const { loaded, total } = event as ProgressEvent;
        // Current Chrome reports `loaded` as a 0..1 fraction; older builds
        // reported bytes with a `total`.
        const fraction = total > 1 ? loaded / total : loaded;
        onProgress(Math.min(1, Math.max(0, fraction)));
      });
    },
  });
  session.destroy();
}
