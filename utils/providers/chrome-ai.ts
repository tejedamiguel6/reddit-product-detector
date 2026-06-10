/**
 * Chrome Built-in AI provider.
 * Uses the Prompt API (LanguageModel) available in Chrome 138+ for extensions.
 * Runs Gemini Nano on-device — free, private, no API key needed.
 */

import type { LLMProvider, ProviderStatus, DetectionResult, BatchDetectionResult } from './types';
import {
  SYSTEM_PROMPT,
  USER_PROMPT_TEMPLATE,
  PRODUCT_DETECTION_SCHEMA,
  BATCH_USER_PROMPT_TEMPLATE,
  BATCH_DETECTION_SCHEMA,
} from './prompts';
import { parseBatchResponse } from './batch-utils';

// Type declarations for Chrome's LanguageModel API
// These aren't in standard TypeScript libs yet
declare global {
  interface LanguageModelSession {
    prompt(input: string, options?: { responseConstraint?: object }): Promise<string>;
    destroy(): void;
  }

  interface LanguageModelCreateOptions {
    initialPrompts?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  }

  // eslint-disable-next-line no-var
  var LanguageModel: {
    availability(): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
    create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
  };
}

export class ChromeAIProvider implements LLMProvider {
  id = 'chrome-ai';
  name = 'Built-in AI (Recommended)';
  // Gemini Nano has a small context window — keep batches modest.
  maxBatchSize = 3;

  private session: LanguageModelSession | null = null;

  async checkStatus(): Promise<ProviderStatus> {
    // Check if LanguageModel API exists in this context
    if (typeof LanguageModel === 'undefined') {
      return {
        available: false,
        status: 'not_available',
        message: 'Chrome Built-in AI not supported. Update Chrome to version 138+.',
      };
    }

    try {
      const availability = await LanguageModel.availability();

      switch (availability) {
        case 'available':
          return { available: true, status: 'ready' };
        case 'downloadable':
          return {
            available: false,
            status: 'downloadable',
            message: 'Free on-device AI. Requires a one-time 22GB download.',
          };
        case 'downloading':
          return {
            available: false,
            status: 'downloading',
            message: 'AI model is downloading...',
          };
        default:
          return {
            available: false,
            status: 'not_available',
            message: 'Built-in AI not available on this device.',
          };
      }
    } catch (error) {
      return {
        available: false,
        status: 'error',
        message: `Failed to check AI availability: ${error}`,
      };
    }
  }

  /**
   * Trigger the model download by creating (and immediately destroying) a session.
   * Chrome handles the download automatically. Returns the updated status.
   */
  async triggerDownload(): Promise<ProviderStatus> {
    if (typeof LanguageModel === 'undefined') {
      return { available: false, status: 'not_available', message: 'Chrome AI not supported.' };
    }

    try {
      // Creating a session triggers the download if model isn't present
      const session = await LanguageModel.create({
        initialPrompts: [
          { role: 'system', content: SYSTEM_PROMPT },
        ],
      });
      // If we get here, model was already available or just finished downloading
      this.session = session;
      return { available: true, status: 'ready' };
    } catch (error) {
      // Check if it's now downloading
      try {
        const availability = await LanguageModel.availability();
        if (availability === 'downloading') {
          return {
            available: false,
            status: 'downloading',
            message: 'AI model is downloading... This may take a few minutes.',
          };
        }
      } catch {
        // Ignore nested error
      }
      return {
        available: false,
        status: 'error',
        message: `Download failed: ${error instanceof Error ? error.message : error}`,
      };
    }
  }

  private async ensureSession(): Promise<LanguageModelSession> {
    if (!this.session) {
      const availability = await LanguageModel.availability();
      if (availability !== 'available') {
        throw new Error('Chrome AI model not downloaded yet. Enable it in extension settings.');
      }
      this.session = await LanguageModel.create({
        initialPrompts: [
          { role: 'system', content: SYSTEM_PROMPT },
        ],
      });
    }
    return this.session;
  }

  /** Detect products in several comments with ONE on-device model call */
  async detectProductsBatch(texts: string[]): Promise<BatchDetectionResult> {
    if (texts.length === 0) return { results: [] };
    const session = await this.ensureSession();

    try {
      const response = await session.prompt(
        BATCH_USER_PROMPT_TEMPLATE(texts),
        { responseConstraint: BATCH_DETECTION_SCHEMA }
      );
      return parseBatchResponse(response, texts.length);
    } catch (error) {
      // If session is broken, destroy and retry next time
      this.destroy();
      throw error;
    }
  }

  async detectProducts(text: string): Promise<DetectionResult> {
    const session = await this.ensureSession();

    try {
      const response = await session.prompt(
        USER_PROMPT_TEMPLATE(text),
        { responseConstraint: PRODUCT_DETECTION_SCHEMA }
      );

      const parsed = JSON.parse(response);

      // Validate output shape
      if (!parsed.products || !Array.isArray(parsed.products)) {
        return { products: [] };
      }

      // Filter to valid entries only
      return {
        products: parsed.products.filter(
          (p: { name?: unknown; category?: unknown }) =>
            typeof p.name === 'string' &&
            p.name.length > 0 &&
            p.name.length <= 200 &&
            typeof p.category === 'string' &&
            p.category.length > 0
        ),
      };
    } catch (error) {
      // If session is broken, destroy and retry next time
      this.destroy();
      throw error;
    }
  }

  /** Destroy the session to free resources */
  destroy(): void {
    if (this.session) {
      try {
        this.session.destroy();
      } catch {
        // Ignore destroy errors
      }
      this.session = null;
    }
  }
}
