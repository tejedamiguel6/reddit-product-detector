/**
 * BYOK (Bring Your Own Key) provider.
 * Calls OpenAI, Anthropic, or Google APIs directly from the service worker.
 * User provides their own API key — no server needed.
 */

import type { LLMProvider, ProviderStatus, DetectionResult, BatchDetectionResult } from './types';
import { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, BATCH_USER_PROMPT_TEMPLATE } from './prompts';
import { parseBatchResponse, normalizeProducts } from './batch-utils';

export interface BYOKConfig {
  provider: 'openai' | 'anthropic' | 'google';
  apiKey: string;
  model?: string;
}

/** Default models per provider — small, fast, cheap */
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  google: 'gemini-2.0-flash',
};

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT = 15000;

export class BYOKProvider implements LLMProvider {
  id = 'byok';
  name = 'Your API Key';
  // Cloud models handle large contexts — batch aggressively to cut cost.
  maxBatchSize = 8;

  private async getConfig(): Promise<BYOKConfig | null> {
    const result = await browser.storage.local.get('byokConfig') as { byokConfig?: BYOKConfig };
    return result.byokConfig || null;
  }

  async checkStatus(): Promise<ProviderStatus> {
    const config = await this.getConfig();

    if (!config || !config.apiKey || !config.provider) {
      return {
        available: false,
        status: 'not_configured',
        message: 'No API key configured.',
      };
    }

    return {
      available: true,
      status: 'ready',
      message: `Using ${config.provider} (${config.model || DEFAULT_MODELS[config.provider]})`,
    };
  }

  async detectProducts(text: string): Promise<DetectionResult> {
    const raw = await this.callModel(USER_PROMPT_TEMPLATE(text), 500);
    return this.parseResponse(raw);
  }

  /** Detect products in several comments with ONE API call */
  async detectProductsBatch(texts: string[]): Promise<BatchDetectionResult> {
    if (texts.length === 0) return { results: [] };
    const raw = await this.callModel(
      BATCH_USER_PROMPT_TEMPLATE(texts),
      // More output room for multi-comment results
      Math.min(4000, 500 + texts.length * 300),
    );
    return parseBatchResponse(raw, texts.length);
  }

  /** Route a prompt to the configured vendor, returning the raw JSON string */
  private async callModel(userPrompt: string, maxTokens: number): Promise<string> {
    const config = await this.getConfig();
    if (!config || !config.apiKey) {
      throw new Error('BYOK not configured. Add an API key in settings.');
    }

    switch (config.provider) {
      case 'openai':
        return this.callOpenAI(userPrompt, config.apiKey, maxTokens, config.model);
      case 'anthropic':
        return this.callAnthropic(userPrompt, config.apiKey, maxTokens, config.model);
      case 'google':
        return this.callGoogle(userPrompt, config.apiKey, maxTokens, config.model);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  // ─── OpenAI ────────────────────────────────────────────────

  private async callOpenAI(
    userPrompt: string,
    apiKey: string,
    maxTokens: number,
    model?: string
  ): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODELS.openai,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // ─── Anthropic ─────────────────────────────────────────────

  private async callAnthropic(
    userPrompt: string,
    apiKey: string,
    maxTokens: number,
    model?: string
  ): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODELS.anthropic,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  // ─── Google Gemini ─────────────────────────────────────────

  private async callGoogle(
    userPrompt: string,
    apiKey: string,
    maxTokens: number,
    model?: string
  ): Promise<string> {
    const modelId = model || DEFAULT_MODELS.google;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            { parts: [{ text: userPrompt }] },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: maxTokens,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Google AI error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  // ─── Response parsing ──────────────────────────────────────

  private parseResponse(raw: string): DetectionResult {
    try {
      const parsed = JSON.parse(raw);
      return { products: normalizeProducts(parsed?.products) };
    } catch {
      console.error('[BYOK] Failed to parse LLM response:', raw.slice(0, 200));
      return { products: [] };
    }
  }
}
