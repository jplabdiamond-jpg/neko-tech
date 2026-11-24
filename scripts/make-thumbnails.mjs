#!/usr/bin/env node
/**
 * 記事サムネイルを生成する。
 *
 * 方式:
 *   1. 背景 — Cloudflare Workers AI でハイパーリアルな猫の写真風画像を生成
 *   2. 文字 — 拡散モデルは日本語を崩すため、絶対に画像内に書かせない。
 *             ベクターテキストとして別レイヤーで合成する
 *
 * 1日3本の運用に耐えるよう、タイトルの改行・級数は自動で決まる。
 *
 * 必要な環境変数:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_AI_TOKEN   … 権限「Workers AI : Read」
 *                           未設定なら CLOUDFLARE_API_TOKEN を使う
 *   CF_AI_MODEL           … 任意。最優先で試すモデルID
 *
 * 使い方:
 *   node scripts/make-thumbnails.mjs          # 未生成の記事だけ
 *   node scripts/make-thumbnails.mjs --force  # 全記事を作り直す
 *   node scripts/make-thumbnails.mjs --dry    # 背景生成せず合成だけ確認
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const ACCOUNT = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
// 専用トークンがあればそれを、無ければPages用トークンを使う
// （1つのトークンに Workers AI 権限を追加して運用する場合に対応）
const TOKEN = (process.env.CLOUDFLARE_AI_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '').trim();
/**
 * 試行するモデルの順序。Cloudflareはモデルを定期的に廃止し、
 * 廃止後は HTTP 410 を返す（2026-11-20 に SDXL 系が一斉廃止された）。
 * 1つ死んでも次を試すことで、運用を止めずに済むようにしておく。
 * CF_AI_MODEL を指定した場合はそれを最優先で試す。
 */
const MODELS = [
  process.env.CF_AI_MODEL,
  '@cf/black-forest-labs/flux-2-klein-9b', // SDXL の公式な移行先
  '@cf/black-forest-labs/flux-1-schnell',
].filter(Boolean);
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');

const ART_DIR = 'src/content/articles';
const OUT_DIR = 'public/thumbs';
const W = 1280, H = 720;          // 生成サイズ
const OUT_W = 2560, OUT_H = 1440; // 出力サイズ

const COLORS = {
  ink: '#0d1014', paper: '#faf8f5', amber: '#f0a04b', scrim: '#0b0e12',
};

/** カテゴリごとの情景。猫は常に右側、左は文字用の暗い余白 */
const SCENES = {
  'litter-box':
    'a sleek modern white automatic cat litter box appliance on a clean wooden floor, a calm short-haired tabby cat sitting beside it',
  monitoring:
    'a calm tabby cat resting near a small modern white pet camera device on a shelf in a tidy living room',
  supplies:
    'a calm short-haired cat beside neatly stacked pet supply bags and a clean ceramic bowl on a wooden floor',
  life:
    'a calm short-haired tabby cat sitting by a window in a tidy minimal japanese apartment, soft daylight',
};

function buildPrompt(category) {
  const scene = SCENES[category] ?? SCENES.life;
  return (
    `hyper realistic photograph, cinematic key visual. ${scene}. ` +
    `The cat and objects are pushed to the RIGHT side of the frame. ` +
    `The LEFT 55 percent is dark, softly blurred, empty negative space with heavy atmospheric depth. ` +
    `shallow depth of field, soft directional window light, warm amber rim light, ` +
    `muted natural colour palette, photorealistic fur detail, 85mm lens, ultra detailed, 8k, ` +
    `no text, no letters, no words, no watermark, no logo`
  );
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 全角を1、半角を0.5として数える */
const width = (s) => [...s].reduce((n, c) => n + (/[\x00-\x7F]/.test(c) ? 0.5 : 1), 0);

/**
 * SEOタイトルをサムネイル用の見出しに縮める。
 * 長いタイトルをそのまま載せると可読性が落ちるため、
 * 「｜」より前 → 最初の句点・疑問符まで、の順で短くする。
 */
const MAX_HEAD = 26; // 全角換算の上限

function toHeadline(title) {
  let t = title.split('｜')[0].trim();
  // 【実践手順】のような装飾は見出しには不要
  t = t.replace(/[【［\[].*?[】］\]]\s*$/g, '').replace(/[〜~].*?[〜~]\s*$/g, '').trim();
  if (width(t) <= MAX_HEAD) return t;

  // 疑問符・句点で切れるならそこで止める（見出しとして成立する位置）
  const m = [...t.matchAll(/[？。！?]/g)].find((x) => {
    const w = width(t.slice(0, x.index + 1));
    return w >= 8 && w <= MAX_HEAD;
  });
  if (m) return t.slice(0, m.index + 1);

  // 読点で切る
  const c = [...t.matchAll(/[、,]/g)].reverse().find((x) => width(t.slice(0, x.index)) <= MAX_HEAD);
  if (c) return t.slice(0, c.index);

  // それでも長ければ丸める
  let cut = '';
  for (const ch of t) {
    if (width(cut + ch) > MAX_HEAD - 1) break;
    cut += ch;
  }
  return cut + '…';
}

/**
 * 見出しを文節単位の塊に分ける。塊の途中では改行しない。
 *   自動猫トイレの3年総額を計算
 *   → [自動猫][トイレの][3年][総額を][計算]
 * 「3」と「年」の間のような不自然な位置で切れるのを防ぐ。
 */
const COUNTERS = '年月日時間分秒台回匹頭本個人つ名件%％万円割倍歳種選位泊枚杯';
function chunks(text) {
  const re = new RegExp(
    `[A-Za-z0-9]+[${COUNTERS}]*` + // 英数字（＋助数詞）
    `|[ァ-ヶｦ-ﾟー]+` +              // カタカナ語
    `|[一-龠々〆ヵヶ]+` +            // 漢字の連なり
    `|[ぁ-ん]+` +                    // ひらがな
    `|[^\s]`,                       // 記号など
    'gu'
  );
  const raw = text.match(re) ?? [text];

  // ひらがな（助詞・送り仮名）は直前の塊にくっつける。
  // 「トイレ」＋「の」→「トイレの」となり、助詞の直後で改行できる。
  const out = [];
  for (const t of raw) {
    const isKana = /^[ぁ-ん]+$/.test(t);
    const isPunct = /^[、。！？・…]$/.test(t);
    if ((isKana || isPunct) && out.length) out[out.length - 1] += t;
    else out.push(t);
  }
  return out;
}

/** 見出しを最大3行に折り返す。塊の途中では切らない */
function wrap(title) {
  const head = toHeadline(title);
  const parts = chunks(head);
  const total = width(head);

  const pack = (limit) => {
    const lines = [];
    let cur = '';
    for (const part of parts) {
      if (cur && width(cur + part) > limit) { lines.push(cur); cur = ''; }
      cur += part;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // 1行の上限を少しずつ広げ、目標行数に収まった時点で採用する。
  // 上限を固定すると塊が入りきらず、短い見出しでも行数が増えてしまう。
  const packInto = (maxLines) => {
    const start = Math.max(Math.ceil(total / maxLines), ...parts.map(width));
    for (let limit = start; limit <= total; limit++) {
      const lines = pack(limit);
      if (lines.length <= maxLines) return lines;
    }
    return pack(total);
  };

  const target = total <= 9 ? 1 : total <= 19 ? 2 : 3;
  let lines = packInto(target);

  // 1行が長すぎると級数が小さくなり読みにくい。その場合は行数を増やす
  const MAX_PER_LINE = 13;
  for (let n = target; n < 3; n++) {
    if (Math.max(...lines.map(width)) <= MAX_PER_LINE) break;
    lines = packInto(n + 1);
  }

  return lines.slice(0, 3);
}

function buildSVG({ lines, label }) {
  const longest = Math.max(...lines.map(width));
  // 左55%に収めるため、最長行から級数を決める
  const size = Math.min(132, Math.floor((W * 0.52) / longest));
  const lh = Math.round(size * 1.28);
  const blockH = lh * lines.length;
  const top = Math.round((H - blockH) / 2) + size * 0.78;
  const x = 72;

  const texts = lines
    .map((t, i) =>
      `<text x="${x}" y="${top + i * lh}" font-family="Noto Sans JP" font-weight="900" ` +
      `font-size="${size}" fill="${COLORS.paper}" letter-spacing="-2">${esc(t)}</text>`
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"    stop-color="${COLORS.scrim}" stop-opacity="0.94"/>
      <stop offset="0.52" stop-color="${COLORS.scrim}" stop-opacity="0.82"/>
      <stop offset="1"    stop-color="${COLORS.scrim}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  <rect x="${x}" y="${top - size - 54}" width="8" height="${blockH + 20}" fill="${COLORS.amber}"/>
  <text x="${x + 26}" y="${top - size - 22}" font-family="Noto Sans JP" font-weight="700"
        font-size="30" fill="${COLORS.amber}" letter-spacing="4">${esc(label)}</text>
  ${texts}
  <text x="${x}" y="${H - 48}" font-family="Noto Sans JP" font-weight="700"
        font-size="30" fill="${COLORS.paper}" opacity="0.72" letter-spacing="3">neko-tech</text>
  <rect x="${x}" y="${H - 34}" width="150" height="5" fill="${COLORS.amber}"/>
</svg>`;
}

async function callModel(model, payload) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${model}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 180);
    const err = new Error(`HTTP ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  // モデルにより JSON(base64) とバイナリの両方がある
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const j = await res.json();
    const b64 = j.result?.image ?? j.result?.images?.[0];
    if (!b64) throw new Error('画像が返りませんでした: ' + JSON.stringify(j).slice(0, 180));
    return Buffer.from(b64, 'base64');
  }
  return Buffer.from(await res.arrayBuffer());
}

/** 成功したモデルを覚えて、2枚目以降は最初から試さない */
let workingModel = null;

async function generateBackground(category) {
  const prompt = buildPrompt(category);
  const negative = 'text, letters, words, watermark, logo, cartoon, illustration, deformed, extra limbs';
  const candidates = workingModel ? [workingModel] : MODELS;
  const problems = [];

  for (const model of candidates) {
    // パラメータ名はモデルごとに違うため、順に試す
    const payloads = [
      { prompt, negative_prompt: negative, width: W, height: H, steps: 6 },
      { prompt, negative_prompt: negative, width: W, height: H, num_steps: 20 },
      { prompt, steps: 6 },
      { prompt },
    ];
    for (const payload of payloads) {
      try {
        const buf = await callModel(model, payload);
        if (workingModel !== model) console.log(`  使用モデル: ${model}`);
        workingModel = model;
        return buf;
      } catch (e) {
        if (e.status === 410) { problems.push(`${model}: 廃止済み`); break; }   // 次のモデルへ
        if (e.status === 400) continue;                                        // 次のパラメータ形へ
        problems.push(`${model}: ${e.message}`);
        break;
      }
    }
  }
  throw new Error(problems.join(' / ') || '全モデルで失敗');
}

/** 背景が無い場合の代替。合成部分の確認とAPI未設定時に使う */
async function placeholderBackground() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="g" cx="0.78" cy="0.42" r="0.75">
      <stop offset="0" stop-color="#3a3026"/><stop offset="1" stop-color="#0d1014"/>
    </radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ---- main ----
const fontFiles = ['assets/fonts/NotoSansJP-Black.ttf', 'assets/fonts/NotoSansJP-Bold.ttf'];
await mkdir(OUT_DIR, { recursive: true });

const files = (await readdir(ART_DIR)).filter((f) => /\.mdx?$/.test(f));
let made = 0, skipped = 0, aiOk = 0, aiFail = 0;
const hasCreds = Boolean(ACCOUNT && TOKEN);

for (const file of files) {
  const slug = file.replace(/\.mdx?$/, '');
  const out = join(OUT_DIR, `${slug}.png`);
  if (existsSync(out) && !FORCE) { skipped++; continue; }

  const raw = await readFile(join(ART_DIR, file), 'utf-8');
  const fm = (raw.match(/^---\n([\s\S]*?)\n---/) || [, ''])[1];
  const get = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');

  const title = get('thumbTitle') || (get('title') || slug).split('｜')[0];
  const category = get('category') || 'life';
  const label = { 'litter-box': '自動トイレ', monitoring: '見守り・給餌', supplies: '消耗品', life: '猫の暮らし' }[category] || '';

  let bg;
  if (DRY || !hasCreds) {
    bg = await placeholderBackground();
  } else {
    try {
      bg = await generateBackground(category);
      aiOk++;
    } catch (e) {
      console.warn(`  [${slug}] 背景生成に失敗: ${e.message} → 代替背景を使用`);
      bg = await placeholderBackground();
      aiFail++;
    }
  }

  // sharp は resize を1回しか適用しない（resize→composite→resize と書くと
  // 2回目が優先され、合成が左上にずれる）。工程を分けること。
  // あわせて文字は出力解像度で直接ベクターレンダリングする（拡大より鮮明）。
  const base = await sharp(bg)
    .resize(OUT_W, OUT_H, { fit: 'cover', position: 'right', kernel: 'lanczos3' })
    .sharpen()
    .png()
    .toBuffer();

  const overlay = new Resvg(buildSVG({ lines: wrap(title), label }), {
    fitTo: { mode: 'width', value: OUT_W },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Noto Sans JP' },
  }).render().asPng();

  await sharp(base)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(out);

  console.log(`  [${slug}] 生成: ${title}`);
  made++;
}

console.log(`\nサムネイル: 生成 ${made} 件 / 既存 ${skipped} 件`);
if (!hasCreds) {
  console.log('CLOUDFLARE_ACCOUNT_ID / トークンが未設定のため代替背景で生成しました');
} else {
  console.log(`AI背景: 成功 ${aiOk} 件 / 失敗 ${aiFail} 件`);
}

// 認証情報があるのに1枚もAI生成できなかった場合は失敗として扱う。
// 代替背景のまま「成功」と表示されると、問題に気づけない。
if (hasCreds && aiOk === 0 && aiFail > 0) {
  console.error(
    '\nAI背景の生成が全件失敗しました。代替背景で出力しています。\n' +
    'モデルの廃止かトークン権限（Workers AI）を確認してください。\n' +
    '現行モデル一覧: https://developers.cloudflare.com/workers-ai/models/'
  );
  process.exit(1);
}
