import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      category: z.enum(['litter-box', 'monitoring', 'supplies', 'life']),
      /** 記事フォーマット。ローテーションの管理に使う（src/lib/editorial.ts） */
      format: z
        .enum(['comparison', 'pick', 'cost', 'troubleshoot', 'guide'])
        .default('guide'),

      // キーワード設計シートの管理番号と対応させる
      planNo: z.number().optional(),
      keyword: z.string().optional(),

      publishDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      verified: z.string().optional(),
      draft: z.boolean().default(false),

      /**
       * サムネイル。自前撮影の画像を src/assets/articles/ に置いて相対パスで指定する。
       * Astroが自動で最適化・レスポンシブ化する。こちらが第一候補。
       */
      hero: image().optional(),
      /**
       * 外部CDNの商品画像URL（Amazon / 楽天）。自前写真が無い記事で使う。
       * URLは運営者が用意する。画像が切れた場合はプレースホルダーに自動で差し替わり、
       * scripts/check-images.mjs で死活監視できる。
       */
      heroRemote: z.string().url().optional(),
      heroAlt: z.string().optional(),
      /** 画像の出所表示が必要な場合（例: 楽天市場） */
      heroCredit: z.string().optional(),
    }),
});

export const collections = { articles };
