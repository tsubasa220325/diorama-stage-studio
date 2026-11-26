// Original procedural pixel-art test sprites (32x32) for public zero-asset preview.
// Users can drag & drop any local PNG/WebP sprite in-browser without uploading anything.

const PALETTES = {
  adventurer: {
    '.': null,
    'o': [20, 24, 36, 255],
    'g': [44, 198, 128, 255],
    'G': [24, 134, 88, 255],
    'c': [248, 244, 218, 255],
    'y': [246, 206, 86, 255],
    's': [248, 212, 184, 255],
    'b': [124, 78, 52, 255],
    'e': [46, 232, 168, 255],
  },
  slime_orb: {
    '.': null,
    'o': [26, 20, 46, 255],
    'p': [132, 86, 236, 255],
    'P': [84, 48, 174, 255],
    'l': [206, 174, 255, 255],
    'w': [250, 250, 255, 255],
    'y': [255, 212, 92, 255],
  },
  golem_knight: {
    '.': null,
    'o': [22, 18, 32, 255],
    'm': [164, 174, 198, 255],
    'M': [96, 106, 132, 255],
    'y': [246, 196, 78, 255],
    'r': [236, 74, 96, 255],
    'c': [126, 232, 255, 255],
  },
  npc_villager: {
    '.': null,
    'o': [26, 22, 34, 255],
    'h': [168, 104, 62, 255],
    's': [246, 210, 180, 255],
    'b': [64, 132, 214, 255],
    'B': [42, 86, 154, 255],
    'w': [242, 238, 224, 255],
    'y': [234, 186, 74, 255],
  },
  pine_tree: {
    '.': null,
    'o': [16, 30, 24, 255],
    'l': [68, 164, 96, 255],
    'd': [38, 108, 68, 255],
    'h': [124, 208, 128, 255],
    't': [114, 72, 46, 255],
    'T': [74, 44, 28, 255],
  },
};

const ART = {
  adventurer: [
    '......oooo......',
    '.....occcco.....',
    '....occcccoo....',
    '....occcycco....',
    '....oococcoo....',
    '.....osssso.....',
    '....oggggggo....',
    '...ogGgeegGgo...',
    '..ogGgccccgGgo..',
    '..oGGgccccgGGo..',
    '..oGGgyyyygGGo..',
    '...oGgccccgGo...',
    '....oGooooGo....',
    '....oob..boo....',
    '....oob..boo....',
    '....ooo..ooo....',
  ],
  slime_orb: [
    '................',
    '................',
    '.....oooooo.....',
    '...ooppppppoo...',
    '..opllpppppppo..',
    '.opllpppppppppo.',
    '.opppwopppwoppo.',
    '.opppoopppooppo.',
    'oppppppppppppppo',
    'oppppyyyyyyppppo',
    'oPPppppppppppPPo',
    'oPPPppppppppPPPo',
    '.oPPPPPPPPPPPPo.',
    '..oPPPPPPPPPPo..',
    '...oooooooooo...',
    '................',
  ],
  golem_knight: [
    '.....oyyyyo.....',
    '....oommmmoo....',
    '...omMmmmmMmo...',
    '...omoccccomo...',
    '...omMMMMMMmo...',
    '..oyymmmmmmyyo..',
    '.oMmmmmrrmmmmMo.',
    '.oMmmmrrrrmmmMo.',
    '.oMmmmmrrmmmmMo.',
    '..oMMmyyyymMMo..',
    '...oMMmmmmMMo...',
    '...oMMo..oMMo...',
    '...oMMo..oMMo...',
    '..oMMMo..oMMMo..',
    '..ooooo..ooooo..',
    '................',
  ],
  npc_villager: [
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '...ohossssoho...',
    '....osossos.....',
    '.....osssso.....',
    '....owwwwwwo....',
    '...obbbbbbbbo...',
    '...obBbyybBbo...',
    '...obBbbbbBbo...',
    '....oBbbbbBo....',
    '....oBBooBBo....',
    '....oBo..oBo....',
    '....ooo..ooo....',
    '................',
    '................',
  ],
  pine_tree: [
    '.......oo.......',
    '......ohlo......',
    '.....ohlldo.....',
    '....ohlllddo....',
    '.....oooodo.....',
    '....ohlllddo....',
    '...ohlllldddo...',
    '..ohlllllddddo..',
    '...ooooodddoo...',
    '..ohlllllddddo..',
    '.ohllllladddddo.'.replace('a', 'l'),
    '.oddddddddddddo.',
    '..oooootttoooo..',
    '......otTto.....',
    '......otTto.....',
    '.....ooooooo....',
  ],
};

export const SAMPLE_SPRITE_STYLES = Object.freeze(Object.keys(ART));

export function buildSampleSpriteRgba(style = 'adventurer') {
  const rows = ART[style] ?? ART.adventurer;
  const pal = PALETTES[style] ?? PALETTES.adventurer;
  const scale = 2;
  const w = 16 * scale;
  const h = 16 * scale;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < 16; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < 16; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const idx = ((y * scale + sy) * w + (x * scale + sx)) * 4;
          rgba[idx] = col[0];
          rgba[idx + 1] = col[1];
          rgba[idx + 2] = col[2];
          rgba[idx + 3] = col[3];
        }
      }
    }
  }
  return { width: w, height: h, rgba };
}
