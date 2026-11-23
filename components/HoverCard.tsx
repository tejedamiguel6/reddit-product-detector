/**
 * Hover card for a highlighted product.
 *
 * Shows what this comment thinks of the product, what the rest of the thread
 * thinks (consensus bar, tally and a quote from another comment), and two
 * quiet search links. The picture is optional: without one the card shows a
 * monogram tile straight away, so it never looks broken or makes you wait.
 */

import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PortalTargetContext } from '@/contexts/PortalTargetContext';
import { getCachedProductInfo, cacheProductInfo } from '@/utils/product-info-cache';
import { buildSearchLinks, affiliateEnabled, isPhysicalProduct } from '@/utils/affiliate';
import { bestMention, verdictOf, type ThreadProduct, type Verdict } from '@/utils/thread-products';
import { debug } from '@/utils/log';

export interface HoverAnchor {
  left: number;
  top: number;
  bottom: number;
}

interface HoverCardProps {
  /** Viewport rectangle of the highlighted name */
  anchor: HoverAnchor;
  productText: string;
  category?: string;
  /** What the hovered comment thinks */
  sentiment?: 'positive' | 'negative' | 'neutral';
  /** The thread-wide entry for this product, when known */
  threadProduct?: ThreadProduct | null;
  /** The comment being hovered, so the quote can come from a different one */
  commentElement?: Element | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const COMMENT_BADGE: Record<string, { label: string; className: string }> = {
  positive: { label: 'This comment recommends it', className: 'pd-chip-pos' },
  negative: { label: 'This comment warns against it', className: 'pd-chip-neg' },
};

const THREAD_VERDICT: Record<Verdict, string> = {
  recommended: 'Thread recommends it',
  divisive: 'Thread is divided',
  warned: 'Thread warns against it',
  mentioned: 'Mentioned in the thread',
};

const CARD_WIDTH = 320;
const GAP = 8;

/** Up to two initials for the picture placeholder, e.g. "Sony WH-1000XM5" -> "SW" */
function monogram(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  return words
    .slice(0, 2)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase())
    .join('');
}

export function HoverCard({
  anchor,
  productText,
  category,
  sentiment,
  threadProduct,
  commentElement,
  onMouseEnter,
  onMouseLeave,
}: HoverCardProps) {
  const portalTarget = useContext(PortalTargetContext);
  const cardRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  // Measured after render so the card can flip above the name near the bottom
  const [top, setTop] = useState<number | null>(null);

  // Optional picture: only arrives if the user has set up image search
  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setImageLoaded(false);

    const cached = getCachedProductInfo(productText, category);
    if (cached) {
      setImage(cached.image);
      return;
    }

    // Started inside a promise so a synchronous throw (the extension was
    // reloaded while this page stayed open) can't take the whole UI down.
    Promise.resolve()
      .then(() =>
        browser.runtime.sendMessage({
          type: 'GET_PRODUCT_INFO',
          name: productText,
          category,
          pageContext: document.title,
        })
      )
      .then((data) => {
        if (cancelled || !data?.image) return;
        setImage(data.image);
        // Only persist results with a picture: caching "none" would make a
        // transient failure (no key yet, quota, timeout) stick for a week.
        cacheProductInfo(data, category);
        debug('[Product Detector] Cached product info for:', productText);
      })
      .catch((error) => {
        console.error('[Product Detector] Failed to fetch product info:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [productText, category]);

  // Place below the name, or above it when there is no room below
  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight ?? 0;
    const below = anchor.bottom + GAP;
    const above = anchor.top - GAP - height;
    const fitsBelow = below + height <= window.innerHeight - GAP;
    const next = fitsBelow || above < GAP ? below : above;
    setTop(Math.max(GAP, Math.min(next, window.innerHeight - height - GAP)));
  }, [anchor, threadProduct, productText]);

  if (!portalTarget) return null;

  const left = Math.min(Math.max(GAP, anchor.left), window.innerWidth - CARD_WIDTH - GAP);

  // Include the category in searches: "Rainy Whisper keyboard" finds the
  // product, "Rainy Whisper" alone finds a CD.
  const searchQuery = category ? `${productText} ${category}` : productText;
  const searchLinks = buildSearchLinks(searchQuery);
  // Software and services don't belong on Amazon
  const showAmazon = isPhysicalProduct(category);

  const badge = sentiment ? COMMENT_BADGE[sentiment] : undefined;

  // Thread context only adds something when other comments are involved
  const thread = threadProduct && threadProduct.mentions.length > 1 ? threadProduct : null;
  const verdict = thread ? verdictOf(thread) : null;
  const otherQuote = thread
    ? (() => {
        const best = bestMention(thread);
        if (best && best.element !== commentElement) return best;
        return thread.mentions.find((m) => m.element !== commentElement) ?? null;
      })()
    : null;

  return createPortal(
    <div
      ref={cardRef}
      className="pd pd-card"
      style={{ left, top: top ?? anchor.bottom + GAP, visibility: top === null ? 'hidden' : 'visible' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="pd-card-head">
        <div className="pd-card-tile" aria-hidden="true">
          <span className="pd-card-monogram">{monogram(productText)}</span>
          {image && (
            <img
              src={image}
              alt=""
              className={`pd-card-img ${imageLoaded ? 'pd-card-img-ready' : ''}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImage(null)}
            />
          )}
        </div>
        <div className="pd-card-title">
          <div className="pd-card-name">{productText}</div>
          <div className="pd-card-chips">
            {category && <span className="pd-chip">{category}</span>}
            {badge && <span className={`pd-chip ${badge.className}`}>{badge.label}</span>}
          </div>
        </div>
      </div>

      {thread && verdict && (
        <div className="pd-card-thread">
          <div className="pd-row-top">
            <span className={`pd-verdict pd-verdict-${verdict}`}>{THREAD_VERDICT[verdict]}</span>
            <span className="pd-row-meta">
              {[
                thread.positive > 0 && `${thread.positive} for`,
                thread.negative > 0 && `${thread.negative} against`,
                thread.neutral > 0 && `${thread.neutral} neutral`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <div className="pd-bar" aria-hidden="true">
            {thread.positive > 0 && <span className="pd-bar-pos" style={{ flexGrow: thread.positive }} />}
            {thread.neutral > 0 && <span className="pd-bar-neu" style={{ flexGrow: thread.neutral }} />}
            {thread.negative > 0 && <span className="pd-bar-neg" style={{ flexGrow: thread.negative }} />}
          </div>
          {otherQuote && <blockquote className="pd-quote pd-card-quote">{otherQuote.quote}</blockquote>}
        </div>
      )}

      <div className="pd-card-links">
        {showAmazon && (
          <a className="pd-card-link" href={searchLinks.amazon} target="_blank" rel="noopener noreferrer">
            Search Amazon
          </a>
        )}
        <a
          className="pd-card-link"
          href={showAmazon ? searchLinks.googleShopping : searchLinks.google}
          target="_blank"
          rel="noopener noreferrer"
        >
          Search Google
        </a>
      </div>

      {/* Affiliate disclosure, required by Amazon Associates and by good manners */}
      {affiliateEnabled() && showAmazon && (
        <div className="pd-card-note">
          The Amazon link is an affiliate link: as an Amazon Associate we earn from qualifying
          purchases.
        </div>
      )}
    </div>,
    portalTarget
  );
}
