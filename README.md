# Diorama Stage Studio

**Mac 容量消費ほぼゼロ・インストール不要・GitHub Pages で即起動できる 2.5D ドット絵ジオラマ（立体ドット表現）ステージ制作スタジオ＆マルチエンジン出力ツール**です。

- **ライブエディタ（GitHub Pages）**: https://tsubasa220325.github.io/diorama-stage-studio/
- **依存ライブラリゼロ（Pure ES Modules + WebGL2）**: `node_modules` 不要、リポジトリ全体わずか数百 KB。
- **マルチゲーム対応**: リズモディア（4:3 戦闘・ビスタ）はもちろん、16:9 RPG 探索マップ・タクティカル段差マップなど別ゲームにもそのまま使えます。

> ※「HD-2D」はスクウェア・エニックス社の登録商標のため、本リポジトリおよび UI・書き出しデータでは「2.5D ドット絵ジオラマ（Diorama Stage）」として表現・設計しています。

---

## 主な機能

1. **リアルタイム WebGL2 2.5D ジオラマ描画**
   - 1024×1024 PCF ソフトシャドウマップ（3D 建築＋2D ドットキャラの双方から影を投影）
   - ピクセル PBR タイルアトラス（Albedo ＋ 法線マップ ＋ 光沢）とニアレスト補間ドット絵ビルボード
   - 最大 8 灯の動的ポイントライト・ゴッドレイ（光柱）・霧・深度ボケ浮遊パーティクル
   - 被写界深度（DoF）・選択的 HDR ブルーム・Filmic トーンマップ・ビネット・床映り込み反射
2. **10 種のビルトインプリセット**
   - 4:3 戦闘ジオラマ 7 種（洞窟・劇場・地下礼拝堂・大理石舞踏室・大聖堂・メトロノームの間・星奏聖域）
   - 他ゲーム向け汎用 16:9 プリセット 2 種（RPG 石畳広場・タクティカル遺跡段差＋歩行グリッド）
   - 4:3 月夜ビスタ背景 1 種
3. **Mac の容量を食わない保存・連携ワークフロー**
   - **File System Access API（Chrome / Edge）**: ブラウザから直接ローカルのゲームフォルダへ上書き保存
   - **GitHub REST API 直接コミット**: Mac にクローンせず GitHub 上のステージ JSON を直接更新
   - **ブラウザ内 Sobel 法線マップ工房**: 2D タイル画像から法線マップ PNG を即時生成（0 CU）
   - **Google Colab GPU 連携**: 商用安全モデル（Apache-2.0 `FLUX.2-klein-4B` 等）用 `colab_jobs.json` 書き出し
4. **マルチエンジン書き出し＆導入アダプタ**
   - **`stage.diorama.json`（v1）**: リズモディア Web 版へそのまま読込可能（`adapters/rhysmodia-web/`）
   - **バイナリ glTF 2.0（`.glb`）**: ブラウザ内で直接生成。`NEAREST` サンプラ、`KHR_lights_punctual` 光源、`extras.dioramaStage`（DoF・ブルーム・霧・アンカー・歩行グリッド）を完全埋め込み
   - **Unity 6 URP 用 UPM パッケージ**: `https://github.com/tsubasa220325/diorama-stage-studio.git?path=adapters/unity-urp` から直接導入（`glTFast >= 6.21.0` 対応、`FilterMode.Point` & `anisoLevel = 0` 自動強制）
   - **Godot 4 / Three.js アダプタ**: `adapters/godot4/`・`adapters/threejs/`

---

## Google クラウド環境でのゼロ容量運用

Mac の SSD を消費せずに開発・素材生成・ステージ編集を完結できます。

| 作業 | 推奨環境 | Mac SSD 消費 |
|---|---|---:|
| ステージ作成・編集・`.glb`/JSON 書き出し | **GitHub Pages（ブラウザで開くだけ）** | **0 MB** |
| コード編集・テスト実行・`git push` | **Google Cloud Shell（無料・5GB 永続・Cloud Shell Editor 付き）** または **GitHub Codespaces** | **0 MB** |
| 背景美術・ドット調タイル大量生成 | **Google Colab GPU（L4）＋ Google Drive（2TB）** | **0 MB** |
| 凝った単体 3D 小物モデリング | **Blockbench Web** (`https://app.blockbench.net`) | **0 MB** |

### Google Cloud Shell でツールを改造する場合
```bash
git clone --depth 1 https://github.com/tsubasa220325/diorama-stage-studio.git
cd diorama-stage-studio
npm test
python3 -m http.server 8080   # Cloud Shell の「ウェブでプレビュー」から即確認
```

---

## テスト

Node.js 20+ 標準テストランナーのみで動作します（`npm install` 不要）。

```bash
npm test
```
