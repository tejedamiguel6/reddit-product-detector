import { debug } from '@/utils/log';
/**
 * Provider manager — handles selection, fallback, and routing.
 * Tries Chrome AI first, falls back to BYOK if unavailable.
 */

import type { LLMProvider, DetectionResult, BatchDetectionResult, ProviderStatus } from './types';
import type { DetectedProduct } from './types';
import { chunk } from './batch-utils';

export class ProviderManager {
  private providers: Map<string, LLMProvider> = new Map();
  private activeProviderId: string | null = null;

  register(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Initialize — pick the best available provider.
   * Checks user preference first, then auto-detects.
   */
  async initialize(): Promise<void> {
    // Check user preference first
    const result = await browser.storage.local.get('preferredProvider');
    const preferred = result.preferredProvider as string | undefined;

    if (preferred && this.providers.has(preferred)) {
      const status = await this.providers.get(preferred)!.checkStatus();
      if (status.available) {
        this.activeProviderId = preferred;
        debug(`[Provider] Using preferred: ${preferred}`);
        return;
      }
      debug(`[Provider] Preferred provider '${preferred}' not available, auto-detecting...`);
    }

    // Auto-detect: try chrome-ai first, then byok
    const priority = ['chrome-ai', 'byok'];
    for (const id of priority) {
      const provider = this.providers.get(id);
      if (provider) {
        const status = await provider.checkStatus();
        if (status.available) {
          this.activeProviderId = id;
          debug(`[Provider] Auto-selected: ${id}`);
          return;
        }
      }
    }

    console.warn('[Provider] No provider available');
    this.activeProviderId = null;
  }

  /** Re-initialize after settings change */
  async refresh(): Promise<void> {
    await this.initialize();
  }

  /** Detect products using the active provider */
  async detectProducts(text: string): Promise<DetectionResult> {
    const provider = this.getActiveProvider();
    if (!provider) {
      console.warn('[Provider] No active provider');
      return { products: [], error: 'No AI provider available. Configure one in extension settings.' };
    }

    try {
      return await provider.detectProducts(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Provider] ${provider.id} detection failed:`, message);
      return { products: [], error: message };
    }
  }

  /**
   * Detect products in many texts, chunked to the provider's max batch size.
   * Each chunk is ONE model call. Returns product lists aligned with input.
   * On mid-batch failure, returns partial results + error (callers should
   * not cache entries produced after the error).
   */
  async detectProductsBatch(texts: string[]): Promise<BatchDetectionResult> {
    let provider = this.getActiveProvider();
    if (!provider) {
      // A provider may have become ready since startup (model finished
      // downloading, key just saved) — look again before giving up.
      await this.initialize();
      provider = this.getActiveProvider();
    }
    if (!provider) {
      console.warn('[Provider] No active provider');
      return {
        results: texts.map(() => []),
        error: 'No AI provider available. Configure one in extension settings.',
        errorCode: 'no_provider',
      };
    }

    const results: DetectedProduct[][] = [];
    try {
      for (const group of chunk(texts, provider.maxBatchSize)) {
        const r = await provider.detectProductsBatch(group);
        results.push(...r.results);
      }
      return { results };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Provider] ${provider.id} batch detection failed:`, message);
      // Pad to input length so callers can align results
      while (results.length < texts.length) results.push([]);
      return { results, error: message };
    }
  }

  getActiveProvider(): LLMProvider | null {
    if (!this.activeProviderId) return null;
    return this.providers.get(this.activeProviderId) || null;
  }

  getActiveProviderId(): string | null {
    return this.activeProviderId;
  }

  /** Get status of all registered providers (for settings UI) */
  async getAllStatuses(): Promise<Record<string, ProviderStatus>> {
    const statuses: Record<string, ProviderStatus> = {};
    for (const [id, provider] of this.providers) {
      statuses[id] = await provider.checkStatus();
    }
    return statuses;
  }
}
