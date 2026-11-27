import { toRhysmodiaRuntime } from '../../exporters/rhysmodiaAdapter.js';
import { validateStage } from '../../core/validator.js';

async function decodeImage(url) {
  if (!url || typeof Image === 'undefined') return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/**
 * Drop-in loader for Rhysmodia Web (or any pure WebGL2 game using the v0.7.0 diorama pipeline).
 * Fetches stage.diorama.json, validates it, compiles WebGL2 buffers + biome,
 * and optionally preloads external backdrop, PBR atlas, and 2.5D cutout images.
 */
export async function loadRhysmodiaStage(url, options = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load stage ${url}: HTTP ${res.status}`);
  const stage = await res.json();
  const check = validateStage(stage);
  if (!check.valid) {
    throw new Error(`Invalid diorama stage ${url}: ${check.errors.join('; ')}`);
  }
  const runtime = toRhysmodiaRuntime(stage);
  if (options.preloadAssets !== false && typeof Image !== 'undefined') {
    const base = options.assetBaseUrl ?? '';
    const resolveUrl = p => (!p ? null : /^https?:\/\//i.test(p) ? p : `${base}${p}`);
    const jobs = [];
    if (runtime.biome.bgImageUrl) {
      jobs.push(decodeImage(resolveUrl(runtime.biome.bgImageUrl)).then(img => { runtime.bgImage = img; }));
    }
    if (runtime.biome.atlasImageUrl) {
      jobs.push(decodeImage(resolveUrl(runtime.biome.atlasImageUrl)).then(img => { runtime.atlasImage = img; }));
    }
    for (const c of runtime.cutouts ?? []) {
      if (c.imageUrl) {
        jobs.push(decodeImage(resolveUrl(c.imageUrl)).then(img => { c.image = img; }));
      }
    }
    if (jobs.length) await Promise.all(jobs);
  }
  return runtime;
}
