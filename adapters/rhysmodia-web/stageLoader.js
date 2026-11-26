import { toRhysmodiaRuntime } from '../../exporters/rhysmodiaAdapter.js';
import { validateStage } from '../../core/validator.js';

/**
 * Drop-in loader for Rhysmodia Web (or any pure WebGL2 game using the same diorama pipeline).
 * Fetches a stage.diorama.json file, validates it, and compiles the WebGL2 vertex buffer + biome.
 */
export async function loadRhysmodiaStage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load stage ${url}: HTTP ${res.status}`);
  const stage = await res.json();
  const check = validateStage(stage);
  if (!check.valid) {
    throw new Error(`Invalid diorama stage ${url}: ${check.errors.join('; ')}`);
  }
  return toRhysmodiaRuntime(stage);
}
