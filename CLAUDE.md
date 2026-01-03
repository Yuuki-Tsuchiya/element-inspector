# CLAUDE.md - Claude Code用プロジェクトガイド

## プロジェクト概要

Chrome拡張機能「Element Inspector Lite」の開発プロジェクトです。
Webページ上の要素をクリックして、その要素の情報（タグ名、ID、クラス、子要素数）を表示します。

## 技術スタック

- **Chrome Extensions Manifest V3**
- **Vanilla JavaScript (ES6+)**
- **CSS**
- 外部ライブラリは使用しない

## ディレクトリ構造

```
element-inspector/
├── manifest.json          # 拡張機能設定（必須）
├── README.md              
├── CLAUDE.md              # 本ファイル
├── popup/
│   ├── popup.html         # ポップアップUI
│   ├── popup.js           # ポップアップロジック
│   └── popup.css          # ポップアップスタイル
├── content/
│   ├── content.js         # ページ注入スクリプト
│   └── content.css        # ハイライト用スタイル
├── icons/
│   ├── icon16.png         # 16x16
│   ├── icon48.png         # 48x48
│   └── icon128.png        # 128x128
└── docs/
    ├── REQUIREMENTS.md    # 要件定義
    ├── ARCHITECTURE.md    # アーキテクチャ設計
    ├── DEVELOPMENT.md     # 開発ガイド
    ├── TESTING.md         # テスト方法
    └── ROADMAP.md         # 開発ロードマップ
```

## 開発時の注意点

### Manifest V3 の制約
- Background Scripts ではなく Service Worker を使用
- `chrome.scripting` API を使用（`chrome.tabs.executeScript` は非推奨）
- Content Security Policy が厳格

### コーディング規約
- `const`/`let` を使用（`var` 禁止）
- セミコロン必須
- 関数名は camelCase
- CSSクラスには `element-inspector-` プレフィックス

### よくある問題と解決策
1. **Content Script が動作しない** → ページをリロード
2. **メッセージ通信エラー** → `return true` を忘れていないか確認
3. **ポップアップが閉じる** → 非同期処理中のUIは保持されない

## 主要な実装ポイント

### 1. メッセージ通信パターン

```javascript
// Popup → Content Script
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const response = await chrome.tabs.sendMessage(tab.id, { action: 'startInspect' });

// Content Script でのリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 処理...
  sendResponse({ status: 'ok' });
  return true; // 非同期レスポンス用
});
```

### 2. 要素情報取得

```javascript
function getElementInfo(element) {
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: Array.from(element.classList),
    childCount: element.children.length
  };
}
```

### 3. ハイライト表示

```javascript
function highlightElement(element) {
  element.classList.add('element-inspector-highlight');
}
```

## 実装順序

1. `manifest.json` を作成
2. `popup/popup.html`, `popup.css`, `popup.js` を実装
3. `content/content.js`, `content.css` を実装
4. アイコンを作成（または仮アイコンを配置）
5. Chromeに読み込んでテスト

## テスト方法

1. `chrome://extensions/` を開く
2. デベロッパーモードを有効化
3. 「パッケージ化されていない拡張機能を読み込む」
4. プロジェクトフォルダを選択

## コマンド例

```bash
# プロジェクトの構造確認
tree -I 'node_modules'

# JSONの構文チェック
cat manifest.json | python3 -m json.tool

# 全ファイル一覧
find . -type f -name "*.js" -o -name "*.html" -o -name "*.css"
```

## 参考ドキュメント

詳細な仕様は `docs/` フォルダを参照:
- 要件: `docs/REQUIREMENTS.md`
- 設計: `docs/ARCHITECTURE.md`
- 開発: `docs/DEVELOPMENT.md`
- テスト: `docs/TESTING.md`
- 計画: `docs/ROADMAP.md`

## 最終目標

このStep 1を完了後、段階的に以下を追加予定:
- Step 2: CSS プロパティ取得
- Step 3: 子孫要素の再帰走査
- Step 4: SASS形式でのネスト出力
