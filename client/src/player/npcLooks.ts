import type { NpcLook } from './NpcCharacter.js';

/**
 * WHO WALKS THE STREETS OF PALMHAVEN: twelve residents and tourists (the
 * server picks one by index for fares, suspects, patients, customers and
 * pedestrians) and the uniformed staff behind every counter. Outfits use the
 * details `NpcSkin` paints: collar, buttons, stripes, vest, apron, overalls,
 * belt, sash and badge.
 */

// Skin tones, light to deep.
const SKIN = [0xf6d2b0, 0xf2c8a0, 0xe8b890, 0xd8a070, 0xc8905a, 0xa86a3e, 0x8a5430, 0x6a3e22, 0x4e2c18] as const;

/** Exactly 12 varied Palmhaven residents and tourists, picked by index 0..11. */
export const NPC_LOOK_LIST: readonly NpcLook[] = [
  // 0. Tourist in a loud floral shirt, a bucket hat and shades.
  {
    outfit: {
      skin: SKIN[0],
      hair: 0x6a3a1a,
      shirt: 0x2ec4b6,
      pants: 0xe8d8b0,
      shoes: 0x8a5a2a,
      details: [
        { kind: 'stripes', color: 0xff70a6, every: 1 },
        { kind: 'collar', color: 0xffffff },
        { kind: 'buttons', color: 0xffffff },
      ],
    },
    hat: 'bucket',
    hatColor: 0xf3dfa2,
    trim: 0x2ec4b6,
    glasses: true,
  },
  // 1. Surfer: bare-chested, bleached hair, board shorts, a shell necklace.
  {
    outfit: {
      skin: SKIN[3],
      hair: 0xf0d070,
      shirt: SKIN[3],
      pants: 0xff9f1c,
      shoes: SKIN[3],
      details: [{ kind: 'collar', color: 0xfff4e0 }],
    },
    hat: 'none',
    hatColor: 0,
  },
  // 2. Businesswoman in a navy blazer over a white blouse.
  {
    outfit: {
      skin: SKIN[6],
      hair: 0x1a1a1a,
      shirt: 0xffffff,
      sleeves: 0x2a3a5a,
      pants: 0x2a3a5a,
      shoes: 0x1a1a1a,
      details: [
        { kind: 'vest', color: 0x2a3a5a, button: 0xffcf33 },
        { kind: 'badge', color: 0xffcf33 },
      ],
    },
    hat: 'none',
    hatColor: 0,
  },
  // 3. Retiree in a mint polo, cream slacks and a white visor.
  {
    outfit: {
      skin: SKIN[1],
      hair: 0xd8d8d8,
      shirt: 0xa8e6cf,
      pants: 0xf3e9d2,
      shoes: 0xffffff,
      details: [
        { kind: 'collar', color: 0xffffff },
        { kind: 'buttons', color: 0xffffff },
      ],
    },
    hat: 'visor',
    hatColor: 0xffffff,
    trim: 0x7ad3ff,
    glasses: true,
  },
  // 4. Jogger in a hot-pink tank top and a white cap.
  {
    outfit: {
      skin: SKIN[7],
      hair: 0x1a1a1a,
      shirt: 0xff3d7f,
      sleeves: SKIN[7],
      pants: 0x222831,
      shoes: 0x2ec4b6,
      details: [{ kind: 'collar', color: 0xffffff }],
    },
    hat: 'cap',
    hatColor: 0xffffff,
    trim: 0xff3d7f,
  },
  // 5. Beach-goer in a yellow tank top under a wide straw hat.
  {
    outfit: {
      skin: SKIN[4],
      hair: 0x8a3a1a,
      shirt: 0xffd23f,
      sleeves: SKIN[4],
      pants: 0x3a86ff,
      shoes: 0xff70a6,
      details: [],
    },
    hat: 'beach',
    hatColor: 0xf3dfa2,
    trim: 0xff70a6,
    glasses: true,
  },
  // 6. Student in a purple hoodie and jeans, a backpack on.
  {
    outfit: {
      skin: SKIN[2],
      hair: 0x3a2a1a,
      shirt: 0x7b5cd6,
      pants: 0x3a4a6a,
      shoes: 0xffffff,
      details: [
        { kind: 'collar', color: 0x5a3cb6 },
        { kind: 'badge', color: 0xffd23f },
      ],
    },
    hat: 'none',
    hatColor: 0,
    pack: 'backpack',
  },
  // 7. Artist: pink hair, a red beanie, a paint-spattered apron.
  {
    outfit: {
      skin: SKIN[5],
      hair: 0xff70a6,
      shirt: 0xfff4e0,
      pants: 0x3a3a3a,
      shoes: 0x2a2a2a,
      details: [
        { kind: 'stripes', color: 0x1a1a1a, every: 1 },
        { kind: 'apron', color: 0x5a8ac8, pocket: 0xffd23f },
      ],
    },
    hat: 'beanie',
    hatColor: 0xd7263d,
    trim: 0xd7263d,
  },
  // 8. Fisherman: yellow waders over a blue shirt, a grey beard, an olive bucket hat.
  {
    outfit: {
      skin: SKIN[3],
      hair: 0x8a8a8a,
      shirt: 0x3a6a8a,
      pants: 0xe0c040,
      shoes: 0x3a3a3a,
      details: [{ kind: 'overalls', color: 0xe0c040, button: 0x3a3a3a }],
    },
    hat: 'bucket',
    hatColor: 0x6a7a4a,
    beard: 0x9a9a9a,
  },
  // 9. Skater: a black graphic tee, red shoes, an orange cap.
  {
    outfit: {
      skin: SKIN[0],
      hair: 0xd89a3a,
      shirt: 0x1a1a1a,
      pants: 0x5a6a8a,
      shoes: 0xd7263d,
      details: [
        { kind: 'badge', color: 0xff3d3d },
        { kind: 'stripes', color: 0x3a3a3a, every: 3 },
      ],
    },
    hat: 'cap',
    hatColor: 0xff9f1c,
  },
  // 10. Hip dad: salmon camp shirt, khaki shorts, a navy cap and shades.
  {
    outfit: {
      skin: SKIN[8],
      hair: 0x1a1a1a,
      shirt: 0xf3a76b,
      pants: 0xd8c8a8,
      shoes: 0xffffff,
      details: [
        { kind: 'collar', color: 0xffffff },
        { kind: 'buttons', color: 0xffffff },
        { kind: 'belt', color: 0x5a3a22, buckle: 0xc0c4cc },
      ],
    },
    hat: 'cap',
    hatColor: 0x1d3557,
    trim: 0xe63946,
    beard: 0x1a1a1a,
    glasses: true,
  },
  // 11. Glam shopper: all pink and gold, a white sun hat, big shades.
  {
    outfit: {
      skin: SKIN[1],
      hair: 0xf0d070,
      shirt: 0xff70a6,
      pants: 0xffffff,
      shoes: 0xffcf33,
      details: [
        { kind: 'sash', color: 0xffcf33 },
        { kind: 'belt', color: 0xffcf33, buckle: 0xffffff },
      ],
    },
    hat: 'sunhat',
    hatColor: 0xffffff,
    trim: 0xff3d7f,
    glasses: true,
  },
];

type StaffRole = 'cashier' | 'cook' | 'nurse' | 'doctor' | 'officer' | 'clerk' | 'mechanic' | 'lifeguard' | 'pilot' | 'captain' | 'banker' | 'firefighter';

/** Uniformed staff for shops and services. */
export const STAFF_LOOKS: Readonly<Record<StaffRole, NpcLook>> = {
  cashier: {
    outfit: {
      skin: SKIN[2],
      hair: 0x3a2a1a,
      shirt: 0x2ecc71,
      pants: 0x2a2a2a,
      shoes: 0x1a1a1a,
      details: [
        { kind: 'apron', color: 0xffffff, pocket: 0x2ecc71 },
        { kind: 'badge', color: 0xffd23f },
      ],
    },
    hat: 'visor',
    hatColor: 0x2ecc71,
    trim: 0x1f9a54,
  },
  cook: {
    outfit: {
      skin: SKIN[4],
      hair: 0x1a1a1a,
      shirt: 0xffffff,
      pants: 0x2a2a2a,
      shoes: 0x1a1a1a,
      details: [
        { kind: 'collar', color: 0xe8e8e8 },
        { kind: 'buttons', color: 0x2a2a2a },
        { kind: 'apron', color: 0x2a2a2a, pocket: 0x3a3a3a },
      ],
    },
    hat: 'chef',
    hatColor: 0xffffff,
  },
  nurse: {
    outfit: {
      skin: SKIN[5],
      hair: 0x1a1a1a,
      shirt: 0x7ad3ff,
      pants: 0x7ad3ff,
      shoes: 0xffffff,
      details: [
        { kind: 'collar', color: 0x4aa3d8 },
        { kind: 'badge', color: 0xffffff },
      ],
    },
    hat: 'nurse',
    hatColor: 0xffffff,
    trim: 0xe03c3c,
  },
  doctor: {
    outfit: {
      skin: SKIN[1],
      hair: 0x6a6a6a,
      shirt: 0x8ab8e8,
      sleeves: 0xffffff,
      pants: 0x3a3f4a,
      shoes: 0x1a1a1a,
      details: [
        { kind: 'vest', color: 0xffffff, button: 0xd8d8d8 },
        { kind: 'collar', color: 0x2a3a6a },
        { kind: 'badge', color: 0x2ec4b6 },
      ],
    },
    hat: 'none',
    hatColor: 0,
  },
  officer: {
    outfit: {
      skin: SKIN[6],
      hair: 0x1a1a1a,
      shirt: 0x1d2b4f,
      pants: 0x1d2b4f,
      shoes: 0x111111,
      details: [
        { kind: 'buttons', color: 0xffcf33 },
        { kind: 'badge', color: 0xffcf33 },
        { kind: 'belt', color: 0x111111, buckle: 0xc0c4cc },
      ],
    },
    hat: 'police',
    hatColor: 0x1d2b4f,
    glasses: true,
  },
  clerk: {
    outfit: {
      skin: SKIN[0],
      hair: 0x8a3a1a,
      shirt: 0xffffff,
      pants: 0x2a2a3a,
      shoes: 0x1a1a1a,
      details: [
        { kind: 'vest', color: 0xd7263d, button: 0xffffff },
        { kind: 'badge', color: 0xffd23f },
      ],
    },
    hat: 'none',
    hatColor: 0,
  },
  mechanic: {
    outfit: {
      skin: SKIN[3],
      hair: 0x3a2a1a,
      shirt: 0x9aa0a8,
      pants: 0x3a5a8a,
      shoes: 0x2a2a2a,
      details: [
        { kind: 'overalls', color: 0x3a5a8a, button: 0xc0c4cc },
        { kind: 'badge', color: 0xff6a00 },
      ],
    },
    hat: 'cap',
    hatColor: 0xd7263d,
    trim: 0x8a1a22,
    beard: 0x3a2a1a,
  },
  lifeguard: {
    outfit: {
      skin: SKIN[4],
      hair: 0xf0d070,
      shirt: 0xe03c3c,
      sleeves: SKIN[4],
      pants: 0xe03c3c,
      shoes: SKIN[4],
      details: [
        { kind: 'collar', color: 0xffffff },
        { kind: 'badge', color: 0xffffff },
      ],
    },
    hat: 'straw',
    hatColor: 0xf2d27a,
    trim: 0xe03c3c,
    glasses: true,
  },
  pilot: {
    outfit: {
      skin: SKIN[2],
      hair: 0x3a2a1a,
      shirt: 0xffffff,
      pants: 0x1d2b4f,
      shoes: 0x111111,
      details: [
        { kind: 'collar', color: 0x1d2b4f },
        { kind: 'badge', color: 0xffcf33 },
        { kind: 'belt', color: 0x111111, buckle: 0xffcf33 },
      ],
    },
    hat: 'pilot',
    hatColor: 0x1d2b4f,
    trim: 0xffcf33,
    glasses: true,
  },
  captain: {
    outfit: {
      skin: SKIN[2],
      hair: 0xd8d8d8,
      shirt: 0x1f2a4a,
      pants: 0x1f2a4a,
      shoes: 0x1a1a1a,
      details: [
        { kind: 'collar', color: 0xffffff },
        { kind: 'buttons', color: 0xffd23a },
        { kind: 'belt', color: 0x1a1a1a, buckle: 0xffd23a },
      ],
    },
    hat: 'captain',
    hatColor: 0x1f2a4a,
    beard: 0xe8e8e8,
  },
  banker: {
    outfit: {
      skin: SKIN[7],
      hair: 0x1a1a1a,
      shirt: 0xffffff,
      sleeves: 0x3a3f4a,
      pants: 0x3a3f4a,
      shoes: 0x1a1a1a,
      details: [
        { kind: 'vest', color: 0x3a3f4a, button: 0xc0c4cc },
        { kind: 'collar', color: 0x8a1a22 },
      ],
    },
    hat: 'none',
    hatColor: 0,
  },
  firefighter: {
    outfit: {
      skin: SKIN[2],
      hair: 0x6a3a1a,
      shirt: 0xc8a050,
      pants: 0xc8a050,
      shoes: 0x1a1a1a,
      details: [
        { kind: 'collar', color: 0xf0f060 },
        { kind: 'buttons', color: 0x3a3a3a },
        { kind: 'belt', color: 0xf0f060, buckle: 0xc0c4cc },
      ],
    },
    hat: 'hardhat',
    hatColor: 0xd7263d,
    trim: 0xffcf33,
  },
};
