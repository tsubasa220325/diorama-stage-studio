# Diorama Stage Studio

[![Open in Cloud Shell](https://gstatic.com/cloudssh/images/open-btn.svg)](https://shell.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https://github.com/tsubasa220325/diorama-stage-studio&cloudshell_tutorial=cloud/cloudshell-tutorial.md)
[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/tsubasa220325/diorama-stage-studio/blob/main/colab/Diorama_Stage_Asset_Studio.ipynb)

**Mac 容量消費ほぼゼロ・インストール不要・GitHub Pages ＋ Google クラウド環境で完結する 2.5D ドット絵ジオラマ（立体ドット表現）ステージ制作スタジオ＆マルチエンジン出力ツール**です。

- **ライブエディタ（GitHub Pages）**: https://tsubasa220325.github.io/diorama-stage-studio/
- **Google Cloud Shell ワンクリック開発（無料 5 GB・Mac 0 MB）**: 上の「Open in Cloud Shell」ボタンをクリックするだけでリポジトリ自動クローン＋日本語チュートリアル＋Web プレビュー対応
- **Google Colab GPU 素材スタジオ（L4＋Drive 2TB）**: 上の「Open In Colab」ボタンから背景美術・64px ドットタイル・Sobel 法線マップを一括生成＆自動切断
- **依存ライブラリゼロ（Pure ES Modules + WebGL2）**: `node_modules` 不要、リポジトリ全体わずか数百 KB。

> ※「HD-2D」はスクウェア・エニックス社の登録商標のため、本リポジトリおよび UI・書き出しデータでは「2.5D ドット絵ジオラマ（Diorama Stage）」として表現・設計しています。

---

## 主な機能

1. **リアルタイム WebGL2 2.5D ジオラマ描画（v0.7.0）**
   - **Art-First 3D 湾曲プロジェクション (`backdrop.artFirst`)**: 手描きピクセル美術パノラマを 5 セグメント湾曲 3D 建築ベイ＆細分化フロアへ継ぎ目なく投影し、Sobel 法線レリーフ・色彩シャドウ・微細スペキュラ反射をリアルタイム合成
   - **2.5D 切り抜き小物レイヤー (`geometry.cutouts[]`)**: 透過ドット絵の振子・吊り鐘・篝火・街灯・水晶などを 3D 空間に配置し、BGM 拍同期アニメーション（`pendulum` / `sway` / `bob`）・回転連動シャドウマップ・動的ライト・ティルトシフト DoF を適用
   - **デュアルスケール選択的 HDR ブルーム＋前景ボケオーブ**: 1/4 解像度の芯ブルームと 1/8 解像度の広域シネマティックグロウを合成し、1024×1024 PCF 色彩シャドウマップ・頂点コンタクト AO・Filmic トーンマップと合わせて立体感を強調
   - ピクセル PBR タイルアトラス（Albedo ＋ 自動 Sobel 法線マップ ＋ 光沢、外部画像読込対応）＋動的アニメーション水面（波紋・フレネル反射）・溶岩流（黒曜石クラスト＋灼熱マグマ脈）シェーダ
   - 八角柱・石造アーチ門・大時計＆拍同期振子・切妻屋根の館・八角灯台・多面水晶クラスター・拍同期吊り鐘など15種の建築プロップ（GPU 頂点シェーダで BGM 拍に連動し影ごとリアルタイム動作）
   - 最大 8 灯の動的ポイントライト・ゴッドレイ（光柱）・霧・深度ボケ浮遊パーティクル・テーマ別プロシージャル遠景・リズモディア実戦 HUD 安全領域ガイド
2. **15 種のビルトインプリセット**
   - リズモディア 4:3 戦闘ジオラマ 12 種（通常戦 7 種 ＋ **タワー中ボス 3 種**［10F 大振子の時計塔溶岩工房 / 20F 氷結の沈没楽堂 / 30F 黄昏の天空港大楽章音楽堂］＋ **変拍子専用 2 種**［5拍子 星屑サーカス大時計広場 / 7拍子 月光ゴシック七連鐘楼］）
   - 他ゲーム向け汎用 16:9 プリセット 2 種（RPG 石畳広場・タクティカル遺跡段差＋歩行グリッド）
   - 4:3 月夜ビスタ背景 1 種
   - 単体ステージプレビュー・ヘッドレス画像書き出し用 `render.html?stage=<id>&beats=<n>&hud=1` 付属
3. **Mac の容量を食わない保存・連携ワークフロー**
   - **File System Access API（Chrome / Edge）**: ブラウザから直接ローカルのゲームフォルダへ上書き保存
   - **GitHub REST API 直接コミット**: Mac にクローンせず GitHub 上のステージ JSON を直接更新
   - **ブラウザ内 Sobel 法線マップ工房**: 2D タイル画像から法線マップ PNG を即時生成（0 CU）
   - **Google Colab GPU 連携**: 商用安全モデル（Apache-2.0 `FLUX.2-klein-4B` 等）用 `colab_jobs.json` 書き出し
4. **マルチエンジン書き出し＆導入アダプタ**
   - **`stage.diorama.json`（v1）＆ 静的プリセット URL**: 全 15 プリセットを `https://tsubasa220325.github.io/diorama-stage-studio/presets/json/<id>.diorama.json` として配信。リズモディア Web 版は `?stage=sample_arena` または `?stage=https://...` でそのまま読み込めます。
   - **Blockbench Web `.glb` 外部プロップ読込**: 依存ゼロの純 JS `.glb` インポータで、Blockbench Web 製 3D 小物をステージ内へ直接配置（影投影・動的ライト・DoF 対応）。
   - **バイナリ glTF 2.0（`.glb`）書き出し**: ブラウザ内で直接生成。`NEAREST` サンプラ、`KHR_lights_punctual` 光源、`extras.dioramaStage`（DoF・ブルーム・霧・アンカー・歩行グリッド）を完全埋め込み
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
