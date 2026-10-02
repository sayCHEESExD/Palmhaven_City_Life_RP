import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { studPlastic } from './Studs.js';

/**
 * BATCHED PRIMITIVES.
 *
 * Everything drawn in code - every prop, building, pet and accessory - is a
 * pile of boxes, cylinders and cones. Drawn one mesh each, a village is
 * thousands of draw calls; merged, it is a handful. This builder collects
 * parts with a colour and a KIND and merges them into at most three meshes:
 *
 *   - 'stud'   : Roblox studded plastic (the studs drawn by the shader from
 *                world position), tinted per part by VERTEX COLOUR, so a
 *                hundred colours of studded plastic are still one material;
 *   - 'smooth' : smooth plastic, no studs (fruit, tools, trim);
 *   - 'flat'   : studded and hard-edged (flat shading) - rock, bark, canopy;
 *   - 'leaf'   : two-sided, for blades and leaves;
 *   - 'glow'   : unlit, vertex-coloured - flames, lamps, eyes.
 *
 * The three materials are shared process-wide, so two builders' meshes differ
 * only in geometry.
 */
export type PartKind = 'stud' | 'smooth' | 'glow' | 'flat' | 'leaf';

const KINDS: readonly PartKind[] = ['stud', 'smooth', 'glow', 'flat', 'leaf'];

let shared: Record<PartKind, Material> | null = null;

export const partMaterials = (): Record<PartKind, Material> => {
  if (!shared) {
    shared = {
      // Studded Roblox plastic: the studs are drawn by the shader from world position.
      stud: studPlastic({ vertexColors: true, flatShading: true }),
      smooth: new MeshLambertMaterial({ vertexColors: true }),
      glow: new MeshBasicMaterial({ vertexColors: true, fog: false }),
      // Faceted blocks: rock, bark, bone, canopy - hard edges catch the sun.
      flat: studPlastic({ vertexColors: true, flatShading: true }),
      // Two-sided: grass blades and leaves, seen from under as well as over.
      leaf: studPlastic({ vertexColors: true, side: DoubleSide, flatShading: true }, 0.5),
    };
  }
  return shared;
};

const MATRIX = new Matrix4();
const QUAT = new Quaternion();
const EULER = new Euler();
const SCALE = new Vector3(1, 1, 1);
const POSITION = new Vector3();
const COLOR = new Color();
const HSL = { h: 0, s: 0, l: 0 };

export interface Transform {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export class PartBuilder {
  private readonly parts: Record<PartKind, BufferGeometry[]> = { stud: [], smooth: [], glow: [], flat: [], leaf: [] };

  get isEmpty(): boolean {
    return KINDS.every((kind) => this.parts[kind].length === 0);
  }

  /**
   * Add a geometry, transformed and coloured. The geometry is consumed (it
   * is transformed in place and merged), so pass a fresh one.
   */
  add(geometry: BufferGeometry, color: number | string, kind: PartKind = 'smooth', transform: Transform = {}): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    EULER.set(transform.rx ?? 0, transform.ry ?? 0, transform.rz ?? 0, 'YXZ');
    QUAT.setFromEuler(EULER);
    POSITION.set(transform.x ?? 0, transform.y ?? 0, transform.z ?? 0);
    SCALE.set(transform.sx ?? 1, transform.sy ?? 1, transform.sz ?? 1);
    MATRIX.compose(POSITION, QUAT, SCALE);
    g.applyMatrix4(MATRIX);

    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    COLOR.set(color);
    // Everything built here is Roblox plastic: colours a touch cleaner and more saturated.
    COLOR.getHSL(HSL);
    COLOR.setHSL(HSL.h, Math.min(1, HSL.s * 1.15), Math.min(0.95, HSL.l * 1.03));
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = COLOR.r;
      colors[i * 3 + 1] = COLOR.g;
      colors[i * 3 + 2] = COLOR.b;
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    this.parts[kind].push(g);
    return this;
  }

  /**
   * Add a geometry that is already coloured per vertex (painted terrain):
   * its own colours are kept, given the same plastic lift as every part.
   */
  addPainted(geometry: BufferGeometry, kind: PartKind = 'stud'): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const color = g.getAttribute('color') as BufferAttribute | undefined;
    if (!color || g.getAttribute('position').count === 0) {
      g.dispose();
      return this;
    }
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
    }
    if (!g.getAttribute('uv')) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    for (let i = 0; i < color.count; i += 1) {
      COLOR.setRGB(color.getX(i), color.getY(i), color.getZ(i));
      COLOR.getHSL(HSL);
      COLOR.setHSL(HSL.h, Math.min(1, HSL.s * 1.15), Math.min(0.95, HSL.l * 1.03));
      color.setXYZ(i, COLOR.r, COLOR.g, COLOR.b);
    }
    this.parts[kind].push(g);
    return this;
  }

  /** A box by size and centre. Studded boxes get world-scaled UVs, so studs are the same size everywhere. */
  box(w: number, h: number, d: number, color: number | string, kind: PartKind = 'stud', transform: Transform = {}): this {
    const geometry = kind === 'stud' ? studBox(w, h, d) : new BoxGeometry(w, h, d);
    return this.add(geometry, color, kind, transform);
  }

  /**
   * Take every part of another builder, moved by a transform (a model built
   * round its own origin, placed and turned): many models, one merge. The
   * other builder is left empty.
   */
  absorb(other: PartBuilder, transform: Transform = {}): this {
    EULER.set(transform.rx ?? 0, transform.ry ?? 0, transform.rz ?? 0, 'YXZ');
    QUAT.setFromEuler(EULER);
    POSITION.set(transform.x ?? 0, transform.y ?? 0, transform.z ?? 0);
    SCALE.set(transform.sx ?? 1, transform.sy ?? 1, transform.sz ?? 1);
    MATRIX.compose(POSITION, QUAT, SCALE);
    for (const kind of KINDS) {
      for (const g of other.parts[kind]) this.parts[kind].push(g.applyMatrix4(MATRIX));
      other.parts[kind] = [];
    }
    return this;
  }

  /** Merge everything added so far into this builder's meshes. */
  build(name = 'parts', castShadow = true): Group {
    const group = new Group();
    group.name = name;
    const materials = partMaterials();
    resolveCoplanar(this.parts);
    for (const kind of KINDS) {
      const list = this.parts[kind];
      if (list.length === 0) continue;
      const merged = mergeGeometries(list, false);
      for (const part of list) part.dispose();
      this.parts[kind] = [];
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, materials[kind]);
      mesh.name = `${name}-${kind}`;
      mesh.castShadow = castShadow && kind !== 'glow';
      mesh.receiveShadow = kind !== 'glow';
      group.add(mesh);
    }
    return group;
  }

  /** Merge into ONE geometry per kind without building meshes (for callers that instance or cache). */
  geometries(): Partial<Record<PartKind, BufferGeometry>> {
    const out: Partial<Record<PartKind, BufferGeometry>> = {};
    resolveCoplanar(this.parts);
    for (const kind of KINDS) {
      const list = this.parts[kind];
      if (list.length === 0) continue;
      const merged = mergeGeometries(list, false);
      for (const part of list) part.dispose();
      this.parts[kind] = [];
      if (merged) {
        merged.computeBoundingSphere();
        out[kind] = merged;
      }
    }
    return out;
  }
}

/**
 * NO Z-FIGHTING, BY CONSTRUCTION.
 *
 * Models are built from plain parts, and a trim, stripe, lens or cushion is
 * often placed with a face exactly flush with the part it sits on. Two
 * coplanar faces of different colours shimmer as the camera moves. Rather than
 * trusting every builder to offset every detail, each merge finds overlapping
 * coplanar faces from different parts and pushes the SMALLER part (the detail)
 * out by a few millimetres, so it wins the depth test at any distance - stacks
 * of details resolve over a couple of passes.
 */
const NUDGE = 0.007;
const PLANE_TOLERANCE = 0.004;
const CELL = 8;

interface PartInfo {
  readonly g: BufferGeometry;
  readonly kind: number;
  readonly color: number;
  readonly volume: number;
}

const resolveCoplanar = (parts: Record<PartKind, BufferGeometry[]>): void => {
  const infos: PartInfo[] = [];
  KINDS.forEach((kind, k) => {
    for (const g of parts[kind]) {
      const pos = g.getAttribute('position');
      if (!pos || pos.count < 3) continue;
      g.computeBoundingBox();
      const box = g.boundingBox!;
      const volume = Math.max(0.01, box.max.x - box.min.x) * Math.max(0.01, box.max.y - box.min.y) * Math.max(0.01, box.max.z - box.min.z);
      const col = g.getAttribute('color');
      // Painted parts carry many colours: never treated as matching anything.
      const uniform = col && col.count > 0 && col.getX(0) === col.getX(col.count - 1) && col.getY(0) === col.getY(col.count - 1);
      const color = uniform ? (Math.round(col.getX(0) * 255) << 16) | (Math.round(col.getY(0) * 255) << 8) | Math.round(col.getZ(0) * 255) : -1 - infos.length;
      infos.push({ g, kind: k, color, volume });
    }
  });
  if (infos.length < 2) return;
  // A nudge can land a detail exactly on another one: look again.
  for (let pass = 0; pass < 4; pass += 1) {
    // Edges from each detail to the larger parts it is flush with.
    const above = new Map<number, Set<number>>();
    const buckets = new Map<string, number[]>();
    // Triangles as flat arrays: part, then n, d, and the 2D projection.
    const triPart: number[] = [];
    const triN: number[] = [];
    const tri2: number[] = [];
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const e1 = new Vector3();
    const e2 = new Vector3();
    infos.forEach((info, p) => {
      const pos = info.g.getAttribute('position');
      for (let i = 0; i + 2 < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        e1.subVectors(b, a);
        e2.subVectors(c, a);
        e1.cross(e2);
        const len = e1.length();
        if (len < 1e-5) continue;
        e1.divideScalar(len);
        const ax = Math.abs(e1.x);
        const ay = Math.abs(e1.y);
        const az = Math.abs(e1.z);
        const axis = ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2;
        const u = axis === 0 ? 1 : 0;
        const v = axis === 2 ? 1 : 2;
        const pts = [a, b, c].map((q) => [q.getComponent(u), q.getComponent(v)] as const);
        const t = triPart.length;
        triPart.push(p);
        const d = e1.dot(a);
        const face = `${Math.round(e1.x * 60)},${Math.round(e1.y * 60)},${Math.round(e1.z * 60)}`;
        triN.push(0, d);
        tri2.push(pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1], pts[2]![0], pts[2]![1]);
        const x0 = Math.floor(Math.min(pts[0]![0], pts[1]![0], pts[2]![0]) / CELL);
        const x1 = Math.floor(Math.max(pts[0]![0], pts[1]![0], pts[2]![0]) / CELL);
        const y0 = Math.floor(Math.min(pts[0]![1], pts[1]![1], pts[2]![1]) / CELL);
        const y1 = Math.floor(Math.max(pts[0]![1], pts[1]![1], pts[2]![1]) / CELL);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) continue;
        const slab = Math.round(d / PLANE_TOLERANCE);
        for (let cx = x0; cx <= x1; cx += 1) {
          for (let cy = y0; cy <= y1; cy += 1) {
            const key = `${face}|${slab}|${cx}|${cy}`;
            const list = buckets.get(key);
            if (list) list.push(t);
            else buckets.set(key, [t]);
          }
        }
      }
    });
    const poly = (t: number): [number, number][] => [
      [tri2[t * 6]!, tri2[t * 6 + 1]!],
      [tri2[t * 6 + 2]!, tri2[t * 6 + 3]!],
      [tri2[t * 6 + 4]!, tri2[t * 6 + 5]!],
    ];
    const checked = new Set<string>();
    for (const [key, list] of buckets) {
      const [face, slab, cx, cy] = key.split('|');
      const next = buckets.get(`${face}|${Number(slab) + 1}|${cx}|${cy}`) ?? [];
      const pool = next.length > 0 ? list.concat(next) : list;
      if (pool.length > 2000) continue;
      for (let i = 0; i < list.length; i += 1) {
        const t = list[i]!;
        const pt = triPart[t]!;
        for (let j = i + 1; j < pool.length; j += 1) {
          const s = pool[j]!;
          const ps = triPart[s]!;
          if (ps === pt) continue;
          const A = infos[pt]!;
          const B = infos[ps]!;
          if (A.color === B.color && A.kind === B.kind) continue;
          if (Math.abs(triN[t * 2 + 1]! - triN[s * 2 + 1]!) > PLANE_TOLERANCE) continue;
          const pair = pt < ps ? `${pt}:${ps}` : `${ps}:${pt}`;
          if (checked.has(pair)) continue;
          if (overlapArea(poly(t), poly(s)) < 1e-4) continue;
          checked.add(pair);
          const small = A.volume < B.volume || (A.volume === B.volume && pt > ps) ? pt : ps;
          const large = small === pt ? ps : pt;
          let set = above.get(small);
          if (!set) above.set(small, (set = new Set()));
          set.add(large);
        }
      }
    }
    if (above.size === 0) return;
    // A detail's level is one more than the highest part it sits on, so a
    // sticker on a stripe on a door all stay in front of each other.
    const level = new Map<number, number>();
    const order = [...infos.keys()].sort((x, y) => infos[y]!.volume - infos[x]!.volume || x - y);
    for (const p of order) {
      const under = above.get(p);
      if (!under) continue;
      let l = 0;
      for (const q of under) l = Math.max(l, (level.get(q) ?? 0) + 1);
      level.set(p, l);
    }
    for (const [p, l] of level) inflate(infos[p]!.g, NUDGE * l);
  }
};

/** Push every face of a part out by `by`, scaling it about its own centre. */
const inflate = (g: BufferGeometry, by: number): void => {
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const hx = (box.max.x - box.min.x) / 2;
  const hy = (box.max.y - box.min.y) / 2;
  const hz = (box.max.z - box.min.z) / 2;
  const kx = hx > 1e-4 ? (hx + by) / hx : 1;
  const ky = hy > 1e-4 ? (hy + by) / hy : 1;
  const kz = hz > 1e-4 ? (hz + by) / hz : 1;
  const pos = g.getAttribute('position');
  // A flat part (a decal quad) has no thickness to grow: slide it along its face instead.
  let ox = 0;
  let oy = 0;
  let oz = 0;
  if (Math.min(hx, hy, hz) <= 1e-4 && pos.count >= 3) {
    const n = new Vector3().subVectors(new Vector3().fromBufferAttribute(pos, 1), new Vector3().fromBufferAttribute(pos, 0)).cross(new Vector3().subVectors(new Vector3().fromBufferAttribute(pos, 2), new Vector3().fromBufferAttribute(pos, 0))).normalize();
    ox = n.x * by;
    oy = n.y * by;
    oz = n.z * by;
  }
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(i, cx + (pos.getX(i) - cx) * kx + ox, cy + (pos.getY(i) - cy) * ky + oy, cz + (pos.getZ(i) - cz) * kz + oz);
  }
  pos.needsUpdate = true;
  g.boundingBox = null;
};

const signedArea = (p: readonly (readonly [number, number])[]): number => {
  let s = 0;
  for (let i = 0; i < p.length; i += 1) {
    const [x0, y0] = p[i]!;
    const [x1, y1] = p[(i + 1) % p.length]!;
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
};

/** Area shared by two triangles (Sutherland-Hodgman clip). */
const overlapArea = (p: [number, number][], q: [number, number][]): number => {
  if (signedArea(p) < 0) p = [...p].reverse();
  if (signedArea(q) < 0) q = [...q].reverse();
  let out: [number, number][] = p;
  for (let i = 0; i < 3 && out.length > 0; i += 1) {
    const [ax, ay] = q[i]!;
    const [bx, by] = q[(i + 1) % 3]!;
    const side = (x: number, y: number): number => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j += 1) {
      const cur = input[j]!;
      const prev = input[(j + input.length - 1) % input.length]!;
      const sc = side(cur[0], cur[1]);
      const sp = side(prev[0], prev[1]);
      if (sc >= 0 !== sp >= 0) {
        const t = sp / (sp - sc);
        out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
      }
      if (sc >= 0) out.push(cur);
    }
  }
  return out.length >= 3 ? Math.abs(signedArea(out)) : 0;
};

/** Meshes for a cached set of geometries, on the shared materials. */
export const meshesFor = (geometries: Partial<Record<PartKind, BufferGeometry>>, name: string, castShadow = true): Group => {
  const group = new Group();
  group.name = name;
  const materials = partMaterials();
  for (const kind of KINDS) {
    const geometry = geometries[kind];
    if (!geometry) continue;
    const mesh = new Mesh(geometry, materials[kind]);
    mesh.castShadow = castShadow && kind !== 'glow';
    mesh.receiveShadow = kind !== 'glow';
    group.add(mesh);
  }
  return group;
};

/** A box whose UVs are world-scaled (one stud plate every 2 units). */
export const studBox = (w: number, h: number, d: number, tile = 2): BoxGeometry => {
  const geometry = new BoxGeometry(w, h, d);
  const uv = geometry.getAttribute('uv');
  const spans: readonly (readonly [number, number])[] = [
    [d / tile, h / tile],
    [d / tile, h / tile],
    [w / tile, d / tile],
    [w / tile, d / tile],
    [w / tile, h / tile],
    [w / tile, h / tile],
  ];
  for (let face = 0; face < 6; face += 1) {
    const span = spans[face]!;
    for (let corner = 0; corner < 4; corner += 1) {
      const index = face * 4 + corner;
      uv.setXY(index, uv.getX(index) * span[0], uv.getY(index) * span[1]);
    }
  }
  uv.needsUpdate = true;
  return geometry;
};
