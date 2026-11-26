import {
  encodeRgbaToPng, generateNormalFromRgba, patchAtlasTile, TILE_LABELS_JA, TILE_NAMES,
} from '../core/atlasBuilder.js';
import { projectPoint, unprojectRayToPlaneY } from '../core/math.js';
import { PROP_TYPES } from '../core/meshBuilder.js';
import { createStudioRenderer } from '../core/renderer.js';
import { SAMPLE_SPRITE_STYLES } from '../core/sampleSprites.js';
import { cloneStage, normalizeStage, validateStage } from '../core/validator.js';
import { buildColabStageJob } from '../exporters/colabJobExporter.js';
import { exportStageToGlb } from '../exporters/glbExporter.js';
import { PRESETS, presetById } from '../presets/index.js';
import {
  commitStageToGitHub, downloadBlob, openStageJsonFile, saveStageJson,
} from './storage.js';

const $ = id => document.getElementById(id);

const MOOD_PRESETS = [
  {
    name: '紫水晶の洞窟',
    ambient: [0.24, 0.18, 0.34],
    keyColor: [1.0, 0.76, 0.46],
    fogColor: [0.10, 0.05, 0.18],
    bgTop: [0.06, 0.04, 0.16],
    bgBottom: [0.22, 0.12, 0.34],
    grade: [1.03, 0.99, 1.03],
  },
  {
    name: '月光ブルー',
    ambient: [0.16, 0.22, 0.38],
    keyColor: [0.68, 0.86, 1.0],
    fogColor: [0.05, 0.09, 0.22],
    bgTop: [0.03, 0.07, 0.18],
    bgBottom: [0.14, 0.22, 0.42],
    grade: [0.95, 1.00, 1.09],
  },
  {
    name: '夕暮れノスタルジア',
    ambient: [0.30, 0.20, 0.26],
    keyColor: [1.0, 0.68, 0.36],
    fogColor: [0.22, 0.11, 0.16],
    bgTop: [0.14, 0.12, 0.30],
    bgBottom: [0.72, 0.32, 0.20],
    grade: [1.08, 0.99, 0.92],
  },
  {
    name: '翠霧エメラルド',
    ambient: [0.16, 0.25, 0.20],
    keyColor: [0.62, 1.0, 0.58],
    fogColor: [0.04, 0.13, 0.08],
    bgTop: [0.03, 0.10, 0.07],
    bgBottom: [0.10, 0.24, 0.15],
    grade: [0.97, 1.05, 0.95],
  },
  {
    name: '黄金大聖堂',
    ambient: [0.24, 0.14, 0.20],
    keyColor: [1.0, 0.74, 0.36],
    fogColor: [0.14, 0.05, 0.09],
    bgTop: [0.12, 0.04, 0.09],
    bgBottom: [0.34, 0.14, 0.18],
    grade: [1.06, 0.98, 0.94],
  },
  {
    name: '白雪モーニング',
    ambient: [0.34, 0.38, 0.48],
    keyColor: [0.96, 0.98, 1.0],
    fogColor: [0.18, 0.24, 0.34],
    bgTop: [0.22, 0.34, 0.56],
    bgBottom: [0.64, 0.74, 0.88],
    grade: [0.99, 1.01, 1.04],
  },
];

const state = {
  stage: normalizeStage(PRESETS[0]),
  undoStack: [],
  redoStack: [],
  selection: { group: 'props', index: 0 },
  cameraMode: 'game', // 'game' | 'orbit'
  toolMode: 'move',   // 'move' | 'grid'
  snapStep: 0.25,
  orbit: { yaw: 0.32, pitch: 0.36, distance: 14.5, panX: 0, panY: 0, panZ: 0 },
  beatSync: true,
  bpm: 128,
  enraged: false,
  showGuides: true,
  impactFlash: 0,
  lastRenderInfo: null,
};

const glCanvas = $('gl-canvas');
const guideCanvas = $('guide-canvas');
const guideCtx = guideCanvas.getContext('2d');
const renderer = createStudioRenderer(glCanvas);

function setStatus(msg) {
  $('status-msg').textContent = msg;
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function pushUndo() {
  state.undoStack.push(cloneStage(state.stage));
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack.length = 0;
}

function rebuildGeometry() {
  if (!renderer) return;
  renderer.uploadStageGeometry(state.stage);
}

function syncAspectButtons() {
  const isWide = (state.stage.meta.aspect[0] / state.stage.meta.aspect[1]) > 1.5;
  $('btn-aspect-43').classList.toggle('active', !isWide);
  $('btn-aspect-169').classList.toggle('active', isWide);
}

function loadStage(rawStage, label = '') {
  const normalized = normalizeStage(rawStage);
  const check = validateStage(normalized);
  if (!check.valid) {
    setStatus(`警告: ${check.errors[0]}`);
  }
  state.stage = normalized;
  state.undoStack.length = 0;
  state.redoStack.length = 0;
  state.selection = { group: 'props', index: normalized.geometry.props.length > 0 ? 0 : -1 };
  renderer?.updateAtlas(normalized.atlas?.normalStrength ?? 2.2);
  rebuildGeometry();
  syncAspectButtons();
  renderOutliner();
  renderInspector();
  renderEnvInspector();
  setStatus(label || `読み込み完了: ${normalized.meta.name}`);
}

function getCollection(group) {
  if (group === 'floors') return state.stage.geometry.floors;
  if (group === 'boxes') return state.stage.geometry.boxes;
  if (group === 'slopes') return state.stage.geometry.slopes;
  if (group === 'props') return state.stage.geometry.props;
  if (group === 'pointLights') return state.stage.lighting.pointLights;
  if (group === 'lightRays') return state.stage.lighting.lightRays;
  if (group === 'anchors') return state.stage.anchors;
  return [];
}

function addItem(group) {
  pushUndo();
  const list = getCollection(group);
  const n = list.length + 1;
  if (group === 'floors') {
    list.push({ id: `floor_${n}`, x: [-4, 4], y: 0, z: [-2, 2], tile: 'CAVERN_FLOOR', repeat: [4, 2], gloss: 0.4, receiveRings: false });
  } else if (group === 'boxes') {
    list.push({ id: `box_${n}`, x: [-1, 1], y: [0, 1], z: [-2, -1], sideTile: 'ASHLAR_BLOCK', topTile: 'ASHLAR_BLOCK', gloss: 0.3, emissive: 0, dofTag: 0 });
  } else if (group === 'slopes') {
    list.push({ id: `stairs_${n}`, x: [-1, 1], y: [0, 1], z: [-2, -0.5], direction: '-z', steps: 5, tile: 'ASHLAR_BLOCK', gloss: 0.3 });
  } else if (group === 'props') {
    list.push({ id: `prop_${n}`, type: 'brazier', pos: [0, 0, -2.2], scale: 1, height: 1.3, radius: 0.4, width: 1.5, tile: 'STONE_PILLAR', capTile: 'ASHLAR_BLOCK' });
  } else if (group === 'pointLights') {
    if (list.length >= 8) {
      setStatus('ポイントライトは WebGL2 上限の 8 灯までです');
      return;
    }
    list.push({ id: `light_${n}`, pos: [0, 2.0, -1.5], color: [1.0, 0.78, 0.38], intensity: 1.8, radius: 7.0, flicker: 0.1, phase: n });
  } else if (group === 'lightRays') {
    list.push({ id: `ray_${n}`, top: [0, 5.6], bot: [0, 0], z: -2.4, width: 1.6, color: [1.0, 0.85, 0.55], alpha: 0.13 });
  } else if (group === 'anchors') {
    list.push({ id: `anchor_${n}`, role: 'npc', pos: [0, 0, 0.5], widthWorld: 1.6, heightWorld: 1.6, spriteStyle: 'npc_villager', ringColor: [0.55, 0.85, 1.0] });
  }
  state.selection = { group, index: list.length - 1 };
  rebuildGeometry();
  renderOutliner();
  renderInspector();
  setStatus(`${group} を追加しました`);
}

function renderOutliner() {
  const container = $('outliner');
  container.innerHTML = '';
  const groups = [
    { key: 'floors', title: '床 (Floors)' },
    { key: 'boxes', title: 'ブロック / 段差 (Boxes)' },
    { key: 'slopes', title: '階段 / スロープ (Slopes)' },
    { key: 'props', title: '建築プロップ (Props)' },
    { key: 'pointLights', title: 'ポイントライト (最大8)' },
    { key: 'lightRays', title: 'ゴッドレイ光柱 (Rays)' },
    { key: 'anchors', title: 'キャラ・配置点 (Anchors)' },
  ];
  let total = 0;

  for (const g of groups) {
    const list = getCollection(g.key);
    total += list.length;
    const box = document.createElement('div');
    box.className = 'group-box';

    const head = document.createElement('div');
    head.className = 'group-head';
    head.innerHTML = `<span>${g.title} (${list.length})</span>`;
    const addBtn = document.createElement('button');
    addBtn.className = 'mini';
    addBtn.textContent = '+ 追加';
    addBtn.onclick = () => addItem(g.key);
    head.appendChild(addBtn);
    box.appendChild(head);

    const listEl = document.createElement('div');
    listEl.className = 'group-list';
    list.forEach((item, idx) => {
      const row = document.createElement('div');
      const selected = state.selection.group === g.key && state.selection.index === idx;
      row.className = `item-row${selected ? ' selected' : ''}`;
      const label = item.id || `${g.key}_${idx + 1}`;
      const tag = item.type || item.tile || item.role || (item.intensity != null ? `I:${item.intensity.toFixed(1)}` : '');
      row.innerHTML = `<span>${item.hidden ? '🙈 ' : ''}${label}</span><span class="item-tag">${tag}</span>`;
      row.onclick = () => {
        state.selection = { group: g.key, index: idx };
        switchRightTab('object');
        renderOutliner();
        renderInspector();
      };
      listEl.appendChild(row);
    });
    box.appendChild(listEl);
    container.appendChild(box);
  }
  $('obj-count').textContent = `${total} 要素`;
}

function numField(label, value, step, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = Number(value ?? 0).toFixed(2).replace(/\.00$/, '');
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) {
      pushUndo();
      onChange(v);
      rebuildGeometry();
      renderOutliner();
    }
  });
  wrap.appendChild(input);
  return wrap;
}

function sliderField(label, value, min, max, step, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'slider-field';
  const head = document.createElement('div');
  head.className = 'slider-head';
  const valSpan = document.createElement('span');
  valSpan.className = 'mono';
  valSpan.textContent = Number(value).toFixed(2);
  head.innerHTML = `<span>${label}</span>`;
  head.appendChild(valSpan);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('pointerdown', () => pushUndo());
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    valSpan.textContent = v.toFixed(2);
    onChange(v);
    rebuildGeometry();
  });
  wrap.appendChild(head);
  wrap.appendChild(input);
  return wrap;
}

function tileSelect(label, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.textContent = label;
  const sel = document.createElement('select');
  for (const name of TILE_NAMES) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = `${TILE_LABELS_JA[name] ?? name} (${name})`;
    if (name === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = () => {
    pushUndo();
    onChange(sel.value);
    rebuildGeometry();
    renderOutliner();
  };
  wrap.appendChild(sel);
  return wrap;
}

function colorField(label, rgb, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.textContent = label;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = rgbToHex(rgb);
  input.addEventListener('pointerdown', () => pushUndo());
  input.addEventListener('input', () => onChange(hexToRgb(input.value)));
  wrap.appendChild(input);
  return wrap;
}

function renderInspector() {
  const root = $('inspector-object');
  root.innerHTML = '';
  const { group, index } = state.selection;
  const list = getCollection(group);
  const item = list[index];
  if (!item) {
    root.innerHTML = '<div class="hint">左のアウトライナーから要素を選択するか「+ 追加」してください。</div>';
    return;
  }

  const headerCard = document.createElement('div');
  headerCard.className = 'card';
  const idLabel = document.createElement('label');
  idLabel.className = 'field';
  idLabel.textContent = '要素 ID';
  const idInput = document.createElement('input');
  idInput.type = 'text';
  idInput.value = item.id || '';
  idInput.onchange = () => {
    pushUndo();
    item.id = idInput.value.trim() || item.id;
    renderOutliner();
  };
  idLabel.appendChild(idInput);
  headerCard.appendChild(idLabel);

  const actions = document.createElement('div');
  actions.className = 'asset-btns';
  const dupBtn = document.createElement('button');
  dupBtn.textContent = '複製';
  dupBtn.onclick = () => {
    if (group === 'pointLights' && list.length >= 8) return setStatus('ライトは最大8灯までです');
    pushUndo();
    const copy = JSON.parse(JSON.stringify(item));
    copy.id = `${copy.id || group}_copy`;
    if (copy.pos) copy.pos[0] += 0.8;
    if (copy.x) { copy.x[0] += 0.6; copy.x[1] += 0.6; }
    list.push(copy);
    state.selection = { group, index: list.length - 1 };
    rebuildGeometry();
    renderOutliner();
    renderInspector();
  };
  const hideBtn = document.createElement('button');
  hideBtn.textContent = item.hidden ? '表示する' : '非表示';
  hideBtn.onclick = () => {
    pushUndo();
    item.hidden = !item.hidden;
    rebuildGeometry();
    renderOutliner();
    renderInspector();
  };
  const delBtn = document.createElement('button');
  delBtn.className = 'danger';
  delBtn.textContent = '削除';
  delBtn.onclick = () => {
    pushUndo();
    list.splice(index, 1);
    state.selection = { group, index: Math.min(index, list.length - 1) };
    rebuildGeometry();
    renderOutliner();
    renderInspector();
  };
  actions.append(dupBtn, hideBtn, delBtn);
  headerCard.appendChild(actions);
  root.appendChild(headerCard);

  const card = document.createElement('div');
  card.className = 'card';

  if (group === 'floors') {
    const rX = document.createElement('div'); rX.className = 'row-2';
    rX.append(numField('X 最小', item.x[0], 0.25, v => item.x[0] = v), numField('X 最大', item.x[1], 0.25, v => item.x[1] = v));
    const rZ = document.createElement('div'); rZ.className = 'row-2';
    rZ.append(numField('Z 奥', item.z[0], 0.25, v => item.z[0] = v), numField('Z 手前', item.z[1], 0.25, v => item.z[1] = v));
    const rRep = document.createElement('div'); rRep.className = 'row-3';
    rRep.append(
      numField('高さ Y', item.y, 0.1, v => item.y = v),
      numField('繰返 X', item.repeat?.[0] ?? 4, 1, v => { item.repeat = [Math.max(1, v), item.repeat?.[1] ?? 2]; }),
      numField('繰返 Z', item.repeat?.[1] ?? 2, 1, v => { item.repeat = [item.repeat?.[0] ?? 4, Math.max(1, v)]; }),
    );
    card.append(rX, rZ, rRep, tileSelect('床タイル', item.tile, v => item.tile = v), sliderField('床光沢 (Gloss)', item.gloss ?? 0.35, 0, 1, 0.02, v => item.gloss = v));
  } else if (group === 'boxes') {
    const rX = document.createElement('div'); rX.className = 'row-2';
    rX.append(numField('X 最小', item.x[0], 0.2, v => item.x[0] = v), numField('X 最大', item.x[1], 0.2, v => item.x[1] = v));
    const rY = document.createElement('div'); rY.className = 'row-2';
    rY.append(numField('Y 下端', item.y[0], 0.1, v => item.y[0] = v), numField('Y 上端', item.y[1], 0.1, v => item.y[1] = v));
    const rZ = document.createElement('div'); rZ.className = 'row-2';
    rZ.append(numField('Z 奥', item.z[0], 0.2, v => item.z[0] = v), numField('Z 手前', item.z[1], 0.2, v => item.z[1] = v));
    card.append(
      rX, rY, rZ,
      tileSelect('側面タイル', item.sideTile, v => item.sideTile = v),
      tileSelect('天面タイル', item.topTile ?? item.sideTile, v => item.topTile = v),
      sliderField('光沢 (Gloss)', item.gloss ?? 0.28, 0, 1, 0.02, v => item.gloss = v),
      sliderField('自己発光 (Emissive)', item.emissive ?? 0, 0, 2.5, 0.05, v => item.emissive = v),
    );
  } else if (group === 'slopes') {
    const rX = document.createElement('div'); rX.className = 'row-2';
    rX.append(numField('X 最小', item.x[0], 0.2, v => item.x[0] = v), numField('X 最大', item.x[1], 0.2, v => item.x[1] = v));
    const rY = document.createElement('div'); rY.className = 'row-2';
    rY.append(numField('Y 下端', item.y[0], 0.1, v => item.y[0] = v), numField('Y 上端', item.y[1], 0.1, v => item.y[1] = v));
    const rZ = document.createElement('div'); rZ.className = 'row-2';
    rZ.append(numField('Z 奥', item.z[0], 0.2, v => item.z[0] = v), numField('Z 手前', item.z[1], 0.2, v => item.z[1] = v));
    const dirWrap = document.createElement('label'); dirWrap.className = 'field'; dirWrap.textContent = '上り方向';
    const dirSel = document.createElement('select');
    for (const d of ['-z', '+z', '+x', '-x']) {
      const o = document.createElement('option'); o.value = d; o.textContent = d; if (item.direction === d) o.selected = true;
      dirSel.appendChild(o);
    }
    dirSel.onchange = () => { pushUndo(); item.direction = dirSel.value; rebuildGeometry(); };
    dirWrap.appendChild(dirSel);
    card.append(
      rX, rY, rZ,
      dirWrap,
      numField('段数 (1=斜面 / 2〜16=階段)', item.steps ?? 5, 1, v => item.steps = Math.max(1, Math.min(16, Math.round(v)))),
      tileSelect('タイル', item.tile, v => item.tile = v),
    );
  } else if (group === 'props') {
    const typeWrap = document.createElement('label'); typeWrap.className = 'field'; typeWrap.textContent = 'プロップ種別';
    const typeSel = document.createElement('select');
    for (const pt of PROP_TYPES) {
      const o = document.createElement('option'); o.value = pt.type; o.textContent = pt.label; if (item.type === pt.type) o.selected = true;
      typeSel.appendChild(o);
    }
    typeSel.onchange = () => { pushUndo(); item.type = typeSel.value; rebuildGeometry(); renderOutliner(); };
    typeWrap.appendChild(typeSel);
    const rP = document.createElement('div'); rP.className = 'row-3';
    rP.append(
      numField('位置 X', item.pos[0], 0.25, v => item.pos[0] = v),
      numField('位置 Y', item.pos[1], 0.1, v => item.pos[1] = v),
      numField('位置 Z', item.pos[2], 0.25, v => item.pos[2] = v),
    );
    const rS = document.createElement('div'); rS.className = 'row-3';
    rS.append(
      numField('倍率', item.scale ?? 1, 0.1, v => item.scale = Math.max(0.1, v)),
      numField('高さ', item.height ?? 2, 0.2, v => item.height = Math.max(0.2, v)),
      numField('幅 / 半径', item.width ?? item.radius ?? 0.5, 0.1, v => { item.width = v; item.radius = v; }),
    );
    card.append(typeWrap, rP, rS, tileSelect('主タイル', item.tile ?? 'STONE_PILLAR', v => item.tile = v));
  } else if (group === 'pointLights') {
    const rP = document.createElement('div'); rP.className = 'row-3';
    rP.append(
      numField('X', item.pos[0], 0.25, v => item.pos[0] = v),
      numField('Y', item.pos[1], 0.25, v => item.pos[1] = v),
      numField('Z', item.pos[2], 0.25, v => item.pos[2] = v),
    );
    card.append(
      rP,
      colorField('ライト色', item.color, rgb => item.color = rgb),
      sliderField('強度 (Intensity)', item.intensity, 0, 5, 0.05, v => item.intensity = v),
      sliderField('到達半径 (Radius)', item.radius, 1, 18, 0.2, v => item.radius = v),
      sliderField('炎の揺らぎ (Flicker)', item.flicker ?? 0.1, 0, 0.5, 0.01, v => item.flicker = v),
    );
  } else if (group === 'lightRays') {
    const rT = document.createElement('div'); rT.className = 'row-2';
    rT.append(numField('上端 X', item.top[0], 0.2, v => item.top[0] = v), numField('上端 Y', item.top[1], 0.2, v => item.top[1] = v));
    const rB = document.createElement('div'); rB.className = 'row-2';
    rB.append(numField('下端 X', item.bot[0], 0.2, v => item.bot[0] = v), numField('奥行 Z', item.z, 0.2, v => item.z = v));
    card.append(
      rT, rB,
      colorField('光柱の色', item.color, rgb => item.color = rgb),
      sliderField('光柱の幅', item.width, 0.3, 5, 0.1, v => item.width = v),
      sliderField('不透明度', item.alpha, 0, 0.45, 0.01, v => item.alpha = v),
    );
  } else if (group === 'anchors') {
    const rP = document.createElement('div'); rP.className = 'row-3';
    rP.append(
      numField('X', item.pos[0], 0.2, v => item.pos[0] = v),
      numField('Y', item.pos[1], 0.1, v => item.pos[1] = v),
      numField('Z', item.pos[2], 0.2, v => item.pos[2] = v),
    );
    const rSz = document.createElement('div'); rSz.className = 'row-2';
    rSz.append(
      numField('幅 (World)', item.widthWorld ?? 1.8, 0.1, v => item.widthWorld = Math.max(0.2, v)),
      numField('高さ (World)', item.heightWorld ?? 1.8, 0.1, v => item.heightWorld = Math.max(0.2, v)),
    );
    const spWrap = document.createElement('label'); spWrap.className = 'field'; spWrap.textContent = 'テスト用ドット絵';
    const spSel = document.createElement('select');
    for (const s of SAMPLE_SPRITE_STYLES) {
      const o = document.createElement('option'); o.value = s; o.textContent = s; if (item.spriteStyle === s) o.selected = true;
      spSel.appendChild(o);
    }
    spSel.onchange = () => { pushUndo(); item.spriteStyle = spSel.value; };
    spWrap.appendChild(spSel);
    card.append(rP, rSz, spWrap, colorField('足元リング色', item.ringColor ?? [0.4, 0.9, 0.7], rgb => item.ringColor = rgb));
  }

  root.appendChild(card);
}

function renderEnvInspector() {
  const root = $('inspector-env');
  root.innerHTML = '';
  const s = state.stage;

  // Mood presets card
  const moodCard = document.createElement('div');
  moodCard.className = 'card';
  moodCard.innerHTML = '<div class="section-title">ワンクリック・ムード変換</div>';
  const moodGrid = document.createElement('div');
  moodGrid.className = 'mood-grid';
  for (const m of MOOD_PRESETS) {
    const b = document.createElement('button');
    b.textContent = m.name;
    b.onclick = () => {
      pushUndo();
      s.lighting.ambient = [...m.ambient];
      s.lighting.keyLight.color = [...m.keyColor];
      s.atmosphere.fogColor = [...m.fogColor];
      s.backdrop.colorTop = [...m.bgTop];
      s.backdrop.colorBottom = [...m.bgBottom];
      s.postProcess.grade = [...m.grade];
      renderEnvInspector();
      setStatus(`ムード適用: ${m.name}`);
    };
    moodGrid.appendChild(b);
  }
  moodCard.appendChild(moodGrid);
  root.appendChild(moodCard);

  // Camera & DoF card
  const camCard = document.createElement('div');
  camCard.className = 'card';
  camCard.innerHTML = '<div class="section-title">カメラ & 被写界深度 (DoF)</div>';
  camCard.append(
    sliderField('俯瞰ピッチ角 (deg)', s.camera.pitchDeg ?? 14.5, 4, 55, 0.5, v => s.camera.pitchDeg = v),
    sliderField('カメラ距離', s.camera.distance ?? 13.5, 6, 28, 0.2, v => s.camera.distance = v),
    sliderField('焦点面 Z (Focus Z)', s.camera.focusZ ?? 0, -5, 4, 0.1, v => s.camera.focusZ = v),
    sliderField('被写界深度ボケ強度', s.postProcess.dofStrength ?? 0.85, 0, 1.4, 0.02, v => s.postProcess.dofStrength = v),
    sliderField('カメラ揺らぎ X', s.camera.sway?.x ?? 0.4, 0, 1.2, 0.02, v => { s.camera.sway = { ...(s.camera.sway || {}), x: v }; }),
  );
  root.appendChild(camCard);

  // Lighting & Post-FX card
  const lightCard = document.createElement('div');
  lightCard.className = 'card';
  lightCard.innerHTML = '<div class="section-title">ライティング & ポストプロセス</div>';
  const colRow = document.createElement('div');
  colRow.className = 'row-3';
  colRow.append(
    colorField('環境光', s.lighting.ambient, rgb => s.lighting.ambient = rgb),
    colorField('キーライト', s.lighting.keyLight.color, rgb => s.lighting.keyLight.color = rgb),
    colorField('霧の色', s.atmosphere.fogColor, rgb => s.atmosphere.fogColor = rgb),
  );
  const bgRow = document.createElement('div');
  bgRow.className = 'row-2';
  bgRow.append(
    colorField('遠景・空(上)', s.backdrop.colorTop ?? [0.06, 0.05, 0.16], rgb => s.backdrop.colorTop = rgb),
    colorField('遠景・地平(下)', s.backdrop.colorBottom ?? [0.18, 0.12, 0.3], rgb => s.backdrop.colorBottom = rgb),
  );
  lightCard.append(
    colRow,
    bgRow,
    sliderField('選択的ブルーム強度', s.postProcess.bloomStrength ?? 0.42, 0, 1.2, 0.02, v => s.postProcess.bloomStrength = v),
    sliderField('ビネット (周辺減光)', s.postProcess.vignette ?? 0.48, 0, 1.0, 0.02, v => s.postProcess.vignette = v),
    sliderField('霧の密度 (Fog)', s.atmosphere.fogDensity ?? 0.06, 0, 0.18, 0.002, v => s.atmosphere.fogDensity = v),
    sliderField('床映り込み光沢閾値', s.lighting.floorGloss ?? 0.4, 0, 1, 0.02, v => s.lighting.floorGloss = v),
    sliderField('浮遊パーティクル数', s.atmosphere.particles?.count ?? 48, 0, 100, 2, v => s.atmosphere.particles.count = Math.round(v)),
    sliderField('法線マップ凹凸強度', s.atlas?.normalStrength ?? 2.2, 0.4, 5.0, 0.1, v => {
      s.atlas = { ...(s.atlas || {}), normalStrength: v };
      renderer?.updateAtlas(v);
    }),
  );
  root.appendChild(lightCard);
}

function switchRightTab(tabName) {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  $('inspector-object').classList.toggle('hidden', tabName !== 'object');
  $('inspector-env').classList.toggle('hidden', tabName !== 'env');
}

function drawGuides(cam, width, height) {
  guideCanvas.width = width;
  guideCanvas.height = height;
  guideCtx.clearRect(0, 0, width, height);
  if (!state.showGuides) return;

  const vp = cam.viewProj;
  guideCtx.save();

  // Focus plane line (Z = focusZ)
  const fz = state.stage.camera?.focusZ ?? 0;
  const fL = projectPoint(vp, -6, 0, fz, width, height);
  const fR = projectPoint(vp, 6, 0, fz, width, height);
  guideCtx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
  guideCtx.lineWidth = 2;
  guideCtx.setLineDash([8, 6]);
  guideCtx.beginPath();
  guideCtx.moveTo(fL.x, fL.y);
  guideCtx.lineTo(fR.x, fR.y);
  guideCtx.stroke();
  guideCtx.setLineDash([]);
  guideCtx.fillStyle = '#38bdf8';
  guideCtx.font = 'bold 14px monospace';
  guideCtx.fillText(`FOCUS Z=${fz.toFixed(1)}`, fL.x + 8, fL.y - 8);

  // Walkable grid cells (for RPG / Tactical presets)
  for (const cell of state.stage.gameplay?.walkableCells ?? []) {
    const gs = state.stage.gameplay?.gridSize ?? 1.0;
    const x0 = cell.x * gs - gs * 0.48;
    const x1 = cell.x * gs + gs * 0.48;
    const z0 = cell.z * gs - gs * 0.48;
    const z1 = cell.z * gs + gs * 0.48;
    const y = (cell.y ?? 0) + 0.02;
    const pts = [
      projectPoint(vp, x0, y, z0, width, height),
      projectPoint(vp, x1, y, z0, width, height),
      projectPoint(vp, x1, y, z1, width, height),
      projectPoint(vp, x0, y, z1, width, height),
    ];
    guideCtx.fillStyle = 'rgba(52, 211, 153, 0.18)';
    guideCtx.strokeStyle = 'rgba(52, 211, 153, 0.72)';
    guideCtx.lineWidth = 1.5;
    guideCtx.beginPath();
    guideCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) guideCtx.lineTo(pts[i].x, pts[i].y);
    guideCtx.closePath();
    guideCtx.fill();
    guideCtx.stroke();
  }

  // Prop pins (clickable in viewport)
  for (let i = 0; i < (state.stage.geometry?.props?.length ?? 0); i++) {
    const p = state.stage.geometry.props[i];
    if (p.hidden) continue;
    const isSel = state.selection.group === 'props' && state.selection.index === i;
    const pt = projectPoint(vp, p.pos[0], p.pos[1] + 0.35, p.pos[2], width, height);
    guideCtx.fillStyle = isSel ? '#38bdf8' : 'rgba(167, 139, 250, 0.85)';
    guideCtx.strokeStyle = isSel ? '#ffffff' : 'rgba(255,255,255,0.65)';
    guideCtx.lineWidth = isSel ? 2.5 : 1.5;
    guideCtx.beginPath();
    guideCtx.arc(pt.x, pt.y, isSel ? 8 : 5, 0, Math.PI * 2);
    guideCtx.fill();
    guideCtx.stroke();
    if (isSel) {
      guideCtx.fillStyle = '#e0f2fe';
      guideCtx.font = 'bold 12px monospace';
      guideCtx.fillText(`${p.id} [${p.pos[0].toFixed(2)}, ${p.pos[2].toFixed(2)}]`, pt.x + 11, pt.y + 4);
    }
  }

  // Light pins
  for (let i = 0; i < (state.stage.lighting?.pointLights?.length ?? 0); i++) {
    const pl = state.stage.lighting.pointLights[i];
    const isSel = state.selection.group === 'pointLights' && state.selection.index === i;
    const pt = projectPoint(vp, pl.pos[0], pl.pos[1], pl.pos[2], width, height);
    guideCtx.fillStyle = rgbToHex(pl.color);
    guideCtx.strokeStyle = isSel ? '#38bdf8' : '#ffffff';
    guideCtx.lineWidth = isSel ? 3 : 2;
    guideCtx.beginPath();
    guideCtx.arc(pt.x, pt.y, isSel ? 9 : 7, 0, Math.PI * 2);
    guideCtx.fill();
    guideCtx.stroke();
    guideCtx.fillStyle = '#fff';
    guideCtx.font = '12px monospace';
    guideCtx.fillText(pl.id, pt.x + 10, pt.y + 4);
  }

  // Anchor markers
  for (let i = 0; i < (state.stage.anchors?.length ?? 0); i++) {
    const a = state.stage.anchors[i];
    const isSel = state.selection.group === 'anchors' && state.selection.index === i;
    const pt = projectPoint(vp, a.pos[0], a.pos[1], a.pos[2], width, height);
    guideCtx.strokeStyle = isSel ? '#38bdf8' : '#facc15';
    guideCtx.lineWidth = isSel ? 3 : 2;
    guideCtx.strokeRect(pt.x - 7, pt.y - 7, 14, 14);
    guideCtx.fillStyle = isSel ? '#38bdf8' : '#fde047';
    guideCtx.font = 'bold 12px monospace';
    guideCtx.fillText(`${a.id} (${a.role})`, pt.x + 11, pt.y - 6);
  }

  guideCtx.restore();
}

function snapValue(v) {
  const s = state.snapStep;
  return s > 0 ? Math.round(v / s) * s : Math.round(v * 100) / 100;
}

function canvasPointerToNdc(e) {
  const rect = glCanvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / Math.max(1, rect.width)) * glCanvas.width;
  const py = ((e.clientY - rect.top) / Math.max(1, rect.height)) * glCanvas.height;
  return {
    px,
    py,
    ndcX: (px / glCanvas.width) * 2 - 1,
    ndcY: 1 - (py / glCanvas.height) * 2,
  };
}

function pickViewportHandle(px, py) {
  if (!state.lastRenderInfo) return null;
  const { cam, width, height } = state.lastRenderInfo;
  const candidates = [];
  (state.stage.anchors ?? []).forEach((a, index) => {
    const pt = projectPoint(cam.viewProj, a.pos[0], a.pos[1] + (a.heightWorld ?? 1.6) * 0.45, a.pos[2], width, height);
    candidates.push({ group: 'anchors', index, item: a, dist: Math.hypot(pt.x - px, pt.y - py) });
  });
  (state.stage.lighting?.pointLights ?? []).forEach((pl, index) => {
    const pt = projectPoint(cam.viewProj, pl.pos[0], pl.pos[1], pl.pos[2], width, height);
    candidates.push({ group: 'pointLights', index, item: pl, dist: Math.hypot(pt.x - px, pt.y - py) });
  });
  (state.stage.geometry?.props ?? []).forEach((p, index) => {
    if (p.hidden) return;
    const pt = projectPoint(cam.viewProj, p.pos[0], p.pos[1] + 0.35, p.pos[2], width, height);
    candidates.push({ group: 'props', index, item: p, dist: Math.hypot(pt.x - px, pt.y - py) });
  });
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0] && candidates[0].dist <= 28 ? candidates[0] : null;
}

// Viewport pointer controls: Orbit + Direct Click/Drag Move + Walkable Grid Paint
let dragMode = null;
let dragTarget = null;
let dragPlaneY = 0;
let dragOffset = [0, 0];
let lastMouse = [0, 0];

glCanvas.addEventListener('pointerdown', e => {
  const { px, py, ndcX, ndcY } = canvasPointerToNdc(e);

  if (state.toolMode === 'grid' && state.lastRenderInfo) {
    const hit = unprojectRayToPlaneY(state.lastRenderInfo.cam.viewProj, ndcX, ndcY, 0);
    if (!hit) return;
    const gs = state.stage.gameplay?.gridSize ?? 1.0;
    const gx = Math.round(hit[0] / gs);
    const gz = Math.round(hit[2] / gs);
    pushUndo();
    state.stage.gameplay = state.stage.gameplay ?? { gridSize: 1.0, walkableCells: [], triggers: [] };
    const cells = state.stage.gameplay.walkableCells;
    const idx = cells.findIndex(c => c.x === gx && c.z === gz);
    if (idx >= 0) {
      cells.splice(idx, 1);
      setStatus(`歩行グリッド削除: (${gx}, ${gz})`);
    } else {
      cells.push({ x: gx, z: gz, y: 0 });
      setStatus(`歩行グリッド追加: (${gx}, ${gz})`);
    }
    return;
  }

  // Click-to-select & drag handles when in move mode (unless Alt/Right-click forces orbit)
  if (state.toolMode === 'move' && e.button === 0 && !e.altKey) {
    const hit = pickViewportHandle(px, py);
    if (hit && state.lastRenderInfo) {
      state.selection = { group: hit.group, index: hit.index };
      switchRightTab('object');
      renderOutliner();
      renderInspector();
      dragMode = 'move-handle';
      dragTarget = hit.item;
      dragPlaneY = hit.item.pos[1];
      const worldPt = unprojectRayToPlaneY(state.lastRenderInfo.cam.viewProj, ndcX, ndcY, dragPlaneY);
      if (worldPt) {
        dragOffset = [hit.item.pos[0] - worldPt[0], hit.item.pos[2] - worldPt[2]];
        pushUndo();
      }
      glCanvas.setPointerCapture(e.pointerId);
      setStatus(`選択: ${hit.item.id || hit.group} — ドラッグで X/Z 移動`);
      return;
    }
  }

  if (state.cameraMode !== 'orbit') return;
  dragMode = e.shiftKey ? 'pan' : 'orbit';
  lastMouse = [e.clientX, e.clientY];
  glCanvas.setPointerCapture(e.pointerId);
});

glCanvas.addEventListener('pointermove', e => {
  if (!dragMode) return;
  if (dragMode === 'move-handle' && dragTarget && state.lastRenderInfo) {
    const { ndcX, ndcY } = canvasPointerToNdc(e);
    const worldPt = unprojectRayToPlaneY(state.lastRenderInfo.cam.viewProj, ndcX, ndcY, dragPlaneY);
    if (!worldPt) return;
    dragTarget.pos[0] = snapValue(worldPt[0] + dragOffset[0]);
    dragTarget.pos[2] = snapValue(worldPt[2] + dragOffset[1]);
    rebuildGeometry();
    renderInspector();
    return;
  }
  const dx = e.clientX - lastMouse[0];
  const dy = e.clientY - lastMouse[1];
  lastMouse = [e.clientX, e.clientY];
  if (dragMode === 'orbit') {
    state.orbit.yaw -= dx * 0.008;
    state.orbit.pitch = Math.max(0.06, Math.min(1.38, state.orbit.pitch + dy * 0.006));
  } else if (dragMode === 'pan') {
    state.orbit.panX -= dx * 0.02;
    state.orbit.panY += dy * 0.02;
  }
});

glCanvas.addEventListener('pointerup', () => {
  dragMode = null;
  dragTarget = null;
});
glCanvas.addEventListener('wheel', e => {
  if (state.cameraMode !== 'orbit') return;
  e.preventDefault();
  state.orbit.distance = Math.max(4, Math.min(34, state.orbit.distance + e.deltaY * 0.015));
}, { passive: false });

// Wire toolbar & UI events
const presetSel = $('preset-select');
for (const p of PRESETS) {
  const opt = document.createElement('option');
  opt.value = p.meta.id;
  opt.textContent = p.meta.name;
  presetSel.appendChild(opt);
}
presetSel.onchange = () => loadStage(presetById(presetSel.value));

document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => switchRightTab(btn.dataset.tab);
});

$('btn-undo').onclick = () => {
  if (!state.undoStack.length) return;
  state.redoStack.push(cloneStage(state.stage));
  state.stage = state.undoStack.pop();
  rebuildGeometry();
  renderOutliner();
  renderInspector();
  renderEnvInspector();
  setStatus('元に戻しました');
};
$('btn-redo').onclick = () => {
  if (!state.redoStack.length) return;
  state.undoStack.push(cloneStage(state.stage));
  state.stage = state.redoStack.pop();
  rebuildGeometry();
  renderOutliner();
  renderInspector();
  renderEnvInspector();
  setStatus('やり直しました');
};

window.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (e.shiftKey) $('btn-redo').click();
    else $('btn-undo').click();
  }
});

$('btn-aspect-43').onclick = () => { pushUndo(); state.stage.meta.aspect = [4, 3]; syncAspectButtons(); };
$('btn-aspect-169').onclick = () => { pushUndo(); state.stage.meta.aspect = [16, 9]; syncAspectButtons(); };
$('btn-cam-game').onclick = () => {
  state.cameraMode = 'game';
  $('btn-cam-game').classList.add('active');
  $('btn-cam-orbit').classList.remove('active');
};
$('btn-cam-orbit').onclick = () => {
  state.cameraMode = 'orbit';
  $('btn-cam-orbit').classList.add('active');
  $('btn-cam-game').classList.remove('active');
  setStatus('自由オービット: ドラッグで回転 / Shift+ドラッグで移動 / ホイールでズーム');
};
$('btn-cam-reset').onclick = () => {
  state.orbit = { yaw: 0.32, pitch: 0.36, distance: 14.5, panX: 0, panY: 0, panZ: 0 };
};

$('btn-tool-move').onclick = () => {
  state.toolMode = 'move';
  $('btn-tool-move').classList.add('active');
  $('btn-tool-grid').classList.remove('active');
  setStatus('ドラッグ移動モード: ビューポート上のプロップ・光源・アンカーをドラッグして移動');
};
$('btn-tool-grid').onclick = () => {
  state.toolMode = 'grid';
  state.showGuides = true;
  $('btn-guides').classList.add('active');
  $('btn-tool-grid').classList.add('active');
  $('btn-tool-move').classList.remove('active');
  setStatus('歩行グリッド塗りモード: 床をクリックして RPG / タクティカル歩行マスを追加・削除');
};
$('snap-select').onchange = e => {
  state.snapStep = parseFloat(e.target.value) || 0;
};

$('btn-beat').onclick = () => {
  state.beatSync = !state.beatSync;
  $('btn-beat').classList.toggle('active', state.beatSync);
};
$('btn-enrage').onclick = () => {
  state.enraged = !state.enraged;
  $('btn-enrage').classList.toggle('active', state.enraged);
};
$('btn-flash').onclick = () => { state.impactFlash = 1.0; };
$('btn-guides').onclick = () => {
  state.showGuides = !state.showGuides;
  $('btn-guides').classList.toggle('active', state.showGuides);
};

$('btn-open').onclick = async () => {
  try {
    const { name, data } = await openStageJsonFile();
    loadStage(data, `読み込み完了: ${name}`);
  } catch (err) {
    if (err?.name !== 'AbortError') setStatus(`読込エラー: ${err.message}`);
  }
};

$('btn-save').onclick = async () => {
  try {
    const res = await saveStageJson(state.stage);
    setStatus(res.mode === 'fs-access' ? `直接上書き保存しました: ${res.name}` : `ダウンロード保存しました: ${res.name}`);
  } catch (err) {
    if (err?.name !== 'AbortError') setStatus(`保存エラー: ${err.message}`);
  }
};

$('btn-export-glb').onclick = () => {
  const glb = exportStageToGlb(state.stage, renderer?.getAtlasData());
  const filename = `${state.stage.meta.id || 'stage'}.glb`;
  downloadBlob(new Blob([glb], { type: 'model/gltf-binary' }), filename);
  setStatus(`glTF 2.0 (.glb) 書き出し完了: ${filename} (${(glb.byteLength / 1024).toFixed(1)} KB)`);
};

$('btn-export-png').onclick = () => {
  glCanvas.toBlob(blob => {
    if (!blob) return;
    const filename = `${state.stage.meta.id || 'stage'}_${glCanvas.width}x${glCanvas.height}.png`;
    downloadBlob(blob, filename);
    setStatus(`高精細 PNG 保存: ${filename}`);
  }, 'image/png');
};

$('btn-export-colab').onclick = () => {
  const job = buildColabStageJob(state.stage);
  const filename = `colab_jobs_${state.stage.meta.id || 'stage'}.json`;
  downloadBlob(new Blob([JSON.stringify(job, null, 2) + '\n'], { type: 'application/json' }), filename);
  setStatus(`Google Colab GPU バッチジョブ書き出し完了: ${filename}`);
};

// Local preview image loaders (0 upload)
$('input-bg-img').onchange = e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    renderer?.setBackdropImage(img);
    setStatus(`背景画像をプレビュー適用: ${file.name}`);
  };
  img.src = URL.createObjectURL(file);
};
$('btn-clear-bg').onclick = () => {
  renderer?.setBackdropImage(null);
  setStatus('背景画像をプロシージャル遠景へ戻しました');
};
$('input-sprite-img').onchange = e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const anchor = state.selection.group === 'anchors'
    ? state.stage.anchors[state.selection.index]
    : state.stage.anchors[0];
  if (!anchor) return setStatus('先にアンカー要素を選択してください');
  const img = new Image();
  img.onload = () => {
    renderer?.setAnchorSpriteImage(anchor.id, img);
    setStatus(`アンカー "${anchor.id}" にローカル画像を適用: ${file.name}`);
  };
  img.src = URL.createObjectURL(file);
};

// GitHub direct commit modal
const ghModal = $('github-modal');
$('btn-github').onclick = () => {
  $('gh-owner').value = localStorage.getItem('dss_gh_owner') || 'tsubasa220325';
  $('gh-repo').value = localStorage.getItem('dss_gh_repo') || 'rhysmodia-game';
  $('gh-path').value = `game/assets/stages/${state.stage.meta.id || 'stage'}.diorama.json`;
  $('gh-status').textContent = '';
  ghModal.showModal();
};
$('gh-cancel').onclick = () => ghModal.close();
$('github-form').onsubmit = async e => {
  e.preventDefault();
  const owner = $('gh-owner').value.trim();
  const repo = $('gh-repo').value.trim();
  const branch = $('gh-branch').value.trim() || 'main';
  const path = $('gh-path').value.trim();
  const token = $('gh-token').value.trim();
  const message = $('gh-msg').value.trim();
  localStorage.setItem('dss_gh_owner', owner);
  localStorage.setItem('dss_gh_repo', repo);
  $('gh-status').textContent = 'GitHub API へコミット中...';
  try {
    const res = await commitStageToGitHub({ owner, repo, branch, path, token, stage: state.stage, message });
    $('gh-status').textContent = `コミット成功: ${res.commit?.sha?.slice(0, 7) || 'OK'}`;
    setStatus(`GitHub へ直接コミットしました (${owner}/${repo}:${path})`);
  } catch (err) {
    $('gh-status').textContent = `失敗: ${err.message}`;
  }
};

// Browser Normal Map & Live Atlas Injection Lab modal
const normalModal = $('normal-modal');
const labSlotSel = $('lab-slot');
for (const name of TILE_NAMES) {
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = `${TILE_LABELS_JA[name] ?? name} (${name})`;
  labSlotSel.appendChild(opt);
}
let labSourceImageData = null;
let labNormalRgba = null;
$('btn-normal-lab').onclick = () => normalModal.showModal();
$('lab-close').onclick = () => normalModal.close();

function recomputeLabNormal() {
  if (!labSourceImageData) return;
  const strength = parseFloat($('lab-strength').value);
  $('lab-strength-val').textContent = strength.toFixed(1);
  const { data, width, height } = labSourceImageData;
  labNormalRgba = generateNormalFromRgba(data, width, height, strength, true);
  const normCanvas = $('lab-norm');
  normCanvas.width = width;
  normCanvas.height = height;
  const ctx = normCanvas.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(labNormalRgba), width, height), 0, 0);
  $('lab-download').disabled = false;
  $('lab-inject').disabled = false;
}

$('lab-file').onchange = e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const srcCanvas = $('lab-src');
    srcCanvas.width = img.width;
    srcCanvas.height = img.height;
    const ctx = srcCanvas.getContext('2d');
    ctx.clearRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
    labSourceImageData = ctx.getImageData(0, 0, img.width, img.height);
    recomputeLabNormal();
  };
  img.src = URL.createObjectURL(file);
};
$('lab-strength').oninput = recomputeLabNormal;
$('lab-download').onclick = () => {
  if (!labNormalRgba || !labSourceImageData) return;
  const png = encodeRgbaToPng(labNormalRgba, labSourceImageData.width, labSourceImageData.height);
  downloadBlob(new Blob([png], { type: 'image/png' }), 'tile_normal.png');
};
$('lab-inject').onclick = () => {
  if (!labSourceImageData || !renderer) return;
  const slot = labSlotSel.value;
  const strength = parseFloat($('lab-strength').value);
  const patched = patchAtlasTile(
    renderer.getAtlasData(),
    slot,
    labSourceImageData.data,
    labSourceImageData.width,
    labSourceImageData.height,
    strength,
  );
  renderer.updateAtlas(strength, patched.albedo, patched.normal);
  setStatus(`カスタムタイルを 3D アトラス枠 "${slot}" へ即時反映しました（.glb 書き出し対応）`);
  normalModal.close();
};
$('lab-reset-atlas').onclick = () => {
  renderer?.updateAtlas(state.stage.atlas?.normalStrength ?? 2.2);
  setStatus('タイルアトラスを標準プロシージャルに戻しました');
};

// Google Cloud Launcher Modal
const gcloudModal = $('gcloud-modal');
$('btn-gcloud').onclick = () => gcloudModal.showModal();
$('gcloud-close').onclick = () => gcloudModal.close();
$('btn-copy-cs-cmd').onclick = async () => {
  const cmd = 'git clone --depth 1 https://github.com/tsubasa220325/diorama-stage-studio.git && cd diorama-stage-studio && bash cloud/cloudshell-bootstrap.sh && node cloud/dev-server.mjs';
  try {
    await navigator.clipboard.writeText(cmd);
    setStatus('Google Cloud Shell 起動コマンドをクリップボードへコピーしました');
  } catch {
    setStatus(cmd);
  }
};

// Boot & animation loop
if (!renderer) {
  setStatus('エラー: このブラウザは WebGL2 に対応していません。Chrome または Edge で開いてください。');
} else {
  loadStage(PRESETS[0]);
  let startMs = performance.now();
  let lastFrameMs = startMs;
  let smoothFrameMs = 1.0;

  function loop(now) {
    const dt = Math.min(0.1, (now - lastFrameMs) / 1000);
    lastFrameMs = now;
    const time = (now - startMs) / 1000;
    const beats = time * (state.bpm / 60);
    if (state.impactFlash > 0) state.impactFlash = Math.max(0, state.impactFlash - dt * 5.0);

    const t0 = performance.now();
    const selectedAnchorId = state.selection.group === 'anchors'
      ? state.stage.anchors[state.selection.index]?.id
      : null;
    const info = renderer.render(state.stage, {
      time,
      beats,
      beatSync: state.beatSync,
      enraged: state.enraged,
      impactFlash: state.impactFlash,
      orbit: state.cameraMode === 'orbit' ? state.orbit : null,
      selectedId: selectedAnchorId,
    });
    const renderMs = performance.now() - t0;
    smoothFrameMs = smoothFrameMs * 0.92 + renderMs * 0.08;
    state.lastRenderInfo = info;
    drawGuides(info.cam, info.width, info.height);
    $('stats-msg').textContent = `${info.width}×${info.height} · ${info.vertexCount} verts · ${info.lightCount}/8 lights · ${smoothFrameMs.toFixed(2)} ms`;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
