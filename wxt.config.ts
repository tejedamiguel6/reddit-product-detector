import { defineConfig } from "wxt";

/**
 * Hosts the extension works on out of the box.
 * Keep in sync with DEFAULT_SITES in utils/site-settings.ts and the
 * `matches` in entrypoints/content.tsx.
 *
 * User-added sites are handled via optional_host_permissions: the popup
 * requests permission for the specific origin and registers a dynamic
 * content script (see utils/dynamic-sites.ts). This keeps the install
 * warning small ("can read data on reddit.com, news.ycombinator.com,
 * producthunt.com") instead of "on all websites".
 */
export const DEFAULT_HOST_MATCHES = [
  "*://*.reddit.com/*",
  "*://news.ycombinator.com/*",
  "*://*.producthunt.com/*",
];

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  dev: {
    server: {
      port: 3001,
    },
  },
  manifest: {
    name: "Product Detector",
    description: "AI-powered product detection for forums and discussion sites",
    // activeTab (not "tabs"): grants the popup access to the current tab's URL
    // only when the user clicks the extension — no "read browsing history" warning.
    // scripting: needed to register content scripts for user-added sites.
    permissions: ["storage", "activeTab", "scripting"],
    host_permissions: DEFAULT_HOST_MATCHES,
    // Users can grant access to additional forums one at a time from the popup
    optional_host_permissions: ["*://*/*"],
    icons: {
      16: "assets/icons/icon-16.png",
      48: "assets/icons/icon-48.png",
      128: "assets/icons/icon-128.png",
    },
    action: {
      default_icon: {
        16: "assets/icons/icon-16.png",
        48: "assets/icons/icon-48.png",
        128: "assets/icons/icon-48.png",
      },
    },
  },
});
