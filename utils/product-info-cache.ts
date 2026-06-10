/**
 * Persistent cache for product info (images, links)
 * Uses localStorage to persist across sessions and save Serper API calls
 */

interface CachedProductInfo {
  name: string;
  image: string | null;
  imageSearchUrl?: string;
  searchLinks: {
    amazon: string;
    googleShopping: string;
    google: string;
  };
  cachedAt: number;
}

interface CacheData {
  version: number;
  entries: Record<string, CachedProductInfo>;
}

const CACHE_KEY = 'pd_product_info_cache';
const CACHE_VERSION = 2; // Bumped to clear stale results with missing category context
const MAX_CACHE_ENTRIES = 500; // Limit cache size
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCacheData(): CacheData {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return { version: CACHE_VERSION, entries: {} };
    }
    const data = JSON.parse(raw) as CacheData;
    // Handle version mismatch - clear cache
    if (data.version !== CACHE_VERSION) {
      return { version: CACHE_VERSION, entries: {} };
    }
    return data;
  } catch {
    return { version: CACHE_VERSION, entries: {} };
  }
}

function saveCacheData(data: CacheData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage might be full - clear old entries and retry
    console.warn('[Product Detector] Cache storage failed, clearing old entries');
    pruneCache(data, MAX_CACHE_ENTRIES / 2);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
      // Give up if still failing
    }
  }
}

function pruneCache(data: CacheData, maxEntries: number): void {
  const entries = Object.entries(data.entries);
  if (entries.length <= maxEntries) return;

  // Sort by cachedAt (oldest first) and remove oldest
  entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
  const toRemove = entries.length - maxEntries;
  for (let i = 0; i < toRemove; i++) {
    delete data.entries[entries[i][0]];
  }
}

function getCacheKey(productName: string, category?: string): string {
  // Include category in cache key since it affects image search
  return `${productName.toLowerCase()}|${category?.toLowerCase() || ''}`;
}

/**
 * Get cached product info if available and not expired
 */
export function getCachedProductInfo(
  productName: string,
  category?: string
): CachedProductInfo | null {
  const data = getCacheData();
  const key = getCacheKey(productName, category);
  const cached = data.entries[key];

  if (!cached) return null;

  // Check if expired
  if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
    delete data.entries[key];
    saveCacheData(data);
    return null;
  }

  return cached;
}

/**
 * Cache product info for future use
 */
export function cacheProductInfo(
  productInfo: Omit<CachedProductInfo, 'cachedAt'>,
  category?: string
): void {
  const data = getCacheData();
  const key = getCacheKey(productInfo.name, category);

  data.entries[key] = {
    ...productInfo,
    cachedAt: Date.now(),
  };

  // Prune if too many entries
  pruneCache(data, MAX_CACHE_ENTRIES);
  saveCacheData(data);
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): { entries: number; oldestDays: number } {
  const data = getCacheData();
  const entries = Object.values(data.entries);
  if (entries.length === 0) {
    return { entries: 0, oldestDays: 0 };
  }
  const oldest = Math.min(...entries.map((e) => e.cachedAt));
  const oldestDays = Math.floor((Date.now() - oldest) / (24 * 60 * 60 * 1000));
  return { entries: entries.length, oldestDays };
}

/**
 * Clear the entire cache
 */
export function clearProductInfoCache(): void {
  localStorage.removeItem(CACHE_KEY);
}
