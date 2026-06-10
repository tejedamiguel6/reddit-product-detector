/**
 * Product detection logic.
 * Routes detection through the background service worker,
 * which picks the best available LLM provider (Chrome AI → BYOK).
 */

import type { Sentiment } from './providers/types';

export interface ProductMatch {
  /** The matched product name */
  name: string;
  /** Product category (optional) */
  category?: string;
  /** Commenter's sentiment toward the product */
  sentiment?: Sentiment;
  /** Start index in the original text */
  startIndex: number;
  /** End index in the original text */
  endIndex: number;
}

export interface DetectedProduct {
  name: string;
  category?: string;
  sentiment?: Sentiment;
}

// Per-tab in-memory cache to avoid even messaging the background worker.
// (The background worker also has a persistent cross-tab cache.)
// Keyed on the FULL analyzed text — a prefix key can return wrong results.
const detectionCache = new Map<string, DetectedProduct[]>();

// ─── Micro-batching queue ────────────────────────────────
// Instead of one model call per comment (slow, expensive), collect comments
// that arrive within a short window and send them to the background worker
// as ONE batch. The background worker checks its persistent cache and makes
// a single model call for the misses.
const BATCH_WINDOW_MS = 400; // collect comments for this long before sending
const MAX_PENDING = 8; // send immediately once this many are waiting

interface PendingRequest {
  text: string;
  resolve: (products: DetectedProduct[]) => void;
}

let pendingRequests: PendingRequest[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;

function enqueueDetection(text: string): Promise<DetectedProduct[]> {
  return new Promise((resolve) => {
    pendingRequests.push({ text, resolve });
    if (pendingRequests.length >= MAX_PENDING) {
      flushBatch();
    } else if (!batchTimer) {
      batchTimer = setTimeout(flushBatch, BATCH_WINDOW_MS);
    }
  });
}

async function flushBatch(): Promise<void> {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  // Only one batch in flight at a time; new arrivals wait for the next flush
  if (flushInFlight || pendingRequests.length === 0) return;

  const batch = pendingRequests;
  pendingRequests = [];
  flushInFlight = true;

  try {
    const result = await browser.runtime.sendMessage({
      type: 'DETECT_PRODUCTS_BATCH',
      texts: batch.map((r) => r.text),
    });

    if (result?.error) {
      console.error('[Product Detector] Provider error:', result.error);
    }

    const results: DetectedProduct[][] = result?.results || [];
    batch.forEach((req, i) => {
      const products = results[i] ?? [];
      // Only cache locally on success — errors should be retryable
      if (!result?.error) {
        detectionCache.set(req.text, products);
      }
      req.resolve(products);
    });
  } catch (error) {
    console.error('[Product Detector] Batch detection failed:', error);
    batch.forEach((req) => req.resolve([]));
  } finally {
    flushInFlight = false;
    // Drain anything that queued while we were busy
    if (pendingRequests.length > 0) {
      flushBatch();
    }
  }
}

/**
 * Quick heuristic check — does this text look like it might mention a product?
 * Skips the LLM call entirely for text that's clearly just conversation.
 * This saves API calls and CPU, reducing fan noise and cost.
 */
function mightContainProduct(text: string): boolean {
  // Must have at least one word that starts with a capital letter
  // (brand/product names are almost always capitalized)
  const hasCapitalizedWord = /\b[A-Z][a-zA-Z0-9]/.test(text);
  if (!hasCapitalizedWord) return false;

  // Check for product-like patterns:
  // - Model numbers: letters + digits (e.g., "WH-1000XM5", "iPhone 15", "X1 Carbon")
  // - Brand + word patterns: two+ capitalized words near each other
  const hasModelNumber = /[A-Za-z][\w-]*\d|\d[\w-]*[A-Za-z]/.test(text);
  const hasMultiWordName = /[A-Z][a-z]+\s+[A-Z][a-z]/.test(text);
  const hasProductIndicator = /\$\d|USD|bought|using|recommend|switched to|upgrade|review/i.test(text);

  return hasModelNumber || hasMultiWordName || hasProductIndicator;
}

/**
 * Detect product mentions in text using AI.
 * Sends text to the background service worker, which routes
 * to Chrome AI or BYOK provider. Limits concurrency to avoid lag.
 *
 * @param text - The text to search for product mentions
 * @returns Promise resolving to array of detected products
 */
export async function detectProducts(text: string): Promise<ProductMatch[]> {
  const trimmed = text.trim();

  // Skip short text
  if (trimmed.length < 50) {
    return [];
  }

  // Skip text that's unlikely to contain product names
  // This prevents unnecessary LLM calls for pure conversation
  if (!mightContainProduct(trimmed)) {
    return [];
  }

  // Cap text length to avoid slow/expensive LLM calls on huge comments
  const textToAnalyze = trimmed.length > 1500 ? trimmed.slice(0, 1500) : trimmed;

  // Check local cache first (full-text key — exact match only)
  const cached = detectionCache.get(textToAnalyze);
  if (cached) {
    return findProductPositions(text, cached);
  }

  // Queue for the next micro-batch (one model call covers many comments)
  const products = await enqueueDetection(textToAnalyze);

  if (products.length > 0) {
    console.log('[Product Detector] Detected products:', products);
  }

  return findProductPositions(text, products);
}

/**
 * Find the positions of detected products in the original text
 */
function findProductPositions(text: string, products: DetectedProduct[]): ProductMatch[] {
  const matches: ProductMatch[] = [];
  const lowerText = text.toLowerCase();

  for (const product of products) {
    const lowerName = product.name.toLowerCase();
    let searchStart = 0;

    // Find all occurrences of this product name
    while (searchStart < text.length) {
      const index = lowerText.indexOf(lowerName, searchStart);
      if (index === -1) break;

      matches.push({
        name: text.slice(index, index + product.name.length), // Use original case
        category: product.category,
        sentiment: product.sentiment,
        startIndex: index,
        endIndex: index + product.name.length,
      });

      searchStart = index + product.name.length;
    }
  }

  // Sort by start index
  matches.sort((a, b) => a.startIndex - b.startIndex);

  return matches;
}

/**
 * Check if an element has already been processed
 */
export function isAlreadyProcessed(element: Element): boolean {
  return element.hasAttribute('data-rpd-scanned');
}

/**
 * Mark an element as processed
 */
export function markAsProcessed(element: Element): void {
  element.setAttribute('data-rpd-scanned', 'true');
}

/**
 * Clear the detection cache (useful for testing or memory management)
 */
export function clearCache(): void {
  detectionCache.clear();
}
