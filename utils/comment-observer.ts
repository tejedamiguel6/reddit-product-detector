import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { getSelectorsForSite, getContentElements, isUserContent } from './generic-selectors';
import type { SiteConfig } from './site-settings';

/**
 * Creates a MutationObserver that watches for new content being added to the page.
 * Works across different forum types using generic selectors.
 */
export function observeContent(
  ctx: ContentScriptContext,
  siteConfig: SiteConfig | null,
  onContentFound: (elements: Element[]) => void
): MutationObserver {
  const hostname = window.location.hostname;
  const selector = getSelectorsForSite(hostname, siteConfig?.selectors);

  console.log('[Product Detector] Using selectors for', hostname);

  // Process existing content on initial load
  const existingContent = getContentElements(hostname, siteConfig?.selectors)
    .filter(isUserContent);

  console.log('[Product Detector] Found', existingContent.length, 'existing content elements');

  if (existingContent.length > 0) {
    onContentFound(existingContent);
  }

  // Create observer for dynamically loaded content
  const observer = new MutationObserver((mutations) => {
    const newContent: Element[] = [];

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        // Check if the added node itself matches
        try {
          if (node.matches(selector) && isUserContent(node)) {
            newContent.push(node);
          }
        } catch {
          // Invalid selector, skip
        }

        // Check for matching descendants
        try {
          const descendants = node.querySelectorAll(selector);
          for (const desc of descendants) {
            if (isUserContent(desc)) {
              newContent.push(desc);
            }
          }
        } catch {
          // Invalid selector, skip
        }
      }
    }

    if (newContent.length > 0) {
      console.log('[Product Detector] Found', newContent.length, 'new content elements');
      onContentFound(newContent);
    }
  });

  // Start observing the document body
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Clean up when extension is invalidated
  ctx.onInvalidated(() => {
    observer.disconnect();
  });

  return observer;
}
