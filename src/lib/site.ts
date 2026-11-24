export const site = {
  name: 'neko-tech',
  nameJa: 'ねこテック',
  tagline: '猫の道具を、実測で選ぶ。',
  description:
    '自動猫トイレ・見守りカメラ・給餌器などの猫用デバイスを、長期使用と実測データで比較するレビューメディア。ランニングコストまで数字で検証します。',
  // 独自ドメイン取得後に差し替え
  url: 'https://neko-tech.pages.dev',
  nav: [
    { href: '/category/litter-box/', label: '自動トイレ' },
    { href: '/category/monitoring/', label: '見守り・給餌' },
    { href: '/category/supplies/', label: '消耗品' },
    { href: '/category/life/', label: '猫の暮らし' },
  ],
  tools: [{ href: '/tools/cost-simulator/', label: '年間コスト計算機' }],
} as const;

/**
 * 運営者情報。ASP審査とE-E-A-Tのために必要。
 * ここが空の間、/about/ は「準備中」表示かつ noindex になる。
 * ハンドルネームでも可。連絡先はメールアドレスかフォームのURL。
 */
export const owner = {
  name: '',      // 例: 'さね' / 'neko-tech編集部'
  contact: '',   // 例: 'contact@neko-tech.com'
  since: '2026', // サイト開設年
} as const;

export const ownerReady = owner.name !== '' && owner.contact !== '';

export const categoryLabels: Record<string, string> = {
  'litter-box': '自動トイレ',
  monitoring: '見守り・給餌',
  supplies: '消耗品',
  life: '猫の暮らし',
};
