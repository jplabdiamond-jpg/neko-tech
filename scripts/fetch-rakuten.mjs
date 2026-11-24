#!/usr/bin/env node
/**
 * 楽天商品検索APIから商品情報（名前・価格・画像URL・アフィリエイトリンク）を取得し、
 * src/data/products.json に保存する。
 *
 * 2026年2月の新仕様に対応:
 *   - ドメイン openapi.rakuten.co.jp / パス /ichibams/api/
 *   - 認証は applicationId(UUID) をクエリ、accessKey(pk_) を専用ヘッダで送る
 *   - Origin / Referer ヘッダが必須。楽天アプリの「許可されたWebサイト」と一致させる
 *
 * なぜAPIを使うのか:
 *   Amazonの商品画像はPA-APIまたは公式リンクツール経由でのみ利用が許諾されている。
 *   楽天はAPIが返す画像URLをアフィリエイト目的で参照できるため、
 *   実機写真が無い商品はこちらで補う。
 *
 * 使い方:
 *   RAKUTEN_APP_ID=... RAKUTEN_ACCESS_KEY=... RAKUTEN_REFERER=https://neko-tech.pages.dev/ \
 *     node scripts/fetch-rakuten.mjs
 *
 * 必須の環境変数が無い場合は何もせずに正常終了する（CIを壊さないため）。
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const APP_ID = (process.env.RAKUTEN_APP_ID || '').trim();
const ACCESS_KEY = (process.env.RAKUTEN_ACCESS_KEY || '').trim();
const AFFILIATE_ID = (process.env.RAKUTEN_AFFILIATE_ID || '').trim();
const REFERER = (process.env.RAKUTEN_REFERER || '').trim() || 'https://neko-tech.pages.dev/';

const OUT = resolve('src/data/products.json');
const LIST = resolve('src/data/product-queries.json');
const ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601';

if (!APP_ID || !ACCESS_KEY) {
  console.log('[rakuten] RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY が未設定のためスキップします');
  console.log('[rakuten] 既存の src/data/products.json をそのまま使います');
  process.exit(0);
}

let queries;
try {
  queries = JSON.parse(await readFile(LIST, 'utf-8'));
} catch {
  console.log('[rakuten] src/data/product-queries.json が無いためスキップします');
  process.exit(0);
}

// 既存データを読み、取得に失敗した商品は前回値を残す（画像が突然消えるのを防ぐ）
let previous = {};
try { previous = JSON.parse(await readFile(OUT, 'utf-8')); } catch { /* 初回 */ }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { ...previous };
let ok = 0;
let failed = 0;

for (const q of queries) {
  const api = new URL(ENDPOINT);
  api.searchParams.set('applicationId', APP_ID);
  if (AFFILIATE_ID) api.searchParams.set('affiliateId', AFFILIATE_ID);
  api.searchParams.set('format', 'json');
  api.searchParams.set('hits', '1');
  api.searchParams.set('imageFlag', '1');    // 画像ありのみ
  api.searchParams.set('availability', '1'); // 在庫ありのみ
  api.searchParams.set('sort', 'standard');
  if (q.itemCode) api.searchParams.set('itemCode', q.itemCode);
  else api.searchParams.set('keyword', q.keyword);

  try {
    const res = await fetch(api, {
      headers: {
        Accept: 'application/json',
        accessKey: ACCESS_KEY,                    // 新仕様。Bearerではない
        Origin: REFERER.replace(/\/+$/, ''),
        Referer: REFERER,
      },
    });
    if (!res.ok) {
      console.warn(`[rakuten] ${q.id}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
      failed++;
      continue;
    }
    const item = (await res.json()).Items?.[0]?.Item;
    if (!item) {
      console.warn(`[rakuten] ${q.id}: 該当商品なし`);
      failed++;
      continue;
    }
    out[q.id] = {
      name: item.itemName,
      price: item.itemPrice,
      // 既定は小さいサイズなので大きいものに差し替える
      image: (item.mediumImageUrls?.[0]?.imageUrl ?? '').replace(/\?_ex=\d+x\d+$/, '?_ex=600x600'),
      url: item.affiliateUrl || item.itemUrl,
      shop: item.shopName,
      fetchedAt: new Date().toISOString().slice(0, 10),
    };
    ok++;
    console.log(`[rakuten] ${q.id}: OK`);
  } catch (e) {
    console.warn(`[rakuten] ${q.id}: ${e.message}`);
    failed++;
  }
  await sleep(1100); // レート制限（1秒1回）に合わせる
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf-8');
console.log(`[rakuten] 成功 ${ok} 件 / 失敗 ${failed} 件 → ${OUT}`);
