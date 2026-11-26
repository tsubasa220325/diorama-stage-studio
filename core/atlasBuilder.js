export const ATLAS_TILES = 4;
export const TILE_PX = 64;
export const ATLAS_PX = ATLAS_TILES * TILE_PX;

export const TILE = Object.freeze({
  CAVERN_FLOOR: [0, 0],
  MARBLE_FLOOR: [1, 0],
  CATHEDRAL_FLOOR: [2, 0],
  CARPET_RUNNER: [3, 0],
  OAK_STAGE: [0, 1],
  CRYPT_COBBLE: [1, 1],
  STONE_PILLAR: [2, 1],
  MARBLE_PILLAR: [3, 1],
  ASHLAR_BLOCK: [0, 2],
  GOLD_PIPES: [1, 2],
  VELVET_BANNER: [2, 2],
  DARK_IRON: [3, 2],
  CRYSTAL_GLOW: [0, 3],
  FLAME_CORE: [1, 3],
  RUNE_GLASS: [2, 3],
  WATER_TRENCH: [3, 3],
});

export const TILE_NAMES = Object.freeze(Object.keys(TILE));

export const TILE_LABELS_JA = Object.freeze({
  CAVERN_FLOOR: '洞窟石畳',
  MARBLE_FLOOR: '大理石チェック',
  CATHEDRAL_FLOOR: '大聖堂石床',
  CARPET_RUNNER: '紅絨毯',
  OAK_STAGE: '木製舞台床',
  CRYPT_COBBLE: '地下堂石畳',
  STONE_PILLAR: '石柱',
  MARBLE_PILLAR: '大理石柱',
  ASHLAR_BLOCK: '切石ブロック',
  GOLD_PIPES: '黄金パイプ',
  VELVET_BANNER: '深紅ベルベット',
  DARK_IRON: '黒鉄',
  CRYSTAL_GLOW: '発光水晶',
  FLAME_CORE: '炎コア',
  RUNE_GLASS: 'ステンドグラス',
  WATER_TRENCH: '水堀',
});

function hash2(x, y, s = 0) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function tilePixel(tx, ty, x, y) {
  const n = hash2(x >> 1, y >> 1, tx * 17 + ty * 31) - 0.5;
  const f = hash2(x, y, tx * 53 + ty * 97) - 0.5;

  if (tx === 0 && ty === 0) {
    const row = Math.floor(y / 16);
    const sx = (x + (row % 2) * 16) % 32;
    const sy = y % 16;
    const seam = sx < 2 || sy < 2;
    const bevel = sx === 2 || sy === 2 ? 18 : sx === 31 || sy === 15 ? -16 : 0;
    const moss = !seam && hash2(x >> 2, y >> 2, 11) > 0.87 ? 1 : 0;
    const base = seam ? 26 : 64 + n * 24 + f * 8 + bevel;
    return [base * (moss ? 0.72 : 0.92), base * (moss ? 1.05 : 0.86), base * (moss ? 0.78 : 1.12), seam ? 0.15 : 0.6 + bevel * 0.01];
  }
  if (tx === 1 && ty === 0) {
    const cx = Math.floor(x / 16);
    const cy = Math.floor(y / 16);
    const light = (cx + cy) % 2 === 0;
    const sx = x % 16;
    const sy = y % 16;
    const seam = sx === 0 || sy === 0;
    const vein = Math.sin((x * 0.22 + y * 0.17) + n * 3) * 0.5 + 0.5;
    if (seam) return [42, 46, 68, 0.2];
    if (light) {
      const v = 188 + n * 18 + (vein > 0.84 ? -18 : 0);
      return [v * 0.95, v * 0.97, v * 1.04, 0.72 + (vein > 0.84 ? -0.05 : 0)];
    }
    const v = 74 + n * 16 + (vein > 0.82 ? 16 : 0);
    return [v * 0.82, v * 0.96, v * 1.28, 0.68];
  }
  if (tx === 2 && ty === 0) {
    const sx = x % 32;
    const sy = y % 32;
    const seam = sx < 2 || sy < 2;
    const inlay = !seam && (sx === 4 || sy === 4 || sx === 29 || sy === 29);
    if (seam) return [32, 26, 40, 0.18];
    if (inlay) return [168 + n * 16, 132 + n * 14, 68 + n * 10, 0.75];
    const v = 96 + n * 20 + f * 8;
    return [v * 1.04, v * 0.96, v * 1.02, 0.58];
  }
  if (tx === 3 && ty === 0) {
    const border = y < 8 || y >= 56;
    const goldEdge = y === 6 || y === 7 || y === 56 || y === 57 || ((y === 11 || y === 52) && ((x >> 2) % 2 === 0));
    if (goldEdge) return [224 + n * 20, 178 + n * 16, 72 + n * 10, 0.82];
    if (border) return [88 + n * 10, 22 + n * 6, 36 + n * 8, 0.48];
    const weave = ((x ^ y) & 2) ? 10 : -6;
    return [148 + weave + n * 14, 28 + n * 8, 48 + n * 10, 0.52 + weave * 0.005];
  }
  if (tx === 0 && ty === 1) {
    const plank = Math.floor(y / 16);
    const sy = y % 16;
    const sx = (x + plank * 23) % 64;
    const seam = sy === 0 || sx === 0;
    const nail = (sx === 4 || sx === 60) && (sy === 4 || sy === 12);
    if (seam) return [28, 18, 16, 0.14];
    if (nail) return [54, 46, 50, 0.35];
    const grain = Math.sin(x * 0.16 + plank * 2.1 + n * 2.4) * 10;
    const v = 96 + grain + n * 14;
    return [v * 1.12, v * 0.76, v * 0.52, 0.55 + grain * 0.008];
  }
  if (tx === 1 && ty === 1) {
    const row = Math.floor(y / 12);
    const sx = (x + (row % 2) * 10) % 20;
    const sy = y % 12;
    const seam = sx < 2 || sy < 2;
    const bevel = sx === 2 || sy === 2 ? 16 : sx === 19 || sy === 11 ? -14 : 0;
    if (seam) return [20, 20, 28, 0.12];
    const v = 68 + n * 24 + bevel;
    return [v * 0.88, v * 0.94, v * 0.92, 0.55 + bevel * 0.01];
  }
  if (tx === 2 && ty === 1) {
    const flute = Math.sin((x % 16) / 16 * Math.PI);
    const band = y < 6 || y >= 58 || (y >= 30 && y <= 33);
    const v = (band ? 112 : 76 + flute * 36) + n * 14;
    return [v * 0.94, v * 0.92, v * 1.06, 0.42 + flute * 0.35];
  }
  if (tx === 3 && ty === 1) {
    const flute = Math.sin((x % 16) / 16 * Math.PI);
    const trim = y < 8 || y >= 56;
    if (trim) return [214 + n * 18, 174 + n * 14, 78 + n * 10, 0.85];
    const v = 152 + flute * 44 + n * 12;
    return [v * 0.98, v * 0.96, v * 1.04, 0.48 + flute * 0.35];
  }
  if (tx === 0 && ty === 2) {
    const row = Math.floor(y / 16);
    const sx = (x + (row % 2) * 16) % 32;
    const sy = y % 16;
    const seam = sx < 2 || sy < 2;
    const bevel = sx === 2 || sy === 2 ? 22 : sx === 31 || sy === 15 ? -18 : 0;
    if (seam) return [28, 24, 38, 0.12];
    const v = 86 + n * 18 + bevel;
    return [v * 0.96, v * 0.94, v * 1.08, 0.56 + bevel * 0.012];
  }
  if (tx === 1 && ty === 2) {
    const pipe = Math.sin((x % 12) / 12 * Math.PI);
    const slit = y >= 40 && y <= 46 && (x % 12) >= 4 && (x % 12) <= 7;
    if (slit) return [38, 28, 24, 0.15];
    const v = 138 + pipe * 98 + n * 12;
    return [v * 1.06, v * 0.84, v * 0.36, 0.38 + pipe * 0.5];
  }
  if (tx === 2 && ty === 2) {
    const fold = Math.sin((x % 16) / 16 * Math.PI);
    const hem = y >= 56;
    if (hem) return [226 + n * 16, 180 + n * 14, 74, 0.8];
    const v = 88 + fold * 52 + n * 10;
    return [v * 1.18, v * 0.26, v * 0.40, 0.35 + fold * 0.4];
  }
  if (tx === 3 && ty === 2) {
    const rib = (x % 8) < 2 || (y % 16) < 2 ? 14 : 0;
    const v = 42 + rib + n * 12;
    return [v * 0.96, v * 0.98, v * 1.12, 0.45 + rib * 0.02];
  }
  if (tx === 0 && ty === 3) {
    const facet = ((x + y) % 16) < 8 ? 1.15 : 0.85;
    const core = 1 - Math.hypot((x - 32) / 32, (y - 32) / 32) * 0.45;
    return [182 * facet * core + 36, 118 * facet * core + 24, 246 * core, 0.85];
  }
  if (tx === 1 && ty === 3) {
    const d = Math.hypot((x - 32) / 30, (y - 38) / 34);
    const glow = Math.max(0, 1 - d);
    return [255, 165 + glow * 85, 48 + glow * 150, 0.9];
  }
  if (tx === 2 && ty === 3) {
    const grid = (x % 16) < 2 || (y % 16) < 2;
    if (grid) return [36, 40, 62, 0.25];
    const d = Math.hypot((x - 32) / 32, (y - 32) / 32);
    return [96 + (1 - d) * 90, 178 + (1 - d) * 70, 255, 0.78];
  }
  const ripple = Math.sin(x * 0.32 + Math.sin(y * 0.18) * 2) * 0.5 + 0.5;
  return [28 + ripple * 24, 62 + ripple * 48, 112 + ripple * 62, 0.5 + ripple * 0.25];
}

export function buildDioramaAtlasData(normalStrength = 2.2) {
  const albedo = new Uint8Array(ATLAS_PX * ATLAS_PX * 4);
  const heights = new Float32Array(ATLAS_PX * ATLAS_PX);
  for (let ty = 0; ty < ATLAS_TILES; ty++) {
    for (let tx = 0; tx < ATLAS_TILES; tx++) {
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const [r, g, b, h] = tilePixel(tx, ty, x, y);
          const px = tx * TILE_PX + x;
          const py = ty * TILE_PX + y;
          const idx = py * ATLAS_PX + px;
          albedo[idx * 4] = clampByte(r);
          albedo[idx * 4 + 1] = clampByte(g);
          albedo[idx * 4 + 2] = clampByte(b);
          albedo[idx * 4 + 3] = 255;
          heights[idx] = h;
        }
      }
    }
  }
  const normal = new Uint8Array(ATLAS_PX * ATLAS_PX * 4);
  for (let ty = 0; ty < ATLAS_TILES; ty++) {
    for (let tx = 0; tx < ATLAS_TILES; tx++) {
      const bx = tx * TILE_PX;
      const by = ty * TILE_PX;
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const xm = bx + ((x - 1 + TILE_PX) % TILE_PX);
          const xp = bx + ((x + 1) % TILE_PX);
          const ym = by + ((y - 1 + TILE_PX) % TILE_PX);
          const yp = by + ((y + 1) % TILE_PX);
          const dx = (heights[(by + y) * ATLAS_PX + xm] - heights[(by + y) * ATLAS_PX + xp]) * normalStrength;
          const dy = (heights[ym * ATLAS_PX + (bx + x)] - heights[yp * ATLAS_PX + (bx + x)]) * normalStrength;
          const dz = 1.0;
          const inv = 1 / Math.hypot(dx, dy, dz);
          const idx = (by + y) * ATLAS_PX + (bx + x);
          normal[idx * 4] = clampByte((dx * inv * 0.5 + 0.5) * 255);
          normal[idx * 4 + 1] = clampByte((dy * inv * 0.5 + 0.5) * 255);
          normal[idx * 4 + 2] = clampByte((dz * inv * 0.5 + 0.5) * 255);
          normal[idx * 4 + 3] = 255;
        }
      }
    }
  }
  return { width: ATLAS_PX, height: ATLAS_PX, albedo, normal };
}

export function generateNormalFromRgba(rgba, width, height, strength = 2.4, wrap = true) {
  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i * 4 + 3] / 255;
    luma[i] = ((rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114) / 255) * a;
  }
  const normal = new Uint8Array(width * height * 4);
  const at = (x, y) => {
    const sx = wrap ? (x + width) % width : Math.max(0, Math.min(width - 1, x));
    const sy = wrap ? (y + height) % height : Math.max(0, Math.min(height - 1, y));
    return luma[sy * width + sx];
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const gx = ((tl + 2 * l + bl) - (tr + 2 * r + br)) * strength;
      const gy = ((tl + 2 * t + tr) - (bl + 2 * b + br)) * strength;
      const gz = 1.0;
      const inv = 1 / Math.hypot(gx, gy, gz);
      const idx = (y * width + x) * 4;
      normal[idx] = clampByte((gx * inv * 0.5 + 0.5) * 255);
      normal[idx + 1] = clampByte((gy * inv * 0.5 + 0.5) * 255);
      normal[idx + 2] = clampByte((gz * inv * 0.5 + 0.5) * 255);
      normal[idx + 3] = 255;
    }
  }
  return normal;
}

export function tileCoordFor(tileRef) {
  if (Array.isArray(tileRef) && tileRef.length === 2) return tileRef;
  if (typeof tileRef === 'string' && TILE[tileRef]) return TILE[tileRef];
  return TILE.ASHLAR_BLOCK;
}

export function tileUvRect(tileRef) {
  const [tx, ty] = tileCoordFor(tileRef);
  const pad = 0.5 / ATLAS_PX;
  const s = 1 / ATLAS_TILES;
  return [tx * s + pad, ty * s + pad, (tx + 1) * s - pad, (ty + 1) * s - pad];
}

// Pure-JS valid PNG encoder (uncompressed zlib stored blocks) — works in both browser and Node.js
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

export function encodeRgbaToPng(rgba, width, height) {
  const rowLen = width * 4 + 1;
  const raw = new Uint8Array(rowLen * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * rowLen + 1);
  }
  const maxBlock = 65535;
  const numBlocks = Math.ceil(raw.length / maxBlock);
  const zlib = new Uint8Array(2 + raw.length + numBlocks * 5 + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let pos = 2;
  for (let offset = 0; offset < raw.length; offset += maxBlock) {
    const len = Math.min(maxBlock, raw.length - offset);
    const last = offset + len >= raw.length ? 1 : 0;
    zlib[pos++] = last;
    zlib[pos++] = len & 0xff;
    zlib[pos++] = (len >>> 8) & 0xff;
    const nlen = (~len) & 0xffff;
    zlib[pos++] = nlen & 0xff;
    zlib[pos++] = (nlen >>> 8) & 0xff;
    zlib.set(raw.subarray(offset, offset + len), pos);
    pos += len;
  }
  const adler = adler32(raw);
  zlib[pos++] = (adler >>> 24) & 0xff;
  zlib[pos++] = (adler >>> 16) & 0xff;
  zlib[pos++] = (adler >>> 8) & 0xff;
  zlib[pos++] = adler & 0xff;

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width, false);
  iv.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const cIhdr = pngChunk('IHDR', ihdr);
  const cIdat = pngChunk('IDAT', zlib);
  const cIend = pngChunk('IEND', new Uint8Array(0));

  const out = new Uint8Array(sig.length + cIhdr.length + cIdat.length + cIend.length);
  let p = 0;
  out.set(sig, p); p += sig.length;
  out.set(cIhdr, p); p += cIhdr.length;
  out.set(cIdat, p); p += cIdat.length;
  out.set(cIend, p);
  return out;
}
