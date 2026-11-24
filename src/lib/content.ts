import { getCollection, type CollectionEntry } from 'astro:content';
import { readdirSync, existsSync } from 'node:fs';

/** 生成済みサムネイルの一覧。ビルド時に1回だけ読む */
const THUMBS: ReadonlySet<string> = existsSync('public/thumbs')
  ? new Set(readdirSync('public/thumbs').filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)))
  : new Set();

/** scripts/make-thumbnails.mjs が生成したサムネイルのURL。無ければ undefined */
export function thumbUrl(slug: string): string | undefined {
  return THUMBS.has(slug) ? `/thumbs/${slug}.png` : undefined;
}

export type Article = CollectionEntry<'articles'>;

/**
 * 公開対象の記事を返す。
 *
 * 予約投稿に対応している: publishDate が未来の記事はビルドに含めない。
 * 記事を書き溜めておき、日次のスケジュール実行で自動的に公開していく運用。
 */
export async function getPublishedArticles(): Promise<Article[]> {
  const now = Date.now();
  const all = await getCollection('articles', ({ data }) => !data.draft);
  return all
    .filter((a) => a.data.publishDate.valueOf() <= now)
    .sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());
}

/** 予約済み（未来日付）の記事。公開予定の確認に使う */
export async function getScheduledArticles(): Promise<Article[]> {
  const now = Date.now();
  const all = await getCollection('articles', ({ data }) => !data.draft);
  return all
    .filter((a) => a.data.publishDate.valueOf() > now)
    .sort((a, b) => a.data.publishDate.valueOf() - b.data.publishDate.valueOf());
}
