'use strict';

const toggleBtn = document.getElementById('toggleInspect');
const statusEl = document.getElementById('status');
const elementInfoEl = document.getElementById('elementInfo');
const tagNameEl = document.getElementById('tagName');
const elementIdEl = document.getElementById('elementId');
const classesEl = document.getElementById('classes');
const childCountEl = document.getElementById('childCount');
const mainContentEl = document.getElementById('mainContent');
const cssPropertiesEl = document.getElementById('cssProperties');
const cssContentEl = document.getElementById('cssContent');
const copyCSSBtn = document.getElementById('copyCSS');
const styleTreeEl = document.getElementById('styleTree');
const treeContentEl = document.getElementById('treeContent');
const treeStatsEl = document.getElementById('treeStats');
const copySASSBtn = document.getElementById('copySASS');
const historyEl = document.getElementById('history');
const historyListEl = document.getElementById('historyList');
const sourceMapStatusEl = document.getElementById('sourceMapStatus');
const sourceMapInfoEl = document.getElementById('sourceMapInfo');
const reloadSourceMapBtn = document.getElementById('reloadSourceMap');

let isInspecting = false;
let history = [];
let currentStyles = {};
let currentStyleTree = null;
let hasSourceMap = false;
let sourceMapPropertyCount = 0;
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

let sourceMapByCss = {}; // CSSファイルごとのプロパティ情報

/**
 * Source Mapステータスを更新
 */
function updateSourceMapStatus(loading = false) {
  sourceMapStatusEl.classList.remove('hidden');

  if (loading) {
    sourceMapInfoEl.textContent = 'Source Map: 読み込み中...';
    sourceMapStatusEl.classList.remove('active');
    sourceMapStatusEl.classList.add('loading');
  } else if (hasSourceMap && sourceMapPropertyCount > 0) {
    // CSSファイルごとの詳細を表示
    const cssFiles = Object.keys(sourceMapByCss);
    if (cssFiles.length > 0) {
      const details = cssFiles.map(f => `${f}:${sourceMapByCss[f].count}`).join(', ');
      sourceMapInfoEl.textContent = `Source Map: ${details} (計${sourceMapPropertyCount}個)`;
    } else {
      sourceMapInfoEl.textContent = `Source Map: ${sourceMapPropertyCount}個のプロパティを検出`;
    }
    sourceMapStatusEl.classList.remove('loading');
    sourceMapStatusEl.classList.add('active');
  } else {
    sourceMapInfoEl.textContent = 'Source Map: 未検出';
    sourceMapStatusEl.classList.remove('loading');
    sourceMapStatusEl.classList.remove('active');
  }
}

/**
 * Source Mapステータスを取得
 */
async function checkSourceMapStatus() {
  const response = await sendMessageToContent('getSourceMapStatus');
  if (response) {
    hasSourceMap = response.hasSourceMap;
    sourceMapPropertyCount = response.propertyCount;
    sourceMapByCss = response.byCssFile || {};
    updateSourceMapStatus();
  }
}

/**
 * Source Mapを再読み込み
 */
async function reloadSourceMaps() {
  updateSourceMapStatus(true); // ローディング表示

  const tabId = getInspectedTabId();
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'loadSourceMaps' });
    if (response) {
      if (response.status === 'ok') {
        hasSourceMap = response.propertyCount > 0;
        sourceMapPropertyCount = response.propertyCount;
        console.log('Source Map再読み込み完了:', response.propertyCount, '個のプロパティ');
        // 詳細情報を取得
        await checkSourceMapStatus();
      } else {
        console.warn('Source Map読み込みエラー:', response.error);
        hasSourceMap = false;
        sourceMapPropertyCount = 0;
        sourceMapByCss = {};
      }
    }
  } catch (error) {
    console.error('Source Map再読み込みエラー:', error);
    hasSourceMap = false;
    sourceMapPropertyCount = 0;
    sourceMapByCss = {};
  }
  updateSourceMapStatus();
}

/**
 * CSSプロパティを表示
 */
function displayCSSProperties(styles) {
  currentStyles = styles || {};
  cssContentEl.innerHTML = '';

  if (!styles || Object.keys(styles).length === 0) {
    cssContentEl.innerHTML = '<div class="css-row" style="color: #999;">スタイルなし</div>';
    return;
  }

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
    mainContentEl.classList.add('hidden');
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

  // Source Mapステータスを更新
  if (info.hasSourceMap !== undefined) {
    hasSourceMap = info.hasSourceMap;
    sourceMapPropertyCount = info.sourceMapPropertyCount || 0;
    updateSourceMapStatus();
  }

  // CSSプロパティを表示
  displayCSSProperties(info.styles);

  // ツリー構造を表示
  if (info.styleTree) {
    displayStyleTree(info.styleTree);
  }

  // メインコンテンツを表示
  mainContentEl.classList.remove('hidden');
}

/**
 * ツリー内の要素数をカウント
 */
function countTreeNodes(node) {
  if (!node) return 0;
  let count = 1;
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      count += countTreeNodes(child);
    });
  }
  return count;
}

/**
 * ツリーの最大深度を取得
 */
function getTreeMaxDepth(node, currentDepth = 0) {
  if (!node) return currentDepth;
  let maxDepth = currentDepth;
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      const childDepth = getTreeMaxDepth(child, currentDepth + 1);
      if (childDepth > maxDepth) {
        maxDepth = childDepth;
      }
    });
  }
  return maxDepth;
}

/**
 * ツリーノードのHTML要素を生成
 */
function createTreeNode(node) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'tree-node';

  // ノードヘッダー（セレクタ + 展開/折りたたみ）
  const headerEl = document.createElement('div');
  headerEl.className = 'tree-node-header';

  // 展開/折りたたみトグル
  if (node.children && node.children.length > 0) {
    const toggleEl = document.createElement('span');
    toggleEl.className = 'tree-toggle expanded';
    toggleEl.textContent = '▼';
    toggleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const childrenEl = nodeEl.querySelector('.tree-children');
      if (childrenEl) {
        childrenEl.classList.toggle('collapsed');
        toggleEl.classList.toggle('expanded');
        toggleEl.textContent = toggleEl.classList.contains('expanded') ? '▼' : '▶';
      }
    });
    headerEl.appendChild(toggleEl);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'tree-toggle-spacer';
    headerEl.appendChild(spacer);
  }

  // セレクタ表示
  const selectorEl = document.createElement('span');
  selectorEl.className = 'tree-selector';

  // タグ名
  const tagSpan = document.createElement('span');
  tagSpan.className = 'tree-tag';
  tagSpan.textContent = node.tagName;
  selectorEl.appendChild(tagSpan);

  // ID
  if (node.id) {
    const idSpan = document.createElement('span');
    idSpan.className = 'tree-id';
    idSpan.textContent = `#${node.id}`;
    selectorEl.appendChild(idSpan);
  }

  // クラス
  if (node.classes && node.classes.length > 0) {
    const classSpan = document.createElement('span');
    classSpan.className = 'tree-class';
    classSpan.textContent = `.${node.classes.join('.')}`;
    selectorEl.appendChild(classSpan);
  }

  headerEl.appendChild(selectorEl);

  // スタイル数
  const styleCount = node.styles ? Object.keys(node.styles).length : 0;
  if (styleCount > 0) {
    const countEl = document.createElement('span');
    countEl.className = 'tree-style-count';
    countEl.textContent = `(${styleCount})`;
    headerEl.appendChild(countEl);
  }

  nodeEl.appendChild(headerEl);

  // 子要素
  if (node.children && node.children.length > 0) {
    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-children';
    node.children.forEach(child => {
      childrenEl.appendChild(createTreeNode(child));
    });
    nodeEl.appendChild(childrenEl);
  }

  return nodeEl;
}

/**
 * スタイルツリーを表示
 */
function displayStyleTree(tree) {
  currentStyleTree = tree;
  treeContentEl.innerHTML = '';

  if (!tree) {
    treeStatsEl.textContent = '';
    treeContentEl.innerHTML = '<div style="color: #999;">ツリーなし</div>';
    return;
  }

  // 統計情報を表示
  const nodeCount = countTreeNodes(tree);
  const maxDepth = getTreeMaxDepth(tree);
  treeStatsEl.textContent = `${nodeCount}要素 / 深度${maxDepth}`;

  // ツリーを描画
  treeContentEl.appendChild(createTreeNode(tree));
}

/**
 * CSSプロパティ名をケバブケースからキャメルケースに変換しない（SASSはケバブケース）
 */
function formatCSSProperty(prop, value) {
  return `${prop}: ${value};`;
}

/**
 * ツリーをSASS形式に変換
 */
function treeToSASS(node, indent = 0) {
  if (!node) return '';

  const spaces = '  '.repeat(indent);
  let output = '';

  // セレクタを出力
  output += `${spaces}${node.selector} {\n`;

  // スタイルを出力
  if (node.styles && Object.keys(node.styles).length > 0) {
    Object.entries(node.styles).forEach(([prop, value]) => {
      output += `${spaces}  ${formatCSSProperty(prop, value)}\n`;
    });
  }

  // 擬似要素を出力（::before, ::after）
  if (node.pseudoElements && Object.keys(node.pseudoElements).length > 0) {
    Object.entries(node.pseudoElements).forEach(([pseudo, styles]) => {
      if (Object.keys(styles).length > 0) {
        output += '\n';
        // & を使って擬似要素を表現
        output += `${spaces}  &${pseudo} {\n`;
        Object.entries(styles).forEach(([prop, value]) => {
          output += `${spaces}    ${formatCSSProperty(prop, value)}\n`;
        });
        output += `${spaces}  }\n`;
      }
    });
  }

  // 子要素を再帰処理
  if (node.children && node.children.length > 0) {
    const hasStyles = Object.keys(node.styles || {}).length > 0;
    const hasPseudo = node.pseudoElements && Object.keys(node.pseudoElements).length > 0;
    if (hasStyles || hasPseudo) {
      output += '\n';
    }
    node.children.forEach(child => {
      output += treeToSASS(child, indent + 1);
    });
  }

  output += `${spaces}}\n`;

  // ルートレベル以外は改行を追加
  if (indent > 0) {
    output += '\n';
  }

  return output;
}

/**
 * SASSをクリップボードにコピー
 */
function copySASS() {
  if (!currentStyleTree) {
    return;
  }

  const sassText = treeToSASS(currentStyleTree);

  // フォールバック: textareaを使用したコピー
  const textarea = document.createElement('textarea');
  textarea.value = sassText;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const successful = document.execCommand('copy');
    if (successful) {
      copySASSBtn.textContent = 'コピー完了!';
    } else {
      copySASSBtn.textContent = '失敗';
    }
  } catch (error) {
    console.error('コピー失敗:', error);
    copySASSBtn.textContent = '失敗';
  }

  document.body.removeChild(textarea);

  setTimeout(() => {
    copySASSBtn.textContent = 'SASSコピー';
  }, 1500);
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
    hasSourceMap = response.hasSourceMap || false;
    sourceMapPropertyCount = response.sourceMapPropertyCount || 0;
    updateUI();
    updateSourceMapStatus();
    if (response.lastElementInfo) {
      displayElementInfo(response.lastElementInfo);
    }
  }

  // Source Mapステータスを少し遅れて再チェック（非同期読み込み完了後）
  setTimeout(() => {
    checkSourceMapStatus();
  }, 1000);
}

// イベントリスナー
toggleBtn.addEventListener('click', toggleInspectMode);
copyCSSBtn.addEventListener('click', copyCSS);
copySASSBtn.addEventListener('click', copySASS);
reloadSourceMapBtn.addEventListener('click', reloadSourceMaps);

// 初期化実行
init();
