import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 本番の独自ドメインが決まったら site を差し替える（例: https://neko-tech.com）
export const SITE = 'https://neko-tech.pages.dev';

export default defineConfig({
  site: SITE,
  integrations: [sitemap()],
  build: { format: 'directory', assets: 'assets' },
  vite: {
    build: {
      rollupOptions: {
        // 既定では [...slug] 由来で "_slug_.css" になり、先頭の _ が
        // 一部ホスティングで予約名として弾かれるため明示的に命名する
        output: { assetFileNames: 'assets/site.[hash][extname]' },
      },
    },
  },
});
