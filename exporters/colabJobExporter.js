/**
 * Exports a Google Colab GPU batch job JSON compatible with commercial-safe
 * open models (FLUX.2-klein-4B / Z-Image-Turbo, Apache-2.0) to offload heavy
 * backdrop and pixel-tile texture generation to cloud GPUs (0 MB Mac storage).
 */
export function buildColabStageJob(stage) {
  const id = stage.meta?.id ?? 'stage';
  const name = stage.meta?.name ?? id;
  const aspect = stage.meta?.aspect ?? [4, 3];
  const isWide = aspect[0] / aspect[1] > 1.5;
  const width = isWide ? 1280 : 960;
  const height = isWide ? 720 : 720;
  const tags = (stage.meta?.tags ?? []).join(', ');
  const keyHex = rgbToDesc(stage.lighting?.keyLight?.color ?? [1, 0.85, 0.65]);
  const fogHex = rgbToDesc(stage.atmosphere?.fogColor ?? [0.1, 0.08, 0.18]);

  return {
    batch_name: `diorama_stage_${id}`,
    generated_by: 'Diorama Stage Studio v0.1.0',
    commercial_policy: 'Apache-2.0 only (FLUX.2-klein-4B / Z-Image-Turbo)',
    auto_disconnect_when_done: true,
    jobs: [
      {
        id: `${id}_backdrop`,
        model: 'flux2_klein_4b',
        width,
        height,
        steps: 4,
        guidance: 1.0,
        seed: 4201,
        prompt: `Crisp 32-bit pixel art architectural background vista for a 2.5D diorama game stage (${name}, ${tags}). Atmospheric ${keyHex} key lighting and ${fogHex} deep mist, clean center horizon clear of characters or UI, rich miniature stone and architectural depth, sharp pixel edges, no text, no watermark.`,
        output_filename: `hd_bg_${id}.webp`,
      },
      {
        id: `${id}_tile_floor`,
        model: 'flux2_klein_4b',
        width: 512,
        height: 512,
        steps: 4,
        guidance: 1.0,
        seed: 4202,
        prompt: `Seamless top-down 32-bit pixel art floor tile texture matching "${name}", crisp bevels, subtle weathering, flat even lighting for PBR normal-map generation, game-ready seamless tile, no perspective distortion, no text.`,
        output_filename: `tile_${id}_floor.png`,
      },
    ],
  };
}

function rgbToDesc([r, g, b]) {
  const hex = [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');
  return `#${hex}`;
}
