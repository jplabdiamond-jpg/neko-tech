import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['litter-box', 'monitoring', 'supplies', 'life']),
    // キーワード設計シートの管理番号と対応させる
    planNo: z.number().optional(),
    keyword: z.string().optional(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    // 「実機を○ヶ月使った」という独自性の明示。2026/4の規約改定対応の要
    verified: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles };
