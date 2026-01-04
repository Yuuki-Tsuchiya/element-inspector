'use strict';

// Content Script からのメッセージを DevTools Panel に転送
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'elementSelected' || message.action === 'inspectCancelled') {
    // 全ての拡張機能コンテキストにメッセージを転送
    chrome.runtime.sendMessage(message).catch(() => {
      // DevTools パネルが開いていない場合は無視
    });
    sendResponse({ status: 'ok' });
    return true;
  }

  // Content Script からの fetch プロキシリクエスト（CORS回避用）
  if (message.action === 'fetchUrl') {
    const url = message.url;
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      })
      .then(text => {
        sendResponse({ status: 'ok', data: text });
      })
      .catch(error => {
        console.warn('Element Inspector: fetch error', url, error.message);
        sendResponse({ status: 'error', error: error.message });
      });
    return true; // 非同期レスポンス
  }

  sendResponse({ status: 'ok' });
  return true;
});
