'use strict';

// Content Script からのメッセージを DevTools Panel に転送
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'elementSelected' || message.action === 'inspectCancelled') {
    // 全ての拡張機能コンテキストにメッセージを転送
    chrome.runtime.sendMessage(message).catch(() => {
      // DevTools パネルが開いていない場合は無視
    });
  }
  sendResponse({ status: 'ok' });
  return true;
});
