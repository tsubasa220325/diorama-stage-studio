import { TILE } from './atlasBuilder.js';
import { PROP_TYPES } from './meshBuilder.js';

const VALID_PRESETS = new Set(['battle-4:3', 'room-4:3', 'vista-4:3', 'rpg-field-16:9', 'tactical-grid']);
const VALID_PROP_TYPES = new Set(PROP_TYPES.map(p => p.type));

function isVec(v, len) {
  return Array.isArray(v) && v.length === len && v.every(n => typeof n === 'number' && Number.isFinite(n));
}

export function validateStage(stage) {
  const errors = [];
  if (!stage || typeof stage !== 'object') {
    return { valid: false, errors: ['Stage must be an object'] };
  }
  if (stage.schemaVersion !== '1.0.0') {
    errors.push(`schemaVersion must be "1.0.0" (got ${stage.schemaVersion})`);
  }
  if (!stage.meta || typeof stage.meta.id !== 'string' || !/^[a-z0-9_-]+$/.test(stage.meta.id)) {
    errors.push('meta.id must match /^[a-z0-9_-]+$/');
  }
  if (!stage.meta || typeof stage.meta.name !== 'string' || !stage.meta.name.trim()) {
    errors.push('meta.name must be a non-empty string');
  }
  if (!stage.meta || !VALID_PRESETS.has(stage.meta.preset)) {
    errors.push(`meta.preset must be one of ${[...VALID_PRESETS].join(', ')}`);
  }
  if (!isVec(stage.meta?.aspect, 2) || stage.meta.aspect[0] <= 0 || stage.meta.aspect[1] <= 0) {
    errors.push('meta.aspect must be [w, h] with positive numbers');
  }
  if (!stage.camera || !isVec(stage.camera.target, 3)) {
    errors.push('camera.target must be [x, y, z]');
  }
  if (!stage.geometry || !Array.isArray(stage.geometry.floors) || !Array.isArray(stage.geometry.boxes) || !Array.isArray(stage.geometry.props)) {
    errors.push('geometry must contain arrays floors, boxes, props');
  } else {
    for (const f of stage.geometry.floors) {
      if (!isVec(f.x, 2) || !isVec(f.z, 2) || typeof f.y !== 'number') errors.push(`invalid floor ${f.id}`);
      if (!TILE[f.tile]) errors.push(`unknown tile "${f.tile}" on floor ${f.id}`);
    }
    for (const b of stage.geometry.boxes) {
      if (!isVec(b.x, 2) || !isVec(b.y, 2) || !isVec(b.z, 2)) errors.push(`invalid box ${b.id}`);
      if (!TILE[b.sideTile]) errors.push(`unknown sideTile "${b.sideTile}" on box ${b.id}`);
    }
    for (const p of stage.geometry.props) {
      if (!isVec(p.pos, 3) || !VALID_PROP_TYPES.has(p.type)) errors.push(`invalid prop ${p.id} (${p.type})`);
    }
    if (stage.geometry.cutouts !== undefined) {
      if (!Array.isArray(stage.geometry.cutouts)) {
        errors.push('geometry.cutouts must be an array');
      } else {
        for (const c of stage.geometry.cutouts) {
          if (!isVec(c.pos, 3) || !isVec(c.size, 2)) errors.push(`invalid cutout ${c.id}`);
        }
      }
    }
  }
  if (!stage.lighting || !isVec(stage.lighting.ambient, 3) || !isVec(stage.lighting.keyLight?.dir, 3) || !isVec(stage.lighting.keyLight?.color, 3)) {
    errors.push('lighting requires ambient and keyLight.{dir,color}');
  }
  if ((stage.lighting?.pointLights?.length ?? 0) > 8) {
    errors.push('lighting.pointLights cannot exceed 8 (WebGL2 uniform limit)');
  }
  if (!stage.atmosphere || !isVec(stage.atmosphere.fogColor, 3)) {
    errors.push('atmosphere.fogColor must be [r, g, b]');
  }
  if (!stage.postProcess || !isVec(stage.postProcess.grade, 3)) {
    errors.push('postProcess.grade must be [r, g, b]');
  }
  return { valid: errors.length === 0, errors };
}

export function cloneStage(stage) {
  return JSON.parse(JSON.stringify(stage));
}

export function normalizeStage(raw) {
  const s = cloneStage(raw);
  s.schemaVersion = '1.0.0';
  s.geometry = s.geometry ?? {};
  s.geometry.floors = s.geometry.floors ?? [];
  s.geometry.boxes = s.geometry.boxes ?? [];
  s.geometry.slopes = s.geometry.slopes ?? [];
  s.geometry.props = s.geometry.props ?? [];
  s.geometry.cutouts = s.geometry.cutouts ?? [];
  s.geometry.externalModels = s.geometry.externalModels ?? [];
  s.backdrop = s.backdrop ?? {};
  s.atlas = s.atlas ?? { normalStrength: 2.2 };
  s.lighting = s.lighting ?? {};
  s.lighting.pointLights = (s.lighting.pointLights ?? []).slice(0, 8);
  s.lighting.lightRays = s.lighting.lightRays ?? [];
  s.anchors = s.anchors ?? [];
  s.gameplay = s.gameplay ?? { gridSize: 1.0, walkableCells: [], triggers: [] };
  return s;
}
