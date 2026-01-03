'use strict';

const toggleBtn = document.getElementById('toggleInspect');
const statusEl = document.getElementById('status');
const elementInfoEl = document.getElementById('elementInfo');
const tagNameEl = document.getElementById('tagName');
const elementIdEl = document.getElementById('elementId');
const classesEl = document.getElementById('classes');
const childCountEl = document.getElementById('childCount');
const historyEl = document.getElementById('history');
const historyListEl = document.getElementById('historyList');

let isInspecting = false;
let history = [];
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
 * 要素情報を表示
 */
function displayElementInfo(info) {
  if (!info) {
    elementInfoEl.classList.add('hidden');
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

// 初期化実行
init();
