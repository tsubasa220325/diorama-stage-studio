#!/usr/bin/env node
// Exports all built-in presets to static presets/json/*.diorama.json files for direct URL loading
// from Rhysmodia Web (?stage=https://...), Unity, Godot, or Three.js with 0 MB Mac storage.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStage } from '../core/validator.js';
import { PRESETS } from '../presets/index.js';

const outDir = fileURLToPath(new URL('../presets/json/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const manifest = [];
for (const preset of PRESETS) {
  const check = validateStage(preset);
  if (!check.valid) throw new Error(`Preset ${preset.meta.id} invalid: ${check.errors.join(', ')}`);
  const filename = `${preset.meta.id}.diorama.json`;
  writeFileSync(join(outDir, filename), JSON.stringify(preset, null, 2) + '\n', 'utf8');
  manifest.push({
    id: preset.meta.id,
    name: preset.meta.name,
    preset: preset.meta.preset,
    aspect: preset.meta.aspect,
    file: filename,
  });
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ version: '1.0.0', stages: manifest }, null, 2) + '\n', 'utf8');
console.log(`Exported ${manifest.length} static stage JSON presets to ${outDir}`);
