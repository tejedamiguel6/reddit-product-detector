/**
 * Shared helpers for batched detection responses.
 */

import type { DetectedProduct, BatchDetectionResult } from './types';

function isValidProduct(p: { name?: unknown; category?: unknown }): p is DetectedProduct {
  return (
    typeof p.name === 'string' &&
    p.name.length > 0 &&
    p.name.length <= 200 &&
    typeof p.category === 'string' &&
    p.category.length > 0
  );
}

/**
 * Parse a raw JSON batch response of shape
 * { results: [{ index: 1, products: [...] }, ...] }
 * into product lists aligned with the input order (1-based indices).
 */
export function parseBatchResponse(raw: string, count: number): BatchDetectionResult {
  const results: DetectedProduct[][] = Array.from({ length: count }, () => []);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.results)) {
      for (const entry of parsed.results) {
        const i = (typeof entry?.index === 'number' ? entry.index : NaN) - 1;
        if (i >= 0 && i < count && Array.isArray(entry.products)) {
          results[i] = entry.products.filter(isValidProduct);
        }
      }
    }
    return { results };
  } catch {
    console.error('[Batch] Failed to parse batch response:', raw.slice(0, 200));
    return { results, error: 'Failed to parse model response' };
  }
}

/** Split an array into chunks of at most `size` */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) {
    out.push(items.slice(i, i + Math.max(1, size)));
  }
  return out;
}
