'use strict';

const toggleBtn = document.getElementById('toggleInspect');
const statusEl = document.getElementById('status');
const elementInfoEl = document.getElementById('elementInfo');
const tagNameEl = document.getElementById('tagName');
const elementIdEl = document.getElementById('elementId');
const classesEl = document.getElementById('classes');
const childCountEl = document.getElementById('childCount');
const cssPropertiesEl = document.getElementById('cssProperties');
const cssContentEl = document.getElementById('cssContent');
const copyCSSBtn = document.getElementById('copyCSS');
const historyEl = document.getElementById('history');
const historyListEl = document.getElementById('historyList');

let isInspecting = false;
let history = [];
let currentStyles = {};
const MAX_HISTORY = 10;

/**
 * 現在の検査対象タブIDを取得
 */
function getInspectedTabId() {
  return chrome.devtools.inspectedWindow.tabId;
}

/**
 * Content Scriptにメッセージを送信
 */
async function sendMessageToContent(action) {
  const tabId = getInspectedTabId();
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action });
    return response;
  } catch (error) {
    console.error('メッセージ送信エラー:', error);
    return null;
  }
}

/**
 * UIの状態を更新
 */
function updateUI() {
  if (isInspecting) {
    toggleBtn.textContent = '検査終了';
    toggleBtn.classList.add('active');
    statusEl.textContent = '要素をクリックしてください (ESCで終了)';
    statusEl.classList.add('inspecting');
  } else {
    toggleBtn.textContent = '検査開始';
    toggleBtn.classList.remove('active');
    statusEl.textContent = '';
    statusEl.classList.remove('inspecting');
  }
}

/**
 * CSSプロパティを表示
 */
function displayCSSProperties(styles) {
  currentStyles = styles || {};

  if (!styles || Object.keys(styles).length === 0) {
    cssPropertiesEl.classList.add('hidden');
    return;
  }

  cssContentEl.innerHTML = '';

  Object.entries(styles).forEach(([prop, value]) => {
    const row = document.createElement('div');
    row.className = 'css-row';

    const propSpan = document.createElement('span');
    propSpan.className = 'css-prop';
    propSpan.textContent = prop;

    const colonSpan = document.createElement('span');
    colonSpan.className = 'css-colon';
    colonSpan.textContent = ': ';

    const valueSpan = document.createElement('span');
    valueSpan.className = 'css-value';
    valueSpan.textContent = value;

    // 色の場合はプレビューを表示
    if (isColorValue(value)) {
      const colorPreview = document.createElement('span');
      colorPreview.className = 'color-preview';
      colorPreview.style.backgroundColor = value;
      valueSpan.insertBefore(colorPreview, valueSpan.firstChild);
    }

    const semicolonSpan = document.createElement('span');
    semicolonSpan.className = 'css-semicolon';
    semicolonSpan.textContent = ';';

    row.appendChild(propSpan);
    row.appendChild(colonSpan);
    row.appendChild(valueSpan);
    row.appendChild(semicolonSpan);
    cssContentEl.appendChild(row);
  });

  cssPropertiesEl.classList.remove('hidden');
}

/**
 * 色の値かどうかを判定
 */
function isColorValue(value) {
  if (!value) return false;
  return value.startsWith('rgb') ||
         value.startsWith('rgba') ||
         value.startsWith('#') ||
         value.startsWith('hsl');
}

/**
 * CSSをクリップボードにコピー（フォールバック対応）
 */
function copyCSS() {
  if (!currentStyles || Object.keys(currentStyles).length === 0) {
    return;
  }

  const cssText = Object.entries(currentStyles)
    .map(([prop, value]) => `  ${prop}: ${value};`)
    .join('\n');

  // フォールバック: textareaを使用したコピー
  const textarea = document.createElement('textarea');
  textarea.value = cssText;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const successful = document.execCommand('copy');
    if (successful) {
      copyCSSBtn.textContent = 'コピー完了!';
    } else {
      copyCSSBtn.textContent = '失敗';
    }
  } catch (error) {
    console.error('コピー失敗:', error);
    copyCSSBtn.textContent = '失敗';
  }

  document.body.removeChild(textarea);

  setTimeout(() => {
    copyCSSBtn.textContent = 'コピー';
  }, 1500);
}

/**
 * 要素情報を表示
 */
function displayElementInfo(info) {
  if (!info) {
    elementInfoEl.classList.add('hidden');
    cssPropertiesEl.classList.add('hidden');
    return;
  }

  tagNameEl.textContent = info.tagName;
  tagNameEl.className = 'value tag';

  elementIdEl.textContent = info.id || 'なし';
  elementIdEl.className = info.id ? 'value id' : 'value';

  const classText = info.classes.length > 0 ? info.classes.join(', ') : 'なし';
  classesEl.textContent = classText;
  classesEl.className = info.classes.length > 0 ? 'value class' : 'value';

  childCountEl.textContent = info.childCount;

  elementInfoEl.classList.remove('hidden');

  // CSSプロパティを表示
  displayCSSProperties(info.styles);
}

/**
 * 履歴に追加
 */
function addToHistory(info) {
  history.unshift(info);
  if (history.length > MAX_HISTORY) {
    history.pop();
  }
  renderHistory();
}

/**
 * 履歴を描画
 */
function renderHistory() {
  if (history.length === 0) {
    historyEl.classList.add('hidden');
    return;
  }

  historyListEl.innerHTML = '';
  history.forEach((info, index) => {
    const li = document.createElement('li');
    let text = `<${info.tagName}>`;
    if (info.id) {
      text += `#${info.id}`;
    }
    if (info.classes.length > 0) {
      text += `.${info.classes.join('.')}`;
    }
    li.textContent = text;
    li.addEventListener('click', () => displayElementInfo(info));
    historyListEl.appendChild(li);
  });

  historyEl.classList.remove('hidden');
}

/**
 * 検査モードの切り替え
 */
async function toggleInspectMode() {
  const action = isInspecting ? 'stopInspect' : 'startInspect';
  const response = await sendMessageToContent(action);

  if (response && response.status === 'ok') {
    isInspecting = !isInspecting;
    updateUI();
  } else {
    statusEl.textContent = 'エラー: ページをリロードしてください';
  }
}

/**
 * Background からのメッセージを受信
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 検査対象のタブからのメッセージのみ処理
  if (sender.tab && sender.tab.id !== getInspectedTabId()) {
    return;
  }

  if (message.action === 'elementSelected') {
    displayElementInfo(message.data);
    addToHistory(message.data);
    isInspecting = false;
    updateUI();
    sendResponse({ status: 'ok' });
  } else if (message.action === 'inspectCancelled') {
    isInspecting = false;
    updateUI();
    sendResponse({ status: 'ok' });
  }
  return true;
});

/**
 * 初期化
 */
async function init() {
  const response = await sendMessageToContent('getStatus');
  if (response) {
    isInspecting = response.isInspecting;
    updateUI();
    if (response.lastElementInfo) {
      displayElementInfo(response.lastElementInfo);
    }
  }
}

// イベントリスナー
toggleBtn.addEventListener('click', toggleInspectMode);
copyCSSBtn.addEventListener('click', copyCSS);

// 初期化実行
init();
