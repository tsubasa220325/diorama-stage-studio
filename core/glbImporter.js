// Pure-JS binary glTF 2.0 (.glb) importer (zero external dependencies).
// Designed for importing low-poly pixel-art props exported from Blockbench Web,
// Crocotile 3D, Blender, or Diorama Stage Studio itself.

const COMPONENT_SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(gltf, bin, accessorIndex) {
  const acc = gltf.accessors?.[accessorIndex];
  if (!acc) return null;
  const bv = gltf.bufferViews?.[acc.bufferView];
  if (!bv) return null;
  const compSize = COMPONENT_SIZES[acc.componentType];
  const comps = TYPE_COUNTS[acc.type];
  if (!compSize || !comps) return null;

  const baseOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride || compSize * comps;
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out = new Float32Array(acc.count * comps);

  for (let i = 0; i < acc.count; i++) {
    const row = baseOffset + i * stride;
    for (let c = 0; c < comps; c++) {
      const off = row + c * compSize;
      let val = 0;
      if (acc.componentType === 5126) val = dv.getFloat32(off, true);
      else if (acc.componentType === 5123) val = dv.getUint16(off, true);
      else if (acc.componentType === 5125) val = dv.getUint32(off, true);
      else if (acc.componentType === 5121) val = dv.getUint8(off);
      else if (acc.componentType === 5122) val = dv.getInt16(off, true);
      else if (acc.componentType === 5120) val = dv.getInt8(off);
      out[i * comps + c] = val;
    }
  }
  return out;
}

function mulMat4(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4], b1 = b[col * 4 + 1], b2 = b[col * 4 + 2], b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

function nodeLocalMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    return new Float32Array(node.matrix);
  }
  const t = node.translation ?? [0, 0, 0];
  const r = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return new Float32Array([
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]);
}

function transformPos(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function transformNorm(m, x, y, z) {
  const nx = m[0] * x + m[4] * y + m[8] * z;
  const ny = m[1] * x + m[5] * y + m[9] * z;
  const nz = m[2] * x + m[6] * y + m[10] * z;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function computeFlatNormal(p0, p1, p2) {
  const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
  const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/**
 * Parses a binary .glb Uint8Array / ArrayBuffer into normalized triangle buffers
 * plus optional embedded baseColor image bytes (PNG/JPEG/WebP).
 */
export function parseGlb(bufferOrBytes, name = 'external_model') {
  const bytes = bufferOrBytes instanceof Uint8Array ? bufferOrBytes : new Uint8Array(bufferOrBytes);
  if (bytes.byteLength < 20) throw new Error('GLB file is too short');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid GLB header (expected glTF magic)');
  const version = dv.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported glTF version: ${version}`);

  let offset = 12;
  let gltf = null;
  let bin = new Uint8Array(0);
  while (offset + 8 <= bytes.byteLength) {
    const chunkLen = dv.getUint32(offset, true);
    const chunkType = dv.getUint32(offset + 4, true);
    const chunkData = bytes.subarray(offset + 8, offset + 8 + chunkLen);
    if (chunkType === 0x4e4f534a) {
      gltf = JSON.parse(new TextDecoder().decode(chunkData));
    } else if (chunkType === 0x004e4942) {
      bin = chunkData;
    }
    offset += 8 + chunkLen;
  }
  if (!gltf) throw new Error('GLB missing JSON chunk');

  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const meshTransforms = [];
  const sceneIdx = gltf.scene ?? 0;
  const roots = gltf.scenes?.[sceneIdx]?.nodes ?? (gltf.nodes ? [0] : []);

  function walkNode(nodeIdx, parentMat) {
    const node = gltf.nodes?.[nodeIdx];
    if (!node) return;
    const world = mulMat4(parentMat, nodeLocalMatrix(node));
    if (typeof node.mesh === 'number') {
      meshTransforms.push({ meshIndex: node.mesh, matrix: world });
    }
    for (const child of node.children ?? []) walkNode(child, world);
  }
  for (const r of roots) walkNode(r, identity);

  if (meshTransforms.length === 0 && Array.isArray(gltf.meshes)) {
    gltf.meshes.forEach((_, idx) => meshTransforms.push({ meshIndex: idx, matrix: identity }));
  }

  const positions = [];
  const normals = [];
  const uvs = [];
  let baseColorFactor = [1, 1, 1, 1];
  let embeddedImage = null;

  for (const { meshIndex, matrix } of meshTransforms) {
    const mesh = gltf.meshes?.[meshIndex];
    if (!mesh) continue;
    for (const prim of mesh.primitives ?? []) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const pos = readAccessor(gltf, bin, prim.attributes?.POSITION);
      if (!pos) continue;
      const norm = prim.attributes?.NORMAL !== undefined ? readAccessor(gltf, bin, prim.attributes.NORMAL) : null;
      const uv = prim.attributes?.TEXCOORD_0 !== undefined ? readAccessor(gltf, bin, prim.attributes.TEXCOORD_0) : null;
      const indices = prim.indices !== undefined ? readAccessor(gltf, bin, prim.indices) : null;

      if (!embeddedImage && typeof prim.material === 'number') {
        const mat = gltf.materials?.[prim.material];
        const pbr = mat?.pbrMetallicRoughness;
        if (Array.isArray(pbr?.baseColorFactor)) baseColorFactor = pbr.baseColorFactor.slice(0, 4);
        const texIdx = pbr?.baseColorTexture?.index;
        if (typeof texIdx === 'number') {
          const imgIdx = gltf.textures?.[texIdx]?.source;
          const imgDef = typeof imgIdx === 'number' ? gltf.images?.[imgIdx] : null;
          if (imgDef && typeof imgDef.bufferView === 'number') {
            const bv = gltf.bufferViews[imgDef.bufferView];
            const start = bv.byteOffset ?? 0;
            embeddedImage = {
              mimeType: imgDef.mimeType || 'image/png',
              bytes: new Uint8Array(bin.subarray(start, start + bv.byteLength)),
            };
          }
        }
      }

      const triCount = indices ? Math.floor(indices.length / 3) : Math.floor(pos.length / 9);
      for (let t = 0; t < triCount; t++) {
        const i0 = indices ? indices[t * 3] : t * 3;
        const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
        const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;
        const p0 = transformPos(matrix, pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2]);
        const p1 = transformPos(matrix, pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2]);
        const p2 = transformPos(matrix, pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2]);
        const flat = norm ? null : computeFlatNormal(p0, p1, p2);
        const verts = [
          [i0, p0], [i1, p1], [i2, p2],
        ];
        for (const [vi, p] of verts) {
          positions.push(p[0], p[1], p[2]);
          const n = norm ? transformNorm(matrix, norm[vi * 3], norm[vi * 3 + 1], norm[vi * 3 + 2]) : flat;
          normals.push(n[0], n[1], n[2]);
          if (uv) uvs.push(uv[vi * 2], uv[vi * 2 + 1]);
          else uvs.push(0.5, 0.5);
        }
      }
    }
  }

  // Normalize bottom-center to origin so Blockbench / external props rest cleanly on the diorama floor
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i] < minX) minX = positions[i];
    if (positions[i] > maxX) maxX = positions[i];
    if (positions[i + 1] < minY) minY = positions[i + 1];
    if (positions[i + 1] > maxY) maxY = positions[i + 1];
    if (positions[i + 2] < minZ) minZ = positions[i + 2];
    if (positions[i + 2] > maxZ) maxZ = positions[i + 2];
  }
  const cx = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
  const cy = Number.isFinite(minY) ? minY : 0;
  const cz = Number.isFinite(minZ) ? (minZ + maxZ) * 0.5 : 0;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= cx;
    positions[i + 1] -= cy;
    positions[i + 2] -= cz;
  }

  return {
    name,
    vertexCount: positions.length / 3,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    baseColorFactor,
    embeddedImage,
    size: Number.isFinite(minX) ? [maxX - minX, maxY - minY, maxZ - minZ] : [0, 0, 0],
    extras: gltf.scenes?.[sceneIdx]?.extras ?? null,
  };
}

/**
 * Builds an interleaved 12-float/vertex Float32Array placed in world space for the WebGL2 stage shader.
 */
export function buildExternalModelVertices(parsed, placement) {
  const pos = placement.pos ?? [0, 0, 0];
  const scale = placement.scale ?? 1;
  const rotRad = ((placement.rotYDeg ?? 0) * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);
  const gloss = placement.gloss ?? 0.32;
  const count = parsed.vertexCount;
  const out = new Float32Array(count * 12);

  for (let i = 0; i < count; i++) {
    const px = parsed.positions[i * 3] * scale;
    const py = parsed.positions[i * 3 + 1] * scale;
    const pz = parsed.positions[i * 3 + 2] * scale;
    const wx = px * cosR + pz * sinR + pos[0];
    const wy = py + pos[1];
    const wz = -px * sinR + pz * cosR + pos[2];

    const nx = parsed.normals[i * 3];
    const ny = parsed.normals[i * 3 + 1];
    const nz = parsed.normals[i * 3 + 2];
    const rnx = nx * cosR + nz * sinR;
    const rnz = -nx * sinR + nz * cosR;

    const o = i * 12;
    out[o] = wx; out[o + 1] = wy; out[o + 2] = wz;
    out[o + 3] = rnx; out[o + 4] = ny; out[o + 5] = rnz;
    out[o + 6] = parsed.uvs[i * 2]; out[o + 7] = parsed.uvs[i * 2 + 1];
    out[o + 8] = 1; out[o + 9] = gloss; out[o + 10] = 0; out[o + 11] = 0;
  }
  return out;
}
