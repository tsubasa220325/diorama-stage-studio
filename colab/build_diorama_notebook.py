#!/usr/bin/env python3
"""Generates colab/Diorama_Stage_Asset_Studio.ipynb and verifies all cells via Python AST."""
from __future__ import annotations

import ast
import json
from pathlib import Path


def md_cell(text: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(keepends=True)}


def code_cell(code: str, form_view: bool = True) -> dict:
    clean = code.strip("\n") + "\n"
    ast.parse(clean)
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {"cellView": "form"} if form_view else {},
        "outputs": [],
        "source": clean.splitlines(keepends=True),
    }


INTRO_MD = """# 2.5D Diorama Stage Asset Studio (Google Colab GPU × Google Drive)

**Diorama Stage Studio**（https://tsubasa220325.github.io/diorama-stage-studio/）と連携し、**Mac の SSD を 1 MB も消費せず**に背景美術・シームレス床タイル・Sobel 法線マップをクラウド GPU で一括生成する専用ノートブックです。

### 特徴（v0.7.2）
1. **商用クリーン標準**：`FLUX.2-klein-4B`（Apache 2.0・4 ステップ高速）および `Z-Image-Turbo`（Apache 2.0）を採用。
2. **Drive 共有キャッシュ**：`MyDrive/AI_Studio/hf_cache` にモデルをキャッシュし、2 回目以降の再取得を不要化。
3. **ゼロフリンジ 2.5D 切り抜き小物抽出（`kind: "cutout"`）**：四隅クロマ自動サンプル → 4 連結境界フラッドフィル → 2px 境界色滲みデスピル → 回転軸（`top`/`bottom`）揃えの自動トリムで透過 WebP を生成。
4. **ドット絵 PBR 自動後処理**：生成したタイル画像をニアレスト縮小（64×64 / 256×256）＋ **Sobel タンジェント法線マップ（`*_normal.png`）** 同時出力。
5. **商用証跡台帳＆CU 節約自動切断**：生成物ごとにモデル ID・ライセンス・Seed を `asset_ledger.csv` / `.provenance.json` に自動記録し、完了後に `runtime.unassign()` を自動実行可能。

> **推奨ランタイム**：メニュー「ランタイム」→「ランタイムのタイプを変更」→ **L4 GPU**（T4 でも CPU オフロードで動作）。
"""

CELL_1_SETUP = '''#@title 1. GPU診断・Google Drive接続・ライブラリ準備 { display-mode: "form" }
DRIVE_ROOT_FOLDER = "AI_Studio" #@param {type:"string"}
INSTALL_PACKAGES = True #@param {type:"boolean"}

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

import torch

if not torch.cuda.is_available():
    raise RuntimeError("GPUが有効ではありません。ランタイムのタイプを L4 または T4 GPU に変更してください。")

gpu_name = torch.cuda.get_device_name(0)
vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
cc_major, _ = torch.cuda.get_device_capability(0)
BF16_NATIVE = cc_major >= 8
print(f"Python {platform.python_version()} | PyTorch {torch.__version__} | GPU: {gpu_name} ({vram_gb:.1f} GB)")

IN_COLAB = False
try:
    from google.colab import drive  # type: ignore
    IN_COLAB = True
except ImportError:
    drive = None

if IN_COLAB:
    drive.mount("/content/drive", force_remount=False)
    STUDIO_ROOT = Path("/content/drive/MyDrive") / DRIVE_ROOT_FOLDER
else:
    STUDIO_ROOT = Path("./AI_Studio_Local")

DIRS = {
    "hf_cache": STUDIO_ROOT / "hf_cache",
    "stage_jobs": STUDIO_ROOT / "diorama_jobs",
    "stage_outputs": STUDIO_ROOT / "outputs" / "diorama_stages",
}
for p in DIRS.values():
    p.mkdir(parents=True, exist_ok=True)

os.environ["HF_HOME"] = str(DIRS["hf_cache"])
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"

if INSTALL_PACKAGES:
    subprocess.run(
        [
            sys.executable, "-m", "pip", "install", "-q", "-U",
            "git+https://github.com/huggingface/diffusers.git",
            "transformers", "accelerate", "safetensors", "huggingface_hub", "hf_transfer", "pillow", "numpy",
        ],
        check=True,
    )

print(f"Drive保存先: {DIRS['stage_outputs']}")
'''

CELL_2_PIPELINE = '''#@title 2. モデル読込＆2.5Dドット絵PBR（法線マップ＋WebP）後処理関数 { display-mode: "form" }
MODEL_KEY = "flux2_klein_4b" #@param ["flux2_klein_4b", "z_image_turbo"]

import csv
import gc
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from PIL import Image

MODEL_REGISTRY = {
    "flux2_klein_4b": {
        "repo": "black-forest-labs/FLUX.2-klein-4B",
        "license": "Apache-2.0",
        "default_steps": 4,
        "default_guidance": 1.0,
    },
    "z_image_turbo": {
        "repo": "Tongyi-MAI/Z-Image-Turbo",
        "license": "Apache-2.0",
        "default_steps": 9,
        "default_guidance": 0.0,
    },
}

_LOADED = {}


def get_pipeline(key: str):
    if key in _LOADED:
        return _LOADED[key]
    _LOADED.clear()
    gc.collect()
    torch.cuda.empty_cache()

    info = MODEL_REGISTRY[key]
    dtype = torch.bfloat16 if BF16_NATIVE else torch.float16
    if key == "flux2_klein_4b":
        from diffusers import Flux2KleinPipeline
        pipe = Flux2KleinPipeline.from_pretrained(info["repo"], torch_dtype=dtype)
    else:
        from diffusers import ZImagePipeline
        pipe = ZImagePipeline.from_pretrained(info["repo"], torch_dtype=dtype)

    if BF16_NATIVE and torch.cuda.get_device_properties(0).total_memory >= 20 * (1024 ** 3):
        pipe.to("cuda")
    else:
        pipe.enable_model_cpu_offload()
    _LOADED[key] = pipe
    return pipe


def generate_sobel_normal(img: Image.Image, strength: float = 2.6) -> Image.Image:
    arr = np.asarray(img.convert("RGBA"), dtype=np.float32) / 255.0
    luma = (arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114) * arr[:, :, 3]
    tl = np.roll(np.roll(luma, 1, axis=0), 1, axis=1)
    t = np.roll(luma, 1, axis=0)
    tr = np.roll(np.roll(luma, 1, axis=0), -1, axis=1)
    l = np.roll(luma, 1, axis=1)
    r = np.roll(luma, -1, axis=1)
    bl = np.roll(np.roll(luma, -1, axis=0), 1, axis=1)
    b = np.roll(luma, -1, axis=0)
    br = np.roll(np.roll(luma, -1, axis=0), -1, axis=1)

    gx = ((tl + 2.0 * l + bl) - (tr + 2.0 * r + br)) * strength
    gy = ((tl + 2.0 * t + tr) - (bl + 2.0 * b + br)) * strength
    gz = np.ones_like(gx)
    inv = 1.0 / np.sqrt(gx * gx + gy * gy + gz * gz)
    nx = np.clip((gx * inv * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    ny = np.clip((gy * inv * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    nz = np.clip((gz * inv * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    alpha = np.full_like(nx, 255)
    return Image.fromarray(np.stack([nx, ny, nz, alpha], axis=-1), mode="RGBA")


def extract_zero_fringe_cutout(
    img: Image.Image,
    target_w: int,
    target_h: int,
    chroma: str = "green",
    pivot_align: str = "bottom",
) -> Image.Image:
    from collections import deque

    arr = np.asarray(img.convert("RGBA"), dtype=np.int16).copy()
    h, w, _ = arr.shape
    patch = max(2, min(8, min(w, h) // 16))
    corners = [arr[:patch, :patch, :3], arr[:patch, -patch:, :3], arr[-patch:, :patch, :3], arr[-patch:, -patch:, :3]]
    key_rgb = np.mean(np.concatenate([c.reshape(-1, 3) for c in corners], axis=0), axis=0)

    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    dist = np.sqrt((r - key_rgb[0]) ** 2 + (g - key_rgb[1]) ** 2 + (b - key_rgb[2]) ** 2)
    dom = (np.minimum(r, b) - g) if chroma == "magenta" else (g - np.maximum(r, b))
    cand = (a < 24) | ((dist < 105) & (dom > 22)) | ((dom > 52) & (dist < 165))

    bg = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        if cand[0, x] and not bg[0, x]:
            bg[0, x] = True; q.append((0, x))
        if cand[h - 1, x] and not bg[h - 1, x]:
            bg[h - 1, x] = True; q.append((h - 1, x))
    for y in range(1, h - 1):
        if cand[y, 0] and not bg[y, 0]:
            bg[y, 0] = True; q.append((y, 0))
        if cand[y, w - 1] and not bg[y, w - 1]:
            bg[y, w - 1] = True; q.append((y, w - 1))
    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and cand[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))

    arr[bg] = 0
    trans = arr[:, :, 3] < 24
    ring1 = (~trans) & (
        np.roll(trans, 1, 0) | np.roll(trans, -1, 0) | np.roll(trans, 1, 1) | np.roll(trans, -1, 1)
    )
    arr[ring1 & (dom > 34)] = 0
    trans = arr[:, :, 3] < 24
    ring1 = (~trans) & (
        np.roll(trans, 1, 0) | np.roll(trans, -1, 0) | np.roll(trans, 1, 1) | np.roll(trans, -1, 1)
    )
    ring2 = (~trans) & (
        ring1 | np.roll(ring1, 1, 0) | np.roll(ring1, -1, 0) | np.roll(ring1, 1, 1) | np.roll(ring1, -1, 1)
    )
    despill = ring2 & (dom > 6)
    if chroma == "magenta":
        cap = np.minimum(255, arr[:, :, 2 - 1] + 4)
        spill = np.maximum(0, np.minimum(arr[:, :, 0], arr[:, :, 2]) - cap)
        arr[:, :, 0] = np.where(despill, np.maximum(0, arr[:, :, 0] - spill), arr[:, :, 0])
        arr[:, :, 2] = np.where(despill, np.maximum(0, arr[:, :, 2] - spill), arr[:, :, 2])
    else:
        limit = np.maximum(arr[:, :, 0], arr[:, :, 2]) + 2
        arr[:, :, 1] = np.where(despill, np.minimum(arr[:, :, 1], limit), arr[:, :, 1])

    rgba = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGBA")
    bbox = rgba.getbbox()
    if not bbox:
        return Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    cropped = rgba.crop(bbox)
    margin = 4
    scale = min((target_w - margin * 2) / max(1, cropped.width), (target_h - margin * 2) / max(1, cropped.height))
    sw = max(1, round(cropped.width * scale))
    sh = max(1, round(cropped.height * scale))
    scaled = cropped.resize((sw, sh), Image.Resampling.NEAREST)
    out = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    ox = (target_w - sw) // 2
    oy = margin if pivot_align == "top" else ((target_h - sh) // 2 if pivot_align == "center" else max(0, target_h - margin - sh))
    out.paste(scaled, (ox, oy), scaled)
    return out


def record_provenance(out_dir: Path, row: dict):
    ledger = out_dir / "asset_ledger.csv"
    exists = ledger.exists()
    fields = ["timestamp", "job_id", "filename", "model_repo", "license", "seed", "width", "height", "prompt"]
    with ledger.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        if not exists:
            writer.writeheader()
        writer.writerow(row)


print("パイプライン定義完了:", MODEL_KEY)
'''

CELL_3_RUN_BATCH = '''#@title 3. スタジオ書き出し `colab_jobs_*.json` を一括生成（＋タイル法線マップ自動生成＆自動切断） { display-mode: "form" }
JOB_JSON_PATH = "/content/drive/MyDrive/AI_Studio/diorama_jobs/colab_jobs_cavern_arena.json" #@param {type:"string"}
PIXEL_TILE_SIZE = 64 #@param [64, 128, 256] {type:"raw"}
NORMAL_STRENGTH = 2.6 #@param {type:"number"}
AUTO_DISCONNECT_WHEN_DONE = True #@param {type:"boolean"}

import json
from datetime import datetime, timezone
from pathlib import Path

import torch
from PIL import Image

job_file = Path(JOB_JSON_PATH)
if job_file.exists():
    batch = json.loads(job_file.read_text(encoding="utf-8"))
else:
    print("指定JSONが見つからないため、サンプル1ステージ分（背景＋床タイル）を実行します。")
    batch = {
        "batch_name": "sample_cavern_stage",
        "jobs": [
            {
                "id": "cavern_backdrop",
                "model": MODEL_KEY,
                "width": 960,
                "height": 720,
                "steps": 4,
                "guidance": 1.0,
                "seed": 4201,
                "prompt": "Crisp 32-bit pixel art fantasy crystal cavern background vista for a 2.5D diorama battle stage, violet crystal glow and warm torchlight, clear center horizon, no characters, no UI, no text.",
                "output_filename": "hd_bg_cavern_sample.webp",
            },
            {
                "id": "cavern_tile_floor",
                "model": MODEL_KEY,
                "width": 512,
                "height": 512,
                "steps": 4,
                "guidance": 1.0,
                "seed": 4202,
                "prompt": "Seamless top-down 32-bit pixel art dark purple cavern stone cobble floor tile with crisp bevels and moss cracks, flat even lighting for normal map generation, no text.",
                "output_filename": "tile_cavern_floor.png",
            },
        ],
    }

batch_out = DIRS["stage_outputs"] / batch.get("batch_name", "diorama_batch")
batch_out.mkdir(parents=True, exist_ok=True)

for job in batch["jobs"]:
    mkey = job.get("model", MODEL_KEY)
    if mkey not in MODEL_REGISTRY:
        mkey = MODEL_KEY
    info = MODEL_REGISTRY[mkey]
    pipe = get_pipeline(mkey)
    seed = int(job.get("seed", 42))
    gen = torch.Generator(device="cuda").manual_seed(seed)
    w = int(job.get("width", 960))
    h = int(job.get("height", 720))
    steps = int(job.get("steps", info["default_steps"]))
    guidance = float(job.get("guidance", info["default_guidance"]))
    prompt = job["prompt"]

    print(f"Generating {job['id']} ({w}x{h}, {mkey}, seed={seed})...")
    img = pipe(
        prompt=prompt,
        width=w,
        height=h,
        num_inference_steps=steps,
        guidance_scale=guidance,
        generator=gen,
    ).images[0]

    out_name = job.get("output_filename", f"{job['id']}.png")
    out_path = batch_out / out_name
    kind = job.get("kind", "")
    if kind == "cutout" or out_name.startswith("prop_"):
        tw = int(job.get("target_width", 192))
        th = int(job.get("target_height", 256))
        img = extract_zero_fringe_cutout(
            img, tw, th,
            chroma=job.get("chroma", "green"),
            pivot_align=job.get("pivot_align", "bottom"),
        )
        img.save(out_path, format="WEBP" if out_path.suffix.lower() == ".webp" else "PNG", quality=92, method=6)
        print(f"  -> Zero-fringe cutout: {out_path.name} ({tw}x{th})")
    elif out_path.suffix.lower() == ".webp":
        img.save(out_path, format="WEBP", quality=90, method=6)
    else:
        img.save(out_path)

    # If this is a tile job, also output crisp pixel-downsampled tile + Sobel normal map!
    if "tile" in job["id"].lower() or out_name.startswith("tile_"):
        pix = img.resize((PIXEL_TILE_SIZE, PIXEL_TILE_SIZE), Image.Resampling.NEAREST)
        pix_path = batch_out / f"{out_path.stem}_{PIXEL_TILE_SIZE}px.png"
        norm_path = batch_out / f"{out_path.stem}_{PIXEL_TILE_SIZE}px_normal.png"
        pix.save(pix_path)
        generate_sobel_normal(pix, strength=NORMAL_STRENGTH).save(norm_path)
        print(f"  -> Pixel tile: {pix_path.name} + Normal: {norm_path.name}")

    meta_row = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "job_id": job["id"],
        "filename": out_name,
        "model_repo": info["repo"],
        "license": info["license"],
        "seed": seed,
        "width": w,
        "height": h,
        "prompt": prompt,
    }
    (batch_out / f"{out_path.stem}.provenance.json").write_text(
        json.dumps(meta_row, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    record_provenance(batch_out, meta_row)

print(f"完了！出力先: {batch_out}")

if AUTO_DISCONNECT_WHEN_DONE and IN_COLAB:
    from google.colab import runtime  # type: ignore
    print("CU節約のためランタイムを自動切断します...")
    runtime.unassign()
'''


def main() -> None:
    nb = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python"},
            "accelerator": "GPU",
        },
        "cells": [
            md_cell(INTRO_MD),
            code_cell(CELL_1_SETUP),
            code_cell(CELL_2_PIPELINE),
            code_cell(CELL_3_RUN_BATCH),
        ],
    }
    out_path = Path(__file__).resolve().parent / "Diorama_Stage_Asset_Studio.ipynb"
    out_path.write_text(json.dumps(nb, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated & AST-verified: {out_path}")


if __name__ == "__main__":
    main()
