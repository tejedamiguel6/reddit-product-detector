/**
 * Thread-level aggregation: turns per-comment detections into the ranked
 * product list shown in the summary panel.
 *
 * Pure functions, rebuilt from scratch whenever the set of analysed comments
 * changes. That keeps the summary honest across in-page navigation: only
 * comments still attached to the document are counted.
 */

import type { Sentiment } from './providers/types';

/** One comment's opinion of one product */
export interface ThreadMention {
  sentiment: Sentiment;
  /** The sentence from the comment that names the product */
  quote: string;
  /** The comment element, for "jump to comment" */
  element: Element;
}

export interface ThreadProduct {
  /** Stable identity (normalised name) */
  key: string;
  /** Display name: the fullest spelling seen in the thread */
  name: string;
  category?: string;
  /** One entry per comment that names the product */
  mentions: ThreadMention[];
  positive: number;
  negative: number;
  neutral: number;
}

/** What one analysed comment contributed */
export interface CommentDetection {
  name: string;
  category?: string;
  sentiment: Sentiment;
  quote: string;
}

export type Verdict = 'recommended' | 'divisive' | 'warned' | 'mentioned';

/** Lowercased word tokens with punctuation and hyphens removed */
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
}

function keyOf(tokens: string[], name: string): string {
  return tokens.length > 0 ? tokens.join(' ') : name.toLowerCase().trim();
}

/**
 * True when `short` is the same product as `long` minus a leading brand,
 * e.g. "WH-1000XM5" vs "Sony WH-1000XM5", "AirPods Pro" vs "Apple AirPods Pro".
 *
 * Only trailing matches count: "iPhone 15" is NOT merged into "iPhone 15 Pro"
 * because those are different products. A single trailing word must be
 * distinctive (a model number, or a longer word) so "Pro" or "Max" alone
 * never merges anything.
 */
function isBrandlessVariant(short: string[], long: string[]): boolean {
  if (short.length === 0 || short.length >= long.length) return false;
  const offset = long.length - short.length;
  for (let i = 0; i < short.length; i++) {
    if (short[i] !== long[offset + i]) return false;
  }
  if (short.length >= 2) return true;
  const only = short[0];
  return only.length >= 5 || (only.length >= 3 && /\d/.test(only));
}

/**
 * Aggregate detections from every analysed comment into one entry per
 * product. Each comment counts once per product, however often it repeats
 * the name.
 */
export function buildThreadProducts(
  comments: Iterable<{ element: Element; detections: CommentDetection[] }>
): ThreadProduct[] {
  const list = [...comments];

  // 1. Collect every distinct spelling
  const spellings = new Map<string, { tokens: string[]; name: string }>();
  for (const { detections } of list) {
    for (const d of detections) {
      const tokens = tokenize(d.name);
      const key = keyOf(tokens, d.name);
      if (!spellings.has(key)) spellings.set(key, { tokens, name: d.name });
    }
  }

  // 2. Point brandless spellings at their fullest spelling
  const canonical = new Map<string, string>();
  for (const [key, { tokens }] of spellings) {
    let target = key;
    let targetLength = tokens.length;
    for (const [otherKey, other] of spellings) {
      if (other.tokens.length > targetLength && isBrandlessVariant(tokens, other.tokens)) {
        target = otherKey;
        targetLength = other.tokens.length;
      }
    }
    canonical.set(key, target);
  }

  // 3. Tally, one mention per product per comment
  const products = new Map<string, ThreadProduct>();
  for (const { element, detections } of list) {
    const seenInComment = new Set<string>();
    for (const d of detections) {
      const rawKey = keyOf(tokenize(d.name), d.name);
      const key = canonical.get(rawKey) ?? rawKey;
      if (seenInComment.has(key)) continue;
      seenInComment.add(key);

      let product = products.get(key);
      if (!product) {
        product = {
          key,
          name: spellings.get(key)?.name ?? d.name,
          category: d.category,
          mentions: [],
          positive: 0,
          negative: 0,
          neutral: 0,
        };
        products.set(key, product);
      }
      if (!product.category && d.category) product.category = d.category;
      product.mentions.push({ sentiment: d.sentiment, quote: d.quote, element });
      product[d.sentiment]++;
    }
  }

  return [...products.values()].sort(
    (a, b) =>
      b.mentions.length - a.mentions.length ||
      b.positive - b.negative - (a.positive - a.negative) ||
      a.name.localeCompare(b.name)
  );
}

/**
 * Find the thread entry for a name as it appears in one comment, including
 * brandless spellings that were merged into a fuller name.
 */
export function findThreadProduct(
  products: ThreadProduct[],
  name: string
): ThreadProduct | null {
  const tokens = tokenize(name);
  const key = keyOf(tokens, name);
  return (
    products.find((p) => p.key === key) ??
    products.find((p) => isBrandlessVariant(tokens, p.key.split(' '))) ??
    null
  );
}

/** Where the thread lands on a product */
export function verdictOf(p: ThreadProduct): Verdict {
  const opinions = p.positive + p.negative;
  if (opinions === 0) return 'mentioned';
  // Divisive: both sides present and the minority is at least a third
  if (p.positive > 0 && p.negative > 0 && Math.min(p.positive, p.negative) / opinions >= 1 / 3) {
    return 'divisive';
  }
  return p.positive > p.negative ? 'recommended' : 'warned';
}

/**
 * The product the thread most clearly recommends, or null when nothing has
 * at least two recommendations (one comment is not a consensus).
 */
export function topPick(products: ThreadProduct[]): ThreadProduct | null {
  let best: ThreadProduct | null = null;
  for (const p of products) {
    if (p.positive < 2 || verdictOf(p) !== 'recommended') continue;
    if (!best || p.positive - p.negative > best.positive - best.negative) best = p;
  }
  return best;
}

/**
 * The mention that best represents the thread's view of a product: one that
 * agrees with the overall verdict, preferring a substantial sentence over a
 * one-liner or a wall of text.
 */
export function bestMention(p: ThreadProduct): ThreadMention | null {
  if (p.mentions.length === 0) return null;
  const verdict = verdictOf(p);
  const wanted: Sentiment | null =
    verdict === 'recommended' ? 'positive' : verdict === 'warned' ? 'negative' : null;

  let best: ThreadMention | null = null;
  let bestScore = -Infinity;
  for (const m of p.mentions) {
    const length = m.quote.length;
    let score = 0;
    if (wanted && m.sentiment === wanted) score += 3;
    if (!wanted && m.sentiment !== 'neutral') score += 1;
    if (length >= 40 && length <= 180) score += 2;
    else if (length >= 20) score += 1;
    if (score > bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

const QUOTE_MAX = 180;

/**
 * Pull the sentence around a match out of a comment. Uses the comment's own
 * words (no model call), trimmed to a readable length around the product name.
 */
export function extractQuote(text: string, start: number, end: number): string {
  const isBoundary = (ch: string) => ch === '.' || ch === '!' || ch === '?' || ch === '\n';

  let from = start;
  while (from > 0 && !isBoundary(text[from - 1])) from--;
  let to = end;
  while (to < text.length && !isBoundary(text[to])) to++;
  if (to < text.length && text[to] !== '\n') to++; // keep the closing punctuation

  let prefix = '';
  let suffix = '';
  if (to - from > QUOTE_MAX) {
    // Sentence is too long: keep a window around the product name
    const room = Math.max(0, QUOTE_MAX - (end - start));
    const newFrom = Math.max(from, start - Math.floor(room / 3));
    const newTo = Math.min(to, newFrom + QUOTE_MAX);
    if (newFrom > from) prefix = '…';
    if (newTo < to) suffix = '…';
    from = newFrom;
    to = newTo;
  }

  return prefix + text.slice(from, to).replace(/\s+/g, ' ').trim() + suffix;
}

const VERDICT_WORDS: Record<Verdict, string> = {
  recommended: 'recommended',
  divisive: 'divisive',
  warned: 'warned against',
  mentioned: 'mentioned',
};

/**
 * Plain-text version of the summary, for "Copy summary". Meant to be pasted
 * into a message to a friend, so it says how many comments it is based on.
 */
export function formatSummary(
  products: ThreadProduct[],
  commentsRead: number,
  pageTitle: string,
  pageUrl: string
): string {
  const pick = topPick(products);
  const lines: string[] = [`What this thread recommends: ${pageTitle.trim()}`, pageUrl, ''];

  if (pick) {
    lines.push(
      `Top pick: ${pick.name} (recommended in ${pick.positive} of ${pick.mentions.length} comments that mention it)`
    );
    const quote = bestMention(pick);
    if (quote) lines.push(`  "${quote.quote}"`);
    lines.push('');
  }

  for (const p of products) {
    if (p === pick) continue;
    const counts = [
      p.positive > 0 && `${p.positive} for`,
      p.negative > 0 && `${p.negative} against`,
      p.neutral > 0 && `${p.neutral} neutral`,
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`- ${p.name}: ${VERDICT_WORDS[verdictOf(p)]} (${counts})`);
  }

  lines.push('', `Based on ${commentsRead} comment${commentsRead === 1 ? '' : 's'}, summarised by Product Detector.`);
  return lines.join('\n');
}
