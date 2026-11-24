# neko-tech

猫用デバイス（自動猫トイレ・見守りカメラ・給餌器など）の実測レビューメディア。
Amazonアソシエイト／楽天アフィリエイトで収益化する。

- 本番: https://neko-tech.pages.dev （独自ドメイン取得後に差し替え）
- 構成: Astro 5（静的生成）+ Cloudflare Pages
- 依存: Astro / @astrojs/sitemap のみ。CSSは自前（フレームワーク不使用）

## 開発

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ に出力
```

## デプロイ

`main` への push で GitHub Actions が走り、Cloudflare Pages に自動デプロイされる。

### 必要な設定（初回のみ）

1. **GitHub Secret**: `CLOUDFLARE_API_TOKEN`
   - Cloudflare ダッシュボード → My Profile → API Tokens
   - 権限: `Account / Cloudflare Pages / Edit`
   - リポジトリの Settings → Secrets and variables → Actions に登録
2. **Cloudflare Pages プロジェクト**: `neko-tech` という名前で作成
   - Account ID は `.github/workflows/deploy.yml` に直書き済み
3. 独自ドメイン取得後、Pages の Custom domains に追加し、
   `src/lib/site.ts` の `url` と `astro.config.mjs` の `SITE`、
   `public/robots.txt` の Sitemap 行を差し替える

## 記事の追加

`src/content/articles/<slug>.md` を作る。URL は `/articles/<slug>/`。

```yaml
---
title: 記事タイトル
description: 検索結果に出る説明文（120文字前後）
category: litter-box   # litter-box | monitoring | supplies | life
planNo: 17             # キーワード設計シートの管理番号
keyword: 自動猫トイレ デメリット
publishDate: 2026-12-01
verified: 実機を12ヶ月使用   # 独自性の明示。省略可
draft: true            # true の間は公開されない
---
```

`draft: true` の記事はビルド対象から除外される。
実測値が埋まるまで `draft: true` のままにすること。

## 方針（重要）

- **実測値を捏造しない。** 下書きの `[要実測]` が埋まるまで公開しない
- **Amazon規約（2026年4月改定）**: 第三者コンテンツの転載は不可。独自の解説・分析が必須。
  有料広告経由の流入は紹介料対象外なので、集客はSEOとオーガニックSNSのみ
- **Amazon一本足を避ける。** 楽天とASP（ペット保険等）を併用する
- アフィリエイトリンクには `rel="nofollow sponsored"` を付ける（`AffiliateCTA` が対応済み）

## 主要コンポーネント

| ファイル | 役割 |
| --- | --- |
| `src/components/CostCalculator.astro` | 年間コスト計算機。本サイト最大の差別化要素 |
| `src/components/AffiliateCTA.astro` | 収益リンク。rel属性と価格変動の注記を内包 |
| `src/layouts/ArticleLayout.astro` | 記事テンプレ。検証期間バッジとPR表記を自動挿入 |
| `src/lib/site.ts` | サイト名・ナビ・カテゴリ定義 |
