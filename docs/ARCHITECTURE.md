# アーキテクチャ / 設計図（初心者向け）

このドキュメントは、**「このアプリが何をしていて、どのファイルがどの役割で、どこにつながっているか」**を、IT初心者でも追えるようにまとめたものです。

---

### このアプリは何をする？
- **目的**: お題（テーマ）に対して答えを入力し、**正誤判定**して結果を見ながら語彙を覚えるアプリです。
- **特徴**:
  - テーマ（お題）は **データ(JSON)** から増やせる
  - 答えの **表記ゆれ（全角/半角、カタカナ/ひらがな等）** を吸収して判定する
  - 実施回数などの **記録を端末内に保存**（DB/サーバー不要）

---

### 重要な考え方（ざっくり2層）
このプロジェクトは大きく分けて2つの層があります。

- **アプリ実行時（React Native / Expo）**
  - 画面の表示、入力、採点、記録表示など
  - ここでは **外部APIにアクセスしない**（ユーザー操作のたびにネット通信しない）

- **生成時（Node scripts）**
  - `datasets/` の JSON を生成・検証し、`themes.generated.ts` を作る
  - ここで **品質ゲート**（id重複、カテゴリ表記ゆれ、answers空など）をチェックして止める

---

### フォルダ構成と役割

### `app/`（画面＝ルーティング）
Expo Router のルールで、**ファイルが画面**になります。

- **`app/(tabs)/index.tsx`**
  - 出題画面（メイン）
  - カテゴリ選択、ランダム出題、入力/チップ、送信、結果表示、アニメーション
  - 送信時に記録保存（AsyncStorage）

- **`app/(tabs)/record.tsx`**
  - 記録画面
  - 全体/テーマ別の実施回数・成功回数・成功率を表示

- **`app/(tabs)/_layout.tsx`**
  - 下部タブの定義（出題/Explore/記録など）

- **`app/(tabs)/explore.tsx`**
  - テンプレ由来のサンプル画面（学習用/残置）

- **`app/_layout.tsx`**
  - アプリ全体の Stack 構成（タブを包む）

---

### `datasets/`（テーマデータと生成物）
アプリが読む **テーマの元データ（JSON）** と、生成物を置きます。

#### テーマ用（出題に使われる）
- **`datasets/*.json`（直下）**
  - 出題に使うテーマのデータ
  - 形式（統一）:
    - `id`, `title`, `categoryId`, `categoryTitle`, `answers: string[]`

#### canonical辞書（テーマではない）
- **`datasets/canonical/*.json`**
  - テーマとは別の「辞書データ」
  - 例: **`datasets/canonical/countries_base.json`**
    - 国コード(ISO2)をキーにした canonical な国データ（日本語名/英語名など）

#### アプリ側が読む入口
- **`datasets/themes.ts`**
  - アプリ側は基本ここだけ import すれば良い
  - 中身は **`themes.generated.ts` の re-export**のみ

#### 自動生成されるテーマ一覧
- **`datasets/themes.generated.ts`**
  - Nodeスクリプトで生成される TypeScript
  - `export const THEMES` と `export const CATEGORIES` を持つ
  - アプリはここからカテゴリUIや出題対象を決める
  - 通常は生成物扱い（`.gitignore` 対象）

---

### `src/lib/`（アプリのロジック）

#### `src/lib/normalize.ts`
- **`normalizeAnswer(text)`** を提供
- 目的: 表記ゆれを吸収して「同じ答え」を同一扱いにする
  - スペース除去、半角カナ→全角カナ（手動）、英字小文字化、カタカナ→ひらがな、など

#### `src/lib/grading.ts`
- **`gradeAnswers(userAnswers, correctAnswers)`** を提供
- 目的: 正解集合とユーザー回答を正規化して突き合わせ、結果を返す
  - `score`, `wrong`, `missing`, `missingSuggested` など

#### `src/lib/records.ts`
- AsyncStorage を使って **端末内に記録を保存**
- `recordPlay(themeId, isPerfect)` / `loadStats()` など

---

### `scripts/`（生成時パイプライン＝品質ゲート）
ここが「テーマを自分で増やす運用をやめる」ための要です。

### 生成の入口（npm scripts）
よく使うのはこれだけです。

- **`npm run datasets:generate`**
  - source群から `datasets/` を生成
  - テーマJSONは `datasets/{id}.json`
  - canonical辞書は `datasets/canonical/{id}.json`

- **`npm run themes:generate`**
  - `datasets/*.json`（テーマ用）を検証して `themes.generated.ts` を生成

- **`npm run prepare:data`**
  - `datasets:generate` → `themes:generate` をまとめて実行

### `scripts/sources/`（データの供給元）
- **`demo.mjs`**: 動作確認用のダミー（テーマを2件返す）
- **`cldr_ja_territories.mjs`**: CLDR（node_modules）から「世界の国」テーマを作る
- **`rest_countries_base.mjs`**: REST Countries（生成時fetch）から canonical 辞書 `countries_base` を作る

各sourceは以下どちらか（または両方）を export します。
- `fetchThemes(): ThemeSpec[]`（テーマ用）
- `fetchDatasets(): DatasetSpec[]`（canonical用）

### `scripts/generate-datasets.mjs`（datasets生成）
- sourceから集めた ThemeSpec/DatasetSpec を **検証→整形→ファイル出力**します。
- **壊れた状態を残さないために**
  - 重大な不正はエラーで止める（品質ゲート）
  - 書き込みは atomic（tmp→rename）
  - ログに件数を出す（検証しやすい）

### `scripts/generate-themes.mjs`（themes.generated.ts生成）
- `datasets/` 直下の **テーマ用JSONだけ**を対象に検証して生成します。
- `datasets/canonical/` はそもそも対象外（物理分離しているため）

---

### 「つながり」を図で理解する（最重要）

### 1) データ生成（開発者が実行）
`npm run prepare:data` を実行すると…

1. `scripts/generate-datasets.mjs`
   - `scripts/sources/*` からデータ取得
   - `datasets/*.json`（テーマ）と `datasets/canonical/*.json`（辞書）を生成
2. `scripts/generate-themes.mjs`
   - `datasets/*.json`（テーマ）を検証
   - `datasets/themes.generated.ts` を生成

### 2) アプリ実行（ユーザーが触る）
アプリは…

- `datasets/themes.ts` を import
  - → `themes.generated.ts` の `CATEGORIES/THEMES` を使う
- 出題画面（`app/(tabs)/index.tsx`）が
  - カテゴリ選択 → テーマ決定 → dataset.answers を出題
  - `normalizeAnswer()` で重複チェック/正誤判定の前処理
  - `gradeAnswers()` で採点
  - `recordPlay()` で端末内に記録保存

---

### よくある変更はどこを触る？

### 画面の見た目や操作を変えたい
- `app/(tabs)/index.tsx`
- `app/(tabs)/record.tsx`

### 正規化（表記ゆれ）のルールを変えたい
- `src/lib/normalize.ts`

### 採点や模範解答のルールを変えたい
- `src/lib/grading.ts`

### 記録（保存/集計）の仕様を変えたい
- `src/lib/records.ts`

### テーマやカテゴリを増やしたい（運用）
- 可能なら **`scripts/sources/*` を増やして `prepare:data`**
- 手動でJSONを置く場合は `datasets/*.json` を追加（品質ゲートで止まる場合はログ参照）

---

### 用語ミニ辞典
- **theme / テーマ**: 出題の単位（「世界の国」など）。answersを持つ。
- **category / カテゴリ**: テーマのグルーピング（「地理」など）。
- **canonical / 辞書**: 出題そのものではなく、他のテーマ生成の土台になる整ったデータ。
- **quality gate / 品質ゲート**: データが壊れていたら起動前に止める仕組み。


