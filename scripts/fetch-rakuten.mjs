#!/usr/bin/env node
/**
 * 楽天商品検索APIから商品情報（名前・価格・画像URL・アフィリエイトリンク）を取得し、
 * src/data/products.json に保存する。
 *
 * なぜAPIを使うのか:
 *   Amazonの商品画像は保存して自サイトに置くと運営規約違反になる。
 *   楽天はAPIが返す画像URLをアフィリエイト目的で参照できるため、
 *   実機写真が無い商品はこちらで補う。
 *
 * 使い方:
 *   RAKUTEN_APP_ID=xxx RAKUTEN_AFFILIATE_ID=yyy node scripts/fetch-rakuten.mjs
 *
 * 環境変数が無い場合は何もせずに正常終了する（CIを壊さないため）。
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const APP_ID = process.env.RAKUTEN_APP_ID;
const AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;
const OUT = resolve('src/data/products.json');
const LIST = resolve('src/data/product-queries.json');
const ENDPOINT = 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';

if (!APP_ID) {
  console.log('[rakuten] RAKUTEN_APP_ID が未設定のためスキップします（既存の products.json は保持）');
  process.exit(0);
}

let queries;
try {
  queries = JSON.parse(await readFile(LIST, 'utf-8'));
} catch {
  console.log('[rakuten] src/data/product-queries.json が無いためスキップします');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};

for (const q of queries) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('applicationId', APP_ID);
  if (AFFILIATE_ID) url.searchParams.set('affiliateId', AFFILIATE_ID);
  url.searchParams.set('keyword', q.keyword);
  url.searchParams.set('hits', '1');
  url.searchParams.set('sort', '-reviewCount');
  url.searchParams.set('imageFlag', '1');

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[rakuten] ${q.id}: HTTP ${res.status}`);
      continue;
    }
    const json = await res.json();
    const item = json.Items?.[0]?.Item;
    if (!item) {
      console.warn(`[rakuten] ${q.id}: 該当商品なし`);
      continue;
    }
    out[q.id] = {
      name: item.itemName,
      price: item.itemPrice,
      // 128x128 が既定なので大きいサイズに差し替える
      image: (item.mediumImageUrls?.[0]?.imageUrl ?? '').replace(/\?_ex=\d+x\d+$/, '?_ex=600x600'),
      url: item.affiliateUrl || item.itemUrl,
      shop: item.shopName,
      fetchedAt: new Date().toISOString().slice(0, 10),
    };
    console.log(`[rakuten] ${q.id}: OK`);
  } catch (e) {
    console.warn(`[rakuten] ${q.id}: ${e.message}`);
  }
  await sleep(1100); // 楽天APIのレート制限（1秒1回）に合わせる
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf-8');
console.log(`[rakuten] ${Object.keys(out).length} 件を ${OUT} に保存しました`);
