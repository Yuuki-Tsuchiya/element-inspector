# Element Inspector Lite

Chrome拡張機能の学習プロジェクト - Step 1

## 概要

Webページ上の要素をクリックすると、その要素の基本情報（タグ名、クラス、ID、子要素数）をポップアップで表示するシンプルなChrome拡張機能です。

## 目的

この拡張機能は、最終的に「SASS形式でCSSを抽出する拡張機能」を作成するための学習Step 1として開発します。

## 機能

- ページ上の任意の要素をクリックで選択
- 選択した要素の情報を表示
  - タグ名
  - クラス名（複数対応）
  - ID
  - 子要素の数
- 選択モードのON/OFF切り替え
- 選択中の要素のハイライト表示

## インストール方法

1. このリポジトリをクローンまたはダウンロード
2. Chrome で `chrome://extensions/` を開く
3. 「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `element-inspector` フォルダを選択

## 使い方

1. 拡張機能アイコンをクリック
2. 「Inspectモードを開始」ボタンをクリック
3. ページ上の調べたい要素をクリック
4. 要素情報がポップアップに表示される

## ドキュメント

詳細なドキュメントは `docs/` フォルダを参照してください。

- [要件定義](docs/REQUIREMENTS.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [開発ガイド](docs/DEVELOPMENT.md)
- [テスト方法](docs/TESTING.md)
- [ロードマップ](docs/ROADMAP.md)

## 技術スタック

- Manifest V3
- Vanilla JavaScript（ES6+）
- Chrome Extensions API

## ライセンス

MIT License
