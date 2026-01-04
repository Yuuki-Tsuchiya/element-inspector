# アーキテクチャ設計書 (ARCHITECTURE.md)

## 1. システム構成図

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Chrome Browser                                 │
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────────────────────────────────┐ │
│  │     Popup       │    │                  Web Page                   │ │
│  │  ┌───────────┐  │    │  ┌───────────────────────────────────────┐  │ │
│  │  │popup.html │  │    │  │           Content Script              │  │ │
│  │  │popup.js   │  │    │  │           (content.js)                │  │ │
│  │  │popup.css  │  │    │  │                                       │  │ │
│  │  └───────────┘  │    │  │  - Event Listeners (hover, click)    │  │ │
│  └─────────────────┘    │  │  - DOM Manipulation (highlight)       │  │ │
│                         │  │  - Element Info Getter                │  │ │
│  ┌─────────────────────────┐  └──────────────┬────────────────────┘  │ │
│  │      DevTools Panel     │                 │                        │ │
│  │  ┌───────────────────┐  │                 │                        │ │
│  │  │  panel.html       │  │                 │                        │ │
│  │  │  panel.js         │  │◄────────────────┘                        │ │
│  │  │  panel.css        │  │   Chrome Message API                     │ │
│  │  └───────────────────┘  │                                          │ │
│  └─────────────────────────┘                                          │ │
│           ▲                                                            │
│           │                 ┌─────────────────────────────────────┐   │
│           └─────────────────│         Background Script           │   │
│              Message Forward│         (background.js)             │   │
│                             │         Service Worker              │   │
│                             └─────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                         manifest.json                               ││
│  │  - 権限設定 (permissions: activeTab, scripting)                     ││
│  │  - Content Script 登録                                              ││
│  │  - DevTools Page 登録                                               ││
│  │  - Background Service Worker 登録                                   ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. ファイル構成

```
element-inspector/
├── manifest.json          # 拡張機能の設定ファイル
├── background.js          # Service Worker（メッセージ転送）
├── README.md              # プロジェクト説明
├── popup/
│   ├── popup.html         # ポップアップUI
│   ├── popup.js           # ポップアップのロジック
│   └── popup.css          # ポップアップのスタイル
├── devtools/
│   ├── devtools.html      # DevTools初期化ページ
│   ├── devtools.js        # DevToolsパネル作成
│   ├── panel.html         # DevToolsパネルUI
│   ├── panel.js           # DevToolsパネルロジック
│   └── panel.css          # DevToolsパネルスタイル
├── content/
│   ├── content.js         # ページに注入されるスクリプト
│   └── content.css        # ハイライト用スタイル
├── icons/
│   ├── icon16.png         # 16x16 アイコン
│   ├── icon48.png         # 48x48 アイコン
│   └── icon128.png        # 128x128 アイコン
└── docs/
    ├── REQUIREMENTS.md    # 要件定義
    ├── ARCHITECTURE.md    # 本ドキュメント
    ├── DEVELOPMENT.md     # 開発ガイド
    ├── TESTING.md         # テスト方法
    └── ROADMAP.md         # ロードマップ
```

---

## 3. コンポーネント詳細

### 3.1 manifest.json

Manifest V3形式の設定ファイル。

```json
{
  "manifest_version": 3,
  "name": "Element Inspector Lite",
  "version": "1.0.0",
  "description": "Webページ上の要素をクリックして情報を表示するシンプルな拡張機能",
  "permissions": ["activeTab", "scripting"],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": { ... }
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

### 3.2 Background Script (background.js)

**責務**:
- Content ScriptからDevToolsパネルへのメッセージ転送

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'elementSelected' || message.action === 'inspectCancelled') {
    chrome.runtime.sendMessage(message);
  }
  sendResponse({ status: 'ok' });
  return true;
});
```

### 3.3 Content Script (content.js)

**責務**:
- DOM要素のイベントリスニング（hover, click, keydown）
- 要素のハイライト表示
- 要素情報の抽出
- **CSSプロパティの取得（Step 2）**
- Popup/DevToolsパネルとのメッセージ通信

**主要な関数**:

```javascript
// 状態管理
let isInspecting = false;
let currentHighlightedElement = null;
let lastElementInfo = null;

// 主要CSSプロパティリスト（約50種類）
const IMPORTANT_CSS_PROPERTIES = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'width', 'height', 'margin', 'padding', 'color', 'font-family',
  'font-size', 'background-color', 'border', 'border-radius',
  'flex', 'flex-direction', 'justify-content', 'align-items', 'gap',
  // ... その他約30種類
];

// デフォルト値フィルタリング用
const DEFAULT_VALUES = {
  'display': 'block',
  'position': 'static',
  'margin-top': '0px',
  // ... 約40種類
};

// CSSスタイルの取得（Step 2で追加）
function getElementStyles(element) {
  const computed = window.getComputedStyle(element);
  const styles = {};
  IMPORTANT_CSS_PROPERTIES.forEach(prop => {
    const value = computed.getPropertyValue(prop);
    // デフォルト値と同じ場合はスキップ
    if (DEFAULT_VALUES[prop] && value === DEFAULT_VALUES[prop]) return;
    if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
      styles[prop] = value;
    }
  });
  return styles;
}

// 要素情報の取得
function getElementInfo(element) {
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: Array.from(element.classList),
    childCount: element.children.length,
    styles: getElementStyles(element)  // Step 2で追加
  };
}

// ハイライト表示
function highlightElement(element) { /* ... */ }
function removeHighlight() { /* ... */ }

// イベントハンドラ
function handleMouseOver(e) { /* ... */ }
function handleClick(e) { /* ... */ }
function handleKeyDown(e) { /* ESCキーでキャンセル */ }

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Popup/DevToolsからのコマンドを処理
});
```

### 3.4 DevTools Panel (devtools/panel.js)

**責務**:
- DevTools内でのUI表示・更新
- ユーザーアクションの処理
- Content Scriptへのメッセージ送信
- 要素情報の表示
- **CSSプロパティの表示（Step 2）**
- **クリップボードコピー機能（Step 2）**
- **ツリー構造の表示（Step 3）**
- **SASS形式変換・コピー（Step 3/4）**
- 選択履歴の管理

**主要な関数**:

```javascript
// モード切り替え
async function toggleInspectMode() { /* ... */ }

// 要素情報の表示更新
function displayElementInfo(info) { /* ... */ }

// CSSプロパティの表示（Step 2で追加）
function displayCSSProperties(styles) {
  // シンタックスハイライト風にCSS表示
  // 色の値にはカラープレビュー表示
}

// クリップボードコピー（Step 2で追加）
function copyCSS() {
  // DevToolsパネルでは navigator.clipboard APIが制限されるため
  // document.execCommand('copy') でフォールバック対応
  const textarea = document.createElement('textarea');
  textarea.value = cssText;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

// 色の値判定（Step 2で追加）
function isColorValue(value) {
  return value.startsWith('rgb') || value.startsWith('#') || value.startsWith('hsl');
}

// ツリー表示（Step 3で追加）
function displayStyleTree(tree) { /* ... */ }
function createTreeNode(node) { /* ... */ }

// SASS変換・コピー（Step 3/4で追加）
function treeToSASS(node, indent = 0) {
  // ツリー構造をSASS形式のネストに再帰変換
}
function copySASS() { /* ... */ }

// 履歴管理
function addToHistory(info) { /* ... */ }

// Content Scriptへメッセージ送信
async function sendMessageToContent(action) {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  return chrome.tabs.sendMessage(tabId, { action });
}
```

### 3.5 Popup (popup.js)

**責務**:
- 簡易UIの表示（DevToolsを開かない場合向け）
- Content Scriptへのメッセージ送信

---

## 4. データフロー

### 4.1 Inspectモード開始フロー

```
[DevTools Panel]           [Background]           [Content Script]
       │                        │                        │
       │ 1. ボタンクリック       │                        │
       │────────────────────────────────────────────────>│
       │         chrome.tabs.sendMessage                 │
       │           {action: "startInspect"}              │
       │                        │                        │
       │                        │               2. モードON│
       │                        │               イベント登録│
       │                        │                        │
       │<────────────────────────────────────────────────│
       │              {status: "ok"}                     │
       │                        │                        │
       │ 3. UI更新              │                        │
```

### 4.2 要素選択フロー

```
[Web Page]          [Content Script]          [Background]          [DevTools Panel]
    │                      │                       │                       │
    │ 1. 要素クリック       │                       │                       │
    │─────────────────────>│                       │                       │
    │                      │                       │                       │
    │             2. イベント防止                   │                       │
    │                情報取得                       │                       │
    │                      │                       │                       │
    │                      │ 3. メッセージ送信      │                       │
    │                      │──────────────────────>│                       │
    │                      │ {action: elementSelected, data: {...}}        │
    │                      │                       │                       │
    │                      │                       │ 4. メッセージ転送     │
    │                      │                       │──────────────────────>│
    │                      │                       │                       │
    │                      │                       │              5. 情報表示│
    │                      │                       │                 履歴追加│
```

---

## 5. メッセージAPI仕様

### 5.1 DevTools/Popup → Content Script

#### startInspect
```javascript
{ action: "startInspect" }
// Response: { status: "ok" }
```

#### stopInspect
```javascript
{ action: "stopInspect" }
// Response: { status: "ok" }
```

#### getStatus
```javascript
{ action: "getStatus" }
// Response: { isInspecting: boolean, lastElementInfo: object|null }
```

### 5.2 Content Script → Background → DevTools

#### elementSelected
```javascript
{
  action: "elementSelected",
  data: {
    tagName: string,
    id: string | null,
    classes: string[],
    childCount: number,
    styles: {              // Step 2で追加
      [property: string]: string
    }
  }
}
```

#### inspectCancelled
```javascript
{ action: "inspectCancelled" }
```

---

## 6. スタイル設計

### 6.1 ハイライトスタイル (content.css)

```css
.element-inspector-highlight {
  outline: 2px solid #1a73e8 !important;
  outline-offset: -2px !important;
  background-color: rgba(26, 115, 232, 0.1) !important;
}

.element-inspector-inspecting * {
  cursor: crosshair !important;
}
```

### 6.2 DevToolsパネルスタイル (panel.css)

- フォント: system-ui
- カラースキーム: ライトテーマ + ダークモード対応
- レスポンシブ対応

---

## 7. セキュリティ考慮事項

### 7.1 権限の最小化
- `activeTab`: 現在のタブのみアクセス
- `scripting`: Content Script注入用

### 7.2 CSP対応
- インラインスクリプト禁止
- 外部スクリプト読み込み禁止
- すべてのJSは別ファイルに記述

### 7.3 XSS対策
- 要素情報表示時は`textContent`を使用
- `innerHTML`での直接出力を避ける

---

## 8. 技術的な解決策

### 8.1 DevToolsパネルでのクリップボードAPI制限

**問題**: DevToolsパネルのコンテキストでは `navigator.clipboard.writeText()` APIがセキュリティ制限により動作しない。

**解決策**: `document.execCommand('copy')` を使用したフォールバック実装。

```javascript
function copyCSS() {
  const textarea = document.createElement('textarea');
  textarea.value = cssText;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}
```

### 8.2 CSSデフォルト値のフィルタリング

**問題**: `getComputedStyle()` はすべてのプロパティのデフォルト値も返すため、意味のある値のみを抽出する必要がある。

**解決策**:
1. 主要CSSプロパティのホワイトリスト（約50種類）を定義
2. デフォルト値のマッピング（約40種類）を定義
3. 取得した値とデフォルト値を比較してフィルタリング

---

## 9. 将来の拡張性

全Stepが完了。追加予定の機能:

| Step | 機能 | 状態 |
|------|------|------|
| ~~1~~ | ~~要素選択~~ | ✅完了 |
| ~~2~~ | ~~CSS取得~~ | ✅完了 |
| ~~3~~ | ~~子要素走査~~ | ✅完了 |
| ~~4~~ | ~~SASS出力~~ | ✅完了 |

### 将来の拡張候補

#### 優先度: 高（最優先）

| 機能 | 説明 | 難易度 |
|------|------|--------|
| **Source Map連携** | .css.mapを読み込み、実際に設定されたプロパティのみ抽出 | 高 |
| ファイルダウンロード | .scssファイルとして保存 | 低 |
| SASS変数化 | 色などを変数として出力 | 中 |

#### 優先度: 中

| 機能 | 説明 | 難易度 |
|------|------|--------|
| メディアクエリ検出 | レスポンシブ対応 | 高 |
| 複数要素選択 | Ctrl+クリックで複数選択 | 中 |
| プリセット | よく使うプロパティセット | 低 |
