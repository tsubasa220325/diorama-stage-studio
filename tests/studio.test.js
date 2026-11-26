import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ATLAS_PX, buildDioramaAtlasData, encodeRgbaToPng, generateNormalFromRgba,
} from '../core/atlasBuilder.js';
import {
  buildFrameLights, neutralViewProj, projectPoint, sampleParticles, screenToWorldX, STAGE_H, STAGE_W,
} from '../core/math.js';
import { buildStageMesh } from '../core/meshBuilder.js';
import { buildSampleSpriteRgba, SAMPLE_SPRITE_STYLES } from '../core/sampleSprites.js';
import { validateStage } from '../core/validator.js';
import { buildColabStageJob } from '../exporters/colabJobExporter.js';
import { exportStageToGlb } from '../exporters/glbExporter.js';
import { toRhysmodiaRuntime } from '../exporters/rhysmodiaAdapter.js';
import { PRESETS } from '../presets/index.js';

test('all built-in presets pass schema validation and compile to valid 3D meshes', () => {
  assert.ok(PRESETS.length >= 10, 'at least 10 presets');
  for (const preset of PRESETS) {
    const check = validateStage(preset);
    assert.equal(check.valid, true, `${preset.meta.id}: ${check.errors.join(', ')}`);
    const mesh = buildStageMesh(preset);
    assert.ok(mesh.vertexCount >= 36, `${preset.meta.id} vertexCount`);
    assert.equal(mesh.data.length, mesh.vertexCount * 12);
    assert.ok(mesh.gltf.positions.length > 0 && mesh.gltf.positions.length % 9 === 0);
    for (let i = 0; i < mesh.data.length; i++) {
      assert.ok(Number.isFinite(mesh.data[i]), `${preset.meta.id} finite vertex float`);
    }
  }
});

test('Rhysmodia 4:3 battle preset projects hero and enemy anchors to exact 640x480 battle coordinates', () => {
  const cavern = PRESETS.find(p => p.meta.id === 'cavern_arena');
  const vp = neutralViewProj(cavern);
  const hero = cavern.anchors.find(a => a.id === 'hero');
  const enemy = cavern.anchors.find(a => a.id === 'enemy');
  const hp = projectPoint(vp, hero.pos[0], 0, 0, STAGE_W, STAGE_H);
  const ep = projectPoint(vp, enemy.pos[0], 0, 0, STAGE_W, STAGE_H);
  assert.ok(Math.abs(hp.x - 188) < 0.5, `hero x aligned: ${hp.x}`);
  assert.ok(Math.abs(hp.y - 280) < 0.5, `hero y aligned: ${hp.y}`);
  assert.ok(Math.abs(ep.x - 466) < 0.5, `enemy x aligned: ${ep.x}`);
  assert.ok(Math.abs(ep.y - 280) < 0.5, `enemy y aligned: ${ep.y}`);
  assert.equal(screenToWorldX(320), 0);
});

test('procedural 256x256 pixel PBR atlas builds valid albedo, unit normals, and PNG bytes', () => {
  const atlas = buildDioramaAtlasData(2.2);
  assert.equal(atlas.width, ATLAS_PX);
  assert.equal(atlas.height, ATLAS_PX);
  assert.equal(atlas.albedo.length, ATLAS_PX * ATLAS_PX * 4);
  assert.equal(atlas.normal.length, ATLAS_PX * ATLAS_PX * 4);
  const png = encodeRgbaToPng(atlas.albedo, atlas.width, atlas.height);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const customNorm = generateNormalFromRgba(atlas.albedo.subarray(0, 16 * 16 * 4), 16, 16, 2.5);
  assert.equal(customNorm.length, 16 * 16 * 4);
  assert.ok(customNorm[2] >= 128, 'tangent-space normal Z faces outward');
});

test('pure-JS glTF 2.0 (.glb) exporter produces valid binary with NEAREST sampler, KHR_lights_punctual, and extras', () => {
  const stage = PRESETS.find(p => p.meta.id === 'rpg_village_square');
  const glb = exportStageToGlb(stage);
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  assert.equal(dv.getUint32(0, true), 0x46546c67, 'glTF magic');
  assert.equal(dv.getUint32(4, true), 2, 'glTF v2');
  assert.equal(dv.getUint32(8, true), glb.byteLength, 'total byte length');

  const jsonLen = dv.getUint32(12, true);
  assert.equal(dv.getUint32(16, true), 0x4e4f534a, 'JSON chunk type');
  const jsonText = new TextDecoder().decode(glb.subarray(20, 20 + jsonLen));
  const doc = JSON.parse(jsonText);

  assert.equal(doc.asset.version, '2.0');
  assert.ok(doc.extensionsUsed.includes('KHR_lights_punctual'));
  assert.ok(doc.extensions.KHR_lights_punctual.lights.length >= 4);
  assert.equal(doc.samplers[0].magFilter, 9728, 'NEAREST magFilter for pixel art');
  assert.equal(doc.samplers[0].minFilter, 9728, 'NEAREST minFilter for pixel art');
  assert.equal(doc.scenes[0].extras.dioramaStage.meta.id, 'rpg_village_square');
  assert.ok(doc.scenes[0].extras.dioramaStage.gameplay.walkableCells.length > 0);
});

test('Rhysmodia runtime adapter and Colab GPU job exporter produce valid outputs', () => {
  const stage = PRESETS[0];
  const rt = toRhysmodiaRuntime(stage);
  assert.equal(rt.id, 'cavern_arena');
  assert.ok(rt.biome.lights.length >= 4 && rt.biome.lights.length <= 8);
  assert.ok(rt.meshData instanceof Float32Array && rt.meshData.length === rt.vertexCount * 12);

  const lights = buildFrameLights(stage, { time: 2.5, beats: 4.1, beatSync: true, enraged: true });
  assert.ok(lights.length >= 4 && lights.length <= 8);
  const particles = sampleParticles(stage, { time: 1.2 });
  assert.equal(particles.length, stage.atmosphere.particles.count);

  const colab = buildColabStageJob(stage);
  assert.equal(colab.auto_disconnect_when_done, true);
  assert.equal(colab.jobs.length, 2);

  for (const style of SAMPLE_SPRITE_STYLES) {
    const sp = buildSampleSpriteRgba(style);
    assert.equal(sp.width, 32);
    assert.equal(sp.height, 32);
  }
});

test('public code and UI contain no standalone trademarked "HD-2D" / "HD2D" strings', () => {
  const root = new URL('..', import.meta.url).pathname;
  const ignoreDirs = new Set(['.git', 'node_modules']);
  const codeExts = new Set(['.js', '.html', '.css', '.json', '.cs', '.gd']);
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (ignoreDirs.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        const dot = entry.lastIndexOf('.');
        const ext = dot >= 0 ? entry.slice(dot) : '';
        if (!codeExts.has(ext) || entry === 'studio.test.js') continue;
        const text = readFileSync(full, 'utf8');
        assert.equal(/\bHD-?2D\b/i.test(text), false, `Found trademark term in ${full}`);
      }
    }
  }
  walk(root);
});
