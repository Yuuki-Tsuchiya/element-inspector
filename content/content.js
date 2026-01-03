'use strict';

(() => {
  // 重複読み込み防止
  if (window.elementInspectorLoaded) {
    return;
  }
  window.elementInspectorLoaded = true;

  // 状態管理
  let isInspecting = false;
  let currentHighlightedElement = null;
  let lastElementInfo = null;

  /**
   * 要素情報を取得
   */
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

  /**
   * ハイライトを削除
   */
  function removeHighlight() {
    if (currentHighlightedElement) {
      currentHighlightedElement.classList.remove('element-inspector-highlight');
      currentHighlightedElement = null;
    }
  }

  /**
   * 要素をハイライト
   */
  function highlightElement(element) {
    removeHighlight();
    if (element && element !== document.body && element !== document.documentElement) {
      element.classList.add('element-inspector-highlight');
      currentHighlightedElement = element;
    }
  }

  /**
   * マウスオーバーハンドラ
   */
  function handleMouseOver(event) {
    if (!isInspecting) return;
    event.stopPropagation();
    highlightElement(event.target);
  }

  /**
   * クリックハンドラ
   */
  function handleClick(event) {
    if (!isInspecting) return;
    event.preventDefault();
    event.stopPropagation();

    const element = event.target;
    lastElementInfo = getElementInfo(element);

    // 検査モードを終了
    stopInspectMode();

    // ポップアップに通知
    chrome.runtime.sendMessage({
      action: 'elementSelected',
      data: lastElementInfo
    });
  }

  /**
   * キーダウンハンドラ (ESCキー対応)
   */
  function handleKeyDown(event) {
    if (!isInspecting) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      stopInspectMode();
      chrome.runtime.sendMessage({ action: 'inspectCancelled' });
    }
  }

  /**
   * 検査モードを開始
   */
  function startInspectMode() {
    if (isInspecting) return;
    isInspecting = true;
    document.body.classList.add('element-inspector-inspecting');
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
  }

  /**
   * 検査モードを終了
   */
  function stopInspectMode() {
    if (!isInspecting) return;
    isInspecting = false;
    removeHighlight();
    document.body.classList.remove('element-inspector-inspecting');
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
  }

  /**
   * メッセージリスナー
   */
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
        sendResponse({
          isInspecting,
          lastElementInfo
        });
        break;

      default:
        sendResponse({ status: 'unknown action' });
    }
    return true;
  });
})();
