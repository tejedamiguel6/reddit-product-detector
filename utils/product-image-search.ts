/**
 * Product image search using Serper.dev Google Images API.
 * Runs in the background service worker — no separate API server needed.
 */

// In-memory LRU cache
const IMAGE_CACHE_MAX = 300;
const imageCache = new Map<string, { url: string | null; ts: number }>();

function getCached(key: string): string | null | undefined {
  const entry = imageCache.get(key);
  if (entry) {
    imageCache.delete(key);
    imageCache.set(key, entry);
    return entry.url;
  }
  return undefined;
}

function setCache(key: string, url: string | null): void {
  if (imageCache.size >= IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value;
    if (oldest) imageCache.delete(oldest);
  }
  imageCache.set(key, { url, ts: Date.now() });
}

/**
 * Extract useful context from page title (subreddit name, forum topic)
 */
function extractContext(pageContext: string): string | null {
  const sub = pageContext.match(/r\/(\w+)/i);
  if (sub) return sub[1];

  const parts = pageContext.split(/[:\-|]/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].trim();
    const generic = ['reddit', 'hacker news', 'producthunt', 'product hunt'];
    if (last.length > 2 && !generic.some(t => last.toLowerCase().includes(t))) {
      return last;
    }
  }
  return null;
}

export interface ProductImageResult {
  name: string;
  image: string | null;
  imageSearchUrl: string;
  searchLinks: {
    amazon: string;
    googleShopping: string;
    google: string;
  };
}

export async function fetchProductInfo(
  productName: string,
  category?: string,
  pageContext?: string,
): Promise<ProductImageResult> {
  // Build search query with category context
  const searchQuery = category ? `${productName} ${category}` : productName;
  const encoded = encodeURIComponent(searchQuery);

  const result: ProductImageResult = {
    name: productName,
    image: null,
    imageSearchUrl: `https://www.google.com/search?tbm=isch&q=${encoded}`,
    searchLinks: {
      amazon: `https://www.amazon.com/s?k=${encoded}`,
      googleShopping: `https://www.google.com/search?tbm=shop&q=${encoded}`,
      google: `https://www.google.com/search?q=${encoded}`,
    },
  };

  // Try to get image from Serper
  const image = await searchImage(productName, category, pageContext);
  if (image) {
    result.image = image;
  }

  return result;
}

async function searchImage(
  productName: string,
  category?: string,
  pageContext?: string,
): Promise<string | null> {
  // Check cache
  const cacheKey = `${productName}|${category || ''}|${pageContext || ''}`.toLowerCase();
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  // Get Serper API key from storage
  const stored = await browser.storage.local.get('serperApiKey') as { serperApiKey?: string };
  const apiKey = stored.serperApiKey;

  if (!apiKey) {
    console.log('[Image Search] No Serper API key configured');
    setCache(cacheKey, null);
    return null;
  }

  try {
    // Build context-aware query
    let query = productName;
    if (category) query = `${productName} ${category}`;
    if (pageContext) {
      const ctx = extractContext(pageContext);
      if (ctx) query = `${query} ${ctx}`;
    }

    console.log(`[Image Search] Query: "${query}"`);

    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 5 }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status}`);
    }

    const data = await response.json();
    const images = data.images || [];

    if (images.length > 0) {
      // Prefer retail sources for cleaner product images
      const preferred = ['amazon.com', 'walmart.com', 'bestbuy.com', 'target.com'];
      for (const source of preferred) {
        const match = images.find(
          (img: { imageUrl: string; link: string }) =>
            img.link?.includes(source) || img.imageUrl?.includes(source),
        );
        if (match?.imageUrl) {
          setCache(cacheKey, match.imageUrl);
          return match.imageUrl;
        }
      }

      // Fall back to first result
      const first = images[0]?.imageUrl;
      if (first) {
        setCache(cacheKey, first);
        return first;
      }
    }

    setCache(cacheKey, null);
    return null;
  } catch (error) {
    console.error('[Image Search] Error:', error);
    setCache(cacheKey, null);
    return null;
  }
}
