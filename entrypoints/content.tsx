import ReactDOM from 'react-dom/client';
import { PortalTargetContext } from '@/contexts/PortalTargetContext';
import { ProductDetectorApp } from '@/components/ProductDetectorApp';
import { isCurrentSiteEnabled, getCurrentSiteConfig } from '@/utils/site-settings';

export default defineContentScript({
  // Default sites only — keep in sync with wxt.config.ts DEFAULT_HOST_MATCHES.
  // User-added sites get a dynamically registered copy of this script
  // (utils/dynamic-sites.ts) after the user grants per-site permission.
  matches: [
    '*://*.reddit.com/*',
    '*://news.ycombinator.com/*',
    '*://*.producthunt.com/*',
  ],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',

  async main(ctx) {
    console.log('[Product Detector] Content script starting for:', window.location.hostname);

    // Check if this site is enabled
    const siteEnabled = await isCurrentSiteEnabled();
    console.log('[Product Detector] Site enabled check result:', siteEnabled);

    if (!siteEnabled) {
      console.log('[Product Detector] Site not enabled:', window.location.hostname);
      return;
    }

    const siteConfig = await getCurrentSiteConfig();
    console.log('[Product Detector] Content script loaded for:', siteConfig?.name || window.location.hostname);

    // Create Shadow DOM UI for style isolation
    const ui = await createShadowRootUi(ctx, {
      name: 'product-detector',
      position: 'inline',
      anchor: 'body',
      isolateEvents: ['keydown', 'keyup', 'keypress'],

      onMount: (container, shadow) => {
        // Create a wrapper div for React
        const wrapper = document.createElement('div');
        wrapper.id = 'pd-root';
        container.append(wrapper);

        // Use the shadow root as the portal target for hover cards
        const portalTarget = shadow.querySelector('body') || container;

        const root = ReactDOM.createRoot(wrapper);
        root.render(
          <PortalTargetContext.Provider value={portalTarget as HTMLElement}>
            <ProductDetectorApp ctx={ctx} siteConfig={siteConfig} />
          </PortalTargetContext.Provider>
        );

        return root;
      },

      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();

    // Listen for site settings updates from popup
    browser.runtime.onMessage.addListener(async (message) => {
      if (message.type === 'SITES_UPDATED') {
        const stillEnabled = await isCurrentSiteEnabled();
        if (!stillEnabled) {
          ui.remove();
          // Remove any highlights from the page
          document.querySelectorAll('.pd-highlight').forEach((el) => {
            const text = el.textContent || '';
            el.replaceWith(document.createTextNode(text));
          });
          console.log('[Product Detector] Site disabled, removed highlights');
        }
      }
    });

    // Handle SPA navigation
    window.addEventListener('wxt:locationchange', () => {
      console.log('[Product Detector] Page navigation detected');
    });
  },
});
