'use strict';

/**
 * Element Inspector - Content Script
 *
 * Webページ上の要素を検査し、CSSプロパティをSASS形式で抽出する
 * Source Map連携により、実際にSCSSで定義されたプロパティのみを取得可能
 */

(() => {
  // 重複読み込み防止
  if (window.elementInspectorLoaded) {
    return;
  }
  window.elementInspectorLoaded = true;

  // ============================================================
  // 状態管理
  // ============================================================

  let isInspecting = false;
  let currentHighlightedElement = null;
  let lastElementInfo = null;

  // Source Map関連
  let sourceMapProperties = null;
  let sourceMapPropertiesByCss = {};

  // CSSルールキャッシュ
  let fullSelectorRules = [];
  let pseudoElementRules = [];
  let mediaQueryRules = [];
  let hoverRules = []; // :hover擬似クラスルール

  // ============================================================
  // 定数定義
  // ============================================================

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
    'border-top', 'border-right', 'border-bottom', 'border-left',
    // その他
    'opacity', 'visibility', 'overflow', 'cursor', 'box-shadow', 'transform', 'transition'
  ];

  // デフォルト値（フィルタリング用）- 配列形式で複数のデフォルト値を許容
  const DEFAULT_VALUES = {
    // レイアウト
    'display': ['block', 'inline'],
    'position': ['static'],
    'top': ['auto', '0px'],
    'right': ['auto', '0px'],
    'bottom': ['auto', '0px'],
    'left': ['auto', '0px'],
    'z-index': ['auto'],
    'float': ['none'],
    'clear': ['none'],
    // ボックスモデル
    'width': ['auto'],
    'height': ['auto'],
    'min-width': ['0px'],
    'max-width': ['none'],
    'min-height': ['0px'],
    'max-height': ['none'],
    'margin': ['0px'],
    'margin-top': ['0px'],
    'margin-right': ['0px'],
    'margin-bottom': ['0px'],
    'margin-left': ['0px'],
    'padding': ['0px'],
    'padding-top': ['0px'],
    'padding-right': ['0px'],
    'padding-bottom': ['0px'],
    'padding-left': ['0px'],
    'box-sizing': ['content-box'],
    // Flexbox
    'flex': ['0 1 auto'],
    'flex-direction': ['row'],
    'flex-wrap': ['nowrap'],
    'justify-content': ['normal'],
    'align-items': ['normal'],
    'align-content': ['normal'],
    'flex-grow': ['0'],
    'flex-shrink': ['1'],
    'flex-basis': ['auto'],
    'align-self': ['auto'],
    'gap': ['normal'],
    // テキスト
    'color': ['rgb(0, 0, 0)'],
    'font-style': ['normal'],
    'text-align': ['start'],
    'text-decoration': ['none'],
    'text-transform': ['none'],
    'letter-spacing': ['normal'],
    // 背景
    'background': ['none'],
    'background-color': ['rgba(0, 0, 0, 0)'],
    'background-image': ['none'],
    'background-size': ['auto'],
    'background-position': ['0% 0%'],
    // ボーダー
    'border': ['none'],
    'border-width': ['0px'],
    'border-style': ['none'],
    'border-color': ['rgb(0, 0, 0)'],
    'border-radius': ['0px'],
    // その他
    'opacity': ['1'],
    'visibility': ['visible'],
    'overflow': ['visible'],
    'cursor': ['auto'],
    'box-shadow': ['none'],
    'transform': ['none'],
    'transition': ['none', 'all 0s ease 0s']
  };

  // 色関連のプロパティ（rgb→hex変換対象）
  const COLOR_PROPERTIES = [
    'color', 'background', 'background-color',
    'border', 'border-color',
    'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'outline', 'outline-color',
    'text-decoration-color', 'box-shadow'
  ];

  // ============================================================
  // ユーティリティ関数
  // ============================================================

  /**
   * Background Service Worker経由でfetch（CORS回避）
   */
  async function fetchViaBackground(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'fetchUrl', url: url }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.status === 'ok') {
          resolve(response.data);
        } else {
          reject(new Error(response ? response.error : 'Unknown error'));
        }
      });
    });
  }

  // ============================================================
  // CSS解析（Source Map連携）
  // ============================================================

  // メディアクエリとmixin名の対応
  const MEDIA_QUERY_MIXINS = {
    '(max-width: 767px)': 'g.smd()',
    '(max-width: 600px)': 'g.sm()',
    // 追加のブレークポイントがあれば追加
  };

  /**
   * メディアクエリ条件からmixin名を取得
   */
  function getMixinName(mediaCondition) {
    // 正規化: スペースを除去して比較
    const normalized = mediaCondition.replace(/\s+/g, '').toLowerCase();
    for (const [query, mixin] of Object.entries(MEDIA_QUERY_MIXINS)) {
      if (normalized.includes(query.replace(/\s+/g, '').toLowerCase())) {
        return mixin;
      }
    }
    return null;
  }

  /**
   * CSSテキストを解析してセレクタごとのプロパティを抽出
   */
  function parseCSSForSelectors(cssText) {
    const rules = [];
    const pseudoRules = [];
    const mediaRules = []; // メディアクエリルール
    const hoverStyleRules = []; // :hover擬似クラスルール

    // コメントを先に除去
    let cleanCss = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

    // @keyframesと@font-faceは除去
    cleanCss = cleanCss.replace(/@keyframes\s+[\w-]+\s*\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '');
    cleanCss = cleanCss.replace(/@font-face\s*\{[^}]*\}/g, '');

    // メディアクエリを抽出して処理
    const mediaRegex = /@media\s*([^{]+)\{([\s\S]*?)\}(?=\s*(?:@media|\s*$|[^{}]*\{))/g;
    let mediaMatch;

    // メディアクエリブロックをマーク
    const mediaBlocks = [];
    while ((mediaMatch = mediaRegex.exec(cleanCss)) !== null) {
      const mediaCondition = mediaMatch[1].trim();
      const mediaContent = mediaMatch[2];
      const mixinName = getMixinName(mediaCondition);

      if (mixinName) {
        mediaBlocks.push({
          start: mediaMatch.index,
          end: mediaMatch.index + mediaMatch[0].length,
          condition: mediaCondition,
          mixinName: mixinName,
          content: mediaContent
        });

        // メディアクエリ内のルールを解析
        const innerRuleRegex = /([^{}]+)\{([^{}]+)\}/g;
        let innerMatch;
        while ((innerMatch = innerRuleRegex.exec(mediaContent)) !== null) {
          const selectorPart = innerMatch[1].trim();
          const propertiesPart = innerMatch[2].trim();

          const selectors = selectorPart.split(',').map(s => s.trim()).filter(Boolean);

          const properties = {};
          const propValueMatches = propertiesPart.matchAll(/([\w-]+)\s*:\s*([^;]+)/g);
          for (const propMatch of propValueMatches) {
            const prop = propMatch[1].toLowerCase();
            const value = propMatch[2].trim();
            if (IMPORTANT_CSS_PROPERTIES.includes(prop) || prop === 'content') {
              properties[prop] = value;
            }
          }

          if (Object.keys(properties).length === 0) continue;

          for (const selector of selectors) {
            const cleanSelector = selector.replace(/:[\w-]+(\([^)]*\))?/g, '').trim();
            if (!cleanSelector) continue;
            if (cleanSelector === '*' || cleanSelector.startsWith('@')) continue;
            if (!cleanSelector.includes('.') && !cleanSelector.includes('#')) continue;

            mediaRules.push({
              fullSelector: cleanSelector,
              mixinName: mixinName,
              properties: properties
            });
          }
        }
      }
    }

    // メディアクエリブロックを除去してから通常のルールを解析
    let cssWithoutMedia = cleanCss;
    // 後ろから除去することでインデックスがずれないようにする
    for (let i = mediaBlocks.length - 1; i >= 0; i--) {
      const block = mediaBlocks[i];
      cssWithoutMedia = cssWithoutMedia.slice(0, block.start) + cssWithoutMedia.slice(block.end);
    }

    // 通常のルールを解析
    const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
    let match;

    while ((match = ruleRegex.exec(cssWithoutMedia)) !== null) {
      const selectorPart = match[1].trim();
      const propertiesPart = match[2].trim();

      // セレクタを分割（カンマ区切り）
      const selectors = selectorPart.split(',').map(s => s.trim()).filter(Boolean);

      // プロパティを抽出（値も含めて）
      const properties = new Set();
      const propertiesWithValues = {};
      const propValueMatches = propertiesPart.matchAll(/([\w-]+)\s*:\s*([^;]+)/g);
      for (const propMatch of propValueMatches) {
        const prop = propMatch[1].toLowerCase();
        const value = propMatch[2].trim();
        if (IMPORTANT_CSS_PROPERTIES.includes(prop) || prop === 'content') {
          properties.add(prop);
          propertiesWithValues[prop] = value;
        }
      }

      if (properties.size === 0) continue;

      // 各セレクタをルールとして保存
      for (const selector of selectors) {
        // 擬似要素（::before, ::after等）を含むセレクタを検出
        const pseudoMatch = selector.match(/::?(before|after)/i);
        if (pseudoMatch) {
          // 擬似要素ルールとして保存
          const pseudoElement = '::' + pseudoMatch[1].toLowerCase();
          // 擬似要素を除去して親セレクタを取得
          const parentSelector = selector.replace(/::?(before|after)/i, '').trim();

          // 擬似クラスを除去
          const cleanParentSelector = parentSelector.replace(/:[\w-]+(\([^)]*\))?/g, '');

          // 汎用セレクタチェック
          const trimmedSelector = cleanParentSelector.trim();
          if (!trimmedSelector) continue;
          if (trimmedSelector === '*') continue;
          if (trimmedSelector.startsWith('@')) continue;
          if (!trimmedSelector.includes('.') && !trimmedSelector.includes('#')) continue;

          pseudoRules.push({
            parentSelector: cleanParentSelector,
            pseudoElement: pseudoElement,
            properties: propertiesWithValues
          });
          continue;
        }

        // :hover擬似クラスを含むセレクタを検出
        const hoverMatch = selector.match(/:hover/i);
        if (hoverMatch) {
          // :hoverを除去して親セレクタを取得
          const cleanHoverSelector = selector.replace(/:hover/gi, '').replace(/:[\w-]+(\([^)]*\))?/g, '').trim();

          // 汎用セレクタチェック
          if (!cleanHoverSelector) continue;
          if (cleanHoverSelector === '*') continue;
          if (cleanHoverSelector.startsWith('@')) continue;
          if (!cleanHoverSelector.includes('.') && !cleanHoverSelector.includes('#')) continue;

          hoverStyleRules.push({
            parentSelector: cleanHoverSelector,
            properties: propertiesWithValues
          });
          continue;
        }

        // 擬似クラス（:hover, :focus等）を除去
        const cleanSelector = selector.replace(/:[\w-]+(\([^)]*\))?/g, '');

        // 汎用セレクタをスキップ（リセットCSSなどからの混入を防ぐ）
        const trimmedSelector = cleanSelector.trim();
        if (!trimmedSelector) continue;
        if (trimmedSelector === '*') continue;
        if (trimmedSelector.startsWith('@')) continue;
        if (/^\[[\w-]+(=[^\]]+)?\]$/.test(trimmedSelector)) continue;
        if (/^[\w-]+$/.test(trimmedSelector)) continue;

        // クラスまたはIDを含むセレクタのみを対象
        if (!trimmedSelector.includes('.') && !trimmedSelector.includes('#')) {
          continue;
        }

        // ルールを保存
        rules.push({
          fullSelector: cleanSelector,
          properties: new Set(properties)
        });
      }
    }

    return { rules, pseudoRules, mediaRules, hoverStyleRules };
  }

  /**
   * ページ内の全スタイルシートからSource Map URLを抽出し、セレクタマップも構築
   */
  async function findSourceMapUrls() {
    const sourceMapUrls = [];
    fullSelectorRules = []; // リセット
    pseudoElementRules = []; // リセット
    mediaQueryRules = []; // リセット
    hoverRules = []; // リセット

    // 1. <link rel="stylesheet">からCSSファイルURLを取得
    const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of linkElements) {
      const href = link.href;
      if (!href) continue;

      try {
        // Background経由でCSSファイルを取得（CORS回避）
        const cssText = await fetchViaBackground(href);

        // sourceMappingURL コメントを検索
        const match = cssText.match(/\/\*#\s*sourceMappingURL=(.+?)\s*\*\//);
        if (match) {
          // Source Mapがあるファイルのみルールを追加
          const { rules, pseudoRules, mediaRules, hoverStyleRules } = parseCSSForSelectors(cssText);
          fullSelectorRules.push(...rules);
          pseudoElementRules.push(...pseudoRules);
          mediaQueryRules.push(...mediaRules);
          hoverRules.push(...hoverStyleRules);

          let mapUrl = match[1].trim();
          // 相対パスの場合は絶対パスに変換
          if (!mapUrl.startsWith('http') && !mapUrl.startsWith('data:')) {
            const baseUrl = href.substring(0, href.lastIndexOf('/') + 1);
            mapUrl = baseUrl + mapUrl;
          }
          sourceMapUrls.push({
            cssUrl: href,
            mapUrl: mapUrl
          });
        }
      } catch (error) {
        // CSS取得エラーは無視
      }
    }

    // 2. <style>タグ内のインラインCSSからも検索
    const styleElements = document.querySelectorAll('style');
    for (const style of styleElements) {
      const cssText = style.textContent;

      const match = cssText.match(/\/\*#\s*sourceMappingURL=(.+?)\s*\*\//);
      if (match) {
        // Source Mapがあるファイルのみルールを追加
        const { rules, pseudoRules, mediaRules, hoverStyleRules } = parseCSSForSelectors(cssText);
        fullSelectorRules.push(...rules);
        pseudoElementRules.push(...pseudoRules);
        mediaQueryRules.push(...mediaRules);
        hoverRules.push(...hoverStyleRules);

        sourceMapUrls.push({
          cssUrl: 'inline',
          mapUrl: match[1].trim()
        });
      }
    }

    return sourceMapUrls;
  }

  /**
   * SCSSコンテンツからCSSプロパティを抽出
   */
  function extractPropertiesFromSCSS(content, allProperties) {
    // コメントを除去（/* */ と //）
    let cleanContent = content
      .replace(/\/\*[\s\S]*?\*\//g, '')  // ブロックコメント除去
      .replace(/\/\/[^\n]*/g, '');       // 行コメント除去

    // @mixin, @function, @if などのブロックを除去（プロパティ定義ではないため）
    // ただし @include は残す
    cleanContent = cleanContent
      .replace(/@mixin\s+[\w-]+\s*\([^)]*\)\s*\{[^}]*\}/g, '')
      .replace(/@function\s+[\w-]+\s*\([^)]*\)\s*\{[^}]*\}/g, '');

    // 変数宣言行を除去（$variable: value;）
    cleanContent = cleanContent.replace(/^\s*\$[\w-]+\s*:[^;]+;/gm, '');

    // マップ構文内のキーを誤検出しないよう、マップを除去
    // 例: $map: (key: value, key2: value2);
    cleanContent = cleanContent.replace(/\$[\w-]+\s*:\s*\([^)]+\)\s*;/g, '');

    // CSSプロパティ名を抽出（property: value パターン）
    // より厳密に：行頭の空白後にプロパティ名、その後にコロンと値
    const propertyMatches = cleanContent.matchAll(/^\s{2,}([\w-]+)\s*:\s*[^;{]+[;{]?/gm);
    for (const match of propertyMatches) {
      const prop = match[1].toLowerCase();

      // 変数やミックスイン、SCSS特有のものを除外
      if (prop.startsWith('$') || prop.startsWith('@') || prop.startsWith('--')) {
        continue;
      }

      // SCSSの制御構文を除外
      if (['if', 'else', 'for', 'each', 'while', 'include', 'extend', 'import', 'use', 'forward', 'mixin', 'function', 'return', 'warn', 'error', 'debug'].includes(prop)) {
        continue;
      }

      // 主要CSSプロパティリストにあるもののみを対象にする（より厳密なフィルタリング）
      if (IMPORTANT_CSS_PROPERTIES.includes(prop)) {
        allProperties.add(prop);
      }
    }
  }

  /**
   * Source Mapを解析してプロパティ名を抽出
   */
  async function parseSourceMaps() {
    const sourceMapUrls = await findSourceMapUrls();
    const allProperties = new Set();
    sourceMapPropertiesByCss = {}; // リセット

    for (const { cssUrl, mapUrl } of sourceMapUrls) {
      const cssProperties = new Set(); // このCSSファイル固有のプロパティ

      try {
        // Background経由でSource Mapを取得（CORS回避）
        const mapText = await fetchViaBackground(mapUrl);
        const sourceMap = JSON.parse(mapText);

        // CSSファイル名を取得
        const cssFileName = cssUrl.substring(cssUrl.lastIndexOf('/') + 1).replace(/\?.*$/, '');
        const mainScssName = cssFileName.replace('.css', '.scss');

        // sourcesContent から実際のSCSS/SASSソースを取得
        if (sourceMap.sourcesContent && sourceMap.sourcesContent.length > 0) {
          // sourcesContentがある場合もメインSCSSのみを対象にする
          for (let i = 0; i < sourceMap.sources.length; i++) {
            const sourcePath = sourceMap.sources[i];
            const fileName = sourcePath.substring(sourcePath.lastIndexOf('/') + 1);

            // パーシャルファイルはスキップ
            if (fileName.startsWith('_')) {
              continue;
            }

            // メインSCSSファイルのみを対象
            if (fileName !== mainScssName) {
              continue;
            }

            const content = sourceMap.sourcesContent[i];
            if (!content) continue;

            extractPropertiesFromSCSS(content, cssProperties);
          }
        } else if (sourceMap.sources && sourceMap.sources.length > 0) {
          // sourcesContentがない場合、sourcesのファイルを直接取得
          // メインSCSSファイルのみを対象（_で始まる部分ファイルは除外）
          const mapBaseUrl = mapUrl.substring(0, mapUrl.lastIndexOf('/') + 1);

          for (const sourcePath of sourceMap.sources) {
            // ファイル名を取得
            const fileName = sourcePath.substring(sourcePath.lastIndexOf('/') + 1);

            // CSS自体やnode_modulesはスキップ
            if (sourcePath.endsWith('.css') || sourcePath.includes('node_modules')) {
              continue;
            }

            // _で始まる部分ファイル（パーシャル）はスキップ
            if (fileName.startsWith('_')) {
              continue;
            }

            // メインSCSSファイルのみを対象
            if (fileName !== mainScssName) {
              continue;
            }

            try {
              // 相対パスを絶対パスに変換
              let sourceUrl = sourcePath;
              if (!sourcePath.startsWith('http')) {
                sourceUrl = mapBaseUrl + sourcePath;
              }

              const scssContent = await fetchViaBackground(sourceUrl);
              extractPropertiesFromSCSS(scssContent, cssProperties);
            } catch (e) {
              // SCSSファイル取得エラーは無視
            }
          }
        }

        // このCSSファイルのプロパティを保存
        sourceMapPropertiesByCss[cssFileName] = cssProperties;

        // 全体にもマージ（互換性のため）
        for (const prop of cssProperties) {
          allProperties.add(prop);
        }
      } catch (error) {
        // Source Map解析エラーは無視
      }
    }

    return allProperties;
  }

  // ============================================================
  // 色変換
  // ============================================================

  /**
   * RGB/RGBA形式をHEX形式に変換
   * rgb(255, 255, 255) → #ffffff
   * rgba(255, 255, 255, 1) → #ffffff
   * rgba(255, 255, 255, 0.5) → rgba(255, 255, 255, 0.5) (透明度がある場合はそのまま)
   */
  function rgbToHex(value) {
    if (!value) return value;

    // rgba形式をチェック
    const rgbaMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
    if (!rgbaMatch) return value;

    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;

    // 透明度が1未満の場合はrgbaのまま返す
    if (a < 1) {
      return value;
    }

    // HEX形式に変換
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /**
   * 値内の全ての色をHEX形式に変換（box-shadow等の複合値対応）
   */
  function convertColorsToHex(value) {
    if (!value) return value;

    // rgb/rgba形式を全て変換
    return value.replace(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+)?\s*\)/g, (match) => {
      return rgbToHex(match);
    });
  }

  // ============================================================
  // セレクタマッチング
  // ============================================================

  /**
   * 要素がシンプルセレクタにマッチするかチェック
   * シンプルセレクタ: タグ名、#id、.class、またはそれらの組み合わせ
   */
  function elementMatchesSimpleSelector(element, simpleSelector) {
    if (!simpleSelector || !element || element.nodeType !== 1) return false;

    // セレクタをパース
    const tagMatch = simpleSelector.match(/^[\w-]+/);
    const idMatch = simpleSelector.match(/#([\w-]+)/);
    const classMatches = simpleSelector.match(/\.([\w-]+)/g);

    // タグ名チェック
    if (tagMatch) {
      const tagName = tagMatch[0].toLowerCase();
      if (element.tagName.toLowerCase() !== tagName) return false;
    }

    // IDチェック
    if (idMatch) {
      if (element.id !== idMatch[1]) return false;
    }

    // クラスチェック
    if (classMatches) {
      for (const cls of classMatches) {
        const className = cls.substring(1); // . を除去
        if (!element.classList.contains(className)) return false;
      }
    }

    return true;
  }

  /**
   * 要素がCSSセレクタにマッチするかチェック（祖先チェーンを考慮）
   */
  function elementMatchesCssSelector(element, cssSelector) {
    // セレクタを分割（子孫コンビネータ、子コンビネータなど）
    // 簡易版：空白と>で分割
    const parts = cssSelector.split(/\s*>\s*|\s+/).filter(Boolean);
    if (parts.length === 0) return false;

    // 最後のパートが要素自身にマッチするかチェック
    const lastPart = parts[parts.length - 1];
    if (!elementMatchesSimpleSelector(element, lastPart)) return false;

    // パートが1つだけなら、マッチ成功
    if (parts.length === 1) return true;

    // 祖先チェーンをたどって残りのパートをマッチ
    let currentElement = element.parentElement;
    let partIndex = parts.length - 2;

    while (currentElement && partIndex >= 0) {
      if (elementMatchesSimpleSelector(currentElement, parts[partIndex])) {
        partIndex--;
      }
      currentElement = currentElement.parentElement;
    }

    // すべてのパートがマッチしたか
    return partIndex < 0;
  }

  /**
   * 要素に適用されるCSSプロパティを取得（完全なセレクタマッチング）
   */
  function getPropertiesForElement(element) {
    const properties = new Set();

    for (const rule of fullSelectorRules) {
      if (elementMatchesCssSelector(element, rule.fullSelector)) {
        for (const prop of rule.properties) {
          properties.add(prop);
        }
      }
    }

    return properties;
  }

  /**
   * 要素に適用される擬似要素のスタイルを取得
   */
  function getPseudoElementsForElement(element) {
    const pseudoElements = {};

    for (const rule of pseudoElementRules) {
      if (elementMatchesCssSelector(element, rule.parentSelector)) {
        const pseudo = rule.pseudoElement; // ::before or ::after
        if (!pseudoElements[pseudo]) {
          pseudoElements[pseudo] = {};
        }
        // プロパティをマージ
        for (const [prop, value] of Object.entries(rule.properties)) {
          pseudoElements[pseudo][prop] = value;
        }
      }
    }

    return pseudoElements;
  }

  /**
   * 要素に適用されるメディアクエリスタイルを取得
   */
  function getMediaQueriesForElement(element) {
    const mediaQueries = {}; // { 'g.smd()': { prop: value, ... }, ... }

    for (const rule of mediaQueryRules) {
      if (elementMatchesCssSelector(element, rule.fullSelector)) {
        const mixin = rule.mixinName;
        if (!mediaQueries[mixin]) {
          mediaQueries[mixin] = {};
        }
        // プロパティをマージ（値をフォーマット）
        for (const [prop, value] of Object.entries(rule.properties)) {
          mediaQueries[mixin][prop] = formatCSSValue(prop, value);
        }
      }
    }

    return mediaQueries;
  }

  /**
   * 要素に適用される:hoverスタイルを取得
   */
  function getHoverStylesForElement(element) {
    const hoverStyles = {};

    for (const rule of hoverRules) {
      if (elementMatchesCssSelector(element, rule.parentSelector)) {
        // プロパティをマージ（値をフォーマット）
        for (const [prop, value] of Object.entries(rule.properties)) {
          hoverStyles[prop] = formatCSSValue(prop, value);
        }
      }
    }

    return hoverStyles;
  }

  // ============================================================
  // スタイル取得
  // ============================================================

  /**
   * CSS値がデフォルト値かどうかを判定
   */
  function isDefaultValue(prop, value) {
    // 空値はデフォルトとして扱う
    if (!value || value === '') return true;

    // 汎用的なデフォルト値（displayのnoneは除外）
    if (value === 'none' || value === 'normal' || value === 'auto') {
      if (prop === 'display' && value === 'none') return false;
      return true;
    }

    // 定義済みデフォルト値との比較（配列形式）
    const defaults = DEFAULT_VALUES[prop];
    if (defaults && defaults.includes(value)) return true;

    return false;
  }

  /**
   * px値を単位なしの比率に変換（line-height用）
   * @param {string} pxValue - px値（例: "24px"）
   * @param {number} baseFontSize - 基準となるfont-size（px）
   * @returns {string} 単位なしの数値（例: "1.5"）
   */
  function pxToUnitless(pxValue, baseFontSize) {
    const match = pxValue.match(/^([\d.]+)px$/);
    if (!match || !baseFontSize) return pxValue;

    const px = parseFloat(match[1]);
    const ratio = px / baseFontSize;

    // 小数点以下の桁数を調整（不要な0を削除）
    return ratio.toFixed(4).replace(/\.?0+$/, '');
  }

  /**
   * px値をem値に変換
   * @param {string} pxValue - px値（例: "24px"）
   * @param {number} baseFontSize - 基準となるfont-size（px）
   * @returns {string} em値（例: "0.1em"）
   */
  function pxToEm(pxValue, baseFontSize) {
    const match = pxValue.match(/^([\d.]+)px$/);
    if (!match || !baseFontSize) return pxValue;

    const px = parseFloat(match[1]);
    const em = px / baseFontSize;

    // 小数点以下の桁数を調整（不要な0を削除）
    const formatted = em.toFixed(4).replace(/\.?0+$/, '');
    return `${formatted}em`;
  }

  /**
   * CSS値をフォーマット（色変換、単位変換など）
   * @param {string} prop - プロパティ名
   * @param {string} value - 値
   * @param {number} fontSize - font-size（px単位の数値、em変換用）
   */
  function formatCSSValue(prop, value, fontSize = null) {
    // 色変換
    if (COLOR_PROPERTIES.includes(prop)) {
      return convertColorsToHex(value);
    }

    // line-height: pxを単位なしに変換
    if (prop === 'line-height' && fontSize && value.endsWith('px')) {
      return pxToUnitless(value, fontSize);
    }

    // letter-spacing: pxをemに変換
    if (prop === 'letter-spacing' && fontSize && value.endsWith('px')) {
      return pxToEm(value, fontSize);
    }

    return value;
  }

  // ショートハンドと個別プロパティの関係
  const SHORTHAND_MAP = {
    'padding': ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    'margin': ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
    'border': ['border-top', 'border-right', 'border-bottom', 'border-left'],
    'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
    'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
    'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    'background': ['background-color', 'background-image', 'background-size', 'background-position']
  };

  /**
   * ショートハンドプロパティで表現できる個別プロパティを除外
   * @param {Object} styles - スタイルオブジェクト
   * @param {Set} sourceProps - Source Mapから取得したプロパティセット
   * @returns {Object} - フィルタリング後のスタイル
   */
  function removeRedundantProperties(styles, sourceProps) {
    if (!sourceProps || sourceProps.size === 0) return styles;

    const result = { ...styles };

    for (const [shorthand, individuals] of Object.entries(SHORTHAND_MAP)) {
      // ショートハンドがSource Mapにあり、結果にも含まれている場合
      if (sourceProps.has(shorthand) && result[shorthand]) {
        // 個別プロパティがSource Mapに明示的に含まれていなければ削除
        for (const individual of individuals) {
          if (!sourceProps.has(individual) && result[individual]) {
            delete result[individual];
          }
        }
      }
    }

    return result;
  }

  /**
   * 要素のCSSスタイルを取得（共通処理）
   * @param {Element} element - 対象要素
   * @param {Set|Array|null} propertiesToCheck - チェックするプロパティ（nullの場合は全プロパティ）
   */
  function getElementStyles(element, propertiesToCheck = null) {
    const computed = window.getComputedStyle(element);
    const styles = {};

    // font-sizeを取得（em変換の基準）
    const fontSizeValue = computed.getPropertyValue('font-size');
    const fontSize = parseFloat(fontSizeValue); // px単位の数値

    // Source Map使用時はセレクタベースのプロパティを優先
    let propsToCheck = propertiesToCheck;
    if (propsToCheck && propsToCheck instanceof Set && propsToCheck.size === 0) {
      // セレクタマッチがない場合はSource Map全体を使用
      propsToCheck = sourceMapProperties;
    }

    // チェック対象のプロパティを決定
    const props = propsToCheck || IMPORTANT_CSS_PROPERTIES;

    for (const prop of props) {
      const value = computed.getPropertyValue(prop);

      // デフォルト値はスキップ
      if (isDefaultValue(prop, value)) continue;

      // 値をフォーマットして保存（font-sizeを渡してem変換に使用）
      styles[prop] = formatCSSValue(prop, value, fontSize);
    }

    // ショートハンドと個別プロパティの重複を解消
    if (propertiesToCheck instanceof Set) {
      return removeRedundantProperties(styles, propertiesToCheck);
    }

    return styles;
  }

  /**
   * Source Mapベースでスタイルを取得
   */
  function getElementStylesWithSourceMap(element) {
    const elementProps = getPropertiesForElement(element);
    return getElementStyles(element, elementProps);
  }

  // ============================================================
  // 要素情報・ツリー構築
  // ============================================================

  /**
   * 要素のXPathを生成
   */
  function getElementXPath(element) {
    if (!element) return '';
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousSibling;

      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE &&
            sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentNode;
    }

    return '/' + parts.join('/');
  }

  /**
   * XPathから要素を取得
   */
  function getElementByXPath(xpath) {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue;
    } catch (e) {
      return null;
    }
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
      // div以外のタグはタグ名も含める（例: h2.js-ani-block）
      if (tagName !== 'div') {
        return `${tagName}.${classes[0]}`;
      }
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
  function buildStyleTree(element, depth = 0, useSourceMap = false) {
    if (depth > MAX_DEPTH) return null;

    const selector = generateSelector(element);
    const xpath = getElementXPath(element);
    const styles = useSourceMap && sourceMapProperties
      ? getElementStylesWithSourceMap(element)
      : getElementStyles(element);
    const tagName = element.tagName.toLowerCase();
    const id = element.id || null;
    const classes = Array.from(element.classList)
      .filter(c => !c.startsWith('element-inspector-'));

    // 擬似要素のスタイルを取得
    const pseudoElements = useSourceMap ? getPseudoElementsForElement(element) : {};

    // メディアクエリのスタイルを取得
    const mediaQueries = useSourceMap ? getMediaQueriesForElement(element) : {};

    // :hoverスタイルを取得
    const hoverStyles = useSourceMap ? getHoverStylesForElement(element) : {};

    const children = Array.from(element.children)
      .map(child => buildStyleTree(child, depth + 1, useSourceMap))
      .filter(Boolean);

    return {
      selector,
      xpath,
      tagName,
      id,
      classes,
      styles,
      pseudoElements,
      mediaQueries,
      hoverStyles,
      children,
      depth
    };
  }

  /**
   * 要素情報とスタイルツリーを取得
   */
  function getElementInfoWithTree(element, useSourceMap = false) {
    const basicInfo = getElementInfo(element);

    // Source Map使用時はスタイルも再取得
    if (useSourceMap && sourceMapProperties) {
      basicInfo.styles = getElementStylesWithSourceMap(element);
    }

    const styleTree = buildStyleTree(element, 0, useSourceMap);

    return {
      ...basicInfo,
      styleTree,
      hasSourceMap: sourceMapProperties !== null && sourceMapProperties.size > 0,
      sourceMapPropertyCount: sourceMapProperties ? sourceMapProperties.size : 0
    };
  }

  // ============================================================
  // 検査モード（UI操作）
  // ============================================================

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
    // Source Mapがあれば使用
    const useSourceMap = sourceMapProperties !== null && sourceMapProperties.size > 0;
    lastElementInfo = getElementInfoWithTree(element, useSourceMap);

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

  // ============================================================
  // メッセージ通信
  // ============================================================

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
          lastElementInfo,
          hasSourceMap: sourceMapProperties !== null && sourceMapProperties.size > 0,
          sourceMapPropertyCount: sourceMapProperties ? sourceMapProperties.size : 0
        });
        break;

      case 'selectByXPath':
        const element = getElementByXPath(message.xpath);
        if (element) {
          const useSourceMap = sourceMapProperties !== null && sourceMapProperties.size > 0;
          lastElementInfo = getElementInfoWithTree(element, useSourceMap);
          sendResponse({ status: 'ok', data: lastElementInfo });
        } else {
          sendResponse({ status: 'error', error: 'Element not found' });
        }
        break;

      case 'loadSourceMaps':
        // Source Mapを読み込み
        parseSourceMaps().then(props => {
          sourceMapProperties = props;
          sendResponse({
            status: 'ok',
            propertyCount: props.size,
            properties: Array.from(props)
          });
        }).catch(error => {
          console.error('Element Inspector: Source Map読み込みエラー', error);
          sendResponse({
            status: 'error',
            error: error.message
          });
        });
        return true; // 非同期レスポンス

      case 'clearSourceMaps':
        sourceMapProperties = null;
        sourceMapPropertiesByCss = {};
        fullSelectorRules = [];
        pseudoElementRules = [];
        mediaQueryRules = [];
        hoverRules = [];
        sendResponse({ status: 'ok' });
        break;

      case 'getSourceMapStatus':
        // CSSファイルごとのプロパティ情報を構築
        const cssFileInfo = {};
        for (const [cssFile, props] of Object.entries(sourceMapPropertiesByCss)) {
          cssFileInfo[cssFile] = {
            count: props.size,
            properties: Array.from(props)
          };
        }
        sendResponse({
          hasSourceMap: sourceMapProperties !== null && sourceMapProperties.size > 0,
          propertyCount: sourceMapProperties ? sourceMapProperties.size : 0,
          properties: sourceMapProperties ? Array.from(sourceMapProperties) : [],
          byCssFile: cssFileInfo
        });
        break;

      default:
        sendResponse({ status: 'unknown action' });
    }
    return true;
  });

  // ============================================================
  // 初期化
  // ============================================================

  // 起動時にSource Mapを自動読み込み
  parseSourceMaps().then(props => {
    sourceMapProperties = props;
  }).catch(() => {
    // Source Map自動読み込みスキップ
  });
})();
