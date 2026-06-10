import { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PortalTargetContext } from '@/contexts/PortalTargetContext';
import { getCachedProductInfo, cacheProductInfo } from '@/utils/product-info-cache';

interface ProductInfo {
  name: string;
  image: string | null;
  imageSearchUrl?: string;
  searchLinks: {
    amazon: string;
    googleShopping: string;
    google: string;
  };
}

interface HoverCardProps {
  position: { x: number; y: number };
  productText: string;
  category?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function HoverCard({
  position,
  productText,
  category,
  onMouseEnter,
  onMouseLeave,
}: HoverCardProps) {
  const portalTarget = useContext(PortalTargetContext);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadProductInfo() {
      // Check cache first
      const cached = getCachedProductInfo(productText, category);
      if (cached) {
        console.log('[Product Detector] Cache hit for:', productText);
        setProductInfo(cached);
        setLoading(false);
        return;
      }

      try {
        // Fetch via background script (calls Serper API directly — no separate server needed)
        const data = await browser.runtime.sendMessage({
          type: 'GET_PRODUCT_INFO',
          name: productText,
          category,
          pageContext: document.title,
        });

        if (data && !cancelled) {
          setProductInfo(data);
          cacheProductInfo(data, category);
          console.log('[Product Detector] Cached product info for:', productText);
        }
      } catch (error) {
        console.error('[Product Detector] Failed to fetch product info:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProductInfo();

    return () => {
      cancelled = true;
    };
  }, [productText, category]);

  if (!portalTarget) return null;

  const cardWidth = 300;
  const cardHeight = 200;
  const padding = 8;

  const x = Math.min(
    Math.max(padding, position.x),
    window.innerWidth - cardWidth - padding
  );
  const y = Math.min(
    Math.max(padding, position.y),
    window.innerHeight - cardHeight - padding
  );

  // Always include category in search queries for better results
  // "Rainy Whisper keyboard" finds the right product vs "Rainy Whisper" finding a CD
  const searchQuery = category
    ? `${productText} ${category}`
    : productText;

  // Always build our own search links with category context — API-provided links
  // often search just the name which leads to wrong results for ambiguous names
  const searchLinks = {
    amazon: `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}`,
    googleShopping: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(searchQuery)}`,
    google: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
  };

  const cardContent = (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 2147483647,
        pointerEvents: 'auto',
        width: cardWidth,
        backgroundColor: '#1a1a1b',
        border: '1px solid #343536',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: '14px',
        color: '#d7dadc',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header with product image */}
      <div style={{ display: 'flex', gap: '12px', padding: '12px' }}>
        {/* Product Image */}
        <a
          href={productInfo?.imageSearchUrl || `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '8px',
            backgroundColor: '#272729',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: 'pointer',
            textDecoration: 'none',
            transition: 'opacity 0.2s',
          }}
          title={productInfo?.image ? productText : 'Search for images'}
        >
          {loading ? (
            <div
              style={{
                width: '24px',
                height: '24px',
                border: '2px solid #343536',
                borderTopColor: '#ff4500',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
          ) : productInfo?.image ? (
            <img
              src={productInfo.image}
              alt={productText}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.innerHTML = `
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#818384" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                `;
              }}
            />
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#818384" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          )}
        </a>

        {/* Product Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              color: '#ffffff',
              fontSize: '15px',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {productText}
          </div>
          {category && (
            <div
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                backgroundColor: '#272729',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#818384',
                textTransform: 'capitalize',
              }}
            >
              {category}
            </div>
          )}
        </div>
      </div>

      {/* Shop Links */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '12px',
          borderTop: '1px solid #343536',
          backgroundColor: '#272729',
        }}
      >
        <a
          href={searchLinks.amazon}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px',
            backgroundColor: '#ff9900',
            color: '#000',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '12px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          Amazon
        </a>
        <a
          href={searchLinks.googleShopping}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px',
            backgroundColor: '#4285f4',
            color: '#fff',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '12px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          Google
        </a>
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  return createPortal(cardContent, portalTarget);
}
