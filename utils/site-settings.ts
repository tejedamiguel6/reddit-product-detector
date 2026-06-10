/**
 * Site settings management.
 * Handles user-defined list of sites to scan for products.
 */

export interface SiteConfig {
  /** The hostname (e.g., "www.reddit.com") */
  hostname: string;
  /** Display name for UI */
  name: string;
  /** Whether scanning is enabled for this site */
  enabled: boolean;
  /** Optional custom selectors for this site */
  selectors?: string[];
}

// Default sites to include on first install
export const DEFAULT_SITES: SiteConfig[] = [
  { hostname: 'www.reddit.com', name: 'Reddit', enabled: true },
  { hostname: 'old.reddit.com', name: 'Reddit (Old)', enabled: true },
  { hostname: 'news.ycombinator.com', name: 'Hacker News', enabled: true },
  { hostname: 'www.producthunt.com', name: 'Product Hunt', enabled: true },
];

/**
 * Get all configured sites
 */
export async function getSites(): Promise<SiteConfig[]> {
  const result = await browser.storage.sync.get('sites') as { sites?: SiteConfig[] };
  return result.sites || DEFAULT_SITES;
}

/**
 * Save sites configuration
 */
export async function saveSites(sites: SiteConfig[]): Promise<void> {
  await browser.storage.sync.set({ sites });
}

/**
 * Add a new site
 */
export async function addSite(hostname: string, name?: string): Promise<SiteConfig[]> {
  const sites = await getSites();

  // Check if already exists
  if (sites.some(s => s.hostname === hostname)) {
    return sites;
  }

  const newSite: SiteConfig = {
    hostname,
    name: name || hostname,
    enabled: true,
  };

  const updated = [...sites, newSite];
  await saveSites(updated);
  return updated;
}

/**
 * Remove a site
 */
export async function removeSite(hostname: string): Promise<SiteConfig[]> {
  const sites = await getSites();
  const updated = sites.filter(s => s.hostname !== hostname);
  await saveSites(updated);
  return updated;
}

/**
 * Toggle a site's enabled status
 */
export async function toggleSite(hostname: string): Promise<SiteConfig[]> {
  const sites = await getSites();
  const updated = sites.map(s =>
    s.hostname === hostname ? { ...s, enabled: !s.enabled } : s
  );
  await saveSites(updated);
  return updated;
}

/**
 * Check if the current site is enabled for scanning
 */
export async function isCurrentSiteEnabled(): Promise<boolean> {
  const hostname = window.location.hostname;
  const sites = await getSites();
  const site = sites.find(s => s.hostname === hostname);
  return site?.enabled ?? false;
}

/**
 * Get config for current site (if exists)
 */
export async function getCurrentSiteConfig(): Promise<SiteConfig | null> {
  const hostname = window.location.hostname;
  const sites = await getSites();
  return sites.find(s => s.hostname === hostname) || null;
}
