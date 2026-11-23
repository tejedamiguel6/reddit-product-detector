/**
 * Thread Product Summary — floating button + panel listing every product
 * detected on the page, with mention counts and sentiment tallies.
 * The "skip reading 300 comments" feature.
 */

import { useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { PortalTargetContext } from '@/contexts/PortalTargetContext';
import { buildSearchLinks, isPhysicalProduct } from '@/utils/affiliate';

export interface ThreadProduct {
  name: string;
  category?: string;
  /** Number of comments mentioning this product */
  mentions: number;
  positive: number;
  negative: number;
  neutral: number;
}

interface Props {
  products: Map<string, ThreadProduct>;
}

/** Overall verdict from sentiment tallies */
function verdict(p: ThreadProduct): { emoji: string; color: string } {
  if (p.positive > p.negative) return { emoji: '👍', color: '#2ecc71' };
  if (p.negative > p.positive) return { emoji: '⚠️', color: '#e74c3c' };
  return { emoji: '➖', color: '#818384' };
}

export function ThreadSummaryPanel({ products }: Props) {
  const portalTarget = useContext(PortalTargetContext);
  const [open, setOpen] = useState(false);

  if (!portalTarget || products.size === 0) return null;

  const sorted = [...products.values()].sort(
    (a, b) => b.mentions - a.mentions || b.positive - a.positive
  );

  const button = (
    <button
      onClick={() => setOpen(!open)}
      title="Products mentioned in this thread"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 2147483646,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        backgroundColor: '#1a1a1b',
        color: '#fff',
        border: '1px solid #343536',
        borderRadius: '24px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
        fontFamily: 'inherit',
      }}
    >
      🛍️ {products.size} product{products.size === 1 ? '' : 's'}
      <span style={{ fontSize: '10px', color: '#818384' }}>{open ? '▼' : '▲'}</span>
    </button>
  );

  const panel = open && (
    <div
      style={{
        position: 'fixed',
        bottom: '68px',
        right: '20px',
        zIndex: 2147483646,
        width: '340px',
        maxHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1a1a1b',
        border: '1px solid #343536',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #343536',
          color: '#fff',
          fontWeight: 600,
          fontSize: '14px',
        }}
      >
        Products in this thread
        <div style={{ fontSize: '11px', color: '#818384', fontWeight: 400, marginTop: '2px' }}>
          From comments scanned so far — scroll the page to find more
        </div>
      </div>

      {/* Product list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sorted.map((p) => {
          const v = verdict(p);
          const links = buildSearchLinks(p.category ? `${p.name} ${p.category}` : p.name);
          // Software/services: Shop button goes to Google instead of Amazon
          const shopUrl = isPhysicalProduct(p.category) ? links.amazon : links.google;
          return (
            <div
              key={p.name.toLowerCase()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                borderBottom: '1px solid #272729',
              }}
            >
              <span style={{ fontSize: '16px' }} title="Overall thread verdict">
                {v.emoji}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </div>
                <div style={{ fontSize: '11px', color: '#818384' }}>
                  {p.mentions} mention{p.mentions === 1 ? '' : 's'}
                  {p.positive > 0 && (
                    <span style={{ color: '#2ecc71' }}> · 👍 {p.positive}</span>
                  )}
                  {p.negative > 0 && (
                    <span style={{ color: '#e74c3c' }}> · ⚠️ {p.negative}</span>
                  )}
                </div>
              </div>
              <a
                href={shopUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={isPhysicalProduct(p.category) ? 'Search on Amazon' : 'Search on Google'}
                style={{
                  padding: '5px 10px',
                  backgroundColor: '#ff9900',
                  color: '#000',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                Shop
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );

  return createPortal(
    <>
      {button}
      {panel}
    </>,
    portalTarget
  );
}
