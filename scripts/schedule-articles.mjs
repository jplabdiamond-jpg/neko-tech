#!/usr/bin/env node
/**
 * 未公開記事に公開日を自動で割り当てる。
 *
 * draft: true または publishDate が未設定/過去の未公開記事を集め、
 * 1日あたり PER_DAY 本のペースで未来日付を振っていく。
 * Astro側は publishDate が未来の記事をビルドに含めないため、
 * 日次のスケジュール実行だけで自動的に記事が公開されていく。
 *
 * 使い方:
 *   node scripts/schedule-articles.mjs           # 予定を表示するだけ
 *   node scripts/schedule-articles.mjs --apply   # frontmatterを書き換える
 *   node scripts/schedule-articles.mjs --apply --per-day 1
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'src/content/articles';
const APPLY = process.argv.includes('--apply');
const idx = process.argv.indexOf('--per-day');
const PER_DAY = idx !== -1 ? Number(process.argv[idx + 1]) : 3;
/** 1日の公開時刻（JST）。3本なら朝・昼・夕に散らす */
const SLOTS = ['07:00', '12:00', '19:00', '09:00', '15:00', '21:00'].slice(0, PER_DAY);

const files = (await readdir(DIR)).filter((f) => /\.mdx?$/.test(f));
const pending = [];
const now = new Date();

for (const file of files) {
  const raw = await readFile(join(DIR, file), 'utf-8');
  const fm = (raw.match(/^---\n([\s\S]*?)\n---/) || [, ''])[1];
  const isDraft = /^draft:\s*true/m.test(fm);
  const pd = (fm.match(/^publishDate:\s*(.+)$/m) || [])[1]?.trim();
  const planNo = Number((fm.match(/^planNo:\s*(\d+)/m) || [])[1] ?? 9999);
  // 下書き、または公開日が未来のものを対象にする
  const future = pd && new Date(pd) > now;
  if (isDraft || future) pending.push({ file, raw, planNo, isDraft });
}

if (pending.length === 0) {
  console.log('公開待ちの記事はありません。');
  process.exit(0);
}

// キューの番号順（＝キーワード設計シートの順）に並べる
pending.sort((a, b) => a.planNo - b.planNo);

// 翌日から割り当てる
const start = new Date(now);
start.setDate(start.getDate() + 1);

console.log(`公開待ち ${pending.length} 本 / 1日 ${PER_DAY} 本で割り当て\n`);
let changed = 0;

for (let i = 0; i < pending.length; i++) {
  const day = new Date(start);
  day.setDate(day.getDate() + Math.floor(i / PER_DAY));
  const slot = SLOTS[i % PER_DAY];
  const date = day.toISOString().slice(0, 10);
  const stamp = `${date}T${slot}:00+09:00`;
  const p = pending[i];

  console.log(`  ${date} ${slot}  ${p.file}${p.isDraft ? '（下書き解除）' : ''}`);

  if (APPLY) {
    let out = p.raw;
    out = out.replace(/^publishDate:.*$/m, `publishDate: ${stamp}`);
    if (!/^publishDate:/m.test(out)) out = out.replace(/^---\n/, `---\npublishDate: ${stamp}\n`);
    // 実測値が未記入の下書きは解除しない（捏造防止の仕組みを壊さない）
    if (p.isDraft && !/\[要実測\]/.test(out)) out = out.replace(/^draft:\s*true\s*$/m, 'draft: false');
    await writeFile(join(DIR, p.file), out, 'utf-8');
    changed++;
  }
}

console.log(APPLY ? `\n${changed} 本を更新しました。` : '\n--apply を付けると実際に書き換えます。');
console.log('※ [要実測] が残る下書きは draft: true のまま維持されます。');
