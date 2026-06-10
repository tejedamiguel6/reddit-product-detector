import { useEffect, useState, useCallback, useRef } from 'react';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { observeContent } from '@/utils/comment-observer';
import {
  detectProducts,
  isAlreadyProcessed,
  markAsProcessed,
  type ProductMatch,
} from '@/utils/product-detector';
import { HoverCard } from './HoverCard';
import { ThreadSummaryPanel, type ThreadProduct } from './ThreadSummaryPanel';
import type { SiteConfig } from '@/utils/site-settings';
import type { Sentiment } from '@/utils/providers/types';

interface Props {
  ctx: ContentScriptContext;
  siteConfig: SiteConfig | null;
}

interface HoverState {
  productText: string;
  category?: string;
  sentiment?: Sentiment;
  position: { x: number; y: number };
}

// CSS to inject into the page (avoids CSP inline style issues)
// Underline color reflects the commenter's sentiment toward the product:
// green = recommended, red = warned against, orange = neutral/unclear
const HIGHLIGHT_CSS = `
.pd-highlight {
  background-color: rgba(255, 215, 0, 0.3) !important;
  border-bottom: 2px solid #ffa500 !important;
  cursor: pointer !important;
  padding: 0 2px !important;
  border-radius: 2px !important;
}
.pd-highlight:hover {
  background-color: rgba(255, 165, 0, 0.5) !important;
}
.pd-highlight.pd-positive {
  background-color: rgba(70, 200, 120, 0.25) !important;
  border-bottom-color: #2ecc71 !important;
}
.pd-highlight.pd-positive:hover {
  background-color: rgba(70, 200, 120, 0.45) !important;
}
.pd-highlight.pd-negative {
  background-color: rgba(231, 76, 60, 0.2) !important;
  border-bottom-color: #e74c3c !important;
}
.pd-highlight.pd-negative:hover {
  background-color: rgba(231, 76, 60, 0.4) !important;
}
`;

// Inject styles once
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = HIGHLIGHT_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

export function ProductDetectorApp({ ctx, siteConfig }: Props) {
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  // Aggregate of every product detected on this page, keyed by lowercased name
  const [threadProducts, setThreadProducts] = useState<Map<string, ThreadProduct>>(
    () => new Map()
  );

  /**
   * Register detected products into the thread summary.
   * Counts each product once per comment (mention = a comment that names it),
   * and tallies sentiment across comments.
   */
  const registerProducts = useCallback((matches: ProductMatch[]) => {
    if (matches.length === 0) return;

    // Dedupe within this comment — one mention per product per comment
    const seen = new Map<string, ProductMatch>();
    for (const match of matches) {
      const key = match.name.toLowerCase();
      if (!seen.has(key)) seen.set(key, match);
    }

    setThreadProducts((prev) => {
      const next = new Map(prev);
      for (const [key, match] of seen) {
        const existing = next.get(key);
        const sentiment: Sentiment = match.sentiment ?? 'neutral';
        if (existing) {
          next.set(key, {
            ...existing,
            mentions: existing.mentions + 1,
            positive: existing.positive + (sentiment === 'positive' ? 1 : 0),
            negative: existing.negative + (sentiment === 'negative' ? 1 : 0),
            neutral: existing.neutral + (sentiment === 'neutral' ? 1 : 0),
          });
        } else {
          next.set(key, {
            name: match.name,
            category: match.category,
            mentions: 1,
            positive: sentiment === 'positive' ? 1 : 0,
            negative: sentiment === 'negative' ? 1 : 0,
            neutral: sentiment === 'neutral' ? 1 : 0,
          });
        }
      }
      return next;
    });
  }, []);
  const hoverTimeoutRef = useRef<number | null>(null);
  const processingRef = useRef<Set<Element>>(new Set());
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const pendingElementsRef = useRef<Set<Element>>(new Set());

  // Clear hover with a small delay (allows moving to the card)
  const clearHoverWithDelay = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoverState(null);
    }, 150);
  }, []);

  // Cancel the clear timeout (when entering card or highlight)
  const cancelClearHover = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  /**
   * Highlight products in a text node based on matches
   */
  const highlightProducts = useCallback(
    (textNode: Text, matches: ProductMatch[]) => {
      if (matches.length === 0) return;

      // Ensure styles are injected
      injectStyles();

      const text = textNode.textContent || '';
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;

      // Sort matches by startIndex
      const sortedMatches = [...matches].sort((a, b) => a.startIndex - b.startIndex);

      for (const match of sortedMatches) {
        // Add text before this match
        if (match.startIndex > lastIndex) {
          fragment.appendChild(
            document.createTextNode(text.slice(lastIndex, match.startIndex))
          );
        }

        // Create the highlight span
        const span = document.createElement('span');
        span.className = 'pd-highlight';
        if (match.sentiment === 'positive') span.classList.add('pd-positive');
        if (match.sentiment === 'negative') span.classList.add('pd-negative');
        span.textContent = match.name;
        span.dataset.productName = match.name;
        if (match.category) {
          span.dataset.productCategory = match.category;
        }

        // Add hover listeners
        span.addEventListener('mouseenter', () => {
          cancelClearHover();
          const rect = span.getBoundingClientRect();
          setHoverState({
            productText: match.name,
            category: match.category,
            sentiment: match.sentiment,
            position: {
              x: rect.left,
              y: rect.bottom + 8,
            },
          });
        });

        span.addEventListener('mouseleave', () => {
          clearHoverWithDelay();
        });

        fragment.appendChild(span);
        lastIndex = match.endIndex;
      }

      // Add remaining text after last match
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      // Replace the text node
      textNode.parentNode?.replaceChild(fragment, textNode);
    },
    [cancelClearHover, clearHoverWithDelay]
  );

  /**
   * Process a content element to find and highlight products
   */
  const processContent = useCallback(
    async (element: Element) => {
      if (isAlreadyProcessed(element)) return;
      if (processingRef.current.has(element)) return;

      processingRef.current.add(element);
      markAsProcessed(element);

      // Get all text content from the element
      const fullText = element.textContent || '';

      if (fullText.trim().length < 20) {
        processingRef.current.delete(element);
        return;
      }

      console.log('[Product Detector] Processing content:', fullText.slice(0, 80) + '...');

      try {
        // Call AI to detect products in the full text
        const matches = await detectProducts(fullText);

        // Feed the thread summary (counts each product once per comment)
        registerProducts(matches);

        if (matches.length > 0) {
          console.log('[Product Detector] AI found products:', matches.map(m => m.name));

          // Walk through text nodes and highlight matches
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null
          );

          const textNodes: Text[] = [];
          while (walker.nextNode()) {
            textNodes.push(walker.currentNode as Text);
          }

          // For each text node, find which matches apply to it
          let textOffset = 0;
          for (const textNode of textNodes) {
            const nodeText = textNode.textContent || '';
            const nodeStart = textOffset;
            const nodeEnd = textOffset + nodeText.length;

            // Find matches that fall within this text node
            const nodeMatches: ProductMatch[] = [];
            for (const match of matches) {
              if (match.startIndex >= nodeStart && match.endIndex <= nodeEnd) {
                // Adjust indices to be relative to this text node
                nodeMatches.push({
                  ...match,
                  startIndex: match.startIndex - nodeStart,
                  endIndex: match.endIndex - nodeStart,
                });
              }
            }

            if (nodeMatches.length > 0) {
              highlightProducts(textNode, nodeMatches);
            }

            textOffset = nodeEnd;
          }
        }
      } catch (error) {
        console.error('[Product Detector] Error processing content:', error);
      } finally {
        processingRef.current.delete(element);
      }
    },
    [highlightProducts, registerProducts]
  );

  /**
   * Handle newly found content elements - queue them for viewport detection
   */
  const onContentFound = useCallback(
    (elements: Element[]) => {
      const observer = intersectionObserverRef.current;
      if (!observer) return;

      for (const element of elements) {
        // Skip if already processed or pending
        if (isAlreadyProcessed(element) || pendingElementsRef.current.has(element)) {
          continue;
        }
        // Add to pending and observe for visibility
        pendingElementsRef.current.add(element);
        observer.observe(element);
      }
    },
    []
  );

  // Set up the IntersectionObserver for lazy processing
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const element = entry.target;
            // Stop observing this element
            observer.unobserve(element);
            pendingElementsRef.current.delete(element);
            // Process it now that it's visible
            processContent(element);
          }
        }
      },
      {
        // Start processing slightly before element enters viewport
        rootMargin: '100px 0px',
        threshold: 0,
      }
    );

    intersectionObserverRef.current = observer;

    return () => {
      observer.disconnect();
      intersectionObserverRef.current = null;
    };
  }, [processContent]);

  // Set up the content observer
  useEffect(() => {
    const observer = observeContent(ctx, siteConfig, onContentFound);

    return () => {
      observer.disconnect();
    };
  }, [ctx, siteConfig, onContentFound]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      {hoverState && (
        <HoverCard
          position={hoverState.position}
          productText={hoverState.productText}
          category={hoverState.category}
          sentiment={hoverState.sentiment}
          onMouseEnter={cancelClearHover}
          onMouseLeave={clearHoverWithDelay}
        />
      )}
      <ThreadSummaryPanel products={threadProducts} />
    </>
  );
}
