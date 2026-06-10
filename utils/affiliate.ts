/**
 * Affiliate / shopping link builder — single source of truth.
 *
 * 💰 TO START EARNING:
 * 1. Sign up at https://affiliate-program.amazon.com (Amazon Associates)
 * 2. Get your tracking ID (looks like "yourname-20")
 * 3. Put it in AMAZON_AFFILIATE_TAG below and rebuild the extension
 *
 * Note: Amazon requires you to disclose affiliate links to users (e.g. a
 * small "affiliate link" note in the hover card) and to make your first
 * qualified sales within 180 days to keep the account active.
 */

/** Your Amazon Associates tracking ID, e.g. "yourname-20". Empty = plain links. */
export const AMAZON_AFFILIATE_TAG = '';

/**
 * ☕ Your Buy Me a Coffee page, e.g. "https://buymeacoffee.com/miguel".
 * Sign up free at https://buymeacoffee.com. Empty = link hidden.
 */
export const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/botsd0ntcry';

export interface SearchLinks {
  amazon: string;
  googleShopping: string;
  google: string;
}

/** Build shopping search links for a product query, with affiliate tag when set */
export function buildSearchLinks(searchQuery: string): SearchLinks {
  const encoded = encodeURIComponent(searchQuery);
  const amazon = AMAZON_AFFILIATE_TAG
    ? `https://www.amazon.com/s?k=${encoded}&tag=${encodeURIComponent(AMAZON_AFFILIATE_TAG)}`
    : `https://www.amazon.com/s?k=${encoded}`;
  return {
    amazon,
    googleShopping: `https://www.google.com/search?tbm=shop&q=${encoded}`,
    google: `https://www.google.com/search?q=${encoded}`,
  };
}

/** Whether affiliate links are active (for showing the disclosure note) */
export function affiliateEnabled(): boolean {
  return AMAZON_AFFILIATE_TAG.length > 0;
}
