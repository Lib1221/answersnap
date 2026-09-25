import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { BRAND } from './src/config/brand';

export const ANTHROPIC_HOST = 'https://api.anthropic.com/*';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue', '@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
    developmentIndicator: 'overlay',
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ mode }) => {
    const e2e = mode === 'e2e';
    return {
      name: BRAND.name,
      description: BRAND.description,
      minimum_chrome_version: '116',
      permissions: ['activeTab', 'scripting', 'storage', 'sidePanel', 'contextMenus'],
      // e2e builds may add <all_urls> (spec section 6). Production never does.
      host_permissions: e2e ? [ANTHROPIC_HOST, '<all_urls>'] : [ANTHROPIC_HOST],
      optional_host_permissions: ['<all_urls>'],
      action: { default_title: `Snip a question (${BRAND.shortcut})` },
      commands: {
        'snip-question': {
          suggested_key: { default: BRAND.shortcut, mac: BRAND.shortcut },
          description: 'Snip a question and draft an answer',
        },
      },
    };
  },
});
