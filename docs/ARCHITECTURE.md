# アーキテクチャ設計書 (ARCHITECTURE.md)

## 1. システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│                      Chrome Browser                          │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │     Popup       │    │          Web Page               │ │
│  │  ┌───────────┐  │    │  ┌───────────────────────────┐  │ │
│  │  │popup.html │  │    │  │     Content Script        │  │ │
│  │  │popup.js   │  │    │  │     (content.js)          │  │ │
│  │  │popup.css  │  │    │  │                           │  │ │
│  │  └─────┬─────┘  │    │  │  - Event Listeners        │  │ │
│  │        │        │    │  │  - DOM Manipulation       │  │ │
│  │        │        │    │  │  - Element Info Getter    │  │ │
│  │        │        │    │  └─────────────┬─────────────┘  │ │
│  └────────┼────────┘    └───────────────┼───────────────┘ │
│           │                             │                   │
│           │    Chrome Message API       │                   │
│           └─────────────────────────────┘                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    manifest.json                        ││
│  │  - 権限設定 (permissions)                               ││
│  │  - Content Script 登録                                  ││
│  │  - Popup 設定                                          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 2. ファイル構成

```
element-inspector/
├── manifest.json          # 拡張機能の設定ファイル
├── README.md              # プロジェクト説明
├── popup/
│   ├── popup.html         # ポップアップUI
│   ├── popup.js           # ポップアップのロジック
│   └── popup.css          # ポップアップのスタイル
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

### 3.2 Content Script (content.js)

**責務**:
- DOM要素のイベントリスニング（hover, click）
- 要素のハイライト表示
- 要素情報の抽出
- Popupとのメッセージ通信

**主要な関数**:

```javascript
// 状態管理
let isInspectMode = false;
let currentHighlightedElement = null;

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

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Popupからのコマンドを処理
});
```

### 3.3 Popup (popup.js)

**責務**:
- UIの表示・更新
- ユーザーアクションの処理
- Content Scriptへのメッセージ送信
- 要素情報の表示

**主要な関数**:

```javascript
// モード切り替え
async function toggleInspectMode() { /* ... */ }

// 要素情報の表示更新
function updateElementInfo(info) { /* ... */ }

// Content Scriptへメッセージ送信
async function sendMessageToContentScript(message) { /* ... */ }
```

---

## 4. データフロー

### 4.1 Inspectモード開始フロー

```
[Popup]                    [Content Script]
   │                             │
   │ 1. ボタンクリック            │
   │──────────────────────────────>│
   │    {action: "startInspect"}  │
   │                             │
   │                    2. モードON│
   │                    イベント登録│
   │                             │
   │<──────────────────────────────│
   │    {status: "started"}       │
   │                             │
   │ 3. UI更新                    │
```

### 4.2 要素選択フロー

```
[Web Page]              [Content Script]              [Popup]
    │                         │                          │
    │ 1. 要素クリック           │                          │
    │────────────────────────>│                          │
    │                         │                          │
    │                2. イベント│防止                      │
    │                   情報取得│                          │
    │                         │                          │
    │                         │ 3. 情報送信                │
    │                         │─────────────────────────>│
    │                         │   {elementInfo: {...}}   │
    │                         │                          │
    │                         │                   4. 表示│
```

---

## 5. メッセージAPI仕様

### 5.1 Popup → Content Script

#### startInspect
```javascript
{
  action: "startInspect"
}
// Response: { status: "started" }
```

#### stopInspect
```javascript
{
  action: "stopInspect"
}
// Response: { status: "stopped" }
```

#### getStatus
```javascript
{
  action: "getStatus"
}
// Response: { isInspectMode: boolean }
```

### 5.2 Content Script → Popup

#### elementSelected
```javascript
{
  type: "elementSelected",
  data: {
    tagName: string,
    id: string | null,
    classes: string[],
    childCount: number
  }
}
```

---

## 6. スタイル設計

### 6.1 ハイライトスタイル (content.css)

```css
.element-inspector-highlight {
  outline: 2px solid #007bff !important;
  outline-offset: 2px !important;
  background-color: rgba(0, 123, 255, 0.1) !important;
}
```

### 6.2 ポップアップスタイル (popup.css)

- 幅: 300px
- パディング: 16px
- フォント: system-ui
- カラースキーム: ライトテーマ

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
