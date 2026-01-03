'use strict';

const toggleBtn = document.getElementById('toggleInspect');
const statusEl = document.getElementById('status');
const elementInfoEl = document.getElementById('elementInfo');
const tagNameEl = document.getElementById('tagName');
const elementIdEl = document.getElementById('elementId');
const classesEl = document.getElementById('classes');
const childCountEl = document.getElementById('childCount');

let isInspecting = false;

/**
 * 現在のアクティブタブを取得
 */
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Content Scriptにメッセージを送信
 */
async function sendMessageToContent(action) {
  const tab = await getCurrentTab();
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action });
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
 * Content Scriptからのメッセージを受信
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'elementSelected') {
    displayElementInfo(message.data);
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
  // 現在の検査状態を取得
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
