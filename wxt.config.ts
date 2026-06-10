import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  dev: {
    server: {
      port: 3001,
    },
  },
  manifest: {
    name: 'Product Detector',
    description: 'AI-powered product detection for forums and discussion sites',
    permissions: ['storage', 'tabs'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'assets/icons/icon-16.png',
      48: 'assets/icons/icon-48.png',
      128: 'assets/icons/icon-128.png',
    },
    action: {
      default_icon: {
        16: 'assets/icons/icon-16.png',
        48: 'assets/icons/icon-48.png',
        128: 'assets/icons/icon-48.png',
      },
    },
  },
});
