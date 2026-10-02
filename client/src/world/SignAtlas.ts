import { BufferAttribute, BufferGeometry, CanvasTexture, LinearMipmapLinearFilter, Mesh, SRGBColorSpace } from 'three';
import { isMobileGpu } from '../config/device.js';
import { signMaterial } from './materials.js';

/**
 * EVERY SIGN IN TOWN ON ONE TEXTURE.
 *
 * Hotel names in neon script, shop fascias, CITY HALL in deco capitals: all
 * drawn once into a single canvas atlas, so a hundred signs are one texture
 * and - with `SignBuilder` - one draw call per chunk.
 */

export type SignStyle = 'neon' | 'fascia' | 'deco' | 'board' | 'street';

export interface SignSpec {
  readonly text: string;
  readonly style: SignStyle;
  /** Text colour, and the panel colour for fascias and boards. */
  readonly fg: string;
  readonly bg?: string;
}

export interface SignSlot {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
  /** Width / height of the drawn sign. */
  readonly aspect: number;
}

const FONTS: Record<SignStyle, string> = {
  neon: '"Pacifico", "Grandstander", cursive',
  fascia: '"Fredoka", "Nunito", sans-serif',
  deco: '"Righteous", "Fredoka", sans-serif',
  board: '"Grandstander", "Fredoka", sans-serif',
  street: '"Nunito", "Fredoka", sans-serif',
};

export class SignAtlas {
  readonly texture: CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly size: number;
  private readonly rowHeight: number;
  private cursorX = 0;
  private cursorY = 0;
  private readonly cache = new Map<string, SignSlot>();

  constructor() {
    this.size = isMobileGpu() ? 1024 : 2048;
    this.rowHeight = this.size / 16;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.anisotropy = 4;
  }

  /** Draw a sign (once per distinct spec) and return where it is. */
  slot(spec: SignSpec): SignSlot {
    const key = `${spec.style}|${spec.fg}|${spec.bg ?? ''}|${spec.text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const ctx = this.ctx;
    const h = this.rowHeight;
    const pad = h * 0.16;
    const fontSize = spec.style === 'neon' ? h * 0.56 : h * 0.6;
    ctx.font = `${spec.style === 'fascia' || spec.style === 'street' ? 700 : 400} ${fontSize}px ${FONTS[spec.style]}`;
    const textWidth = Math.min(this.size - pad * 2, ctx.measureText(spec.text).width);
    const w = Math.ceil(textWidth + pad * 2.4);
    if (this.cursorX + w > this.size) {
      this.cursorX = 0;
      this.cursorY += h;
    }
    if (this.cursorY + h > this.size) {
      // Out of room: reuse the first slot rather than fail.
      return this.cache.values().next().value ?? { u0: 0, v0: 0, u1: 0.01, v1: 0.01, aspect: 1 };
    }
    const x = this.cursorX;
    const y = this.cursorY;
    this.cursorX += w + 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.clearRect(0, 0, w, h);
    if (spec.bg && spec.style !== 'neon') {
      ctx.fillStyle = spec.bg;
      const r = h * 0.18;
      ctx.beginPath();
      ctx.roundRect(1, 2, w - 2, h - 4, r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = h * 0.04;
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${spec.style === 'fascia' || spec.style === 'street' ? 700 : 400} ${fontSize}px ${FONTS[spec.style]}`;
    if (spec.style === 'neon') {
      ctx.shadowColor = spec.fg;
      ctx.shadowBlur = h * 0.14;
      ctx.lineWidth = h * 0.05;
      ctx.strokeStyle = spec.fg;
      ctx.strokeText(spec.text, w / 2, h * 0.52, w - pad * 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(spec.text, w / 2, h * 0.52, w - pad * 2);
    } else {
      ctx.lineJoin = 'round';
      if (spec.style === 'board' || spec.style === 'deco') {
        ctx.lineWidth = h * 0.08;
        ctx.strokeStyle = 'rgba(20, 24, 40, 0.55)';
        ctx.strokeText(spec.text, w / 2, h * 0.54, w - pad * 2);
      }
      ctx.fillStyle = spec.fg;
      ctx.fillText(spec.text, w / 2, h * 0.54, w - pad * 2);
    }
    ctx.restore();
    this.texture.needsUpdate = true;
    const slot: SignSlot = { u0: x / this.size, v0: 1 - (y + h) / this.size, u1: (x + w) / this.size, v1: 1 - y / this.size, aspect: w / h };
    this.cache.set(key, slot);
    return slot;
  }
}

/** Sign quads (faces with atlas UVs), merged into one mesh. */
export class SignBuilder {
  private readonly position: number[] = [];
  private readonly normal: number[] = [];
  private readonly uv: number[] = [];

  constructor(private readonly atlas: SignAtlas) {}

  get empty(): boolean {
    return this.position.length === 0;
  }

  /**
   * A sign of height `h` centred at (x, y, z), facing the yaw `rot` (its
   * front looks along (sin rot, cos rot)). Width follows the text; `maxW`
   * caps it. `vertical` stands the text on its side (deco blade signs).
   */
  add(spec: SignSpec, x: number, y: number, z: number, rot: number, h: number, maxW = Infinity, vertical = false): void {
    const slot = this.atlas.slot(spec);
    let width = h * slot.aspect;
    let height = h;
    if (width > maxW) {
      height *= maxW / width;
      width = maxW;
    }
    const fx = Math.sin(rot);
    const fz = Math.cos(rot);
    // Right of the viewer looking at the sign = left of the sign's facing.
    const rx = fz;
    const rz = -fx;
    const hw = (vertical ? height : width) / 2;
    const hh = (vertical ? width : height) / 2;
    const o = 0.02;
    const cx = x + fx * o;
    const cz = z + fz * o;
    const corners: [number, number, number][] = [
      [cx - rx * hw, y - hh, cz - rz * hw],
      [cx + rx * hw, y - hh, cz + rz * hw],
      [cx + rx * hw, y + hh, cz + rz * hw],
      [cx - rx * hw, y + hh, cz - rz * hw],
    ];
    const uvs: [number, number][] = vertical
      ? [
          [slot.u0, slot.v0],
          [slot.u0, slot.v1],
          [slot.u1, slot.v1],
          [slot.u1, slot.v0],
        ]
      : [
          [slot.u0, slot.v0],
          [slot.u1, slot.v0],
          [slot.u1, slot.v1],
          [slot.u0, slot.v1],
        ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const c = corners[i]!;
      this.position.push(c[0], c[1], c[2]);
      this.normal.push(fx, 0, fz);
      this.uv.push(uvs[i]![0], uvs[i]![1]);
    }
  }

  build(name: string): Mesh | null {
    if (this.empty) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.normal), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, signMaterial(this.atlas.texture));
    mesh.name = name;
    return mesh;
  }
}
