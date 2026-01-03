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
mkdir -p popup content icons docs
```

### 1.3 推奨VS Code拡張機能

- **Chrome Extension Manifest JSON Schema**: manifest.jsonの補完
- **ESLint**: コード品質チェック
- **Prettier**: コードフォーマット

---

## 2. 実装手順

### Phase 1: 基本構造の作成

#### Step 1.1: manifest.json作成

```bash
# ファイル作成
touch manifest.json
```

**実装内容**:
```json
{
  "manifest_version": 3,
  "name": "Element Inspector Lite",
  "version": "1.0.0",
  "description": "ページ上の要素情報を簡単に確認できる拡張機能",
  "permissions": ["activeTab", "scripting"],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/content.js"],
      "css": ["content/content.css"],
      "run_at": "document_end"
    }
  ]
}
```

#### Step 1.2: アイコン作成

シンプルなプレースホルダーアイコンを作成（後で差し替え可能）:

```bash
# 一時的にSVGをPNGに変換するか、オンラインツールを使用
# 最低限 icon48.png があれば動作する
```

**アイコン仕様**:
- 16x16: ツールバー用
- 48x48: 拡張機能管理画面用
- 128x128: ストア用

---

### Phase 2: Popup UIの実装

#### Step 2.1: popup.html

```bash
touch popup/popup.html
```

**実装内容**:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Element Inspector</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <h1>Element Inspector</h1>
    
    <button id="toggleBtn" class="btn btn-primary">
      Inspectモードを開始
    </button>
    
    <div id="elementInfo" class="info-panel">
      <p class="placeholder">要素を選択してください</p>
    </div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

#### Step 2.2: popup.css

```bash
touch popup/popup.css
```

**実装ポイント**:
- 幅: 300px固定
- ダークモード非対応（シンプルに保つ）
- ボタンの状態スタイル（通常/アクティブ）

#### Step 2.3: popup.js

```bash
touch popup/popup.js
```

**実装する関数**:

```javascript
// DOM要素の取得
const toggleBtn = document.getElementById('toggleBtn');
const elementInfo = document.getElementById('elementInfo');

// 状態管理
let isInspectMode = false;

// 初期化
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // 現在のタブのInspectモード状態を取得
  // UIを更新
}

// モード切り替え
toggleBtn.addEventListener('click', toggleInspectMode);

async function toggleInspectMode() {
  // Content Scriptにメッセージ送信
  // UI更新
}

// 要素情報の表示
function displayElementInfo(info) {
  // 情報をHTMLとして整形
  // elementInfoに表示
}

// Content Scriptへのメッセージ送信
async function sendMessage(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return chrome.tabs.sendMessage(tab.id, { action });
}
```

---

### Phase 3: Content Scriptの実装

#### Step 3.1: content.js

```bash
touch content/content.js
```

**実装する機能**:

```javascript
// 状態管理
let isInspectMode = false;
let highlightedElement = null;

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'startInspect':
      startInspectMode();
      sendResponse({ status: 'started' });
      break;
    case 'stopInspect':
      stopInspectMode();
      sendResponse({ status: 'stopped' });
      break;
    case 'getStatus':
      sendResponse({ isInspectMode });
      break;
  }
  return true; // 非同期レスポンス用
});

// Inspectモード開始
function startInspectMode() {
  isInspectMode = true;
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  document.addEventListener('click', handleClick, true);
}

// Inspectモード終了
function stopInspectMode() {
  isInspectMode = false;
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);
  document.removeEventListener('click', handleClick, true);
  removeHighlight();
}

// マウスオーバー処理
function handleMouseOver(e) {
  if (!isInspectMode) return;
  highlightElement(e.target);
}

// マウスアウト処理
function handleMouseOut(e) {
  if (!isInspectMode) return;
  removeHighlight();
}

// クリック処理
function handleClick(e) {
  if (!isInspectMode) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  const info = getElementInfo(e.target);
  
  // Popupに情報を送信（ストレージ経由）
  chrome.storage.local.set({ selectedElement: info });
}

// ハイライト表示
function highlightElement(element) {
  removeHighlight();
  element.classList.add('element-inspector-highlight');
  highlightedElement = element;
}

// ハイライト削除
function removeHighlight() {
  if (highlightedElement) {
    highlightedElement.classList.remove('element-inspector-highlight');
    highlightedElement = null;
  }
}

// 要素情報取得
function getElementInfo(element) {
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: Array.from(element.classList).filter(
      c => c !== 'element-inspector-highlight'
    ),
    childCount: element.children.length
  };
}
```

#### Step 3.2: content.css

```bash
touch content/content.css
```

**実装内容**:
```css
.element-inspector-highlight {
  outline: 2px solid #007bff !important;
  outline-offset: 2px !important;
  background-color: rgba(0, 123, 255, 0.1) !important;
  transition: outline 0.1s ease-in-out !important;
}
```

---

## 3. Chrome拡張機能の読み込み

### 3.1 デベロッパーモードの有効化

1. Chrome で `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をON

### 3.2 拡張機能の読み込み

1. 「パッケージ化されていない拡張機能を読み込む」をクリック
2. `element-inspector` フォルダを選択
3. 拡張機能がリストに表示される

### 3.3 更新方法

コード変更後:
1. `chrome://extensions/` を開く
2. 拡張機能カードの更新ボタン（🔄）をクリック
3. ページをリロード

---

## 4. デバッグ方法

### 4.1 Popup のデバッグ

1. 拡張機能アイコンを右クリック
2. 「ポップアップを検証」を選択
3. DevToolsでConsole/Elementsを確認

### 4.2 Content Script のデバッグ

1. 対象のWebページでDevToolsを開く（F12）
2. Consoleタブでログを確認
3. Sourcesタブ → Content scripts でブレークポイント設定可能

### 4.3 よくあるエラー

| エラー | 原因 | 解決策 |
|--------|------|--------|
| `Uncaught TypeError` | DOM要素が見つからない | `document.addEventListener('DOMContentLoaded', ...)` で初期化 |
| `Could not establish connection` | Content Scriptが読み込まれていない | ページをリロード |
| `Invalid manifest` | JSON構文エラー | JSONバリデータで確認 |

---

## 5. コーディング規約

### 5.1 JavaScript

- ES6+構文を使用
- `const`/`let` を使用（`var`禁止）
- 関数名はcamelCase
- 定数はUPPER_SNAKE_CASE
- セミコロン必須

```javascript
// Good
const MAX_DEPTH = 10;
function getElementInfo(element) { /* ... */ }

// Bad
var maxDepth = 10;
function GetElementInfo(element) { /* ... */ }
```

### 5.2 CSS

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

### 5.3 ファイル構成

- 1ファイル1責務
- 関連するコードは近くに配置
- コメントは「なぜ」を説明

---

## 6. トラブルシューティング

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
