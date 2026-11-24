/**
 * 記事フォーマットと公開ローテーション。
 *
 * 同じ型の記事が続くとサイトの見え方が単調になり、内部リンクも偏る。
 * フォーマットを定義して順番に出すことで、収益記事と集客記事のバランスを
 * 機械的に保つ。
 */

export type FormatId = 'comparison' | 'pick' | 'cost' | 'troubleshoot' | 'guide' | 'health';

export interface FormatDef {
  label: string;
  /** 一覧やカードに出す短いラベル */
  badge: string;
  /** この型が担う役割 */
  role: '収益' | '集客' | '回収';
  /** 必要な画像の目安。撮影計画の指針になる */
  images: string;
  description: string;
}

export const formats: Record<FormatId, FormatDef> = {
  comparison: {
    label: '複数アイテム比較',
    badge: '比較',
    role: '収益',
    images: '各製品1枚以上＋比較カット1枚＋実測の様子1枚',
    description:
      '3〜7製品を同じ評価軸で比べる。実測値の表を中心に据え、条件別の推奨を出す。',
  },
  pick: {
    label: 'イチオシアイテム',
    badge: 'イチオシ',
    role: '収益',
    images: '主役カット1枚＋使用シーン2〜3枚＋細部1〜2枚',
    description:
      '1製品を深掘りする。長期使用の変化と「誰に向くか」を明確にする。単価が高い製品ほど効く。',
  },
  cost: {
    label: 'コスト検証',
    badge: 'コスト',
    role: '収益',
    images: '計算結果の図版＋消耗品の実物カット',
    description:
      'ランニングコストと総額を数字で出す。年間コスト計算機を埋め込む。実機写真が少なくても成立する。',
  },
  troubleshoot: {
    label: 'トラブル解決',
    badge: '解決',
    role: '集客',
    images: '問題箇所のカット＋手順カット2〜4枚',
    description:
      '競合が薄く最速で上位化する。指名検索の受け皿になり、消耗品への導線を持つ。',
  },
  health: {
    label: '健康・症状ガイド',
    badge: '健康',
    role: '集客',
    images: '観察ポイントの図版。症状写真は使わない',
    description:
      '症状の一般的な解説と受診の目安を示す。治療法や診断は書かない。' +
      '記録・観察に使うデバイス（自動トイレの排尿記録、体重計、給水器）と' +
      'ペット保険への導線を持つ。検索volumeが大きく、感情的な切迫度も高い。',
  },
  guide: {
    label: '暮らしガイド',
    badge: 'ガイド',
    role: '集客',
    images: '導入カット1枚（自宅の猫の写真で可）',
    description:
      '猫の飼育の悩みに答える。製品を売らず、収益記事へ内部リンクで送る。',
  },
};

/**
 * 公開ローテーション。先頭から順に消化し、一周したら戻る。
 * 収益:集客 = 4:4 で、収益記事に偏りすぎないようにしている。
 * 立ち上げ期は troubleshoot が多めになるよう先頭に寄せた。
 */
export const rotation: FormatId[] = [
  'troubleshoot',
  'troubleshoot',
  'cost',
  'health',
  'guide',
  'comparison',
  'health',
  'guide',
  'pick',
  'troubleshoot',
];

/** 公開済み本数から次に書くべきフォーマットを返す */
export function nextFormat(publishedCount: number): FormatId {
  return rotation[publishedCount % rotation.length];
}
