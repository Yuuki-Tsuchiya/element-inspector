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

  // 設定
  const MAX_DEPTH = 5; // 最大走査深度

  // 主要CSSプロパティリスト
  const IMPORTANT_CSS_PROPERTIES = [
    // レイアウト
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
    'float', 'clear',
    // ボックスモデル
    'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'box-sizing',
    // Flexbox
    'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
    'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'gap',
    // Grid
    'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
    // テキスト
    'color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'line-height', 'text-align', 'text-decoration', 'text-transform', 'letter-spacing',
    // 背景
    'background', 'background-color', 'background-image', 'background-size', 'background-position',
    // ボーダー
    'border', 'border-width', 'border-style', 'border-color', 'border-radius',
    // その他
    'opacity', 'visibility', 'overflow', 'cursor', 'box-shadow', 'transform', 'transition'
  ];

  // デフォルト値（フィルタリング用）
  const DEFAULT_VALUES = {
    'display': 'block',
    'position': 'static',
    'top': 'auto',
    'right': 'auto',
    'bottom': 'auto',
    'left': 'auto',
    'z-index': 'auto',
    'float': 'none',
    'clear': 'none',
    'width': 'auto',
    'height': 'auto',
    'min-width': '0px',
    'max-width': 'none',
    'min-height': '0px',
    'max-height': 'none',
    'margin': '0px',
    'margin-top': '0px',
    'margin-right': '0px',
    'margin-bottom': '0px',
    'margin-left': '0px',
    'padding': '0px',
    'padding-top': '0px',
    'padding-right': '0px',
    'padding-bottom': '0px',
    'padding-left': '0px',
    'box-sizing': 'content-box',
    'flex': '0 1 auto',
    'flex-direction': 'row',
    'flex-wrap': 'nowrap',
    'justify-content': 'normal',
    'align-items': 'normal',
    'align-content': 'normal',
    'flex-grow': '0',
    'flex-shrink': '1',
    'flex-basis': 'auto',
    'align-self': 'auto',
    'gap': 'normal',
    'color': 'rgb(0, 0, 0)',
    'font-style': 'normal',
    'text-align': 'start',
    'text-decoration': 'none',
    'text-transform': 'none',
    'letter-spacing': 'normal',
    'background': 'none',
    'background-color': 'rgba(0, 0, 0, 0)',
    'background-image': 'none',
    'background-size': 'auto',
    'background-position': '0% 0%',
    'border': 'none',
    'border-width': '0px',
    'border-style': 'none',
    'border-color': 'rgb(0, 0, 0)',
    'border-radius': '0px',
    'opacity': '1',
    'visibility': 'visible',
    'overflow': 'visible',
    'cursor': 'auto',
    'box-shadow': 'none',
    'transform': 'none',
    'transition': 'none'
  };

  /**
   * 要素のCSSスタイルを取得
   */
  function getElementStyles(element) {
    const computed = window.getComputedStyle(element);
    const styles = {};

    IMPORTANT_CSS_PROPERTIES.forEach(prop => {
      const value = computed.getPropertyValue(prop);
      if (!value) return;

      // デフォルト値と同じ場合はスキップ
      const defaultValue = DEFAULT_VALUES[prop];
      if (defaultValue && value === defaultValue) return;

      // 空やnone系の値をスキップ
      if (value === '' || value === 'none' || value === 'normal' || value === 'auto') {
        // ただしdisplayのnoneは有効
        if (prop !== 'display') return;
      }

      styles[prop] = value;
    });

    return styles;
  }

  /**
   * 要素のセレクタを生成
   */
  function generateSelector(element) {
    const tagName = element.tagName.toLowerCase();

    // IDがあればID優先
    if (element.id) {
      return `#${element.id}`;
    }

    // クラスがあればクラス使用
    const classes = Array.from(element.classList)
      .filter(c => !c.startsWith('element-inspector-'));
    if (classes.length > 0) {
      return `.${classes[0]}`;
    }

    // タグ名のみ
    return tagName;
  }

  /**
   * 要素情報を取得（単一要素）
   */
  function getElementInfo(element) {
    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: Array.from(element.classList).filter(
        (c) => !c.startsWith('element-inspector-')
      ),
      childCount: element.children.length,
      styles: getElementStyles(element)
    };
  }

  /**
   * スタイルツリーを構築（再帰走査）
   */
  function buildStyleTree(element, depth = 0) {
    if (depth > MAX_DEPTH) return null;

    const selector = generateSelector(element);
    const styles = getElementStyles(element);
    const tagName = element.tagName.toLowerCase();
    const id = element.id || null;
    const classes = Array.from(element.classList)
      .filter(c => !c.startsWith('element-inspector-'));

    const children = Array.from(element.children)
      .map(child => buildStyleTree(child, depth + 1))
      .filter(Boolean);

    return {
      selector,
      tagName,
      id,
      classes,
      styles,
      children,
      depth
    };
  }

  /**
   * 要素情報とスタイルツリーを取得
   */
  function getElementInfoWithTree(element) {
    const basicInfo = getElementInfo(element);
    const styleTree = buildStyleTree(element);

    return {
      ...basicInfo,
      styleTree
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
    lastElementInfo = getElementInfoWithTree(element);

    // 検査モードを終了
    stopInspectMode();

    // DevToolsパネルに通知
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
