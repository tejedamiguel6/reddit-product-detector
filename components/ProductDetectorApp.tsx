import { debug } from '@/utils/log';
import { useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { observeContent } from '@/utils/comment-observer';
import {
  detectProducts,
  isAlreadyProcessed,
  markAsProcessed,
  onNoProvider,
  type ProductMatch,
} from '@/utils/product-detector';
import { HoverCard, type HoverAnchor } from './HoverCard';
import { injectHighlightStyles, setHighlightTheme } from '@/utils/highlight-styles';
import { watchPageTheme } from '@/utils/page-theme';
import { PortalTargetContext } from '@/contexts/PortalTargetContext';
import { ThreadSummaryPanel } from './ThreadSummaryPanel';
import { SetupNudge } from './SetupNudge';
import { UI_CSS } from './ui-styles';
import {
  buildThreadProducts,
  extractQuote,
  findThreadProduct,
  topPick,
  type CommentDetection,
  type ThreadProduct,
} from '@/utils/thread-products';
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
  anchor: HoverAnchor;
  /** The comment the hovered name sits in */
  commentElement: Element | null;
}

export interface ScanProgress {
  done: number;
  total: number;
}

// How many comments "read the rest" hands to the model at a time. Small
// enough that progress moves and Cancel takes effect quickly.
const SCAN_GROUP_SIZE = 6;

// Pause before a card opens, so sweeping the mouse across a paragraph
// doesn't fire a card for every name on the way.
const HOVER_OPEN_DELAY_MS = 140;

export function ProductDetectorApp({ ctx, siteConfig }: Props) {
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  // Every product detected on this page, ranked for the summary panel
  const [threadProducts, setThreadProducts] = useState<ThreadProduct[]>([]);
  // How many comments have been analysed so far (with or without products)
  const [commentsRead, setCommentsRead] = useState(0);
  // Comments found on the page but not analysed yet (not scrolled to)
  const [pendingCount, setPendingCount] = useState(0);
  // Progress of "read the rest of this page", or null when not running
  const [scan, setScan] = useState<ScanProgress | null>(null);
  const scanRunRef = useRef<{ cancelled: boolean } | null>(null);
  // Latest summary, readable from message listeners without re-subscribing
  const summaryRef = useRef({ products: threadProducts, commentsRead });
  summaryRef.current = { products: threadProducts, commentsRead };

  // What each analysed comment contributed. The summary is rebuilt from the
  // comments still attached to the document, so products from a thread the
  // user navigated away from (Reddit swaps pages without a reload) drop out.
  const resultsRef = useRef<Map<Element, CommentDetection[]>>(new Map());

  const rebuildSummary = useCallback(() => {
    const results = resultsRef.current;
    for (const element of results.keys()) {
      if (!element.isConnected) results.delete(element);
    }
    setCommentsRead(results.size);
    setThreadProducts(
      buildThreadProducts(
        [...results].map(([element, detections]) => ({ element, detections }))
      )
    );
  }, []);

  /**
   * Record one comment's detections: each product once per comment, with the
   * sentence that names it.
   */
  const registerComment = useCallback(
    (element: Element, fullText: string, matches: ProductMatch[]) => {
      const seen = new Set<string>();
      const detections: CommentDetection[] = [];
      for (const match of matches) {
        const key = match.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        detections.push({
          name: match.name,
          category: match.category,
          sentiment: match.sentiment ?? 'neutral',
          quote: extractQuote(fullText, match.startIndex, match.endIndex),
        });
      }
      resultsRef.current.set(element, detections);
      rebuildSummary();
    },
    [rebuildSummary]
  );

  // In-page navigation (Reddit, Product Hunt): the old thread's comments are
  // removed a moment after the URL changes, so rebuild now and again shortly.
  useEffect(() => {
    let lastPath = window.location.pathname;
    let timer: number | undefined;
    ctx.addEventListener(window, 'wxt:locationchange', () => {
      if (window.location.pathname === lastPath) return;
      lastPath = window.location.pathname;
      setHoverState(null);
      if (scanRunRef.current) scanRunRef.current.cancelled = true;
      rebuildSummary();
      window.clearTimeout(timer);
      timer = window.setTimeout(rebuildSummary, 1500);
    });
    return () => window.clearTimeout(timer);
  }, [ctx, rebuildSummary]);

  const hoverTimeoutRef = useRef<number | null>(null);
  const hoverOpenRef = useRef<number | undefined>(undefined);
  const hoverVisibleRef = useRef(false);
  hoverVisibleRef.current = hoverState !== null;

  // The card is pinned to the viewport, so it would drift away from its
  // name while scrolling. Close it instead.
  useEffect(() => {
    if (!hoverState) return;
    const close = () => setHoverState(null);
    window.addEventListener('scroll', close, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, [hoverState !== null]);
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
      injectHighlightStyles();

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
          const show = () => {
            const rect = span.getBoundingClientRect();
            setHoverState({
              productText: match.name,
              category: match.category,
              sentiment: match.sentiment,
              anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
              commentElement: span.closest('[data-rpd-scanned]'),
            });
          };
          window.clearTimeout(hoverOpenRef.current);
          // Already showing a card: switch straight away. Otherwise wait a beat.
          if (hoverVisibleRef.current) show();
          else hoverOpenRef.current = window.setTimeout(show, HOVER_OPEN_DELAY_MS);
        });

        span.addEventListener('mouseleave', () => {
          window.clearTimeout(hoverOpenRef.current);
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

      debug('[Product Detector] Processing content:', fullText.slice(0, 80) + '...');

      try {
        // Call AI to detect products in the full text
        const matches = await detectProducts(fullText);

        // The comment may have been removed while the model was working
        if (!element.isConnected) return;

        // Feed the thread summary (counts each product once per comment)
        registerComment(element, fullText, matches);

        if (matches.length > 0) {
          debug('[Product Detector] AI found products:', matches.map(m => m.name));

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
    [highlightProducts, registerComment]
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
      setPendingCount(pendingElementsRef.current.size);
    },
    []
  );

  /**
   * Analyse every comment on the page that hasn't been scrolled to yet, a
   * few at a time, so the summary covers the whole loaded thread.
   */
  const scanRest = useCallback(async () => {
    if (scanRunRef.current) return;
    const run = { cancelled: false };
    scanRunRef.current = run;

    const pending = pendingElementsRef.current;
    const elements = [...pending].filter((el) => el.isConnected);
    setScan({ done: 0, total: elements.length });

    for (let i = 0; i < elements.length && !run.cancelled; i += SCAN_GROUP_SIZE) {
      const group = elements.slice(i, i + SCAN_GROUP_SIZE);
      for (const element of group) {
        intersectionObserverRef.current?.unobserve(element);
        pending.delete(element);
      }
      await Promise.all(group.map(processContent));
      if (!run.cancelled) {
        setScan({ done: Math.min(i + SCAN_GROUP_SIZE, elements.length), total: elements.length });
      }
      setPendingCount(pending.size);
    }

    if (scanRunRef.current === run) scanRunRef.current = null;
    setScan(null);
  }, [processContent]);

  const cancelScan = useCallback(() => {
    if (scanRunRef.current) scanRunRef.current.cancelled = true;
    scanRunRef.current = null;
    setScan(null);
  }, []);

  // Stop reading ahead if the AI turns out not to be set up
  useEffect(() => onNoProvider(cancelScan), [cancelScan]);

  // Let the toolbar popup show what was found on this page
  useEffect(() => {
    const listener = (
      message: { type?: string },
      _sender: unknown,
      sendResponse: (response: unknown) => void
    ) => {
      if (message?.type !== 'GET_PAGE_SUMMARY') return;
      const products = summaryRef.current.products;
      sendResponse({
        productCount: products.length,
        commentsRead: summaryRef.current.commentsRead,
        topPick: topPick(products)?.name ?? null,
      });
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

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
        setPendingCount(pendingElementsRef.current.size);
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

  // Match the host page: light or dark, and follow it if the page switches
  const portalTarget = useContext(PortalTargetContext);
  useEffect(() => {
    const root = portalTarget?.getRootNode();
    const host = root instanceof ShadowRoot ? root.host : null;
    return watchPageTheme((theme) => {
      host?.setAttribute('data-pd-theme', theme);
      setHighlightTheme(theme);
    });
  }, [portalTarget]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      window.clearTimeout(hoverOpenRef.current);
    };
  }, []);

  return (
    <>
      <style>{UI_CSS}</style>
      <SetupNudge />
      {hoverState && (
        <HoverCard
          anchor={hoverState.anchor}
          productText={hoverState.productText}
          category={hoverState.category}
          sentiment={hoverState.sentiment}
          threadProduct={findThreadProduct(threadProducts, hoverState.productText)}
          commentElement={hoverState.commentElement}
          onMouseEnter={cancelClearHover}
          onMouseLeave={clearHoverWithDelay}
        />
      )}
      <ThreadSummaryPanel
        products={threadProducts}
        commentsRead={commentsRead}
        pendingCount={pendingCount}
        scan={scan}
        onScanRest={scanRest}
        onCancelScan={cancelScan}
      />
    </>
  );
}
