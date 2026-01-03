# 開発ガイド (DEVELOPMENT.md)

## 1. 開発環境セットアップ

### 1.1 必要なもの
- Google Chrome（バージョン88以上）
- テキストエディタ（VS Code推奨）
- Git（バージョン管理用）

### 1.2 プロジェクト作成

```bash
# プロジェクトディレクトリ作成
mkdir element-inspector
cd element-inspector

# 基本ディレクトリ構造作成
mkdir -p popup content devtools icons docs
```

### 1.3 推奨VS Code拡張機能

- **Chrome Extension Manifest JSON Schema**: manifest.jsonの補完
- **ESLint**: コード品質チェック
- **Prettier**: コードフォーマット

---

## 2. ファイル構成

```
element-inspector/
├── manifest.json          # 拡張機能の設定ファイル
├── background.js          # Service Worker
├── popup/
│   ├── popup.html         # ポップアップUI
│   ├── popup.js           # ポップアップロジック
│   └── popup.css          # ポップアップスタイル
├── devtools/
│   ├── devtools.html      # DevTools初期化
│   ├── devtools.js        # パネル作成
│   ├── panel.html         # DevToolsパネルUI
│   ├── panel.js           # パネルロジック
│   └── panel.css          # パネルスタイル
├── content/
│   ├── content.js         # ページ注入スクリプト
│   └── content.css        # ハイライトスタイル
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 3. 実装詳細

### 3.1 manifest.json

```json
{
  "manifest_version": 3,
  "name": "Element Inspector Lite",
  "version": "1.0.0",
  "description": "Webページ上の要素をクリックして情報を表示するシンプルな拡張機能",
  "permissions": ["activeTab", "scripting"],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  },
  "devtools_page": "devtools/devtools.html",
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "css": ["content/content.css"],
      "js": ["content/content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### 3.2 DevToolsパネル作成

#### devtools/devtools.html
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body>
  <script src="devtools.js"></script>
</body>
</html>
```

#### devtools/devtools.js
```javascript
'use strict';

chrome.devtools.panels.create(
  'Element Inspector',  // パネル名
  '',                   // アイコン（省略可）
  '/devtools/panel.html', // パネルHTML（絶対パス）
  (panel) => {
    console.log('Element Inspector panel created');
  }
);
```

**注意**: `panel.html` のパスは拡張機能ルートからの絶対パス（`/devtools/panel.html`）を使用

### 3.3 Background Script

```javascript
'use strict';

// Content Script からのメッセージを DevTools Panel に転送
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'elementSelected' || message.action === 'inspectCancelled') {
    chrome.runtime.sendMessage(message).catch(() => {
      // DevTools パネルが開いていない場合は無視
    });
  }
  sendResponse({ status: 'ok' });
  return true;
});
```

### 3.4 Content Script

```javascript
'use strict';

(() => {
  // 重複読み込み防止
  if (window.elementInspectorLoaded) return;
  window.elementInspectorLoaded = true;

  let isInspecting = false;
  let currentHighlightedElement = null;

  function getElementInfo(element) {
    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: Array.from(element.classList).filter(
        (c) => !c.startsWith('element-inspector-')
      ),
      childCount: element.children.length
    };
  }

  function handleClick(event) {
    if (!isInspecting) return;
    event.preventDefault();
    event.stopPropagation();

    const info = getElementInfo(event.target);
    stopInspectMode();

    chrome.runtime.sendMessage({
      action: 'elementSelected',
      data: info
    });
  }

  function handleKeyDown(event) {
    if (!isInspecting) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      stopInspectMode();
      chrome.runtime.sendMessage({ action: 'inspectCancelled' });
    }
  }

  // メッセージリスナー
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'startInspect':
        startInspectMode();
        sendResponse({ status: 'ok' });
        break;
      case 'stopInspect':
        stopInspectMode();
        sendResponse({ status: 'ok' });
        break;
      case 'getStatus':
        sendResponse({ isInspecting, lastElementInfo });
        break;
    }
    return true;
  });
})();
```

---

## 4. Chrome拡張機能の読み込み

### 4.1 デベロッパーモードの有効化

1. Chrome で `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をON

### 4.2 拡張機能の読み込み

1. 「パッケージ化されていない拡張機能を読み込む」をクリック
2. `element-inspector` フォルダを選択
3. 拡張機能がリストに表示される

### 4.3 更新方法

コード変更後:
1. `chrome://extensions/` を開く
2. 拡張機能カードの更新ボタン（🔄）をクリック
3. **DevToolsを開き直す**（DevToolsパネルの変更を反映するため）

---

## 5. デバッグ方法

### 5.1 Popup のデバッグ

1. 拡張機能アイコンを右クリック
2. 「ポップアップを検証」を選択
3. DevToolsでConsole/Elementsを確認

### 5.2 DevTools Panel のデバッグ

1. DevToolsを開く（F12）
2. Element Inspectorパネルを開く
3. **別のDevToolsを開く**: Ctrl+Shift+I（DevToolsにフォーカスした状態）
4. このDevToolsでパネルのエラーを確認

### 5.3 Content Script のデバッグ

1. 対象のWebページでDevToolsを開く（F12）
2. Consoleタブでログを確認
3. Sourcesタブ → Content scripts でブレークポイント設定可能

### 5.4 Background Script のデバッグ

1. `chrome://extensions/` を開く
2. 拡張機能の「Service Worker」リンクをクリック
3. DevToolsが開く

### 5.5 よくあるエラー

| エラー | 原因 | 解決策 |
|--------|------|--------|
| `Uncaught TypeError` | DOM要素が見つからない | `DOMContentLoaded` で初期化 |
| `Could not establish connection` | Content Scriptが読み込まれていない | ページをリロード |
| `Invalid manifest` | JSON構文エラー | JSONバリデータで確認 |
| パネルが「移動、編集、または削除された可能性があります」 | パネルHTMLパスが不正 | 絶対パス（`/devtools/panel.html`）を使用 |

---

## 6. コーディング規約

### 6.1 JavaScript

- ES6+構文を使用
- `const`/`let` を使用（`var`禁止）
- 関数名はcamelCase
- 定数はUPPER_SNAKE_CASE
- セミコロン必須

```javascript
// Good
const MAX_HISTORY = 10;
function getElementInfo(element) { /* ... */ }

// Bad
var maxHistory = 10;
function GetElementInfo(element) { /* ... */ }
```

### 6.2 CSS

- BEM命名規則を参考に
- `!important` は最小限に
- プレフィックス `element-inspector-` を使用

```css
/* Good */
.element-inspector-highlight { }
.element-inspector__info-panel { }

/* Bad */
.highlight { }
.info { }
```

### 6.3 ファイル構成

- 1ファイル1責務
- 関連するコードは近くに配置
- コメントは「なぜ」を説明

---

## 7. DevToolsパネル実装のポイント

### 7.1 パスの指定

DevToolsパネル内のリソース参照は**絶対パス**を使用:

```html
<!-- panel.html -->
<link rel="stylesheet" href="/devtools/panel.css">
<script src="/devtools/panel.js"></script>
```

### 7.2 メッセージ通信

DevToolsパネルからContent Scriptへの通信:

```javascript
// panel.js
async function sendMessageToContent(action) {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  return chrome.tabs.sendMessage(tabId, { action });
}
```

### 7.3 ダークモード対応

```css
@media (prefers-color-scheme: dark) {
  body {
    background: #202124;
    color: #e8eaed;
  }
}
```

---

## 8. トラブルシューティング

### 拡張機能が読み込めない

```bash
# manifest.json の構文チェック
cat manifest.json | python -m json.tool
```

### Content Scriptが動作しない

1. `chrome://extensions/` でエラーを確認
2. `matches` パターンが正しいか確認
3. ページをリロード

### メッセージ通信ができない

1. `sendResponse` を返しているか確認
2. `return true` を忘れていないか確認
3. タブIDが正しいか確認

### DevToolsパネルが表示されない

1. パスが絶対パス（`/devtools/panel.html`）になっているか確認
2. 拡張機能を再読み込み
3. DevToolsを閉じて開き直す
