import { buildStageMesh } from '../core/meshBuilder.js';

/**
 * Converts a universal stage.diorama.json into the exact biome & mesh structures
 * consumed by Rhysmodia Web's pure WebGL2 diorama renderer (game/src/render/diorama.js).
 */
export function toRhysmodiaRuntime(stage) {
  const built = buildStageMesh(stage);
  const vistaMap = { default: 0, sunset: 1, aurora: 2, clocktower: 3, carnival: 4, belfry: 5 };
  const biome = {
    floorV: stage.backdrop?.floorV ?? 0.642,
    ambient: [...(stage.lighting?.ambient ?? [0.24, 0.18, 0.34])],
    keyDir: [...(stage.lighting?.keyLight?.dir ?? [0.22, 0.80, 0.56])],
    keyColor: [...(stage.lighting?.keyLight?.color ?? [1.0, 0.76, 0.46])],
    shadowSkew: [...(stage.lighting?.keyLight?.shadowSkew ?? [-0.32, -0.62])],
    floorGloss: stage.lighting?.floorGloss ?? 0.36,
    floorSpecTint: [...(stage.lighting?.floorSpecTint ?? [1.0, 0.70, 0.42])],
    wallShade: stage.backdrop?.wallShade ?? 0.72,
    fogColor: [...(stage.atmosphere?.fogColor ?? [0.10, 0.05, 0.18])],
    fogDensity: stage.atmosphere?.fogDensity ?? 0.068,
    bloomStrength: stage.postProcess?.bloomStrength ?? 0.42,
    dofStrength: stage.postProcess?.dofStrength ?? 0.86,
    vignette: stage.postProcess?.vignette ?? 0.48,
    grade: [...(stage.postProcess?.grade ?? [1.03, 0.99, 1.03])],
    pillarTint: [...(stage.lighting?.pillarTint ?? [0.42, 0.30, 0.58])],
    curbTint: [...(stage.lighting?.curbTint ?? [0.52, 0.38, 0.68])],
    sconceColor: [...(stage.lighting?.sconceColor ?? [1.0, 0.64, 0.22])],
    vistaStyle: vistaMap[stage.backdrop?.vistaStyle] ?? 0,
    artFirst: Boolean(stage.backdrop?.artFirst),
    bgImageUrl: typeof stage.backdrop?.imageUrl === 'string' && stage.backdrop.imageUrl.trim() ? stage.backdrop.imageUrl.trim() : null,
    atlasImageUrl: typeof stage.atlas?.imageUrl === 'string' && stage.atlas.imageUrl.trim() ? stage.atlas.imageUrl.trim() : null,
    animPivot: [...(built.animPivot ?? [0, 0, 0, 0])],
    moteColor: [...(stage.atmosphere?.particles?.primary ?? [1.0, 0.78, 0.36])],
    moteSecondary: [...(stage.atmosphere?.particles?.secondary ?? [0.78, 0.46, 1.0])],
    moteRise: stage.atmosphere?.particles?.rise ?? 0.24,
    lights: (stage.lighting?.pointLights ?? []).slice(0, 8).map(l => ({
      x: l.pos[0],
      y: l.pos[1],
      z: l.pos[2],
      color: [...l.color],
      intensity: l.intensity,
      radius: l.radius,
      flicker: l.flicker ?? 0,
      phase: l.phase ?? 0,
    })),
    rays: (stage.lighting?.lightRays ?? []).map(r => ({
      topX: r.top[0],
      topY: r.top[1],
      botX: r.bot[0],
      botY: r.bot[1],
      z: r.z,
      width: r.width,
      color: [...r.color],
      alpha: r.alpha,
    })),
  };

  const cutouts = (stage.geometry?.cutouts ?? []).filter(c => !c.hidden).map(c => ({
    id: c.id ?? 'cutout',
    imageUrl: typeof c.imageUrl === 'string' && c.imageUrl.trim() ? c.imageUrl.trim() : null,
    pos: [...(c.pos ?? [0, 0, -2.6])],
    size: [...(c.size ?? [1.6, 2.4])],
    pivotUv: [...(c.pivotUv ?? [0.5, 1.0])],
    beatAnim: c.beatAnim ?? '',
    swingAmp: c.swingAmp ?? 0.36,
    phase: c.phase ?? 0,
    castShadow: c.castShadow !== false,
    emissive: Boolean(c.emissive),
    brightness: c.brightness ?? 1.0,
    dofBoost: c.dofBoost ?? 0,
  }));

  return {
    id: stage.meta?.id ?? 'custom_stage',
    biome,
    meshData: built.data,
    vertexCount: built.vertexCount,
    cutouts,
  };
}
