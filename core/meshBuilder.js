import { TILE, tileUvRect } from './atlasBuilder.js';

function pushVert(interleaved, gltf, p, norm, uv, mat, exportToGltf) {
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

function pushQuad(interleaved, gltf, p0, p1, p2, p3, norm, tile, mat, exportToGltf = true, aoBot = null, aoTop = null) {
  const [u0, v0, u1, v1] = tile ? tileUvRect(tile) : [0, 0, 1, 1];
  const isLit = mat[0] < 1.5;
  const mBot = isLit && aoBot != null ? [mat[0], mat[1], aoBot, mat[3]] : mat;
  const mTop = isLit && aoTop != null ? [mat[0], mat[1], aoTop, mat[3]] : mat;
  const verts = [
    [p0, [u0, v1], mBot], [p1, [u1, v1], mBot], [p2, [u1, v0], mTop],
    [p0, [u0, v1], mBot], [p2, [u1, v0], mTop], [p3, [u0, v0], mTop],
  ];
  for (const [p, uv, m] of verts) {
    pushVert(interleaved, gltf, p, norm, uv, m, exportToGltf);
  }
}

function pushTri(interleaved, gltf, p0, p1, p2, tile, mat, exportToGltf = true, ao0 = null, ao1 = null, ao2 = null) {
  const [u0, v0, u1, v1] = tile ? tileUvRect(tile) : [0, 0, 1, 1];
  const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const nx = e1[1] * e2[2] - e1[2] * e2[1];
  const ny = e1[2] * e2[0] - e1[0] * e2[2];
  const nz = e1[0] * e2[1] - e1[1] * e2[0];
  const nl = Math.hypot(nx, ny, nz) || 1;
  const norm = [nx / nl, ny / nl, nz / nl];
  const isLit = mat[0] < 1.5;
  const m0 = isLit && ao0 != null ? [mat[0], mat[1], ao0, mat[3]] : mat;
  const m1 = isLit && ao1 != null ? [mat[0], mat[1], ao1, mat[3]] : mat;
  const m2 = isLit && ao2 != null ? [mat[0], mat[1], ao2, mat[3]] : mat;
  pushVert(interleaved, gltf, p0, norm, [u0, v1], m0, exportToGltf);
  pushVert(interleaved, gltf, p1, norm, [u1, v1], m1, exportToGltf);
  pushVert(interleaved, gltf, p2, norm, [(u0 + u1) * 0.5, v0], m2, exportToGltf);
}

function pushTiledPlaneY(interleaved, gltf, x0, x1, y, z0, z1, tile, cols, rows, mat) {
  const cCount = Math.max(1, Math.round(cols || 1));
  const rCount = Math.max(1, Math.round(rows || 1));
  const dx = (x1 - x0) / cCount;
  const dz = (z1 - z0) / rCount;
  for (let r = 0; r < rCount; r++) {
    const za = z0 + r * dz;
    const zb = za + dz;
    const aoBack = mat[0] === 0 && r === 0 ? 0.78 : 1.0;
    const aoFront = 1.0;
    for (let c = 0; c < cCount; c++) {
      const xa = x0 + c * dx;
      const xb = xa + dx;
      pushQuad(interleaved, gltf, [xa, y, zb], [xb, y, zb], [xb, y, za], [xa, y, za], [0, 1, 0], tile, mat, true, aoFront, aoBack);
    }
  }
}

function pushBox(interleaved, gltf, x0, x1, y0, y1, z0, z1, sideTile, topTile, mat) {
  const isLit = mat[0] < 1.5;
  const aoBot = isLit ? 0.62 : null;
  const aoTop = isLit ? 1.0 : null;
  pushQuad(interleaved, gltf, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sideTile, mat, true, aoBot, aoTop);
  pushQuad(interleaved, gltf, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], sideTile, mat, true, aoBot, aoTop);
  pushQuad(interleaved, gltf, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sideTile, mat, true, aoBot, aoTop);
  pushQuad(interleaved, gltf, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], sideTile, mat, true, aoBot, aoTop);
  pushQuad(interleaved, gltf, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], topTile ?? sideTile, mat, true, 1.0, 1.0);
}

function pushPolygonPrism(interleaved, gltf, cx, y0, y1, cz, rBot, rTop, sides, tile, topTile, mat, phase = Math.PI / sides) {
  const isLit = mat[0] < 1.5;
  const aoBot = isLit ? 0.66 : null;
  const aoTop = isLit ? 1.0 : null;
  for (let i = 0; i < sides; i++) {
    const a0 = phase + (i / sides) * Math.PI * 2;
    const a1 = phase + ((i + 1) / sides) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p0 = [cx + c0 * rBot, y0, cz + s0 * rBot];
    const p1 = [cx + c1 * rBot, y0, cz + s1 * rBot];
    const p2 = [cx + c1 * rTop, y1, cz + s1 * rTop];
    const p3 = [cx + c0 * rTop, y1, cz + s0 * rTop];
    if (rTop < 0.002) {
      pushTri(interleaved, gltf, p0, p1, [cx, y1, cz], tile, mat, true, aoBot, aoBot, aoTop);
    } else {
      const am = (a0 + a1) * 0.5;
      const dr = rBot - rTop;
      const dy = Math.max(0.001, y1 - y0);
      const nl = Math.hypot(dy, dr) || 1;
      const nr = dy / nl;
      const ny = dr / nl;
      pushQuad(interleaved, gltf, p0, p1, p2, p3, [Math.cos(am) * nr, ny, Math.sin(am) * nr], tile, mat, true, aoBot, aoTop);
      if (topTile) {
        pushTri(interleaved, gltf, p3, p2, [cx, y1, cz], topTile, mat, true, 1.0, 1.0, 1.0);
      }
    }
  }
}

function pushCrystalSpire(interleaved, gltf, cx, y0, cz, r, h, tiltX, tiltZ, tile, mat) {
  const sides = 6;
  const shaftH = h * 0.66;
  const midX = cx + tiltX * shaftH;
  const midZ = cz + tiltZ * shaftH;
  const tip = [cx + tiltX * h, y0 + h, cz + tiltZ * h];
  const rMid = r * 0.82;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2 + 0.35;
    const a1 = ((i + 1) / sides) * Math.PI * 2 + 0.35;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p0 = [cx + c0 * r, y0, cz + s0 * r];
    const p1 = [cx + c1 * r, y0, cz + s1 * r];
    const p2 = [midX + c1 * rMid, y0 + shaftH, midZ + s1 * rMid];
    const p3 = [midX + c0 * rMid, y0 + shaftH, midZ + s0 * rMid];
    const am = (a0 + a1) * 0.5;
    pushQuad(interleaved, gltf, p0, p1, p2, p3, [Math.cos(am), 0.14, Math.sin(am)], tile, mat, true);
    pushTri(interleaved, gltf, p3, p2, tip, tile, mat, true);
  }
}

function pushSlope(interleaved, gltf, slope) {
  const [x0, x1] = slope.x;
  const [y0, y1] = slope.y;
  const [z0, z1] = slope.z;
  const steps = Math.max(1, Math.min(16, Math.round(slope.steps ?? 4)));
  const mat = [1, slope.gloss ?? 0.3, 0, 0];
  const tile = slope.tile ?? 'ASHLAR_BLOCK';
  const dir = slope.direction ?? '-z';

  if (steps === 1) {
    if (dir === '-z') {
      const len = Math.hypot(y1 - y0, z1 - z0) || 1;
      pushQuad(interleaved, gltf, [x0, y0, z1], [x1, y0, z1], [x1, y1, z0], [x0, y1, z0], [0, (z1 - z0) / len, (y1 - y0) / len], tile, mat, true, 0.72, 1.0);
    } else if (dir === '+z') {
      const len = Math.hypot(y1 - y0, z1 - z0) || 1;
      pushQuad(interleaved, gltf, [x0, y1, z1], [x1, y1, z1], [x1, y0, z0], [x0, y0, z0], [0, (z1 - z0) / len, -(y1 - y0) / len], tile, mat, true, 1.0, 0.72);
    } else if (dir === '+x') {
      const len = Math.hypot(y1 - y0, x1 - x0) || 1;
      pushQuad(interleaved, gltf, [x0, y0, z1], [x1, y1, z1], [x1, y1, z0], [x0, y0, z0], [-(y1 - y0) / len, (x1 - x0) / len, 0], tile, mat, true, 0.76, 1.0);
    } else {
      const len = Math.hypot(y1 - y0, x1 - x0) || 1;
      pushQuad(interleaved, gltf, [x0, y1, z1], [x1, y0, z1], [x1, y0, z0], [x0, y1, z0], [(y1 - y0) / len, (x1 - x0) / len, 0], tile, mat, true, 1.0, 0.76);
    }
    return;
  }

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const stepTop = y0 + (y1 - y0) * t1;
    if (dir === '-z') {
      pushBox(interleaved, gltf, x0, x1, y0, stepTop, z1 - (z1 - z0) * t1, z1 - (z1 - z0) * t0, tile, tile, mat);
    } else if (dir === '+z') {
      pushBox(interleaved, gltf, x0, x1, y0, stepTop, z0 + (z1 - z0) * t0, z0 + (z1 - z0) * t1, tile, tile, mat);
    } else if (dir === '+x') {
      pushBox(interleaved, gltf, x0 + (x1 - x0) * t0, x0 + (x1 - x0) * t1, y0, stepTop, z0, z1, tile, tile, mat);
    } else {
      pushBox(interleaved, gltf, x1 - (x1 - x0) * t1, x1 - (x1 - x0) * t0, y0, stepTop, z0, z1, tile, tile, mat);
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
    const baseH = Math.min(0.36 * s, h * 0.2);
    const capH = Math.min(0.32 * s, h * 0.2);
    pushBox(interleaved, gltf, cx - r * 1.32, cx + r * 1.32, y0, y0 + baseH * 0.55, cz - r * 1.32, cz + r * 1.32, cap, cap, mat);
    pushBox(interleaved, gltf, cx - r * 1.16, cx + r * 1.16, y0 + baseH * 0.55, y0 + baseH, cz - r * 1.16, cz + r * 1.16, cap, cap, mat);
    pushPolygonPrism(interleaved, gltf, cx, y0 + baseH, y0 + h - capH, cz, r * 1.04, r * 0.96, 8, shaft, null, mat);
    pushBox(interleaved, gltf, cx - r * 1.24, cx + r * 1.24, y0 + h - capH, y0 + h - capH * 0.45, cz - r * 1.24, cz + r * 1.24, cap, cap, mat);
    pushBox(interleaved, gltf, cx - r * 1.38, cx + r * 1.38, y0 + h - capH * 0.45, y0 + h, cz - r * 1.38, cz + r * 1.38, cap, cap, mat);
    return;
  }

  if (prop.type === 'brazier') {
    const h = (prop.height ?? 1.28) * s;
    const iron = [1, 0.34, 0, dofTag];
    pushBox(interleaved, gltf, cx - 0.24 * s, cx + 0.24 * s, y0, y0 + 0.16 * s, cz - 0.24 * s, cz + 0.24 * s, 'DARK_IRON', 'DARK_IRON', iron);
    pushPolygonPrism(interleaved, gltf, cx, y0 + 0.16 * s, y0 + h - 0.22 * s, cz, 0.11 * s, 0.08 * s, 6, 'DARK_IRON', null, iron);
    pushPolygonPrism(interleaved, gltf, cx, y0 + h - 0.24 * s, y0 + h, cz, 0.18 * s, 0.32 * s, 8, 'DARK_IRON', 'DARK_IRON', iron);
    pushCrystalSpire(interleaved, gltf, cx, y0 + h - 0.04 * s, cz, 0.15 * s, 0.36 * s, 0, 0, 'FLAME_CORE', [3, 0.1, 1.48, dofTag]);
    return;
  }

  if (prop.type === 'crystal_cluster') {
    const tile = prop.tile ?? 'CRYSTAL_GLOW';
    const animTag = prop.beatAnim === 'bob' ? -3.0 : dofTag;
    const glow = [3, 0.88, prop.emissive ?? 1.15, animTag];
    pushCrystalSpire(interleaved, gltf, cx, y0, cz, 0.22 * s, 1.36 * s, 0.02, -0.02, tile, glow);
    pushCrystalSpire(interleaved, gltf, cx - 0.26 * s, y0, cz + 0.08 * s, 0.15 * s, 0.88 * s, -0.24, 0.06, tile, glow);
    pushCrystalSpire(interleaved, gltf, cx + 0.25 * s, y0, cz - 0.06 * s, 0.16 * s, 0.98 * s, 0.22, -0.05, tile, glow);
    pushCrystalSpire(interleaved, gltf, cx + 0.05 * s, y0, cz + 0.20 * s, 0.11 * s, 0.56 * s, 0.08, 0.18, tile, glow);
    return;
  }

  if (prop.type === 'arch_gate') {
    const w = (prop.width ?? 3.6) * s;
    const h = (prop.height ?? 3.4) * s;
    const depth = (prop.depth ?? 0.42) * s;
    const pierW = Math.min(0.46 * s, w * 0.18);
    const tile = prop.tile ?? 'ASHLAR_BLOCK';
    const cap = prop.capTile ?? 'MARBLE_PILLAR';
    const mat = [1, prop.gloss ?? 0.45, 0, dofTag];
    const span = Math.max(0.8 * s, w - pierW * 2);
    const radius = span * 0.5;
    const springY = y0 + Math.max(0.5 * s, h - radius);
    const halfD = depth * 0.5;
    // Left & right piers + capitals
    pushBox(interleaved, gltf, cx - w * 0.5, cx - w * 0.5 + pierW, y0, springY, cz - halfD, cz + halfD, tile, cap, mat);
    pushBox(interleaved, gltf, cx + w * 0.5 - pierW, cx + w * 0.5, y0, springY, cz - halfD, cz + halfD, tile, cap, mat);
    pushBox(interleaved, gltf, cx - w * 0.5 - 0.06 * s, cx - w * 0.5 + pierW + 0.06 * s, springY - 0.14 * s, springY + 0.06 * s, cz - halfD - 0.05 * s, cz + halfD + 0.05 * s, cap, cap, mat);
    pushBox(interleaved, gltf, cx + w * 0.5 - pierW - 0.06 * s, cx + w * 0.5 + 0.06 * s, springY - 0.14 * s, springY + 0.06 * s, cz - halfD - 0.05 * s, cz + halfD + 0.05 * s, cap, cap, mat);
    // Curved stone voussoir arch segments
    const segs = 9;
    const rIn = radius;
    const rOut = radius + pierW * 0.92;
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI - (i / segs) * Math.PI;
      const a1 = Math.PI - ((i + 1) / segs) * Math.PI;
      const keyBoost = i === Math.floor(segs / 2) ? 1.12 : 1.0;
      const ro = rIn + (rOut - rIn) * keyBoost;
      const xIn0 = cx + Math.cos(a0) * rIn, yIn0 = springY + Math.sin(a0) * rIn;
      const xIn1 = cx + Math.cos(a1) * rIn, yIn1 = springY + Math.sin(a1) * rIn;
      const xOut0 = cx + Math.cos(a0) * ro, yOut0 = springY + Math.sin(a0) * ro;
      const xOut1 = cx + Math.cos(a1) * ro, yOut1 = springY + Math.sin(a1) * ro;
      const segTile = i === Math.floor(segs / 2) ? cap : tile;
      const zd = i === Math.floor(segs / 2) ? halfD * 1.18 : halfD;
      pushQuad(interleaved, gltf, [xIn0, yIn0, cz + zd], [xIn1, yIn1, cz + zd], [xOut1, yOut1, cz + zd], [xOut0, yOut0, cz + zd], [0, 0, 1], segTile, mat, true, 0.85, 1.0);
      pushQuad(interleaved, gltf, [xIn1, yIn1, cz - zd], [xIn0, yIn0, cz - zd], [xOut0, yOut0, cz - zd], [xOut1, yOut1, cz - zd], [0, 0, -1], segTile, mat, true, 0.85, 1.0);
      const am = (a0 + a1) * 0.5;
      pushQuad(interleaved, gltf, [xOut0, yOut0, cz + zd], [xOut1, yOut1, cz + zd], [xOut1, yOut1, cz - zd], [xOut0, yOut0, cz - zd], [Math.cos(am), Math.sin(am), 0], segTile, mat, true, 1.0, 1.0);
      pushQuad(interleaved, gltf, [xIn1, yIn1, cz + zd], [xIn0, yIn0, cz + zd], [xIn0, yIn0, cz - zd], [xIn1, yIn1, cz - zd], [-Math.cos(am), -Math.sin(am), 0], segTile, mat, true, 0.65, 0.65);
    }
    if (prop.glassTile) {
      const gMat = [3, 0.85, prop.glassEmissive ?? 0.82, dofTag];
      const [gu0, gv0, gu1, gv1] = tileUvRect(prop.glassTile);
      const mapU = px => gu0 + ((px - (cx - rIn)) / Math.max(0.01, rIn * 2)) * (gu1 - gu0);
      const mapV = py => gv1 - ((py - y0) / Math.max(0.01, h)) * (gv1 - gv0);
      pushQuad(interleaved, gltf, [cx - rIn * 0.96, y0 + 0.04, cz], [cx + rIn * 0.96, y0 + 0.04, cz], [cx + rIn * 0.96, springY + 0.04, cz], [cx - rIn * 0.96, springY + 0.04, cz], [0, 0, 1], prop.glassTile, gMat, true);
      for (let i = 0; i < segs; i++) {
        const a0 = Math.PI - (i / segs) * Math.PI;
        const a1 = Math.PI - ((i + 1) / segs) * Math.PI;
        const pC = [cx, springY, cz];
        const pA = [cx + Math.cos(a1) * rIn * 0.98, springY + Math.sin(a1) * rIn * 0.98, cz];
        const pB = [cx + Math.cos(a0) * rIn * 0.98, springY + Math.sin(a0) * rIn * 0.98, cz];
        pushVert(interleaved, gltf, pC, [0, 0, 1], [mapU(pC[0]), mapV(pC[1])], gMat, true);
        pushVert(interleaved, gltf, pA, [0, 0, 1], [mapU(pA[0]), mapV(pA[1])], gMat, true);
        pushVert(interleaved, gltf, pB, [0, 0, 1], [mapU(pB[0]), mapV(pB[1])], gMat, true);
      }
    }
    return;
  }

  if (prop.type === 'clock_pendulum') {
    const r = (prop.radius ?? 1.18) * s;
    const dialY = y0 + (prop.height ?? 2.35) * s;
    const iron = [1, 0.45, 0, dofTag];
    const gold = [1, 0.84, 0, dofTag];
    const dialEm = [3, 0.45, 0.56, dofTag];
    const segs = 12;
    const rIn = r * 0.80;
    const [du0, dv0, du1, dv1] = tileUvRect('CATHEDRAL_FLOOR');
    const mapDu = px => du0 + ((px - (cx - rIn)) / Math.max(0.01, rIn * 2)) * (du1 - du0);
    const mapDv = py => dv1 - ((py - (dialY - rIn)) / Math.max(0.01, rIn * 2)) * (dv1 - dv0);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const xIn0 = cx + Math.cos(a0) * rIn, yIn0 = dialY + Math.sin(a0) * rIn;
      const xIn1 = cx + Math.cos(a1) * rIn, yIn1 = dialY + Math.sin(a1) * rIn;
      const xOut0 = cx + Math.cos(a0) * r, yOut0 = dialY + Math.sin(a0) * r;
      const xOut1 = cx + Math.cos(a1) * r, yOut1 = dialY + Math.sin(a1) * r;
      pushQuad(interleaved, gltf, [xIn0, yIn0, cz + 0.12 * s], [xIn1, yIn1, cz + 0.12 * s], [xOut1, yOut1, cz + 0.12 * s], [xOut0, yOut0, cz + 0.12 * s], [0, 0, 1], i % 3 === 0 ? 'GOLD_PIPES' : 'DARK_IRON', i % 3 === 0 ? gold : iron, true, 0.85, 1.0);
      // Planar-UV dial face (clean stone-gold patina, zero pinwheel distortion)
      pushVert(interleaved, gltf, [cx, dialY, cz + 0.02 * s], [0, 0, 1], [mapDu(cx), mapDv(dialY)], dialEm, true);
      pushVert(interleaved, gltf, [xIn0, yIn0, cz + 0.02 * s], [0, 0, 1], [mapDu(xIn0), mapDv(yIn0)], dialEm, true);
      pushVert(interleaved, gltf, [xIn1, yIn1, cz + 0.02 * s], [0, 0, 1], [mapDu(xIn1), mapDv(yIn1)], dialEm, true);
      // Crisp 12-hour dark-iron Roman tick marks
      const tc = Math.cos(a0), ts = Math.sin(a0);
      const tLen = i % 3 === 0 ? 0.18 * r : 0.11 * r;
      const tHalf = i % 3 === 0 ? 0.045 * r : 0.026 * r;
      const tOut = rIn * 0.94;
      const tIn = tOut - tLen;
      const px = -ts * tHalf, py = tc * tHalf;
      pushQuad(interleaved, gltf,
        [cx + tc * tIn - px, dialY + ts * tIn - py, cz + 0.06 * s],
        [cx + tc * tIn + px, dialY + ts * tIn + py, cz + 0.06 * s],
        [cx + tc * tOut + px, dialY + ts * tOut + py, cz + 0.06 * s],
        [cx + tc * tOut - px, dialY + ts * tOut - py, cz + 0.06 * s],
        [0, 0, 1], 'DARK_IRON', iron, true, 0.9, 0.9);
    }
    // Crisp 10:10 angled clock hands + central brass boss
    const pushHand = (ang, len, hw, zOff) => {
      const c = Math.cos(ang), sn = Math.sin(ang);
      const px = -sn * hw, py = c * hw;
      pushQuad(interleaved, gltf,
        [cx - c * hw - px, dialY - sn * hw - py, cz + zOff],
        [cx - c * hw + px, dialY - sn * hw + py, cz + zOff],
        [cx + c * len + px * 0.45, dialY + sn * len + py * 0.45, cz + zOff],
        [cx + c * len - px * 0.45, dialY + sn * len - py * 0.45, cz + zOff],
        [0, 0, 1], 'DARK_IRON', iron, true, 0.8, 0.95);
    };
    pushHand(Math.PI * 0.80, rIn * 0.56, 0.068 * s, 0.10 * s);
    pushHand(Math.PI * 0.22, rIn * 0.78, 0.048 * s, 0.12 * s);
    pushBox(interleaved, gltf, cx - 0.10 * s, cx + 0.10 * s, dialY - 0.10 * s, dialY + 0.10 * s, cz + 0.08 * s, cz + 0.18 * s, 'GOLD_PIPES', 'GOLD_PIPES', gold);
    // Grand brass pendulum rod & glowing diamond bob (built vertically; GPU-swung live on BGM beat via aMat.w = -2)
    const bobY = y0 + 0.36 * s;
    const rodTop = dialY - r * 0.94;
    const goldPend = [1, 0.84, 0, -2.0];
    const bobTile = prop.bobTile ?? 'FLAME_CORE';
    const emberPend = [3, 0.2, 1.32, -2.0];
    pushBox(interleaved, gltf, cx - 0.055 * s, cx + 0.055 * s, bobY, rodTop, cz - 0.14 * s, cz - 0.05 * s, 'GOLD_PIPES', 'GOLD_PIPES', goldPend);
    pushPolygonPrism(interleaved, gltf, cx, bobY - 0.28 * s, bobY + 0.04 * s, cz - 0.02 * s, 0.06 * s, 0.36 * s, 8, 'GOLD_PIPES', 'GOLD_PIPES', goldPend);
    pushPolygonPrism(interleaved, gltf, cx, bobY + 0.04 * s, bobY + 0.34 * s, cz - 0.02 * s, 0.36 * s, 0.06 * s, 8, 'GOLD_PIPES', 'GOLD_PIPES', goldPend);
    pushBox(interleaved, gltf, cx - 0.12 * s, cx + 0.12 * s, bobY - 0.06 * s, bobY + 0.16 * s, cz + 0.16 * s, cz + 0.32 * s, bobTile, bobTile, emberPend);
    return;
  }

  if (prop.type === 'gable_pavilion') {
    const w = (prop.width ?? 3.1) * s;
    const h = (prop.height ?? 2.3) * s;
    const d = (prop.depth ?? 1.8) * s;
    const wallTile = prop.tile ?? 'ASHLAR_BLOCK';
    const roofTile = prop.capTile ?? 'DARK_IRON';
    const mat = [1, prop.gloss ?? 0.28, 0, dofTag];
    const roofMat = [1, 0.36, 0, dofTag];
    const x0 = cx - w * 0.5, x1 = cx + w * 0.5;
    const z0 = cz - d * 0.5, z1 = cz + d * 0.5;
    const eaveY = y0 + h;
    const ridgeY = eaveY + Math.min(1.05 * s, w * 0.34);
    pushBox(interleaved, gltf, x0, x1, y0, eaveY, z0, z1, wallTile, wallTile, mat);
    // Triangular front & back gable pediments
    pushTri(interleaved, gltf, [x0, eaveY, z1], [x1, eaveY, z1], [cx, ridgeY, z1], wallTile, mat, true, 0.85, 0.85, 1.0);
    pushTri(interleaved, gltf, [x1, eaveY, z0], [x0, eaveY, z0], [cx, ridgeY, z0], wallTile, mat, true, 0.85, 0.85, 1.0);
    // Sloped overhanging gable roof planes
    const ov = 0.22 * s;
    const rnLen = Math.hypot(ridgeY - eaveY, w * 0.5) || 1;
    const rnx = (ridgeY - eaveY) / rnLen;
    const rny = (w * 0.5) / rnLen;
    pushQuad(interleaved, gltf, [x0 - ov, eaveY - 0.12 * s, z1 + ov], [cx, ridgeY + 0.06 * s, z1 + ov], [cx, ridgeY + 0.06 * s, z0 - ov], [x0 - ov, eaveY - 0.12 * s, z0 - ov], [-rnx, rny, 0], roofTile, roofMat, true, 0.85, 1.0);
    pushQuad(interleaved, gltf, [cx, ridgeY + 0.06 * s, z1 + ov], [x1 + ov, eaveY - 0.12 * s, z1 + ov], [x1 + ov, eaveY - 0.12 * s, z0 - ov], [cx, ridgeY + 0.06 * s, z0 - ov], [rnx, rny, 0], roofTile, roofMat, true, 1.0, 0.85);
    // Twin glowing warm windows
    const winW = w * 0.21;
    const winH = h * 0.32;
    const winY = y0 + h * 0.44;
    for (const wx of [cx - w * 0.23, cx + w * 0.23]) {
      pushBox(interleaved, gltf, wx - winW * 0.5 - 0.06 * s, wx + winW * 0.5 + 0.06 * s, winY - 0.06 * s, winY + winH + 0.06 * s, z1 - 0.02, z1 + 0.06 * s, 'OAK_STAGE', 'OAK_STAGE', mat);
      pushBox(interleaved, gltf, wx - winW * 0.5, wx + winW * 0.5, winY, winY + winH, z1 + 0.01, z1 + 0.09 * s, 'FLAME_CORE', 'FLAME_CORE', [3, 0.2, 1.15, dofTag]);
    }
    return;
  }

  if (prop.type === 'lighthouse_tower') {
    const r = (prop.radius ?? 0.66) * s;
    const h = (prop.height ?? 3.15) * s;
    const mat = [1, 0.36, 0, dofTag];
    const iron = [1, 0.42, 0, dofTag];
    const y1 = y0 + h * 0.30;
    const y2 = y0 + h * 0.52;
    const y3 = y0 + h * 0.72;
    const yGal = y0 + h * 0.77;
    const yLamp = y0 + h * 0.90;
    const yTop = y0 + h * 1.04;
    pushPolygonPrism(interleaved, gltf, cx, y0, y1, cz, r * 1.18, r * 1.04, 8, 'ASHLAR_BLOCK', 'ASHLAR_BLOCK', mat);
    pushPolygonPrism(interleaved, gltf, cx, y1, y2, cz, r * 1.00, r * 0.88, 8, 'VELVET_BANNER', null, mat);
    pushPolygonPrism(interleaved, gltf, cx, y2, y3, cz, r * 0.88, r * 0.76, 8, 'MARBLE_PILLAR', null, mat);
    pushPolygonPrism(interleaved, gltf, cx, y3, yGal, cz, r * 0.98, r * 1.02, 8, 'DARK_IRON', 'DARK_IRON', iron);
    pushPolygonPrism(interleaved, gltf, cx, yGal, yLamp, cz, r * 0.62, r * 0.62, 8, 'FLAME_CORE', 'FLAME_CORE', [3, 0.2, 1.42, dofTag]);
    pushPolygonPrism(interleaved, gltf, cx, yLamp, yTop, cz, r * 0.88, 0.0, 8, 'DARK_IRON', null, iron);
    return;
  }

  if (prop.type === 'organ_pipes') {
    const count = 9;
    const step = 0.4 * s;
    const half = (count - 1) * 0.5;
    for (let i = 0; i < count; i++) {
      const px = cx + (i - half) * step;
      const tall = (2.6 + (4 - Math.abs(i - 4)) * 0.46) * s;
      pushPolygonPrism(interleaved, gltf, px, y0, y0 + tall, cz, 0.14 * s, 0.13 * s, 6, 'GOLD_PIPES', 'GOLD_PIPES', [1, 0.86, 0, dofTag]);
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
    const flTag = prop.dofTag ?? 1;
    pushBox(interleaved, gltf, cx - 0.18 * s, cx + 0.18 * s, y0, y0 + 0.14 * s, cz - 0.14 * s, cz + 0.14 * s, 'DARK_IRON', 'DARK_IRON', [1, 0.35, 0, flTag]);
    pushBox(interleaved, gltf, cx - 0.11 * s, cx + 0.11 * s, y0 + 0.11 * s, y0 + 0.25 * s, cz - 0.14 * s, cz + 0.10 * s, 'FLAME_CORE', 'FLAME_CORE', [3, 0.2, 1.38, flTag]);
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
    const bellTag = dofTag || -4.0;
    pushBox(interleaved, gltf, cx - 0.05 * s, cx + 0.05 * s, y0 + 0.65 * s, y0 + 2.25 * s, cz - 0.05 * s, cz + 0.05 * s, 'DARK_IRON', 'DARK_IRON', [1, 0.3, 0, bellTag]);
    pushPolygonPrism(interleaved, gltf, cx, y0, y0 + 0.68 * s, cz, 0.36 * s, 0.20 * s, 8, 'GOLD_PIPES', 'GOLD_PIPES', [1, 0.76, 0, bellTag]);
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
    pushBox(interleaved, gltf, cx - 0.18 * s, cx + 0.18 * s, y0 + h, y0 + h + 0.34 * s, cz - 0.18 * s, cz + 0.18 * s, 'FLAME_CORE', 'FLAME_CORE', [3, 0.25, 1.48, dofTag]);
    pushPolygonPrism(interleaved, gltf, cx, y0 + h + 0.34 * s, y0 + h + 0.54 * s, cz, 0.28 * s, 0.0, 4, 'DARK_IRON', null, iron);
    return;
  }

  // wooden_crate fallback
  const half = 0.42 * s;
  pushBox(interleaved, gltf, cx - half, cx + half, y0, y0 + half * 2, cz - half, cz + half, prop.tile ?? 'OAK_STAGE', prop.tile ?? 'OAK_STAGE', [1, 0.22, 0, dofTag]);
}

function surfaceMatType(surface, tile, fallback) {
  if (surface === 'lava') return 5;
  if (surface === 'water') return 4;
  if (!surface && tile === 'WATER_TRENCH') return 4;
  return fallback;
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
    const matType = surfaceMatType(floor.surface, floor.tile, 0);
    const mat = [matType, floor.gloss ?? 0.35, 0, floor.receiveRings ? -1 : 0];
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
    const matType = box.surface === 'lava' ? 5 : box.surface === 'water' ? 4 : (isEmissive ? 3 : 1);
    const mat = [matType, box.gloss ?? 0.28, isEmissive ? (box.emissive ?? 0) : 0, box.dofTag ?? 0];
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

  let animPivot = [0, 0, 0, 0];
  for (const prop of stage.geometry?.props ?? []) {
    if (prop.hidden) continue;
    pushProp(interleaved, gltf, prop);
    if (prop.type === 'clock_pendulum' && animPivot[3] === 0) {
      const s = prop.scale ?? 1;
      animPivot = [prop.pos[0], prop.pos[1] + (prop.height ?? 2.35) * s, prop.pos[2], prop.swingAmp ?? 0.42];
    }
  }

  const data = new Float32Array(interleaved);
  return {
    data,
    vertexCount: data.length / 12,
    animPivot,
    gltf: {
      positions: new Float32Array(gltf.positions),
      normals: new Float32Array(gltf.normals),
      uvs: new Float32Array(gltf.uvs),
    },
  };
}

export function buildArtDioramaMesh() {
  const interleaved = [];
  const gltf = { positions: [], normals: [], uvs: [] };
  const wallZ = -3.35;
  const floorFrontZ = 6.8;
  const floorCols = 12;
  const floorRows = 6;
  const fx0 = -11.0;
  const fx1 = 11.0;
  const dx = (fx1 - fx0) / floorCols;
  const dz = (floorFrontZ - wallZ) / floorRows;
  for (let r = 0; r < floorRows; r++) {
    const za = wallZ + r * dz;
    const zb = za + dz;
    for (let c = 0; c < floorCols; c++) {
      const xa = fx0 + c * dx;
      const xb = xa + dx;
      pushQuad(
        interleaved, gltf,
        [xa, 0, zb], [xb, 0, zb], [xb, 0, za], [xa, 0, za],
        [0, 1, 0], null, [0, 0.35, 1.0, -1], false,
      );
    }
  }
  const bayPts = [
    [-11.0, -2.75],
    [-5.4, -3.35],
    [-3.3, -4.2],
    [3.3, -4.2],
    [5.4, -3.35],
    [11.0, -2.75],
  ];
  for (let i = 0; i < bayPts.length - 1; i++) {
    const [ax, az] = bayPts[i];
    const [bx, bz] = bayPts[i + 1];
    const ex = bx - ax;
    const ez = bz - az;
    const nl = Math.hypot(-ez, ex) || 1;
    const norm = [-ez / nl, 0, ex / nl];
    pushQuad(
      interleaved, gltf,
      [ax, -0.02, az], [bx, -0.02, bz], [bx, 8.6, bz], [ax, 8.6, az],
      norm, null, [1, 0.14, 1.0, 0], false,
    );
  }
  const data = new Float32Array(interleaved);
  return {
    data,
    vertexCount: data.length / 12,
    animPivot: [0, 0, 0, 0],
    gltf: {
      positions: new Float32Array(gltf.positions),
      normals: new Float32Array(gltf.normals),
      uvs: new Float32Array(gltf.uvs),
    },
  };
}

export const PROP_TYPES = Object.freeze([
  { type: 'pillar', label: '八角柱 (Pillar)' },
  { type: 'arch_gate', label: '石造アーチ門 (Arch Gate)' },
  { type: 'clock_pendulum', label: '大時計＆振子 (Clock Pendulum)' },
  { type: 'gable_pavilion', label: '切妻屋根の館 (Gable Pavilion)' },
  { type: 'lighthouse_tower', label: '八角灯台 (Lighthouse)' },
  { type: 'brazier', label: '燭台・篝火 (Brazier)' },
  { type: 'crystal_cluster', label: '多面水晶クラスター (Crystal)' },
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
