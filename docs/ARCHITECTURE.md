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
- Popup/DevToolsパネルとのメッセージ通信

**主要な関数**:

```javascript
// 状態管理
let isInspecting = false;
let currentHighlightedElement = null;
let lastElementInfo = null;

// 要素情報の取得
function getElementInfo(element) {
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: Array.from(element.classList),
    childCount: element.children.length
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
- 選択履歴の管理

**主要な関数**:

```javascript
// モード切り替え
async function toggleInspectMode() { /* ... */ }

// 要素情報の表示更新
function displayElementInfo(info) { /* ... */ }

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
    childCount: number
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

## 8. 将来の拡張性

Step 2以降で追加予定の機能に対応できる設計:

| Step | 機能 | 影響を受けるコンポーネント |
|------|------|---------------------------|
| 2 | CSS取得 | content.js に`getComputedStyle`処理追加 |
| 3 | 子要素走査 | content.js に再帰処理追加 |
| 4 | SASS出力 | 新規ユーティリティファイル追加 |

`getElementInfo()`関数を拡張することで、追加情報の取得に対応可能。
