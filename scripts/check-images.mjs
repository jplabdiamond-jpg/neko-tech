#!/usr/bin/env node
/**
 * 外部CDNの商品画像が生きているか確認する。
 *
 * 背景:
 *   Amazon / 楽天の商品画像URLは予告なく変わる。フロント側では
 *   プレースホルダーに差し替わるため表示は崩れないが、
 *   「気づかないまま画像なしの比較記事が放置される」状態になる。
 *   比較記事で製品画像が欠けると成約率に直結するので、定期的に検査する。
 *
 * 使い方:
 *   npm run build && node scripts/check-images.mjs
 *   node scripts/check-images.mjs --strict   # 死んでいたら終了コード1
 *
 * CIでは週次ワークフロー(check-images.yml)が --strict で実行し、
 * 失敗するとGitHubから通知メールが届く。
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const STRICT = process.argv.includes('--strict');
const DIST = 'dist';
const TIMEOUT = 12000;
const CONCURRENCY = 6;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (extname(e.name) === '.html') out.push(p);
  }
  return out;
}

let files;
try {
  files = await walk(DIST);
} catch {
  console.error('dist/ がありません。先に npm run build を実行してください。');
  process.exit(1);
}

// 画像URLと、それが載っているページを対応づける
const urls = new Map(); // url -> Set<page>
for (const f of files) {
  const html = await readFile(f, 'utf-8');
  const page = '/' + f.replace(/^dist\/?/, '').replace(/index\.html$/, '');
  for (const m of html.matchAll(/<img[^>]+src="(https?:\/\/[^"]+)"/g)) {
    if (!urls.has(m[1])) urls.set(m[1], new Set());
    urls.get(m[1]).add(page);
  }
}

if (urls.size === 0) {
  console.log('外部画像は使われていません。');
  process.exit(0);
}

console.log(`外部画像 ${urls.size} 件を検査します...\n`);

const entries = [...urls.entries()];
const dead = [];

async function head(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    // 一部CDNはHEADを拒むのでGETにフォールバックする
    let res = await fetch(url, { method: 'HEAD', signal: ctl.signal, redirect: 'follow' });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, { method: 'GET', signal: ctl.signal, redirect: 'follow' });
    }
    return res.ok ? null : `HTTP ${res.status}`;
  } catch (e) {
    return e.name === 'AbortError' ? 'タイムアウト' : e.message;
  } finally {
    clearTimeout(t);
  }
}

for (let i = 0; i < entries.length; i += CONCURRENCY) {
  const batch = entries.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(([u]) => head(u)));
  results.forEach((err, j) => {
    const [url, pages] = batch[j];
    if (err) dead.push({ url, pages: [...pages], err });
  });
  process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, entries.length)} / ${entries.length}`);
}
process.stdout.write('\n\n');

if (dead.length === 0) {
  console.log(`すべて生存しています（${urls.size} 件）。`);
  process.exit(0);
}

console.log(`切れている画像: ${dead.length} 件\n`);
const byPage = new Map();
for (const d of dead) {
  for (const p of d.pages) {
    if (!byPage.has(p)) byPage.set(p, []);
    byPage.get(p).push(d);
  }
}
for (const [page, items] of [...byPage].sort()) {
  console.log(`  ${page}`);
  for (const it of items) console.log(`    [${it.err}] ${it.url}`);
}
console.log('\n差し替え方法: 記事の heroRemote、または ProductCard の image を更新してください。');
process.exit(STRICT ? 1 : 0);
