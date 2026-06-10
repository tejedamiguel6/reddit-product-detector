/**
 * Generic content selectors that work across different forum types.
 * These target common patterns used by discussion forums.
 */

// Site-specific selectors for known forums
const SITE_SELECTORS: Record<string, string[]> = {
  'www.reddit.com': [
    'shreddit-comment .md',
    'shreddit-comment [slot="comment"]',
    '[data-testid="comment"] .md',
    '.Comment .md',
    '.Post .md',
  ],
  'old.reddit.com': [
    '.usertext-body .md',
    '.comment .md',
  ],
  'news.ycombinator.com': [
    '.commtext',
    '.comment-text',
  ],
  'www.producthunt.com': [
    '[data-test="comment-body"]',
    '.comment-body',
    '.styles_htmlText__eYPgj', // ProductHunt uses CSS modules
  ],
};

// Generic selectors that work on most forums/sites
const GENERIC_SELECTORS = [
  // Common comment/post patterns
  '.comment-body',
  '.comment-content',
  '.comment-text',
  '.post-body',
  '.post-content',
  '.message-body',
  '.message-content',

  // Article content
  'article p',
  '.article-content p',
  '.post p',

  // Forum patterns
  '.forum-post',
  '.thread-message',
  '.discussion-content',

  // Generic content containers
  '[class*="comment"] p',
  '[class*="post"] p',
  '[class*="message"] p',

  // Fallback: paragraphs in main content areas
  'main p',
  '#content p',
  '.content p',
];

/**
 * Get selectors for the current site.
 * Uses site-specific selectors when available, falls back to generic only
 * for unknown sites. This prevents matching too many elements on known sites.
 */
export function getSelectorsForSite(hostname: string, customSelectors?: string[]): string {
  // Custom selectors from user config take top priority
  if (customSelectors && customSelectors.length > 0) {
    return [...new Set(customSelectors)].join(', ');
  }

  // Site-specific selectors — use ONLY these for known sites
  if (SITE_SELECTORS[hostname]) {
    return [...new Set(SITE_SELECTORS[hostname])].join(', ');
  }

  // Unknown site — use generic selectors as fallback
  return [...new Set(GENERIC_SELECTORS)].join(', ');
}

/**
 * Get all content elements on the current page
 */
export function getContentElements(hostname: string, customSelectors?: string[]): Element[] {
  const selector = getSelectorsForSite(hostname, customSelectors);
  const elements = document.querySelectorAll(selector);

  // Filter out very small elements (likely not real content)
  return Array.from(elements).filter(el => {
    const text = el.textContent || '';
    return text.trim().length >= 20;
  });
}

/**
 * Check if an element looks like user-generated content
 * (vs navigation, ads, etc.)
 */
export function isUserContent(element: Element): boolean {
  const text = element.textContent || '';

  // Too short to be meaningful content
  if (text.trim().length < 20) return false;

  // Check if inside common non-content areas
  const nonContentSelectors = [
    'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]',
    '.nav', '.navigation', '.menu', '.sidebar',
    '.ad', '.advertisement', '.sponsored',
  ];

  for (const sel of nonContentSelectors) {
    if (element.closest(sel)) return false;
  }

  return true;
}
