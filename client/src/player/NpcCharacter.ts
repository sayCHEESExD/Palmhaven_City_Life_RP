import { CylinderGeometry, Mesh, MeshStandardMaterial, type Group } from 'three';
import type { PartBuilder } from '../render/PartBuilder.js';
import { PartBuilder as Builder } from '../render/PartBuilder.js';
import { ball, block, cone, cylinder, dome, shade } from '../models/shapes.js';
import { paintOutfit, type NpcOutfit } from './NpcSkin.js';
import { PlayerCharacter } from './PlayerCharacter.js';
import { playerModelLoader } from './PlayerModelLoader.js';

/**
 * A PALMHAVEN NPC: the Block City player model - the very same body and
 * skeleton every player wears - dressed as a resident, a tourist or shop
 * staff. The outfit is painted onto a copy of the body's atlas (`NpcSkin`),
 * and a hat, glasses, beard or pack is built from blocks and worn on the head
 * or back bone, so it breathes and turns with them. The idle animation is the
 * players' own.
 */

export type Hat =
  | 'cap'
  | 'police'
  | 'nurse'
  | 'chef'
  | 'pilot'
  | 'beach'
  | 'bucket'
  | 'beanie'
  | 'hardhat'
  | 'sunhat'
  | 'visor'
  | 'captain'
  | 'bandana'
  | 'straw'
  | 'explorer'
  | 'none';
export type Pack = 'backpack' | 'none';

export interface NpcLook {
  readonly outfit: NpcOutfit;
  readonly hat: Hat;
  readonly hatColor: number;
  /** The hat's second colour: a band, a peak, a badge, a cross. */
  readonly trim?: number;
  readonly beard?: number;
  /** Dark sunglasses. */
  readonly glasses?: boolean;
  readonly pack?: Pack;
}

const GOLD = 0xffcf33;
const RED = 0xe03c3c;
const WHITE = 0xffffff;

/** A peaked uniform cap (police, pilot): a band, a flared crown, a glossy black peak. */
const peakedCap = (b: PartBuilder, c: number): void => {
  cylinder(b, 0.58, 0.56, 0.24, c, { y: 0.46 }, 'smooth', 12);
  cylinder(b, 0.74, 0.6, 0.16, c, { y: 0.66 }, 'smooth', 12);
  cylinder(b, 0.575, 0.565, 0.07, 0x111111, { y: 0.39 }, 'smooth', 12);
  b.add(new CylinderGeometry(0.52, 0.52, 0.05, 10, 1, false, -Math.PI / 2, Math.PI), 0x111111, 'smooth', { y: 0.37, z: 0.3, rx: 0.15 });
};

/**
 * HATS, built in the head's own frame: the head is a unit cube round the
 * origin (y -0.5..0.5, the face on +Z), and the whole thing is scaled to the
 * real head.
 */
const buildHat = (b: PartBuilder, look: NpcLook): void => {
  const c = look.hatColor;
  const trim = look.trim ?? 0xd8443a;
  switch (look.hat) {
    case 'cap': {
      const peak = look.trim ?? shade(c, 0.8);
      block(b, 1.06, 0.26, 1.06, c, { y: 0.43 });
      dome(b, 0.6, c, { y: 0.54, sx: 0.88, sy: 0.55, sz: 0.88 });
      block(b, 0.94, 0.05, 0.52, peak, { y: 0.34, z: 0.74, rx: 0.12 });
      cylinder(b, 0.06, 0.06, 0.04, peak, { y: 0.87 }, 'smooth', 8);
      block(b, 0.24, 0.14, 0.02, WHITE, { y: 0.44, z: 0.535 });
      break;
    }
    case 'police': {
      const badge = look.trim ?? GOLD;
      peakedCap(b, c);
      block(b, 0.7, 0.03, 0.03, badge, { y: 0.43, z: 0.585 });
      block(b, 0.18, 0.2, 0.04, badge, { y: 0.53, z: 0.58 });
      block(b, 0.08, 0.08, 0.01, 0xfff3b0, { y: 0.53, z: 0.603, rz: Math.PI / 4 }, 'glow');
      break;
    }
    case 'pilot': {
      // Gold braid on the peak and a pair of wings on the front.
      const braid = look.trim ?? GOLD;
      peakedCap(b, c);
      block(b, 0.6, 0.04, 0.04, braid, { y: 0.4, z: 0.62, rx: 0.15 });
      block(b, 0.36, 0.06, 0.03, braid, { y: 0.53, z: 0.585 });
      ball(b, 0.06, braid, { y: 0.53, z: 0.6 }, 'smooth', 0);
      break;
    }
    case 'nurse': {
      // A folded nurse's cap perched on top, a red cross on its front.
      const cross = look.trim ?? RED;
      block(b, 0.86, 0.26, 0.42, c, { y: 0.6, z: 0.12, rx: -0.35 });
      block(b, 0.86, 0.12, 0.3, shade(c, 0.92), { y: 0.55, z: -0.12 });
      block(b, 0.18, 0.05, 0.03, cross, { y: 0.675, z: 0.325, rx: -0.35 });
      block(b, 0.05, 0.18, 0.03, cross, { y: 0.675, z: 0.325, rx: -0.35 });
      break;
    }
    case 'chef':
      cylinder(b, 0.56, 0.54, 0.32, c, { y: 0.6 }, 'smooth', 12);
      ball(b, 0.44, c, { y: 1.05 }, 'smooth', 1);
      for (let i = 0; i < 4; i += 1) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        ball(b, 0.3, shade(c, 0.95), { x: Math.sin(a) * 0.3, y: 0.92, z: Math.cos(a) * 0.3 }, 'smooth', 0);
      }
      break;
    case 'beach':
      // A wide straw hat, the outer brim drooping.
      cylinder(b, 0.9, 0.9, 0.05, c, { y: 0.5 }, 'smooth', 16);
      cylinder(b, 0.9, 1.25, 0.14, c, { y: 0.43 }, 'smooth', 16);
      cylinder(b, 0.52, 0.58, 0.36, c, { y: 0.7 }, 'smooth', 14);
      cylinder(b, 0.59, 0.59, 0.1, trim, { y: 0.58 }, 'smooth', 14);
      block(b, 0.3, 0.16, 0.06, trim, { x: 0.45, y: 0.58, z: 0.38, ry: 0.7 });
      break;
    case 'bucket':
      cylinder(b, 0.5, 0.58, 0.38, c, { y: 0.7 }, 'smooth', 12);
      cylinder(b, 0.62, 0.84, 0.14, shade(c, 0.92), { y: 0.45 }, 'smooth', 12);
      cylinder(b, 0.585, 0.59, 0.08, look.trim ?? shade(c, 0.7), { y: 0.55 }, 'smooth', 12);
      break;
    case 'beanie':
      block(b, 1.08, 0.24, 1.08, shade(c, 0.82), { y: 0.38 });
      block(b, 1.04, 0.16, 1.04, c, { y: 0.56 });
      dome(b, 0.56, c, { y: 0.62, sx: 0.95, sy: 0.6, sz: 0.95 });
      ball(b, 0.17, look.trim ?? 0xfff4e0, { y: 0.98 }, 'smooth', 0);
      break;
    case 'hardhat':
      dome(b, 0.66, c, { y: 0.36, sx: 1.08, sy: 0.8, sz: 1.08 });
      cylinder(b, 0.76, 0.76, 0.05, shade(c, 0.92), { y: 0.37 }, 'smooth', 16);
      block(b, 0.6, 0.05, 0.3, shade(c, 0.92), { y: 0.37, z: 0.78 });
      block(b, 0.16, 0.12, 1.0, shade(c, 0.9), { y: 0.84 });
      block(b, 0.22, 0.16, 0.03, look.trim ?? GOLD, { y: 0.52, z: 0.69, rx: -0.3 });
      break;
    case 'sunhat':
      cylinder(b, 1.1, 1.1, 0.07, c, { y: 0.48 }, 'smooth', 16);
      dome(b, 0.58, c, { y: 0.5 });
      cylinder(b, 0.6, 0.6, 0.12, trim, { y: 0.57 }, 'smooth', 16);
      for (let i = 0; i < 3; i += 1) ball(b, 0.12, [0xff5a8a, 0xffffff, 0xffd23a][i]!, { x: 0.52 + i * 0.05, y: 0.66 + (i % 2) * 0.1, z: 0.25 - i * 0.18 }, 'smooth', 0);
      break;
    case 'straw':
      cylinder(b, 1.05, 1.05, 0.08, c, { y: 0.5 }, 'smooth', 14);
      cylinder(b, 0.56, 0.6, 0.42, c, { y: 0.72 }, 'smooth', 14);
      cylinder(b, 0.61, 0.61, 0.12, trim, { y: 0.58 }, 'smooth', 14);
      break;
    case 'visor':
      block(b, 1.08, 0.24, 1.08, c, { y: 0.44 });
      block(b, 0.96, 0.06, 0.6, trim, { y: 0.38, z: 0.72 });
      break;
    case 'explorer':
      cylinder(b, 0.98, 0.98, 0.07, c, { y: 0.48 }, 'smooth', 14);
      cylinder(b, 0.54, 0.6, 0.46, c, { y: 0.72 }, 'smooth', 14);
      cylinder(b, 0.61, 0.61, 0.12, trim, { y: 0.55 }, 'smooth', 14);
      block(b, 0.06, 0.5, 0.2, 0xd8443a, { x: 0.6, y: 0.72, z: -0.1, rz: -0.3 });
      break;
    case 'captain':
      cylinder(b, 0.66, 0.6, 0.4, 0x1f2a4a, { y: 0.66 }, 'smooth', 14);
      cylinder(b, 0.62, 0.62, 0.08, WHITE, { y: 0.84 }, 'smooth', 14);
      block(b, 0.9, 0.06, 0.5, 0x1a1a1a, { y: 0.48, z: 0.52 });
      block(b, 0.3, 0.2, 0.04, 0xffd23a, { y: 0.66, z: 0.62 });
      break;
    case 'bandana':
      block(b, 1.08, 0.3, 1.08, c, { y: 0.4 });
      block(b, 0.34, 0.5, 0.1, c, { x: 0.25, y: 0.2, z: -0.58, rz: 0.3 });
      block(b, 0.34, 0.5, 0.1, c, { x: -0.1, y: 0.2, z: -0.6, rz: -0.25 });
      for (let i = 0; i < 4; i += 1) block(b, 0.1, 0.1, 0.02, WHITE, { x: -0.36 + i * 0.24, y: 0.42, z: 0.55 });
      break;
    case 'none':
      break;
  }
  if (look.glasses) {
    const frame = 0x15161a;
    for (const s of [-1, 1]) {
      block(b, 0.36, 0.22, 0.05, frame, { x: s * 0.22, y: 0.1, z: 0.53 });
      block(b, 0.09, 0.035, 0.01, WHITE, { x: s * 0.22 - 0.08, y: 0.15, z: 0.556, rz: 0.6 }, 'glow');
      block(b, 0.05, 0.05, 0.55, frame, { x: s * 0.505, y: 0.17, z: 0.27 });
    }
    block(b, 0.98, 0.07, 0.07, frame, { y: 0.22, z: 0.53 });
  }
  if (look.beard !== undefined) {
    block(b, 0.9, 0.34, 0.2, look.beard, { y: -0.36, z: 0.5 });
    block(b, 0.5, 0.2, 0.18, look.beard, { y: -0.58, z: 0.48 });
    block(b, 0.5, 0.1, 0.1, shade(look.beard, 0.9), { y: -0.12, z: 0.56 });
  }
};

/** A pack on the back: a rucksack with a bedroll. Built in world units round the back mount. */
const buildPack = (b: PartBuilder): void => {
  block(b, 1.1, 1.3, 0.55, 0x8a5a2a, { z: -0.1 });
  block(b, 0.8, 0.5, 0.2, 0x6a4020, { y: -0.2, z: -0.45 });
  cylinder(b, 0.26, 0.26, 1.3, 0x3a8a4a, { y: 0.8, z: -0.05, rz: Math.PI / 2 }, 'smooth', 8);
  cone(b, 0.12, 0.2, 0xffd23a, { x: 0.4, y: 0.4, z: -0.42, rx: -Math.PI / 2 }, 'smooth', 6);
};

export class NpcCharacter {
  readonly character = new PlayerCharacter();
  private readonly material: MeshStandardMaterial;

  constructor(look: NpcLook) {
    const atlas = playerModelLoader.atlasImage;
    this.material = new MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    if (atlas) this.material.map = paintOutfit(atlas, look.outfit);
    this.character.body.model.traverse((child) => {
      if ((child as Mesh).isMesh) (child as Mesh).material = this.material;
    });
    if (look.hat !== 'none' || look.beard !== undefined || look.glasses) {
      const hat = new Builder();
      buildHat(hat, look);
      this.character.wear(hat.build('npc-hat'), 'head');
    }
    if (look.pack === 'backpack') {
      const pack = new Builder();
      buildPack(pack);
      this.character.wear(pack.build('npc-pack'), 'back');
    }
  }

  get root(): Group {
    return this.character.root;
  }

  update(delta: number): void {
    this.character.update(delta);
  }

  dispose(): void {
    this.material.dispose();
    this.character.root.removeFromParent();
  }
}
