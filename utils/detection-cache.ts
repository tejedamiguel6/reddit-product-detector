/**
 * Persistent detection cache (background service worker).
 *
 * Why: forum comments are immutable, and popular threads are revisited.
 * Caching detection results by full-text hash means a comment is only ever
 * analyzed by the model ONCE — across tabs, page reloads, and browser
 * restarts. This is the single biggest CPU/cost saver in the extension.
 *
 * Storage: one object in browser.storage.local, hash → { p: products, t: ts }.
 * Bounded size with oldest-first eviction; writes are debounced.
 */

import type { DetectedProduct } from './providers/types';

const STORAGE_KEY = 'rpd_detection_cache_v1';
const MAX_ENTRIES = 800;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PERSIST_DEBOUNCE_MS = 2000;

interface CacheEntry {
  /** products */
  p: DetectedProduct[];
  /** timestamp (ms) */
  t: number;
}

let cache: Map<string, CacheEntry> | null = null;
let loadPromise: Promise<Map<string, CacheEntry>> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** SHA-256 hash of normalized text → hex string (first 32 chars) */
export async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

async function loadCache(): Promise<Map<string, CacheEntry>> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      const stored = await browser.storage.local.get(STORAGE_KEY);
      const raw = (stored[STORAGE_KEY] || {}) as Record<string, CacheEntry>;
      const now = Date.now();
      const map = new Map<string, CacheEntry>();
      // Load in timestamp order (oldest first) so Map order = eviction order
      for (const [key, entry] of Object.entries(raw).sort((a, b) => a[1].t - b[1].t)) {
        if (now - entry.t < TTL_MS) {
          map.set(key, entry);
        }
      }
      cache = map;
      return map;
    })();
  }
  return loadPromise;
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    if (!cache) return;
    const obj: Record<string, CacheEntry> = {};
    for (const [key, entry] of cache) obj[key] = entry;
    try {
      await browser.storage.local.set({ [STORAGE_KEY]: obj });
    } catch (error) {
      console.warn('[Detection Cache] Persist failed:', error);
    }
  }, PERSIST_DEBOUNCE_MS);
}

/** Get cached products for a text hash, or undefined on miss */
export async function cacheGet(hash: string): Promise<DetectedProduct[] | undefined> {
  const map = await loadCache();
  const entry = map.get(hash);
  if (!entry) return undefined;
  if (Date.now() - entry.t > TTL_MS) {
    map.delete(hash);
    return undefined;
  }
  return entry.p;
}

/** Store products for a text hash */
export async function cacheSet(hash: string, products: DetectedProduct[]): Promise<void> {
  const map = await loadCache();
  // Evict oldest entries when full (Map preserves insertion order)
  while (map.size >= MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (!oldest) break;
    map.delete(oldest);
  }
  map.set(hash, { p: products, t: Date.now() });
  schedulePersist();
}

/** Clear the cache (settings UI / debugging) */
export async function cacheClear(): Promise<void> {
  const map = await loadCache();
  map.clear();
  await browser.storage.local.remove(STORAGE_KEY);
}
