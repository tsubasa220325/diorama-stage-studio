import { buildDioramaAtlasData, encodeRgbaToPng } from '../core/atlasBuilder.js';
import { buildStageMesh } from '../core/meshBuilder.js';

function pad4(len) {
  return (len + 3) & ~3;
}

function minMaxVec3(arr) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i += 3) {
    if (arr[i] < min[0]) min[0] = arr[i];
    if (arr[i] > max[0]) max[0] = arr[i];
    if (arr[i + 1] < min[1]) min[1] = arr[i + 1];
    if (arr[i + 1] > max[1]) max[1] = arr[i + 1];
    if (arr[i + 2] < min[2]) min[2] = arr[i + 2];
    if (arr[i + 2] > max[2]) max[2] = arr[i + 2];
  }
  return { min, max };
}

/**
 * Pure-JS glTF 2.0 Binary (.glb) exporter (zero dependencies).
 * Includes:
 *  - Stage 3D mesh (POSITION, NORMAL, TEXCOORD_0)
 *  - Embedded 256x256 Albedo + Normal PNGs with NEAREST (9728) pixel-art sampler
 *  - KHR_lights_punctual (directional key light + up to 8 point lights)
 *  - extras.dioramaStage (camera, DoF, Bloom, Fog, LightRays, Particles, Anchors, Gameplay)
 */
export function exportStageToGlb(stage, customAtlas = null) {
  const built = buildStageMesh(stage);
  const { positions, normals, uvs } = built.gltf;
  const vertexCount = positions.length / 3;
  const bounds = minMaxVec3(positions);

  const atlas = customAtlas ?? buildDioramaAtlasData(stage.atlas?.normalStrength ?? 2.2);
  const albedoPng = encodeRgbaToPng(atlas.albedo, atlas.width, atlas.height);
  const normalPng = encodeRgbaToPng(atlas.normal, atlas.width, atlas.height);

  const posBytes = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength);
  const normBytes = new Uint8Array(normals.buffer, normals.byteOffset, normals.byteLength);
  const uvBytes = new Uint8Array(uvs.buffer, uvs.byteOffset, uvs.byteLength);

  const chunks = [posBytes, normBytes, uvBytes, albedoPng, normalPng];
  const offsets = [];
  let cursor = 0;
  for (const c of chunks) {
    offsets.push(cursor);
    cursor = pad4(cursor + c.byteLength);
  }
  const binBuffer = new Uint8Array(cursor);
  for (let i = 0; i < chunks.length; i++) {
    binBuffer.set(chunks[i], offsets[i]);
  }

  const lights = [];
  const nodes = [
    { name: 'DioramaStageMesh', mesh: 0 },
  ];

  // Key directional light
  const key = stage.lighting?.keyLight;
  if (key) {
    lights.push({
      name: 'KeyLight',
      type: 'directional',
      color: key.color.slice(0, 3),
      intensity: 1.5,
    });
    nodes.push({
      name: 'KeyLightNode',
      translation: [key.dir[0] * 10, key.dir[1] * 10, key.dir[2] * 10],
      extensions: { KHR_lights_punctual: { light: lights.length - 1 } },
      extras: { direction: key.dir },
    });
  }

  // Punctual point lights
  for (const pl of stage.lighting?.pointLights ?? []) {
    lights.push({
      name: pl.id || 'PointLight',
      type: 'point',
      color: pl.color.slice(0, 3),
      intensity: pl.intensity,
      range: pl.radius,
      extras: { flicker: pl.flicker ?? 0, phase: pl.phase ?? 0 },
    });
    nodes.push({
      name: `Light_${pl.id}`,
      translation: pl.pos.slice(0, 3),
      extensions: { KHR_lights_punctual: { light: lights.length - 1 } },
    });
  }

  // Gameplay & Sprite Anchor empty nodes
  for (const a of stage.anchors ?? []) {
    nodes.push({
      name: `Anchor_${a.id}`,
      translation: a.pos.slice(0, 3),
      extras: {
        dioramaAnchor: true,
        id: a.id,
        role: a.role,
        widthWorld: a.widthWorld ?? 1.8,
        heightWorld: a.heightWorld ?? 1.8,
        spriteStyle: a.spriteStyle ?? null,
        ringColor: a.ringColor ?? null,
      },
    });
  }

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'Diorama Stage Studio v0.1.0',
    },
    extensionsUsed: ['KHR_lights_punctual'],
    extensions: {
      KHR_lights_punctual: { lights },
    },
    scene: 0,
    scenes: [
      {
        name: stage.meta?.id ?? 'diorama_stage',
        nodes: nodes.map((_, i) => i),
        extras: {
          dioramaStage: {
            schemaVersion: stage.schemaVersion,
            meta: stage.meta,
            camera: stage.camera,
            backdrop: stage.backdrop,
            lighting: stage.lighting,
            atmosphere: stage.atmosphere,
            postProcess: stage.postProcess,
            gameplay: stage.gameplay,
          },
        },
      },
    ],
    nodes,
    meshes: [
      {
        name: 'StageGeometry',
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            material: 0,
            mode: 4,
          },
        ],
      },
    ],
    materials: [
      {
        name: 'PixelDioramaAtlas',
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.05,
          roughnessFactor: Math.max(0.1, 1 - (stage.lighting?.floorGloss ?? 0.4)),
        },
        normalTexture: { index: 1, scale: 0.72 },
        doubleSided: false,
      },
    ],
    samplers: [
      {
        magFilter: 9728, // NEAREST — preserves crisp pixel art in Unity glTFast / Godot / Three.js
        minFilter: 9728, // NEAREST
        wrapS: 33071,    // CLAMP_TO_EDGE
        wrapT: 33071,
      },
    ],
    images: [
      { name: 'atlas_albedo', bufferView: 3, mimeType: 'image/png' },
      { name: 'atlas_normal', bufferView: 4, mimeType: 'image/png' },
    ],
    textures: [
      { sampler: 0, source: 0 },
      { sampler: 0, source: 1 },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: posBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: normBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: offsets[2], byteLength: uvBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: offsets[3], byteLength: albedoPng.byteLength },
      { buffer: 0, byteOffset: offsets[4], byteLength: normalPng.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertexCount, type: 'VEC3', min: bounds.min, max: bounds.max },
      { bufferView: 1, componentType: 5126, count: vertexCount, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: vertexCount, type: 'VEC2' },
    ],
    buffers: [
      { byteLength: binBuffer.byteLength },
    ],
  };

  const jsonRaw = new TextEncoder().encode(JSON.stringify(gltfJson));
  const jsonPaddedLen = pad4(jsonRaw.byteLength);
  const jsonChunk = new Uint8Array(jsonPaddedLen);
  jsonChunk.set(jsonRaw);
  for (let i = jsonRaw.byteLength; i < jsonPaddedLen; i++) jsonChunk[i] = 0x20; // space pad

  const totalLen = 12 + 8 + jsonChunk.byteLength + 8 + binBuffer.byteLength;
  const glb = new Uint8Array(totalLen);
  const dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);          // version 2
  dv.setUint32(8, totalLen, true);
  // JSON chunk
  dv.setUint32(12, jsonChunk.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  glb.set(jsonChunk, 20);
  // BIN chunk
  const binOff = 20 + jsonChunk.byteLength;
  dv.setUint32(binOff, binBuffer.byteLength, true);
  dv.setUint32(binOff + 4, 0x004e4942, true); // 'BIN\0'
  glb.set(binBuffer, binOff + 8);
  return glb;
}
