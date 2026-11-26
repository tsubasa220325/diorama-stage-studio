import { TILE, tileUvRect } from './atlasBuilder.js';

function pushQuad(interleaved, gltf, p0, p1, p2, p3, norm, tile, mat, exportToGltf = true) {
  const [u0, v0, u1, v1] = tile ? tileUvRect(tile) : [0, 0, 1, 1];
  const verts = [
    [p0, [u0, v1]], [p1, [u1, v1]], [p2, [u1, v0]],
    [p0, [u0, v1]], [p2, [u1, v0]], [p3, [u0, v0]],
  ];
  for (const [p, uv] of verts) {
    interleaved.push(
      p[0], p[1], p[2],
      norm[0], norm[1], norm[2],
      uv[0], uv[1],
      mat[0], mat[1], mat[2], mat[3],
    );
    if (exportToGltf) {
      gltf.positions.push(p[0], p[1], p[2]);
      gltf.normals.push(norm[0], norm[1], norm[2]);
      gltf.uvs.push(uv[0], uv[1]);
    }
  }
}

function pushTiledPlaneY(interleaved, gltf, x0, x1, y, z0, z1, tile, cols, rows, mat) {
  const cCount = Math.max(1, Math.round(cols || 1));
  const rCount = Math.max(1, Math.round(rows || 1));
  const dx = (x1 - x0) / cCount;
  const dz = (z1 - z0) / rCount;
  for (let r = 0; r < rCount; r++) {
    const za = z0 + r * dz;
    const zb = za + dz;
    for (let c = 0; c < cCount; c++) {
      const xa = x0 + c * dx;
      const xb = xa + dx;
      pushQuad(interleaved, gltf, [xa, y, zb], [xb, y, zb], [xb, y, za], [xa, y, za], [0, 1, 0], tile, mat);
    }
  }
}

function pushBox(interleaved, gltf, x0, x1, y0, y1, z0, z1, sideTile, topTile, mat) {
  pushQuad(interleaved, gltf, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sideTile, mat);
  pushQuad(interleaved, gltf, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], sideTile, mat);
  pushQuad(interleaved, gltf, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sideTile, mat);
  pushQuad(interleaved, gltf, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], sideTile, mat);
  pushQuad(interleaved, gltf, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], topTile ?? sideTile, mat);
}

function pushSlope(interleaved, gltf, slope) {
  const [x0, x1] = slope.x;
  const [y0, y1] = slope.y;
  const [z0, z1] = slope.z;
  const steps = Math.max(1, Math.min(16, Math.round(slope.steps ?? 4)));
  const mat = [1, slope.gloss ?? 0.3, 0, 0];
  const tile = slope.tile ?? 'ASHLAR_BLOCK';

  if (steps === 1) {
    // Smooth wedge ramp
    const dir = slope.direction ?? '-z';
    if (dir === '-z') {
      const len = Math.hypot(y1 - y0, z1 - z0) || 1;
      const ny = (z1 - z0) / len;
      const nz = (y1 - y0) / len;
      pushQuad(interleaved, gltf, [x0, y0, z1], [x1, y0, z1], [x1, y1, z0], [x0, y1, z0], [0, ny, nz], tile, mat);
    } else if (dir === '+z') {
      const len = Math.hypot(y1 - y0, z1 - z0) || 1;
      const ny = (z1 - z0) / len;
      const nz = -(y1 - y0) / len;
      pushQuad(interleaved, gltf, [x0, y1, z1], [x1, y1, z1], [x1, y0, z0], [x0, y0, z0], [0, ny, nz], tile, mat);
    } else if (dir === '+x') {
      const len = Math.hypot(y1 - y0, x1 - x0) || 1;
      const ny = (x1 - x0) / len;
      const nx = -(y1 - y0) / len;
      pushQuad(interleaved, gltf, [x0, y0, z1], [x1, y1, z1], [x1, y1, z0], [x0, y0, z0], [nx, ny, 0], tile, mat);
    } else {
      const len = Math.hypot(y1 - y0, x1 - x0) || 1;
      const ny = (x1 - x0) / len;
      const nx = (y1 - y0) / len;
      pushQuad(interleaved, gltf, [x0, y1, z1], [x1, y0, z1], [x1, y0, z0], [x0, y1, z0], [nx, ny, 0], tile, mat);
    }
    return;
  }

  // Modular staircase
  const dir = slope.direction ?? '-z';
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const stepTop = y0 + (y1 - y0) * t1;
    if (dir === '-z') {
      const za = z1 - (z1 - z0) * t1;
      const zb = z1 - (z1 - z0) * t0;
      pushBox(interleaved, gltf, x0, x1, y0, stepTop, za, zb, tile, tile, mat);
    } else if (dir === '+z') {
      const za = z0 + (z1 - z0) * t0;
      const zb = z0 + (z1 - z0) * t1;
      pushBox(interleaved, gltf, x0, x1, y0, stepTop, za, zb, tile, tile, mat);
    } else if (dir === '+x') {
      const xa = x0 + (x1 - x0) * t0;
      const xb = x0 + (x1 - x0) * t1;
      pushBox(interleaved, gltf, xa, xb, y0, stepTop, z0, z1, tile, tile, mat);
    } else {
      const xa = x1 - (x1 - x0) * t1;
      const xb = x1 - (x1 - x0) * t0;
      pushBox(interleaved, gltf, xa, xb, y0, stepTop, z0, z1, tile, tile, mat);
    }
  }
}

function pushProp(interleaved, gltf, prop) {
  const [cx, y0, cz] = prop.pos;
  const s = prop.scale ?? 1;
  const dofTag = prop.dofTag ?? 0;

  if (prop.type === 'pillar') {
    const r = (prop.radius ?? 0.42) * s;
    const h = (prop.height ?? 5.6) * s;
    const shaft = prop.tile ?? 'STONE_PILLAR';
    const cap = prop.capTile ?? 'ASHLAR_BLOCK';
    const mat = [1, prop.gloss ?? 0.32, 0, dofTag];
    const baseH = Math.min(0.34 * s, h * 0.2);
    const capH = Math.min(0.30 * s, h * 0.2);
    pushBox(interleaved, gltf, cx - r * 1.24, cx + r * 1.24, y0, y0 + baseH, cz - r * 1.24, cz + r * 1.24, cap, cap, mat);
    pushBox(interleaved, gltf, cx - r, cx + r, y0 + baseH, y0 + h - capH, cz - r, cz + r, shaft, cap, mat);
    pushBox(interleaved, gltf, cx - r * 1.28, cx + r * 1.28, y0 + h - capH, y0 + h, cz - r * 1.28, cz + r * 1.28, cap, cap, mat);
    return;
  }

  if (prop.type === 'brazier') {
    const h = (prop.height ?? 1.28) * s;
    const iron = [1, 0.32, 0, dofTag];
    pushBox(interleaved, gltf, cx - 0.22 * s, cx + 0.22 * s, y0, y0 + 0.16 * s, cz - 0.22 * s, cz + 0.22 * s, 'DARK_IRON', 'DARK_IRON', iron);
    pushBox(interleaved, gltf, cx - 0.09 * s, cx + 0.09 * s, y0 + 0.16 * s, y0 + h - 0.22 * s, cz - 0.09 * s, cz + 0.09 * s, 'DARK_IRON', 'DARK_IRON', iron);
    pushBox(interleaved, gltf, cx - 0.28 * s, cx + 0.28 * s, y0 + h - 0.22 * s, y0 + h, cz - 0.28 * s, cz + 0.28 * s, 'DARK_IRON', 'DARK_IRON', iron);
    pushBox(interleaved, gltf, cx - 0.16 * s, cx + 0.16 * s, y0 + h, y0 + h + 0.26 * s, cz - 0.16 * s, cz + 0.16 * s, 'FLAME_CORE', 'FLAME_CORE', [3, 0.1, 1.45, dofTag]);
    return;
  }

  if (prop.type === 'crystal_cluster') {
    const glow = [3, 0.85, 1.15, dofTag];
    pushBox(interleaved, gltf, cx - 0.18 * s, cx + 0.18 * s, y0, y0 + 1.15 * s, cz - 0.18 * s, cz + 0.18 * s, 'CRYSTAL_GLOW', 'CRYSTAL_GLOW', glow);
    pushBox(interleaved, gltf, cx - 0.42 * s, cx - 0.16 * s, y0, y0 + 0.68 * s, cz - 0.10 * s, cz + 0.22 * s, 'CRYSTAL_GLOW', 'CRYSTAL_GLOW', glow);
    pushBox(interleaved, gltf, cx + 0.16 * s, cx + 0.42 * s, y0, y0 + 0.78 * s, cz - 0.22 * s, cz + 0.12 * s, 'CRYSTAL_GLOW', 'CRYSTAL_GLOW', glow);
    return;
  }

  if (prop.type === 'organ_pipes') {
    const count = 9;
    const step = 0.4 * s;
    const half = (count - 1) * 0.5;
    for (let i = 0; i < count; i++) {
      const px = cx + (i - half) * step;
      const tall = (2.6 + (4 - Math.abs(i - 4)) * 0.46) * s;
      pushBox(interleaved, gltf, px - 0.14 * s, px + 0.14 * s, y0, y0 + tall, cz - 0.15 * s, cz + 0.15 * s, 'GOLD_PIPES', 'GOLD_PIPES', [1, 0.85, 0, dofTag]);
    }
    return;
  }

  if (prop.type === 'velvet_curtain') {
    const w = (prop.width ?? 1.4) * s;
    const h = (prop.height ?? 5.1) * s;
    pushBox(interleaved, gltf, cx - w * 0.5, cx + w * 0.5, y0, y0 + h, cz - 0.15 * s, cz + 0.15 * s, prop.tile ?? 'VELVET_BANNER', prop.tile ?? 'VELVET_BANNER', [1, 0.16, 0, dofTag]);
    return;
  }

  if (prop.type === 'footlight') {
    pushBox(interleaved, gltf, cx - 0.18 * s, cx + 0.18 * s, y0, y0 + 0.16 * s, cz - 0.14 * s, cz + 0.14 * s, 'DARK_IRON', 'DARK_IRON', [1, 0.35, 0, dofTag || 1]);
    pushBox(interleaved, gltf, cx - 0.10 * s, cx + 0.10 * s, y0 + 0.10 * s, y0 + 0.20 * s, cz - 0.20 * s, cz - 0.10 * s, 'FLAME_CORE', 'FLAME_CORE', [3, 0.2, 1.35, dofTag || 1]);
    return;
  }

  if (prop.type === 'balustrade') {
    const w = (prop.width ?? 8.8) * s;
    const posts = Math.max(2, Math.round(w / (0.8 * s)));
    for (let i = 0; i <= posts; i++) {
      const bx = cx - w * 0.5 + (w * i) / posts;
      pushBox(interleaved, gltf, bx - 0.09 * s, bx + 0.09 * s, y0, y0 + 0.7 * s, cz - 0.1 * s, cz + 0.1 * s, 'MARBLE_PILLAR', 'ASHLAR_BLOCK', [1, 0.45, 0, dofTag]);
    }
    pushBox(interleaved, gltf, cx - w * 0.5 - 0.2, cx + w * 0.5 + 0.2, y0 + 0.7 * s, y0 + 0.84 * s, cz - 0.16 * s, cz + 0.16 * s, 'ASHLAR_BLOCK', 'ASHLAR_BLOCK', [1, 0.52, 0, dofTag]);
    return;
  }

  if (prop.type === 'hanging_bell') {
    pushBox(interleaved, gltf, cx - 0.06 * s, cx + 0.06 * s, y0 + 0.65 * s, y0 + 2.25 * s, cz - 0.06 * s, cz + 0.06 * s, 'DARK_IRON', 'DARK_IRON', [1, 0.3, 0, dofTag]);
    pushBox(interleaved, gltf, cx - 0.32 * s, cx + 0.32 * s, y0, y0 + 0.67 * s, cz - 0.30 * s, cz + 0.30 * s, 'GOLD_PIPES', 'GOLD_PIPES', [1, 0.72, 0, dofTag]);
    return;
  }

  if (prop.type === 'rune_glass') {
    const w = (prop.width ?? 1.5) * s;
    const h = (prop.height ?? 2.6) * s;
    pushBox(interleaved, gltf, cx - w * 0.5, cx + w * 0.5, y0, y0 + h, cz - 0.08 * s, cz + 0.08 * s, 'RUNE_GLASS', 'RUNE_GLASS', [3, 0.8, 0.82, dofTag]);
    return;
  }

  if (prop.type === 'lantern_post') {
    const h = (prop.height ?? 2.1) * s;
    const iron = [1, 0.36, 0, dofTag];
    pushBox(interleaved, gltf, cx - 0.16 * s, cx + 0.16 * s, y0, y0 + 0.16 * s, cz - 0.16 * s, cz + 0.16 * s, 'DARK_IRON', 'DARK_IRON', iron);
    pushBox(interleaved, gltf, cx - 0.07 * s, cx + 0.07 * s, y0 + 0.16 * s, y0 + h, cz - 0.07 * s, cz + 0.07 * s, 'DARK_IRON', 'DARK_IRON', iron);
    pushBox(interleaved, gltf, cx - 0.18 * s, cx + 0.18 * s, y0 + h, y0 + h + 0.34 * s, cz - 0.18 * s, cz + 0.18 * s, 'FLAME_CORE', 'FLAME_CORE', [3, 0.25, 1.5, dofTag]);
    pushBox(interleaved, gltf, cx - 0.24 * s, cx + 0.24 * s, y0 + h + 0.34 * s, y0 + h + 0.44 * s, cz - 0.24 * s, cz + 0.24 * s, 'DARK_IRON', 'DARK_IRON', iron);
    return;
  }

  // wooden_crate fallback
  const half = 0.42 * s;
  pushBox(interleaved, gltf, cx - half, cx + half, y0, y0 + half * 2, cz - half, cz + half, prop.tile ?? 'OAK_STAGE', prop.tile ?? 'OAK_STAGE', [1, 0.22, 0, dofTag]);
}

export function buildStageMesh(stage) {
  const interleaved = [];
  const gltf = { positions: [], normals: [], uvs: [] };

  const backdropZ = stage.backdrop?.z ?? -6.8;
  pushQuad(
    interleaved, gltf,
    [-12.0, -0.6, backdropZ], [12.0, -0.6, backdropZ], [12.0, 9.2, backdropZ], [-12.0, 9.2, backdropZ],
    [0, 0, 1], null, [2, 0.05, 0, 0], false,
  );

  for (const floor of stage.geometry?.floors ?? []) {
    if (floor.hidden) continue;
    const mat = [0, floor.gloss ?? 0.35, 0, floor.receiveRings ? -1 : 0];
    pushTiledPlaneY(
      interleaved, gltf,
      floor.x[0], floor.x[1], floor.y, floor.z[0], floor.z[1],
      floor.tile,
      floor.repeat?.[0] ?? 4,
      floor.repeat?.[1] ?? 2,
      mat,
    );
  }

  for (const box of stage.geometry?.boxes ?? []) {
    if (box.hidden) continue;
    const isEmissive = (box.emissive ?? 0) > 0;
    const mat = [isEmissive ? 3 : 1, box.gloss ?? 0.28, box.emissive ?? 0, box.dofTag ?? 0];
    pushBox(
      interleaved, gltf,
      box.x[0], box.x[1], box.y[0], box.y[1], box.z[0], box.z[1],
      box.sideTile, box.topTile ?? box.sideTile, mat,
    );
  }

  for (const slope of stage.geometry?.slopes ?? []) {
    if (slope.hidden) continue;
    pushSlope(interleaved, gltf, slope);
  }

  for (const prop of stage.geometry?.props ?? []) {
    if (prop.hidden) continue;
    pushProp(interleaved, gltf, prop);
  }

  const data = new Float32Array(interleaved);
  return {
    data,
    vertexCount: data.length / 12,
    gltf: {
      positions: new Float32Array(gltf.positions),
      normals: new Float32Array(gltf.normals),
      uvs: new Float32Array(gltf.uvs),
    },
  };
}

export const PROP_TYPES = Object.freeze([
  { type: 'pillar', label: '柱 (Pillar)' },
  { type: 'brazier', label: '燭台・篝火 (Brazier)' },
  { type: 'crystal_cluster', label: '水晶クラスター (Crystal)' },
  { type: 'organ_pipes', label: '9連パイプオルガン (Organ)' },
  { type: 'velvet_curtain', label: '舞台幕・垂れ幕 (Curtain)' },
  { type: 'footlight', label: 'フットライト (Footlight)' },
  { type: 'balustrade', label: '大理石の手すり (Balustrade)' },
  { type: 'hanging_bell', label: '吊り鐘 (Hanging Bell)' },
  { type: 'rune_glass', label: 'ステンドグラス (Rune Glass)' },
  { type: 'lantern_post', label: '街灯ランタン (Lantern)' },
  { type: 'wooden_crate', label: '木箱 (Wooden Crate)' },
]);

export { TILE };
