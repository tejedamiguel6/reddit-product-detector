import { debug } from '@/utils/log';
import { ProviderManager } from '@/utils/providers/manager';
import { ChromeAIProvider } from '@/utils/providers/chrome-ai';
import { BYOKProvider } from '@/utils/providers/byok';
import { fetchProductInfo } from '@/utils/product-image-search';
import { hashText, cacheGet, cacheSet } from '@/utils/detection-cache';
import type { DetectedProduct, BatchDetectionResult } from '@/utils/providers/types';

const chromeAIProvider = new ChromeAIProvider();
const providerManager = new ProviderManager();
providerManager.register(chromeAIProvider);
providerManager.register(new BYOKProvider());

/**
 * Detect products in a batch of texts, with persistent caching.
 * Cached comments cost nothing; only misses go to the model (in one
 * call per provider-sized chunk).
 */
async function detectBatchWithCache(
  texts: string[]
): Promise<{
  results: DetectedProduct[][];
  error?: string;
  errorCode?: 'no_provider';
  cacheHits: number;
}> {
  const hashes = await Promise.all(texts.map(hashText));
  const cached = await Promise.all(hashes.map((h) => cacheGet(h)));

  const missIndices: number[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (cached[i] === undefined) missIndices.push(i);
  }

  let detection: BatchDetectionResult = { results: [] };
  if (missIndices.length > 0) {
    detection = await providerManager.detectProductsBatch(
      missIndices.map((i) => texts[i])
    );
  }

  const results: DetectedProduct[][] = texts.map(() => []);
  for (let i = 0; i < texts.length; i++) {
    const missPos = missIndices.indexOf(i);
    if (missPos === -1) {
      results[i] = cached[i]!;
    } else {
      results[i] = detection.results[missPos] ?? [];
      // Only cache results from successful runs — never cache failures
      if (!detection.error) {
        cacheSet(hashes[i], results[i]);
      }
    }
  }

  return {
    results,
    error: detection.error,
    errorCode: detection.errorCode,
    cacheHits: texts.length - missIndices.length,
  };
}

function openWelcomePage(): void {
  browser.tabs
    .create({ url: browser.runtime.getURL('/welcome.html') })
    .catch((err) => console.error('[Product Detector] Could not open welcome page:', err));
}

export default defineBackground(() => {
  debug('[Product Detector] Background service worker loaded');

  // Listeners below MUST be registered synchronously: an MV3 service worker
  // is woken by the very message or install event it needs to handle, and
  // anything registered after an `await` misses it. So provider setup runs
  // in the background and handlers wait on `ready` instead.
  const ready = providerManager.initialize().catch((err) => {
    console.error('[Provider] Initialisation failed:', err);
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // ─── Batched product detection (preferred) ──────────────
    if (message.type === 'DETECT_PRODUCTS_BATCH') {
      ready
        .then(() => detectBatchWithCache(message.texts as string[]))
        .then((result) => {
          if (result.cacheHits > 0) {
            debug(
              `[Detection] ${result.cacheHits}/${message.texts.length} from cache`
            );
          }
          sendResponse(result);
        })
        .catch((err) => {
          console.error('[Provider] Batch detection error:', err);
          sendResponse({
            results: (message.texts as string[]).map(() => []),
            error: err.message,
          });
        });
      return true;
    }

    // ─── Single-text detection (legacy, also cached) ────────
    if (message.type === 'DETECT_PRODUCTS') {
      ready
        .then(() => detectBatchWithCache([message.text as string]))
        .then((result) =>
          sendResponse({ products: result.results[0] ?? [], error: result.error })
        )
        .catch((err) => {
          console.error('[Provider] Detection error:', err);
          sendResponse({ products: [], error: err.message });
        });
      return true;
    }

    // ─── Provider status for popup/settings UI ─────────────
    if (message.type === 'GET_PROVIDER_STATUS') {
      ready.then(() => providerManager.getAllStatuses()).then((statuses) => {
        sendResponse({
          active: providerManager.getActiveProviderId(),
          statuses,
        });
      });
      return true;
    }

    // ─── Change preferred provider ─────────────────────────
    if (message.type === 'SET_PROVIDER') {
      browser.storage.local
        .set({ preferredProvider: message.providerId })
        .then(() => providerManager.refresh())
        .then(() => {
          sendResponse({
            active: providerManager.getActiveProviderId(),
          });
        });
      return true;
    }

    // ─── Save BYOK config ──────────────────────────────────
    if (message.type === 'SAVE_BYOK_CONFIG') {
      browser.storage.local
        .set({ byokConfig: message.config })
        .then(() => providerManager.refresh())
        .then(() => {
          sendResponse({
            active: providerManager.getActiveProviderId(),
          });
        });
      return true;
    }

    // ─── Trigger Chrome AI model download ─────────────────
    if (message.type === 'TRIGGER_CHROME_AI_DOWNLOAD') {
      chromeAIProvider
        .triggerDownload()
        .then(async (status) => {
          // If download succeeded/started, refresh providers
          await providerManager.refresh();
          sendResponse({
            status,
            active: providerManager.getActiveProviderId(),
          });
        })
        .catch((err) => {
          sendResponse({
            status: { available: false, status: 'error', message: err.message },
            active: providerManager.getActiveProviderId(),
          });
        });
      return true;
    }

    // ─── Re-check providers (after the welcome page finishes a download) ──
    if (message.type === 'REFRESH_PROVIDERS') {
      providerManager
        .refresh()
        .then(() => sendResponse({ active: providerManager.getActiveProviderId() }))
        .catch(() => sendResponse({ active: null }));
      return true;
    }

    // ─── Open the welcome / setup page (from the popup or the in-page prompt) ──
    if (message.type === 'OPEN_WELCOME') {
      openWelcomePage();
      return false;
    }

    // ─── Product info (image + search links) ──────────────
    if (message.type === 'GET_PRODUCT_INFO') {
      fetchProductInfo(message.name, message.category, message.pageContext)
        .then((info) => sendResponse(info))
        .catch((err) => {
          console.error('[Product Info] Error:', err);
          sendResponse({ name: message.name, image: null, searchLinks: null });
        });
      return true;
    }

    // ─── Existing: enabled status ──────────────────────────
    if (message.type === 'GET_STATUS') {
      browser.storage.local.get('enabled').then((result) => {
        sendResponse({ enabled: result.enabled ?? true });
      });
      return true;
    }

    if (message.type === 'LOG') {
      debug('[Content Script]', message.data);
      return false;
    }

    return false;
  });

  // Re-initialize providers when config changes
  browser.storage.onChanged.addListener((changes) => {
    if (changes.byokConfig || changes.preferredProvider) {
      debug('[Provider] Config changed, refreshing...');
      providerManager.refresh();
    }
  });

  // Initialize default state on install
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      await browser.storage.local.set({ enabled: true });
      debug('[Product Detector] Installed, detection enabled');
      // First run: explain what the extension does and get the AI ready
      openWelcomePage();
    }
  });
});
