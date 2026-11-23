/**
 * Thread summary: "what this thread recommends" at a glance.
 *
 * A small pill in the corner names the thread's top pick; opening it shows
 * every product with a consensus bar, a verdict (recommended / divisive /
 * warned against / mentioned), the most representative quote from the
 * comments, and a way to jump to the comment itself. Shopping is a quiet
 * text link, never the main action.
 */

import { useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { PortalTargetContext } from '@/contexts/PortalTargetContext';
import { buildSearchLinks, isPhysicalProduct, affiliateEnabled } from '@/utils/affiliate';
import { flashComment } from '@/utils/highlight-styles';
import {
  bestMention,
  formatSummary,
  topPick,
  verdictOf,
  type ThreadMention,
  type ThreadProduct,
  type Verdict,
} from '@/utils/thread-products';

interface Props {
  products: ThreadProduct[];
  /** Comments analysed so far on this page */
  commentsRead: number;
  /** Comments on the page not analysed yet */
  pendingCount: number;
  /** Progress of "read the rest", or null when idle */
  scan: { done: number; total: number } | null;
  onScanRest: () => void;
  onCancelScan: () => void;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  recommended: 'Recommended',
  divisive: 'Divisive',
  warned: 'Warned against',
  mentioned: 'Mentioned',
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** "5 for · 1 against · 2 neutral", leaving out the zeroes */
function tally(p: ThreadProduct): string {
  const parts: string[] = [];
  if (p.positive > 0) parts.push(`${p.positive} for`);
  if (p.negative > 0) parts.push(`${p.negative} against`);
  if (p.neutral > 0) parts.push(`${p.neutral} neutral`);
  return parts.join(' · ');
}

export function ThreadSummaryPanel({
  products,
  commentsRead,
  pendingCount,
  scan,
  onScanRest,
  onCancelScan,
}: Props) {
  const portalTarget = useContext(PortalTargetContext);
  const [open, setOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!portalTarget || products.length === 0) return null;

  const pick = topPick(products);
  const ordered = pick ? [pick, ...products.filter((p) => p !== pick)] : products;

  const scanPercent = scan && scan.total > 0 ? Math.round((scan.done / scan.total) * 100) : 0;

  const copySummary = async () => {
    const text = formatSummary(products, commentsRead, document.title, window.location.href);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error('[Product Detector] Could not copy the summary:', error);
    }
  };

  const pill = (
    <button
      className="pd pd-pill"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      title="What this thread recommends"
    >
      {scan ? (
        <span
          className="pd-pill-ring"
          style={{ ['--pd-progress' as string]: `${scanPercent}%` }}
          aria-hidden="true"
        />
      ) : (
        <span className="pd-pill-mark" aria-hidden="true" />
      )}
      {pick ? (
        <span className="pd-pill-text">
          <span className="pd-pill-label">Top pick</span>
          <span className="pd-pill-name">{pick.name}</span>
        </span>
      ) : (
        <span className="pd-pill-text">
          <span className="pd-pill-name">{plural(products.length, 'product')} mentioned</span>
        </span>
      )}
      {/* Re-keyed on change so the count gives a small bump as products arrive */}
      <span key={products.length} className="pd-pill-count">
        {products.length}
      </span>
    </button>
  );

  const panel = open && (
    <div
      className="pd pd-panel"
      role="dialog"
      aria-label="What this thread recommends"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <div className="pd-panel-head">
        <div>
          <div className="pd-panel-title">What this thread recommends</div>
          <div className="pd-panel-sub">From {plural(commentsRead, 'comment')} read so far.</div>
        </div>
        <div className="pd-panel-head-actions">
          <button className="pd-head-btn" onClick={copySummary} title="Copy this summary as text">
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="pd-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            ×
          </button>
        </div>
      </div>

      {scan ? (
        <div className="pd-scan">
          <div className="pd-scan-line">
            <span>
              Reading the rest: {scan.done} of {scan.total}
            </span>
            <button className="pd-text-btn" onClick={onCancelScan}>
              Stop
            </button>
          </div>
          <div
            className="pd-scan-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={scanPercent}
          >
            <div className="pd-scan-fill" style={{ width: `${scanPercent}%` }} />
          </div>
          <div className="pd-scan-note">On-device AI can take a while on a long thread.</div>
        </div>
      ) : (
        pendingCount > 0 && (
          <div className="pd-scan">
            <div className="pd-scan-line">
              <span>{plural(pendingCount, 'more comment')} on this page not read yet.</span>
              <button className="pd-text-btn" onClick={onScanRest}>
                Read the rest
              </button>
            </div>
          </div>
        )
      )}

      <div className="pd-panel-list">
        {ordered.map((p) => (
          <ProductRow
            key={p.key}
            product={p}
            featured={p === pick}
            expanded={p === pick || expandedKey === p.key}
            onToggle={() => setExpandedKey(expandedKey === p.key ? null : p.key)}
          />
        ))}
      </div>
    </div>
  );

  return createPortal(
    <>
      {panel}
      {pill}
    </>,
    portalTarget
  );
}

function ProductRow({
  product: p,
  featured,
  expanded,
  onToggle,
}: {
  product: ThreadProduct;
  featured: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Which mention "Show comment" goes to next (cycles through all of them)
  const [cursor, setCursor] = useState(0);

  const verdict = verdictOf(p);
  const quote = bestMention(p);
  const mentionCount = p.mentions.length;

  const links = buildSearchLinks(p.category ? `${p.name} ${p.category}` : p.name);
  const physical = isPhysicalProduct(p.category);
  const searchUrl = physical ? links.amazon : links.google;
  const searchLabel = physical
    ? affiliateEnabled()
      ? 'Search Amazon (affiliate link)'
      : 'Search Amazon'
    : 'Search Google';

  const showComment = () => {
    // Start with the quoted comment, then walk through the others
    const sequence: ThreadMention[] = quote
      ? [quote, ...p.mentions.filter((m) => m !== quote)]
      : p.mentions;
    const live = sequence.filter((m) => m.element.isConnected);
    if (live.length === 0) return;
    flashComment(live[cursor % live.length].element);
    setCursor(cursor + 1);
  };

  const summary = (
    <>
      <div className="pd-row-top">
        <span className="pd-row-name">{p.name}</span>
        <span className={`pd-verdict pd-verdict-${verdict}`}>{VERDICT_LABEL[verdict]}</span>
      </div>
      <div className="pd-bar" aria-hidden="true">
        {p.positive > 0 && <span className="pd-bar-pos" style={{ flexGrow: p.positive }} />}
        {p.neutral > 0 && <span className="pd-bar-neu" style={{ flexGrow: p.neutral }} />}
        {p.negative > 0 && <span className="pd-bar-neg" style={{ flexGrow: p.negative }} />}
      </div>
      <div className="pd-row-meta">
        {featured
          ? `Recommended in ${p.positive} of ${plural(mentionCount, 'comment')} that mention it`
          : `${plural(mentionCount, 'comment')} · ${tally(p)}`}
      </div>
    </>
  );

  return (
    <div className={`pd-row ${featured ? 'pd-row-featured' : ''}`}>
      {featured ? (
        <div className="pd-row-summary">
          <div className="pd-row-tag">Top pick</div>
          {summary}
        </div>
      ) : (
        <button className="pd-row-summary pd-row-toggle" onClick={onToggle} aria-expanded={expanded}>
          {summary}
        </button>
      )}

      {expanded && (
        <div className="pd-row-detail">
          {quote && <blockquote className="pd-quote">{quote.quote}</blockquote>}
          <div className="pd-row-actions">
            <button className="pd-text-btn" onClick={showComment}>
              {mentionCount > 1 ? `Show comments (${mentionCount})` : 'Show comment'}
            </button>
            <a className="pd-text-link" href={searchUrl} target="_blank" rel="noopener noreferrer">
              {searchLabel}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
