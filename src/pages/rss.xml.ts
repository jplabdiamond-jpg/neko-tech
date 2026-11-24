import rss from '@astrojs/rss';
import { getPublishedArticles } from '../lib/content';
import { site } from '../lib/site';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const articles = await getPublishedArticles();

  return rss({
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    site: context.site ?? site.url,
    items: articles.map((a) => ({
      title: a.data.title,
      description: a.data.description,
      pubDate: a.data.publishDate,
      link: `/articles/${a.id}/`,
    })),
    customData: '<language>ja</language>',
  });
}
