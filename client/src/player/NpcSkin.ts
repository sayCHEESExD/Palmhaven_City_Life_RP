import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';
import { PLAYER_TEXTURE_SETTINGS } from '../config/assets.js';

/**
 * AN NPC'S OUTFIT, PAINTED ONTO THE BLOCK CITY BODY.
 *
 * The player model (`player.fbx`) wears one 64x64 pixel-art atlas. Every
 * keeper in the game is that SAME model and skeleton, re-dressed by
 * repainting a copy of the atlas: the shirt, trousers, skin, hair and shoes
 * are recoloured in place (keeping the artist's shading), and role details -
 * dungarees, an apron, a waistcoat, a sash, stripes, buttons, a belt - are
 * drawn over the torso and legs. The atlas is upscaled 4x first so the
 * details can be finer than the original pixels while staying pixel art.
 *
 * Regions are rectangles in ATLAS pixels (64x64, y down), read from the
 * mesh's own UVs per bone and face direction (front = the way the body faces).
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** The body's regions on the atlas. */
export const ATLAS = {
  head: [r(1, 4, 8, 32), r(11, 20, 18, 8)],
  torso: [r(17, 29, 44, 12), r(39, 21, 14, 8), r(39, 41, 14, 8)],
  arms: [r(10, 7, 26, 12), r(30, 0, 6, 7), r(30, 19, 6, 7), r(37, 8, 26, 12), r(57, 1, 6, 7), r(57, 20, 6, 7)],
  legs: [r(7, 51, 23, 12), r(3, 38, 7, 12), r(21, 42, 7, 8), r(12, 42, 7, 8), r(32, 51, 30, 12), r(55, 43, 7, 8), r(30, 42, 7, 8)],
} as const;

export type Region = keyof typeof ATLAS;

/** A keeper's look: colours for each part, and the details drawn over them. */
export interface NpcOutfit {
  readonly skin: number;
  readonly hair: number;
  readonly shirt: number;
  /** Sleeves, when they differ from the shirt (a waistcoat over a shirt). */
  readonly sleeves?: number;
  readonly pants: number;
  readonly shoes: number;
  /** Details over the torso and legs. */
  readonly details: readonly Detail[];
}

export type Detail =
  | { readonly kind: 'overalls'; readonly color: number; readonly button: number }
  | { readonly kind: 'apron'; readonly color: number; readonly pocket?: number }
  | { readonly kind: 'vest'; readonly color: number; readonly button: number }
  | { readonly kind: 'belt'; readonly color: number; readonly buckle: number }
  | { readonly kind: 'stripes'; readonly color: number; readonly every: number }
  | { readonly kind: 'sash'; readonly color: number }
  | { readonly kind: 'buttons'; readonly color: number }
  | { readonly kind: 'collar'; readonly color: number }
  | { readonly kind: 'badge'; readonly color: number }
  | { readonly kind: 'debug' };

const SCALE = 4;

const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const lum = (r: number, g: number, b: number): number => 0.3 * r + 0.59 * g + 0.11 * b;

/** What an atlas pixel is: the painter recolours by class, keeping its shade. */
type PixelClass = 'skin' | 'hair' | 'cloth' | 'white' | 'dark' | 'none';

const classify = (r: number, g: number, b: number, a: number): PixelClass => {
  if (a < 128) return 'none';
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 20) return 'dark';
  if (r > 150 && r > g + 25 && g > b) return 'skin';
  if (max - min < 16) return max > 120 ? 'white' : 'hair';
  if (g >= r && b >= r) return 'cloth';
  return 'none';
};

/** Reference shades: the atlas's own mid-tone of each class, so a pixel's shade is its ratio to these. */
const REF = { skin: lum(0xe4, 0x96, 0x5f), cloth: lum(0x1e, 0x59, 0x54), hair: lum(0x25, 0x25, 0x25), white: lum(0xce, 0xce, 0xce) } as const;

const inRects = (rects: readonly Rect[], x: number, y: number): boolean => rects.some((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);

const regionOf = (x: number, y: number): Region | null => {
  if (inRects(ATLAS.head, x, y)) return 'head';
  if (inRects(ATLAS.torso, x, y)) return 'torso';
  if (inRects(ATLAS.arms, x, y)) return 'arms';
  if (inRects(ATLAS.legs, x, y)) return 'legs';
  return null;
};

const cache = new Map<string, CanvasTexture>();

/**
 * Paint an outfit onto a copy of the atlas and return it as a texture with
 * the player texture's own settings (nearest filtering, flipped Y). Outfits
 * are cached by value: two keepers dressed alike share one texture.
 */
export const paintOutfit = (atlas: HTMLImageElement, outfit: NpcOutfit): CanvasTexture => {
  const key = JSON.stringify(outfit);
  const hit = cache.get(key);
  if (hit) return hit;
  const src = document.createElement('canvas');
  src.width = 64;
  src.height = 64;
  const sctx = src.getContext('2d')!;
  sctx.drawImage(atlas, 0, 0, 64, 64);
  const data = sctx.getImageData(0, 0, 64, 64);
  const px = data.data;
  const debug = outfit.details.some((d) => d.kind === 'debug');
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const i = (y * 64 + x) * 4;
      const cls = classify(px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!);
      if (cls === 'none' || cls === 'dark') continue;
      const region = regionOf(x, y);
      if (debug) {
        const colors: Record<Region, number> = { head: 0xb040ff, torso: 0xff3030, arms: 0x3070ff, legs: 0xffd020 };
        const c = rgb(region ? colors[region] : 0x00ff80);
        // Stripes of shade every 4 columns, so faces can be told apart.
        const k = region === 'torso' || region === 'legs' ? (Math.floor(x / 4) % 2 ? 0.7 : 1) : 1;
        px[i] = c[0] * k;
        px[i + 1] = c[1] * k;
        px[i + 2] = c[2] * k;
        continue;
      }
      const shadeOf = (ref: number): number => Math.max(0.55, Math.min(1.35, lum(px[i]!, px[i + 1]!, px[i + 2]!) / ref));
      let target: number | null = null;
      let ratio = 1;
      if (cls === 'skin') {
        target = outfit.skin;
        ratio = shadeOf(REF.skin);
      } else if (cls === 'hair' && region === 'head') {
        target = outfit.hair;
        ratio = shadeOf(REF.hair);
      } else if (cls === 'cloth') {
        target = region === 'legs' ? outfit.pants : region === 'arms' ? (outfit.sleeves ?? outfit.shirt) : outfit.shirt;
        ratio = shadeOf(REF.cloth);
      } else if (cls === 'white' && region === 'legs') {
        // The trainers: the legs' white pixels are all shoe (soles, toes, heels).
        target = outfit.shoes;
        ratio = shadeOf(REF.white);
      } else if (cls === 'white' && region === 'torso') {
        target = outfit.shirt;
        ratio = 1.15;
      } else if (cls === 'white' && region === 'arms') {
        target = outfit.sleeves ?? outfit.shirt;
        ratio = 1.15;
      }
      if (target === null) continue;
      const c = rgb(target);
      // Pale cloth keeps its brightness: shade it gently.
      if (lum(c[0], c[1], c[2]) > 200) ratio = 1 + (ratio - 1) * 0.35;
      px[i] = Math.min(255, c[0] * ratio);
      px[i + 1] = Math.min(255, c[1] * ratio);
      px[i + 2] = Math.min(255, c[2] * ratio);
    }
  }
  sctx.putImageData(data, 0, 0);
  // Upscale 4x (nearest), then draw the role details at the finer grain.
  const out = document.createElement('canvas');
  out.width = 64 * SCALE;
  out.height = 64 * SCALE;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  if (!debug) for (const detail of outfit.details) drawDetail(ctx, detail);
  const texture = new CanvasTexture(out);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = PLAYER_TEXTURE_SETTINGS.flipY;
  texture.generateMipmaps = false;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
};

// ------------------------------------------------------------ details

/** The faces the details are drawn on, in atlas pixels (read from the mesh's UVs). */
export const FACES = {
  torsoFront: r(39, 29, 14, 12),
  torsoBack: r(17, 29, 14, 12),
  torsoLeft: r(53, 29, 8, 12),
  torsoRight: r(31, 29, 8, 12),
  legFrontL: r(3, 38, 7, 12),
  legFrontR: r(55, 51, 7, 12),
} as const;

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

const fill = (ctx: CanvasRenderingContext2D, color: number, x: number, y: number, w: number, h: number): void => {
  ctx.fillStyle = hex(color);
  ctx.fillRect(Math.round(x * SCALE), Math.round(y * SCALE), Math.round(w * SCALE), Math.round(h * SCALE));
};

const drawDetail = (ctx: CanvasRenderingContext2D, detail: Detail): void => {
  const t = FACES.torsoFront;
  const back = FACES.torsoBack;
  switch (detail.kind) {
    case 'overalls': {
      // A bib on the chest, straps over the shoulders (front and back), two buttons.
      fill(ctx, detail.color, t.x + 3, t.y + 4, t.w - 6, t.h - 4);
      fill(ctx, detail.color, t.x + 2, t.y, 1.5, t.h);
      fill(ctx, detail.color, t.x + t.w - 3.5, t.y, 1.5, t.h);
      fill(ctx, detail.button, t.x + 2.25, t.y + 4, 1, 1);
      fill(ctx, detail.button, t.x + t.w - 3.25, t.y + 4, 1, 1);
      fill(ctx, detail.color, back.x + 2, back.y, 1.5, back.h);
      fill(ctx, detail.color, back.x + back.w - 3.5, back.y, 1.5, back.h);
      fill(ctx, detail.color, t.x + 4, t.y + 6, t.w - 8, 1.5);
      break;
    }
    case 'apron': {
      fill(ctx, detail.color, t.x + 2.5, t.y + 1.5, t.w - 5, t.h - 1.5);
      fill(ctx, detail.color, t.x + 1.5, t.y, 1, 2);
      fill(ctx, detail.color, t.x + t.w - 2.5, t.y, 1, 2);
      if (detail.pocket !== undefined) fill(ctx, detail.pocket, t.x + 4.5, t.y + 5.5, t.w - 9, 2.5);
      for (const leg of [FACES.legFrontL, FACES.legFrontR]) fill(ctx, detail.color, leg.x, leg.y, leg.w, 4);
      break;
    }
    case 'vest': {
      fill(ctx, detail.color, t.x, t.y, 4.5, t.h);
      fill(ctx, detail.color, t.x + t.w - 4.5, t.y, 4.5, t.h);
      fill(ctx, detail.color, back.x, back.y, back.w, back.h);
      fill(ctx, detail.color, FACES.torsoLeft.x, FACES.torsoLeft.y, FACES.torsoLeft.w, FACES.torsoLeft.h);
      fill(ctx, detail.color, FACES.torsoRight.x, FACES.torsoRight.y, FACES.torsoRight.w, FACES.torsoRight.h);
      for (let i = 0; i < 3; i += 1) fill(ctx, detail.button, t.x + 3.6, t.y + 2 + i * 2.5, 0.8, 0.8);
      break;
    }
    case 'belt': {
      for (const face of [t, back, FACES.torsoLeft, FACES.torsoRight]) fill(ctx, detail.color, face.x, face.y + face.h - 1.5, face.w, 1.5);
      fill(ctx, detail.buckle, t.x + t.w / 2 - 1, t.y + t.h - 1.75, 2, 2);
      break;
    }
    case 'stripes': {
      for (let y = 0; y < t.h; y += detail.every * 2) {
        for (const face of [t, back, FACES.torsoLeft, FACES.torsoRight]) fill(ctx, detail.color, face.x, face.y + y, face.w, detail.every);
      }
      break;
    }
    case 'sash': {
      for (let i = 0; i < t.h; i += 0.5) fill(ctx, detail.color, t.x + (i / t.h) * (t.w - 3), t.y + i, 3, 0.75);
      break;
    }
    case 'buttons': {
      for (let i = 0; i < 4; i += 1) fill(ctx, detail.color, t.x + t.w / 2 - 0.4, t.y + 1.5 + i * 2.2, 0.8, 0.8);
      break;
    }
    case 'collar': {
      fill(ctx, detail.color, t.x + 3, t.y, t.w - 6, 1.2);
      fill(ctx, detail.color, t.x + t.w / 2 - 1.5, t.y + 1.2, 3, 1);
      break;
    }
    case 'badge': {
      fill(ctx, detail.color, t.x + t.w - 4.5, t.y + 2, 2, 2);
      break;
    }
    case 'debug':
      break;
  }
};
