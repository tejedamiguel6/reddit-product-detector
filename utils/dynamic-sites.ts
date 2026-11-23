import { debug } from '@/utils/log';
/**
 * Dynamic site registration for user-added forums.
 *
 * The manifest only requests host permissions for the default sites
 * (Reddit, HN, Product Hunt) so the install warning stays small. When a
 * user adds a custom site in the popup, we:
 *   1. Request permission for that origin only (Chrome shows a one-time
 *      prompt naming the specific site)
 *   2. Register the content script for that origin dynamically
 *
 * Registered scripts persist across browser sessions, so this runs once
 * per added site, not on every startup.
 */

/** Origin pattern for a hostname, e.g. "forum.example.com" → "*://forum.example.com/*" */
export function originPattern(hostname: string): string {
  return `*://${hostname}/*`;
}

function scriptId(hostname: string): string {
  return `pd-dynamic-${hostname}`;
}

/**
 * Request host permission for a site. MUST be called from a user gesture
 * (e.g. a button click in the popup). Returns true if granted.
 */
export async function requestSiteAccess(hostname: string): Promise<boolean> {
  try {
    return await browser.permissions.request({ origins: [originPattern(hostname)] });
  } catch (error) {
    console.error('[Dynamic Sites] Permission request failed:', error);
    return false;
  }
}

/** Check whether we already have host permission for a site */
export async function hasSiteAccess(hostname: string): Promise<boolean> {
  try {
    return await browser.permissions.contains({ origins: [originPattern(hostname)] });
  } catch {
    return false;
  }
}

/** Register the content script for a user-added site */
export async function registerSiteScript(hostname: string): Promise<void> {
  const id = scriptId(hostname);
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) return;

  await browser.scripting.registerContentScripts([
    {
      id,
      matches: [originPattern(hostname)],
      js: ['content-scripts/content.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
  debug('[Dynamic Sites] Registered content script for:', hostname);
}

/** Unregister the content script when a site is removed */
export async function unregisterSiteScript(hostname: string): Promise<void> {
  try {
    await browser.scripting.unregisterContentScripts({ ids: [scriptId(hostname)] });
  } catch {
    // Not registered (e.g. a default site) — fine
  }
}

/** Optionally give back the host permission when a site is removed */
export async function releaseSiteAccess(hostname: string): Promise<void> {
  try {
    await browser.permissions.remove({ origins: [originPattern(hostname)] });
  } catch {
    // Can't remove permissions we never had — fine
  }
}
