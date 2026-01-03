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
  ✅
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

## Step 2: CSS Property Inspector

### 目標
選択した要素のCSSプロパティを取得・表示する。

### 追加機能
- [ ] `getComputedStyle()` でCSS取得
- [ ] 重要なプロパティのフィルタリング
- [ ] CSS値の表示UI
- [ ] コピー機能

### 実装イメージ

```javascript
function getElementStyles(element) {
  const computed = window.getComputedStyle(element);
  const styles = {};

  // 重要なプロパティのみ抽出
  const importantProps = [
    'display', 'position', 'width', 'height',
    'margin', 'padding', 'color', 'background',
    'font-size', 'font-weight', 'border', 'flex'
  ];

  importantProps.forEach(prop => {
    const value = computed.getPropertyValue(prop);
    if (value && value !== 'none' && value !== 'auto') {
      styles[prop] = value;
    }
  });

  return styles;
}
```

### 課題
- デフォルト値との区別
- ショートハンドプロパティの扱い
- 継承プロパティの処理

---

## Step 3: Nested Element Traversal

### 目標
選択要素から子孫要素まで再帰的にCSS情報を取得する。

### 追加機能
- [ ] 子要素の再帰走査
- [ ] ツリー構造データの構築
- [ ] 深度制限オプション
- [ ] 要素フィルタリング

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

### 課題
- パフォーマンス（大量DOM対応）
- セレクタ生成の正確性
- 重複スタイルの最適化

---

## Step 4: SASS Formatter

### 目標
取得したスタイルツリーをSASS形式で出力する。

### 追加機能
- [ ] ツリー→SASSテキスト変換
- [ ] インデント整形
- [ ] 出力オプション（変数化など）
- [ ] ファイルダウンロード
- [ ] クリップボードコピー

### 出力形式オプション

```javascript
const outputOptions = {
  format: 'scss',        // 'scss' | 'css'
  indent: 2,             // インデントスペース数
  includeEmpty: false,   // スタイルなし要素を含む
  useVariables: false,   // 色などを変数化
  selectorType: 'class'  // 'class' | 'tag' | 'full'
};
```

### 変換ロジック

```javascript
function treeToSass(node, indent = 0) {
  const spaces = '  '.repeat(indent);
  let output = '';

  output += `${spaces}${node.selector} {\n`;

  // スタイルを出力
  Object.entries(node.styles).forEach(([prop, value]) => {
    output += `${spaces}  ${prop}: ${value};\n`;
  });

  // 子要素を再帰処理
  if (node.children.length > 0) {
    output += '\n';
    node.children.forEach(child => {
      output += treeToSass(child, indent + 1);
    });
  }

  output += `${spaces}}\n`;
  return output;
}
```

### UI追加
- SASS出力パネル
- シンタックスハイライト
- ダウンロードボタン
- オプション設定

---

## オプション機能（将来）

### Step 5+: 拡張機能

優先度順:

| 機能 | 説明 | 難易度 |
|------|------|--------|
| Source Map連携 | SASSの元ファイル行数表示 | 高 |
| 差分抽出 | デフォルトとの差分のみ出力 | 中 |
| 複数要素選択 | Ctrl+クリックで複数選択 | 中 |
| プリセット | よく使うプロパティセット | 低 |
| エクスポート | .scssファイル出力 | 低 |
| 履歴機能 | 過去の選択を保存 | 中 |

---

## 技術的な注意点

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
| M2 | Step 2 完了（CSS取得） | 未着手 |
| M3 | Step 3 完了（再帰走査） | 未着手 |
| M4 | Step 4 完了（SASS出力） | 未着手 |
| M5 | β版リリース | 未着手 |

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
