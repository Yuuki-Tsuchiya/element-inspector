# ロードマップ (ROADMAP.md)

## 概要

このドキュメントは、最終目標である「SASS形式でCSSを抽出する拡張機能」に向けた開発ロードマップを定義します。

---

## 最終目標

Webページ上の要素を選択すると、その要素と子孫要素のCSSを**SASSのネスト形式**で出力する拡張機能。

### 最終出力イメージ

```scss
.container {
  display: flex;
  padding: 20px;

  .header {
    font-size: 24px;
    color: #333;

    .title {
      font-weight: bold;
    }
  }

  .content {
    flex: 1;

    p {
      line-height: 1.6;
    }
  }
}
```

---

## 開発ステップ

```
Step 1          Step 2          Step 3          Step 4
要素選択    →   CSS取得     →   再帰走査    →   SASS出力
  │               │               │               │
  ▼               ▼               ▼               ▼
基本構造        スタイル        ツリー構造      最終形態
  ✅              ✅              ✅              ✅
```

---

## Step 1: Element Inspector Lite ✅ 完了

### 目標
Chrome拡張機能の基本を習得し、要素選択機能を実装する。

### 機能
- [x] 拡張機能の基本構造
- [x] Inspectモード切り替え
- [x] ホバーハイライト
- [x] クリックで要素選択
- [x] 基本情報表示（タグ、ID、クラス、子要素数）
- [x] **DevToolsパネル対応**（ポップアップ閉じる問題を解決）
- [x] **ESCキーでキャンセル**
- [x] **選択履歴機能**
- [x] **ダークモード対応**

### 学習ポイント
- Manifest V3 の構造
- Content Script と Popup の通信
- DOM イベント処理
- Chrome Extensions API
- **DevTools Panel API**
- **Background Script (Service Worker) によるメッセージ転送**

### 成果物
- 動作する拡張機能
- 基本ドキュメント
- DevToolsパネル統合

---

## Step 2: CSS Property Inspector ✅ 完了

### 目標
選択した要素のCSSプロパティを取得・表示する。

### 機能
- [x] `getComputedStyle()` でCSS取得
- [x] 主要プロパティのフィルタリング（約50種類）
- [x] デフォルト値の非表示（意味のある値のみ表示）
- [x] CSS値の表示UI（シンタックスハイライト風）
- [x] 色プレビュー表示
- [x] コピー機能（`document.execCommand` フォールバック対応）
- [x] ダークモード対応

### 実装詳細

#### 取得するCSSプロパティ（主要約50種類）

| カテゴリ | プロパティ |
|----------|-----------|
| レイアウト | display, position, top, right, bottom, left, z-index, float, clear |
| ボックスモデル | width, height, min-*, max-*, margin-*, padding-*, box-sizing |
| Flexbox | flex, flex-direction, flex-wrap, justify-content, align-items, gap |
| Grid | grid-template-columns, grid-template-rows, grid-column, grid-row |
| テキスト | color, font-family, font-size, font-weight, line-height, text-align |
| 背景 | background, background-color, background-image, background-size |
| ボーダー | border, border-width, border-style, border-color, border-radius |
| その他 | opacity, visibility, overflow, cursor, box-shadow, transform, transition |

#### デフォルト値フィルタリング

```javascript
// デフォルト値と同じ場合はスキップ
const DEFAULT_VALUES = {
  'display': 'block',
  'position': 'static',
  'margin-top': '0px',
  // ... 約40種類のデフォルト値を定義
};
```

### 学習ポイント
- `window.getComputedStyle()` API
- DevToolsパネルでのクリップボードAPI制限と回避策
- CSSプロパティのデフォルト値の理解

### 解決した課題
- **デフォルト値との区別**: デフォルト値リストを定義してフィルタリング
- **クリップボードAPI制限**: `document.execCommand('copy')` でフォールバック対応

---

## Step 3: Nested Element Traversal ✅ 完了

### 目標
選択要素から子孫要素まで再帰的にCSS情報を取得する。

### 機能
- [x] 子要素の再帰走査
- [x] ツリー構造データの構築
- [x] 深度制限（5階層まで）
- [x] ツリープレビューUI（展開/折りたたみ対応）
- [x] 統計情報表示（要素数、深度）
- [x] ダークモード対応
- [x] **SASSコピー機能**（ツリー全体をSASS形式でコピー）

### データ構造

```javascript
{
  selector: '.container',
  styles: { display: 'flex', padding: '20px' },
  children: [
    {
      selector: '.header',
      styles: { fontSize: '24px' },
      children: [
        {
          selector: '.title',
          styles: { fontWeight: 'bold' },
          children: []
        }
      ]
    }
  ]
}
```

### 実装イメージ

```javascript
function buildStyleTree(element, depth = 0, maxDepth = 5) {
  if (depth > maxDepth) return null;

  const selector = generateSelector(element);
  const styles = getElementStyles(element);

  const children = Array.from(element.children)
    .map(child => buildStyleTree(child, depth + 1, maxDepth))
    .filter(Boolean);

  return { selector, styles, children };
}
```

### 実装詳細

#### セレクタ生成ロジック

```javascript
function generateSelector(element) {
  // 優先順位: ID > クラス > タグ名
  if (element.id) return `#${element.id}`;
  if (element.classList.length > 0) return `.${element.classList[0]}`;
  return element.tagName.toLowerCase();
}
```

#### ツリー構造

```javascript
{
  selector: '.container',
  tagName: 'div',
  id: null,
  classes: ['container'],
  styles: { display: 'flex', padding: '20px' },
  children: [...],
  depth: 0
}
```

### 学習ポイント
- 再帰処理によるDOM走査
- ツリー構造のUI表示（展開/折りたたみ）
- パフォーマンスを考慮した深度制限

### 解決した課題
- **深度制限**: MAX_DEPTH定数で5階層に制限
- **UI可視化**: 展開/折りたたみ可能なツリービューを実装
- **SASS出力**: treeToSASS()関数でネスト構造を再帰的に生成

### SASS出力例

```scss
.container {
  display: flex;
  padding: 20px;

  .header {
    font-size: 24px;
    color: #333;

    .title {
      font-weight: bold;
    }
  }
}
```

---

## Step 4: SASS Formatter ✅ 完了（Step 3に統合）

### 目標
取得したスタイルツリーをSASS形式で出力する。

### 機能
- [x] ツリー→SASSテキスト変換（`treeToSASS()`関数）
- [x] インデント整形（2スペース）
- [x] クリップボードコピー（SASSコピーボタン）
- [ ] 出力オプション（変数化など）- 将来対応
- [ ] ファイルダウンロード - 将来対応

**注**: 基本的なSASS出力機能はStep 3で実装済み。

---

## 完了したコア機能まとめ

| Step | 機能 | 状態 |
|------|------|------|
| 1 | 要素選択・ハイライト・DevToolsパネル | ✅ 完了 |
| 2 | CSS取得・フィルタリング・コピー | ✅ 完了 |
| 3 | 再帰走査・ツリー表示 | ✅ 完了 |
| 4 | SASS形式変換・コピー | ✅ 完了 |

---

## 拡張機能

### Source Map連携 ✅ 完了

CSSファイルの.css.mapを自動検出し、実際にSASSで定義されたプロパティのみを抽出。

#### 実装内容
- [x] CSSファイルから`sourceMappingURL`コメントを自動検出
- [x] 複数CSSファイル対応
- [x] Source Mapの`sourcesContent`からプロパティ名を抽出
- [x] DevToolsパネルにステータス表示
- [x] Source Mapがあれば自動的にフィルタリング
- [x] **完全なセレクタパスでのマッチング**（祖先チェーンを考慮）
- [x] **汎用セレクタ除外**（リセットCSS対策: `*`, `div`, `p`等をスキップ）
- [x] **メインSCSSファイルのみ対象**（パーシャルファイルは除外）

#### 技術詳細
```javascript
// CSSファイルからSource Map URLを検出
const match = cssText.match(/\/\*#\s*sourceMappingURL=(.+?)\s*\*\//);

// セレクタごとのプロパティをパース
function parseCSSForSelectors(cssText) {
  // セレクタ → プロパティセットのマッピングを構築
}

// 要素がセレクタにマッチするか判定（祖先チェーン考慮）
function elementMatchesCssSelector(element, cssSelector) {
  // 子孫コンビネータ、子コンビネータを処理
}
```

---

### 擬似要素対応 ✅ 完了

`::before`, `::after`の擬似要素をSASS出力に含める。

#### 実装内容
- [x] CSSから擬似要素ルールを抽出（`:before`と`::before`両対応）
- [x] 親セレクタと擬似要素のマッピング
- [x] SASS出力で`&::before`, `&::after`としてネスト表示

#### 出力例
```scss
.box-title-spot {
  padding-bottom: 25px;
  margin-bottom: 38px;
  position: relative;

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 1px;
    background-color: #e5e5e5;
  }
}
```

---

### 色のHEX形式変換 ✅ 完了

ブラウザが返す`rgb()`形式を`#ffffff`形式に自動変換。

#### 実装内容
- [x] `rgb(255, 255, 255)` → `#ffffff`
- [x] `rgba(255, 255, 255, 1)` → `#ffffff`（透明度1の場合）
- [x] `rgba(255, 255, 255, 0.5)` → そのまま維持（透明度がある場合）
- [x] `box-shadow`等の複合値内の色も変換対応

#### 対象プロパティ
- `color`, `background-color`, `border-color`
- `border-top-color`, `border-right-color`, `border-bottom-color`, `border-left-color`
- `outline-color`, `text-decoration-color`, `box-shadow`

---

### セレクタ生成の改善 ✅ 完了

タグ名を適切にセレクタに含める。

#### 実装内容
- [x] `div`要素: `.class-name`（タグ名省略）
- [x] それ以外: `h2.class-name`, `p.class-name`, `span.class-name`等

---

### 単位変換 ✅ 完了

CSSプロパティの単位を適切な形式に変換。

#### 実装内容
- [x] `line-height`: pxを単位なしに変換（例: `24px` → `1.5`）
- [x] `letter-spacing`: pxをemに変換（例: `1.6px` → `0.1em`）
- [x] font-sizeを基準とした相対値計算

---

### ツリー要素クリック選択 ✅ 完了

ツリー構造内の要素をクリックして選択対象を切り替え。

#### 実装内容
- [x] ツリー内の要素名をクリック可能に
- [x] クリックでその要素をルートとして全体を更新
- [x] XPathによる要素の一意識別
- [x] ホバースタイル（視覚的フィードバック）

---

### UIレイアウト改善 ✅ 完了

DevToolsパネルのレイアウトを最適化。

#### 実装内容
- [x] CSSプロパティとツリー構造を横並び表示
- [x] 要素情報をコンパクトな横並び表示
- [x] 履歴を下部に配置

#### レイアウト構造
```
├─ ヘッダー（検査開始ボタン、設定ボタン）
├─ 設定パネル（トグル表示）
├─ ステータス / Source Mapステータス
├─ メインコンテンツ（横並び）
│   ├─ CSSプロパティ（左）
│   └─ ツリー構造（右）
├─ 要素情報（コンパクト表示）
└─ 履歴
```

---

### メディアクエリ検出 ✅ 完了

SCSSのメディアクエリmixinを検出し、SASS出力に含める。

#### 実装内容
- [x] `@media (max-width: 767px)` → `@include g.smd()` に変換
- [x] `@media (max-width: 600px)` → `@include g.sm()` に変換
- [x] Source Mapからメディアクエリルールを抽出
- [x] 要素のセレクタにマッチするメディアクエリを検出
- [x] SASS出力でネストされた`@include`形式で出力

#### 出力例
```scss
.box-title-spot {
  padding-bottom: 25px;
  margin-bottom: 38px;

  @include g.smd() {
    padding-bottom: 20px;
    margin-bottom: 30px;
  }

  @include g.sm() {
    padding-bottom: 15px;
  }
}
```

---

### font-size mixin変換 ✅ 完了

font-sizeプロパティを`@include g.fsz()`形式に変換。

#### 実装内容
- [x] `font-size: 24px` → `@include g.fsz(24);`
- [x] `font-size: 2.6rem` → `@include g.fsz(26);` （1rem = 10px換算）
- [x] 通常スタイルとメディアクエリ内の両方で変換
- [x] 設定で有効/無効を切り替え可能

---

### 設定パネル ✅ 完了

出力オプションを設定画面で切り替え可能に。

#### 実装内容
- [x] 設定ボタン（⚙アイコン）でパネル表示/非表示
- [x] メディアクエリ取得の有効/無効設定
- [x] font-size mixin変換の有効/無効設定
- [x] 設定をchrome.storage.localに保存（永続化）
- [x] ダークモード対応

#### 設定項目
| 設定 | 説明 | デフォルト |
|------|------|-----------|
| メディアクエリを取得 | @include g.smd() 等の出力 | 有効 |
| font-sizeをmixinに変換 | @include g.fsz() への変換 | 有効 |
| hoverをmixinに変換 | @include g.hover() への変換 | 有効 |

---

### hover mixin変換 ✅ 完了

`:hover`擬似クラスを`@include g.hover() {}`形式に変換。

#### 実装内容
- [x] CSSの`:hover`擬似クラスを検出
- [x] `@include g.hover() {}`形式でSASS出力
- [x] 設定で有効/無効を切り替え可能

#### 出力例
```scss
a {
  background-color: #2f374f;

  @include g.hover() {
    opacity: 1;
    background-color: #007474;
  }
}
```

---

## 将来の拡張候補（オプション）

以下は追加機能候補です。

### 優先度: 高

| 機能 | 説明 | 難易度 |
|------|------|--------|
| **@include/@mixin展開** | パーシャルファイル（_mixins.scss等）の@includeを解析してプロパティ抽出 | 高 |
| ファイルダウンロード | .scssファイルとして保存 | 低 |
| SASS変数化 | 色などを`$variable`として出力 | 中 |

### 優先度: 中

| 機能 | 説明 | 難易度 |
|------|------|--------|
| 複数要素選択 | Ctrl+クリックで複数選択 | 中 |
| プリセット | よく使うプロパティセット | 低 |

### 優先度: 低

| 機能 | 説明 | 難易度 |
|------|------|--------|
| CSS変数対応 | カスタムプロパティの抽出 | 中 |

---

## 技術的な注意点（将来対応時の参考）

### パフォーマンス
- 大規模DOMでの走査時間
- `getComputedStyle` の呼び出し回数
- メモリ使用量

### 精度
- 擬似要素の扱い（::before, ::after）
- メディアクエリ内のスタイル
- `!important` の検出

### 互換性
- CSS変数（カスタムプロパティ）
- ベンダープレフィックス
- 新しいCSSプロパティ

---

## マイルストーン

| マイルストーン | 内容 | 状態 |
|---------------|------|------|
| M1 | Step 1 完了（基本拡張機能 + DevToolsパネル） | ✅ 完了 |
| M2 | Step 2 完了（CSS取得） | ✅ 完了 |
| M3 | Step 3 完了（再帰走査） | ✅ 完了 |
| M4 | Step 4 完了（SASS出力） | ✅ 完了 |
| M5 | β版リリース | ✅ 準備完了 |

---

## 参考リソース

### Chrome Extension
- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [DevTools Panels API](https://developer.chrome.com/docs/extensions/reference/devtools_panels/)

### CSS関連
- [getComputedStyle() - MDN](https://developer.mozilla.org/ja/docs/Web/API/Window/getComputedStyle)
- [SASS Documentation](https://sass-lang.com/documentation/)

### 類似ツール参考
- Chrome DevTools Elements パネル
- CSSPeeper 拡張機能
- WhatFont 拡張機能
