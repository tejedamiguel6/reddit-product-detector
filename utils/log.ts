/**
 * Debug logging that only prints in development builds (`npm run dev`).
 * Production builds stay quiet in the host page's console; real problems
 * still go through console.warn / console.error.
 */
export const debug: (...args: unknown[]) => void = import.meta.env.DEV
  ? (...args) => console.log(...args)
  : () => {};
