import { debug } from '@/utils/log';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { getSelectorsForSite, getContentElements, isUserContent } from './generic-selectors';
import type { SiteConfig } from './site-settings';

/**
 * Several selectors can match the same comment at different depths (on new
 * Reddit, both the comment slot and the `.md` inside it). Analysing both
 * would count every mention twice, so keep only the outermost match.
 */
function outermostOnly(elements: Element[], selector: string): Element[] {
  const unique = [...new Set(elements)];
  return unique.filter((el) => {
    try {
      return !el.parentElement?.closest(selector);
    } catch {
      return true; // invalid custom selector: keep the element
    }
  });
}

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

  debug('[Product Detector] Using selectors for', hostname);

  // Process existing content on initial load
  const existingContent = outermostOnly(
    getContentElements(hostname, siteConfig?.selectors).filter(isUserContent),
    selector
  );

  debug('[Product Detector] Found', existingContent.length, 'existing content elements');

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

    const unique = outermostOnly(newContent, selector);
    if (unique.length > 0) {
      debug('[Product Detector] Found', unique.length, 'new content elements');
      onContentFound(unique);
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
