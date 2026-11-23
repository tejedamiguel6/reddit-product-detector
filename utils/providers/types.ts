/**
 * Shared types for the LLM provider system.
 * All providers implement the LLMProvider interface so they're interchangeable.
 */

export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface DetectedProduct {
  name: string;
  category: string;
  /** How the commenter feels about the product (defaults to neutral) */
  sentiment?: Sentiment;
}

export interface DetectionResult {
  products: DetectedProduct[];
  error?: string;
}

/** Result of a batched detection: one product list per input text, same order */
export interface BatchDetectionResult {
  results: DetectedProduct[][];
  error?: string;
  /** Machine-readable reason, so the page can offer setup instead of failing silently */
  errorCode?: 'no_provider';
}

export interface ProviderStatus {
  available: boolean;
  status: 'ready' | 'downloadable' | 'downloading' | 'not_available' | 'not_configured' | 'error';
  message?: string;
}

export interface LLMProvider {
  /** Unique identifier (e.g. 'chrome-ai', 'byok', 'hosted') */
  id: string;
  /** Display name for settings UI */
  name: string;
  /**
   * Max texts this provider can handle in one batched call.
   * Small for on-device models (limited context), larger for cloud APIs.
   */
  maxBatchSize: number;
  /** Check if this provider is available and ready to use */
  checkStatus(): Promise<ProviderStatus>;
  /** Detect products in the given text */
  detectProducts(text: string): Promise<DetectionResult>;
  /**
   * Detect products in multiple texts with ONE model call.
   * Must return one product list per input, in the same order.
   */
  detectProductsBatch(texts: string[]): Promise<BatchDetectionResult>;
}
