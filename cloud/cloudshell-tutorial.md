# Diorama Stage Studio — Google Cloud Shell 開発ガイド

ようこそ！このワークスペースは **Google Cloud Shell（無料・5 GB 永続・Mac の SSD 消費 0 MB）** 上で動いています。

## ステップ 1：環境確認＆自動テスト

依存パッケージのインストール（`npm install`）は不要です。そのまま自動テストを実行して動作を確認しましょう。

```bash
bash cloud/cloudshell-bootstrap.sh
```

## ステップ 2：クラウド上でリアルタイム開発プレビュー

専用の開発サーバー（ポート `8080`）を起動します。

```bash
node cloud/dev-server.mjs
```

起動したら、画面右上の **ウェブでプレビュー** <walkthrough-web-preview-icon></walkthrough-web-preview-icon> ボタン → **ポート 8080 でプレビュー** をクリックすると、ブラウザ上でライブ編集しながら即座に動作確認できます。

## ステップ 3：編集＆ GitHub へプッシュ（自動デプロイ）

主な編集ファイル：

- 描画エンジン：<walkthrough-editor-open-file filePath="core/renderer.js">core/renderer.js</walkthrough-editor-open-file>
- 3D ジオメトリ：<walkthrough-editor-open-file filePath="core/meshBuilder.js">core/meshBuilder.js</walkthrough-editor-open-file>
- ステージプリセット：<walkthrough-editor-open-file filePath="presets/index.js">presets/index.js</walkthrough-editor-open-file>
- エディタ UI：<walkthrough-editor-open-file filePath="editor/app.js">editor/app.js</walkthrough-editor-open-file>

編集後はテストを通して `main` へプッシュするだけで、GitHub Actions が自動でテストと **GitHub Pages** への公開を行います。

```bash
npm test && git status -sb
```

## ステップ 4：重い背景・タイル生成は Google Colab GPU へ

スタジオ上部の **Colab AI** ボタンから `colab_jobs_<stage>.json` を書き出し、リポジトリ内の [colab/Diorama_Stage_Asset_Studio.ipynb](https://colab.research.google.com/github/tsubasa220325/diorama-stage-studio/blob/main/colab/Diorama_Stage_Asset_Studio.ipynb) を **L4 GPU** で実行すると、Google Drive（2TB）へ背景 WebP・ドットタイル・Sobel 法線マップを一括出力して自動切断します。

## ステップ 5（任意）：常駐の Google Compute Engine 開発 VM を立てる場合

AI コーディングツールや長時間ジョブを Google クラウド上の専用 Linux VM で動かしたい場合は、この Cloud Shell からそのまま 1 コマンドで構築できます（Mac へ `gcloud` を入れる必要はありません）。

```bash
bash cloud/gce-dev-vm.sh help
```
