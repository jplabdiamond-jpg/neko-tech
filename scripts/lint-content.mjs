#!/usr/bin/env node
/**
 * 記事の内容検査。健康系記事を自動生成に組み込むうえでの安全装置。
 *
 * 検査する観点:
 *   1. 薬機法 — ペット用品に治療・効能を謳う表現がないか
 *   2. 救急性 — 命に関わる症状を扱う記事に受診勧奨(emergency)があるか
 *   3. 順序   — 受診勧奨より前にアフィリエイトCTAが来ていないか
 *   4. 診断   — 断定的な診断表現がないか
 *
 * 使い方:
 *   node scripts/lint-content.mjs            # 警告のみ
 *   node scripts/lint-content.mjs --strict   # 違反があれば終了コード1（CI用）
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const STRICT = process.argv.includes('--strict');
const DIR = 'src/content/articles';

/** 薬機法で問題になる効能表現。ペット用品は医薬品ではない */
const PHARMA_NG = [
  { re: /治る|治す|完治|治療でき/, why: '治療効果の標榜' },
  { re: /(?<!効果的な使い)効果があ(る|り)|効能|効き目/, why: '効能の標榜' },
  { re: /症状が(消え|なくな)/, why: '症状消失の標榜' },
  { re: /(?<!予防接種|予防医療|予防歯科)を予防でき/, why: '疾病予防の標榜' },
  { re: /副作用(は|が)な(い|く)/, why: '安全性の保証' },
  { re: /医薬品(と)?同(等|様)/, why: '医薬品的表現' },
];

/** 命に関わる症状。扱うなら emergency の受診勧奨が必須 */
const EMERGENCY_TOPICS = [
  { re: /尿が出な|おしっこが出な|尿路閉塞|オシッコが出な/, name: '尿路閉塞' },
  { re: /呼吸が(苦し|荒|速)|開口呼吸/, name: '呼吸困難' },
  { re: /痙攣|けいれん/, name: '痙攣' },
  { re: /中毒|誤飲|誤食/, name: '中毒・誤飲' },
  { re: /ぐったり|意識が(な|もうろう)/, name: '虚脱' },
  { re: /大量に(吐|嘔吐)|吐き続け/, name: '反復嘔吐' },
  { re: /血尿|血便|吐血/, name: '出血' },
];

/** 診断の断定 */
const DIAGNOSIS_NG = [
  { re: /この症状(は|なら)[^。]{0,20}(病|症|炎|結石)です/, why: '断定的な診断' },
  { re: /間違いなく[^。]{0,15}(病|症|炎)/, why: '断定的な診断' },
];

const files = (await readdir(DIR)).filter((f) => /\.mdx?$/.test(f));
const problems = [];

for (const file of files) {
  const raw = await readFile(join(DIR, file), 'utf-8');
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  const front = fm ? fm[1] : '';
  const body = fm ? raw.slice(fm[0].length) : raw;
  const format = (front.match(/^format:\s*(\S+)/m) || [])[1];
  const isDraft = /^draft:\s*true/m.test(front);
  const add = (level, msg) => problems.push({ file, level, msg, isDraft });

  // 1. 薬機法
  for (const { re, why } of PHARMA_NG) {
    const m = body.match(re);
    if (m) add('error', `薬機法リスク（${why}）: 「${m[0]}」`);
  }

  // 4. 診断の断定
  for (const { re, why } of DIAGNOSIS_NG) {
    const m = body.match(re);
    if (m) add('error', `${why}: 「${m[0].slice(0, 30)}」`);
  }

  // 2 & 3. 健康系の救急対応
  const hasVetNotice = /<VetNotice/.test(body);
  const emergencyTopics = EMERGENCY_TOPICS.filter((t) => t.re.test(body));

  if (format === 'health' && !hasVetNotice) {
    add('error', '健康記事に <VetNotice> がありません');
  }
  if (emergencyTopics.length > 0) {
    const names = emergencyTopics.map((t) => t.name).join('・');
    if (!/<VetNotice[^>]*level=["']emergency["']/.test(body)) {
      add('error', `命に関わる症状（${names}）を扱っていますが level="emergency" の受診勧奨がありません`);
    } else {
      // 3. 受診勧奨よりCTAが先に来ていないか
      const vetPos = body.search(/<VetNotice[^>]*level=["']emergency["']/);
      const ctaPos = body.search(/<AffiliateCTA|<ProductCard|amazon\.co\.jp\/dp\//);
      if (ctaPos !== -1 && ctaPos < vetPos) {
        add('error', `救急の受診勧奨より前に商品CTAがあります（受診を遅らせる誘導になります）`);
      }
    }
  }

  if (format === 'health' && !/獣医師/.test(body)) {
    add('warn', '健康記事に獣医師への言及がありません');
  }
}

if (problems.length === 0) {
  console.log(`記事 ${files.length} 本を検査しました。問題なし。`);
  process.exit(0);
}

const errors = problems.filter((p) => p.level === 'error');
const warns = problems.filter((p) => p.level === 'warn');

for (const p of problems) {
  const tag = p.level === 'error' ? '[NG]' : '[注意]';
  console.log(`${tag} ${p.file}${p.isDraft ? '（下書き）' : ''}\n      ${p.msg}`);
}
console.log(`\n検査 ${files.length} 本 / NG ${errors.length} 件 / 注意 ${warns.length} 件`);

// 下書きのNGは公開されないので、strictでも落とさない
const blocking = errors.filter((p) => !p.isDraft);
if (STRICT && blocking.length > 0) {
  console.log(`\n公開記事に ${blocking.length} 件のNGがあります。修正してください。`);
  process.exit(1);
}
process.exit(0);
