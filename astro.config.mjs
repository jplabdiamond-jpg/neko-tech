import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 本番の独自ドメインが決まったら site を差し替える（例: https://neko-tech.com）
export const SITE = 'https://neko-tech.pages.dev';

export default defineConfig({
  site: SITE,
  integrations: [sitemap()],
  build: { format: 'directory' },
});
