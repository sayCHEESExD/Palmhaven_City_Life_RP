import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  TorusGeometry,
} from 'three';
import { vehicleByKey, type VehicleDef, type VehicleSeat } from '@palmhaven/shared';
import { PartBuilder, meshesFor, type PartKind, type Transform } from '../render/PartBuilder.js';
import { block, cylinder, dome, mix, shade, wedge } from './shapes.js';

/**
 * THE FLEET, DRAWN. One procedural model per vehicle key in the shared
 * catalogue, built from chunky primitives (boxes, wedges, lofted sections,
 * low-segment cylinders) and merged per material kind by `PartBuilder`, so
 * a car is a handful of draw calls: body, glow, glass, plus one per wheel.
 *
 * Frame: origin on the ground under the centre (boats: the hull bottom),
 * facing +Z, +X is the vehicle's LEFT (driver) side, y up. Dimensions match
 * each def's length / width / height; seats sit at the def's seat points.
 *
 * Geometry is cached per (key, paint) and shared by every instance, so
 * `dispose()` only detaches the model - shared buffers stay alive.
 */

export interface VehicleModel {
  /** Origin = the ground under the vehicle's centre; the vehicle faces +Z; +X is the vehicle's LEFT (driver) side; y up. */
  readonly root: Group;
  /** Everything except the wheels (the caller leans/pitches this for bikes, boats, aircraft). Child of root. */
  readonly body: Object3D;
  /** Each wheel is its own Object3D pivoted at the wheel centre; the caller spins it about its LOCAL X axis. */
  readonly wheels: readonly Object3D[];
  /** Front-wheel steering pivots (may be parents of wheel objects); the caller rotates them about local Y. */
  readonly steering: readonly Object3D[];
  /** Spinning parts: helicopter main rotor (axis 'y'), tail rotor ('x'), plane propeller ('z'), boat props etc. */
  readonly rotors: readonly { readonly object: Object3D; readonly axis: 'x' | 'y' | 'z' }[];
  /** Glow parts the caller shows when headlights are on (null if none). */
  readonly headlights: Object3D | null;
  /** Red tail/brake glow the caller brightens when braking (null if none). */
  readonly brakeLights: Object3D | null;
  /** Light-bar halves the caller flashes alternately (police, ambulance, firetruck), else null. */
  readonly sirens: { readonly red: Object3D; readonly blue: Object3D } | null;
  /** Taxi roof sign (or null): the caller toggles visibility of a 'FARE' glow. */
  readonly taxiSign: Object3D | null;
  dispose(): void;
}

// ------------------------------------------------------------------ shared materials & colours

/** Every window in the fleet: one see-through material, so seated riders show. */
const GLASS = new MeshLambertMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide });

const TYRE = 0x1d1f24;
const TRIM = 0x17191e;
const CHROME = 0xd9dee5;
const SILVER = 0xb9c0c9;
const DARK = 0x2a2d33;
const RUBBER = 0x24262b;
const SEAT = 0x3b3633;
const HEAD_LENS = 0xe3eaf2;
const HEAD_GLOW = 0xfff6d8;
const TAIL_LENS = 0x9c1c24;
const TAIL_GLOW = 0xff2b2b;
const PLATE = 0xf4f4ee;
const SIREN_RED = 0xff2a36;
const SIREN_BLUE = 0x2f6bff;

const PI = Math.PI;

// ------------------------------------------------------------------ kit: the parts of one model under construction

type Geo = Partial<Record<PartKind, BufferGeometry>>;
type Axis = 'x' | 'y' | 'z';

interface PartSpec {
  readonly geo: Geo;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Collects every part of a vehicle while it is being built. */
class Kit {
  readonly body = new PartBuilder();
  readonly glass = new PartBuilder();
  readonly head = new PartBuilder();
  readonly brake = new PartBuilder();
  readonly red = new PartBuilder();
  readonly blue = new PartBuilder();
  readonly sign = new PartBuilder();
  readonly wheels: (PartSpec & { readonly steer: boolean })[] = [];
  readonly rotors: (PartSpec & { readonly axis: Axis })[] = [];
  /** Steering pivots that carry no wheel geometry (a skateboard truck carries two wheels). */
  readonly trucks: { readonly x: number; readonly y: number; readonly z: number; readonly wheels: readonly number[] }[] = [];

  constructor(readonly def: VehicleDef, readonly paint: number) {}

  /** Build one wheel shape and place it at every position (front ones steer). */
  wheelSet(make: (b: PartBuilder) => void, positions: readonly (readonly [number, number, number, boolean])[]): void {
    const b = new PartBuilder();
    make(b);
    const geo = b.geometries();
    for (const [x, y, z, steer] of positions) this.wheels.push({ geo, x, y, z, steer });
  }

  rotor(make: (b: PartBuilder) => void, x: number, y: number, z: number, axis: Axis): void {
    const b = new PartBuilder();
    make(b);
    this.rotors.push({ geo: b.geometries(), x, y, z, axis });
  }

  seat(i: number): VehicleSeat {
    const s = this.def.seats[i];
    if (!s) throw new Error(`vehicle ${this.def.key} has no seat ${i}`);
    return s;
  }
}

interface Template {
  readonly body: Geo;
  readonly glass: BufferGeometry | null;
  readonly head: Geo | null;
  readonly brake: Geo | null;
  readonly red: Geo | null;
  readonly blue: Geo | null;
  readonly sign: Geo | null;
  readonly wheels: readonly (PartSpec & { readonly steer: boolean })[];
  readonly rotors: readonly (PartSpec & { readonly axis: Axis })[];
  readonly trucks: Kit['trucks'];
}

const geoOrNull = (b: PartBuilder): Geo | null => (b.isEmpty ? null : b.geometries());

const toTemplate = (k: Kit): Template => ({
  body: k.body.geometries(),
  glass: k.glass.isEmpty ? null : (k.glass.geometries().smooth ?? null),
  head: geoOrNull(k.head),
  brake: geoOrNull(k.brake),
  red: geoOrNull(k.red),
  blue: geoOrNull(k.blue),
  sign: geoOrNull(k.sign),
  wheels: k.wheels,
  rotors: k.rotors,
  trucks: k.trucks,
});

// ------------------------------------------------------------------ geometry helpers

type V3 = readonly [number, number, number];
type Section = { readonly z: number; readonly pts: readonly (readonly [number, number])[] };

/** A box by size and centre (smooth plastic unless told otherwise). */
const bx = (b: PartBuilder, w: number, h: number, d: number, c: number, x: number, y: number, z: number, t: Transform = {}, kind: PartKind = 'smooth'): void => {
  block(b, w, h, d, c, { x, y, z, ...t }, kind);
};

/** Run a builder for the left (+1) and right (-1) side. */
const both = (fn: (s: number) => void): void => {
  fn(1);
  fn(-1);
};

/** A box stretched from p1 to p2 (cross-section w x h). */
const beam = (b: PartBuilder, w: number, h: number, p1: V3, p2: V3, c: number, kind: PartKind = 'smooth'): void => {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  block(b, w, h, len, c, {
    x: (p1[0] + p2[0]) / 2,
    y: (p1[1] + p2[1]) / 2,
    z: (p1[2] + p2[2]) / 2,
    rx: -Math.asin(dy / len),
    ry: Math.atan2(dx, dz),
  }, kind);
};

/** A round tube from p1 to p2. */
const rod = (b: PartBuilder, r: number, p1: V3, p2: V3, c: number, segments = 6, kind: PartKind = 'smooth'): void => {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const g = new CylinderGeometry(r, r, len, segments, 1);
  g.rotateX(PI / 2);
  b.add(g, c, kind, {
    x: (p1[0] + p2[0]) / 2,
    y: (p1[1] + p2[1]) / 2,
    z: (p1[2] + p2[2]) / 2,
    rx: -Math.asin(dy / len),
    ry: Math.atan2(dx, dz),
  });
};

/** A flat polygon (convex, any winding) - used for glass, which is two-sided. */
const panel = (pts: readonly V3[]): BufferGeometry => {
  const pos: number[] = [];
  const p0 = pts[0]!;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const c = pts[i + 1]!;
    pos.push(...p0, ...a, ...c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
};

/** A glass pane through the given corners. */
const glass = (k: Kit, pts: readonly V3[]): void => {
  k.glass.add(panel(pts), 0xffffff, 'smooth');
};

/**
 * A solid lofted through cross-sections along Z (each section's points
 * counter-clockwise seen from +Z, every section the same point count,
 * sections in increasing z). Faceted, closed at both ends: hulls,
 * fuselages, noses.
 */
const loftGeometry = (sections: readonly Section[]): BufferGeometry => {
  const pos: number[] = [];
  const tri = (a: V3, b2: V3, c: V3): void => {
    pos.push(...a, ...b2, ...c);
  };
  const at = (s: Section, i: number): V3 => {
    const p = s.pts[i % s.pts.length]!;
    return [p[0], p[1], s.z];
  };
  for (let k = 0; k < sections.length - 1; k += 1) {
    const s0 = sections[k]!;
    const s1 = sections[k + 1]!;
    const n = s0.pts.length;
    for (let i = 0; i < n; i += 1) {
      const a = at(s0, i);
      const b2 = at(s0, i + 1);
      const c = at(s1, i + 1);
      const d = at(s1, i);
      tri(a, b2, c);
      tri(a, c, d);
    }
  }
  const first = sections[0]!;
  const last = sections[sections.length - 1]!;
  for (let i = 1; i < last.pts.length - 1; i += 1) tri(at(last, 0), at(last, i), at(last, i + 1));
  for (let i = 1; i < first.pts.length - 1; i += 1) tri(at(first, 0), at(first, i + 1), at(first, i));
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
};

const loft = (b: PartBuilder, sections: readonly Section[], c: number, t: Transform = {}): void => {
  b.add(loftGeometry(sections), c, 'smooth', t);
};

/** A rectangle-ish cross-section: half-width at the bottom/middle, narrower top (inset), bottom y0, shoulder ym, top yt. */
const sec = (z: number, hw: number, y0: number, ym: number, yt: number, inset = 0.85, bottomInset = 1): Section => ({
  z,
  pts: [
    [-hw * bottomInset, y0],
    [hw * bottomInset, y0],
    [hw, ym],
    [hw * inset, yt],
    [-hw * inset, yt],
    [-hw, ym],
  ],
});

/** A hull cross-section: keel point, chines, gunwales. */
const hullSec = (z: number, hw: number, keel: number, chine: number, deck: number, chineIn = 0.82): Section => ({
  z,
  pts: [
    [0, keel],
    [hw * chineIn, chine],
    [hw, deck],
    [-hw, deck],
    [-hw * chineIn, chine],
  ],
});

// ------------------------------------------------------------------ shared vehicle details

/** A car wheel: tyre, coloured rim, three spokes and a hub; axle along X, centred on the origin. */
const carWheel = (r: number, w: number, rim = SILVER, spoke = DARK, sidewall = true) => (b: PartBuilder): void => {
  // 12 segments: a vertex sits exactly at the bottom, so the tyre touches y = 0.
  cylinder(b, r, r, w, TYRE, { rz: PI / 2 }, 'smooth', 12);
  if (sidewall) cylinder(b, r * 0.86, r * 0.86, w + 0.03, 0x2b2e34, { rz: PI / 2 }, 'smooth', 12);
  cylinder(b, r * 0.62, r * 0.62, w + 0.05, rim, { rz: PI / 2 }, 'smooth', 10);
  for (let i = 0; i < 3; i += 1) bx(b, w + 0.08, r * 1.08, r * 0.13, spoke, 0, 0, 0, { rx: (i * PI) / 3 });
  cylinder(b, r * 0.18, r * 0.18, w + 0.11, rim, { rz: PI / 2 }, 'smooth', 6);
};

/** A spoked bicycle-style wheel: torus tyre, thin spokes, hub. */
const spokedWheel = (r: number, tube: number, rim: number, spokes = 4) => (b: PartBuilder): void => {
  b.add(new TorusGeometry(r - tube, tube, 5, 16), TYRE, 'smooth', { ry: PI / 2 });
  b.add(new TorusGeometry(r - tube * 2.1, tube * 0.45, 4, 16), rim, 'smooth', { ry: PI / 2 });
  for (let i = 0; i < spokes; i += 1) bx(b, 0.03, (r - tube) * 2, 0.04, SILVER, 0, 0, 0, { rx: (i * PI) / spokes });
  cylinder(b, r * 0.12, r * 0.12, tube * 2.6, DARK, { rz: PI / 2 }, 'smooth', 6);
};

/** A motorbike wheel: chunky tyre, disc rim. */
const bikeWheel = (r: number, w: number, rim: number) => (b: PartBuilder): void => {
  b.add(new TorusGeometry(r - w * 0.5, w * 0.5, 6, 16), TYRE, 'smooth', { ry: PI / 2 });
  cylinder(b, r - w * 0.85, r - w * 0.85, w * 0.35, rim, { rz: PI / 2 }, 'smooth', 12);
  for (let i = 0; i < 3; i += 1) bx(b, w * 0.45, (r - w) * 1.9, r * 0.1, DARK, 0, 0, 0, { rx: (i * PI) / 3 });
  cylinder(b, r * 0.16, r * 0.16, w * 0.9, SILVER, { rz: PI / 2 }, 'smooth', 6);
};

/** A seat: cushion with its top at the seat point, a backrest behind and a headrest. */
const seatAt = (b: PartBuilder, s: VehicleSeat, c = SEAT, w = 1.25, back = 1.15, headrest = true): void => {
  bx(b, w, 0.28, 1.05, c, s.x, s.y - 0.14, s.z + 0.12);
  if (back > 0) {
    bx(b, w, back, 0.26, c, s.x, s.y + back / 2 - 0.05, s.z - 0.5, { rx: -0.12 });
    if (headrest) bx(b, w * 0.55, 0.32, 0.2, shade(c, 0.85), s.x, s.y + back + 0.12, s.z - 0.62, { rx: -0.12 });
  }
};

/** A steering wheel in front of a seat, on a column into the dash. */
const steeringWheel = (b: PartBuilder, s: VehicleSeat, ahead = 1.05, up = 0.95): void => {
  const y = s.y + up;
  const z = s.z + ahead;
  b.add(new TorusGeometry(0.3, 0.05, 4, 10), TRIM, 'smooth', { x: s.x, y, z, rx: -0.45 });
  bx(b, 0.5, 0.06, 0.06, TRIM, s.x, y, z);
  rod(b, 0.05, [s.x, y, z], [s.x, y - 0.2, z + 0.5], TRIM, 5);
};

/** Front lamps: lens in the body, glow in the headlights group. */
const headlamp = (k: Kit, x: number, y: number, z: number, w = 0.9, h = 0.28): void => {
  bx(k.body, w, h, 0.1, HEAD_LENS, x, y, z);
  bx(k.body, w * 0.95, 0.05, 0.05, 0xdff3ff, x, y - h / 2 - 0.06, z + 0.02, {}, 'glow');
  bx(k.head, w * 0.94, h * 0.85, 0.05, HEAD_GLOW, x, y, z + 0.05, {}, 'glow');
};

/** Rear lamps: dark-red lens in the body, bright brake glow behind it. */
const taillamp = (k: Kit, x: number, y: number, z: number, w = 0.85, h = 0.26): void => {
  bx(k.body, w, h, 0.1, TAIL_LENS, x, y, z);
  bx(k.brake, w * 0.94, h * 0.85, 0.05, TAIL_GLOW, x, y, z - 0.05, {}, 'glow');
};

/** A licence plate on a face at z (facing +Z if front). */
const plate = (b: PartBuilder, y: number, z: number): void => {
  bx(b, 0.78, 0.28, 0.04, PLATE, 0, y, z);
  bx(b, 0.5, 0.06, 0.045, 0x2b4a8a, 0, y + 0.02, z);
};

/** A side mirror on a short stalk at the A-pillar. */
const mirror = (b: PartBuilder, s: number, hw: number, y: number, z: number, c: number): void => {
  bx(b, 0.18, 0.06, 0.08, TRIM, s * (hw + 0.07), y, z);
  bx(b, 0.14, 0.22, 0.3, c, s * (hw + 0.2), y + 0.06, z, { ry: s * 0.15 });
  bx(b, 0.02, 0.17, 0.24, 0x8fb8d8, s * (hw + 0.2), y + 0.06, z - 0.16, { ry: PI / 2 });
};

/** A light bar: dark base and two coloured halves (lens in body, glow in the siren groups). */
const lightBar = (k: Kit, y: number, z: number, w: number, d = 0.5): void => {
  bx(k.body, w + 0.1, 0.1, d + 0.08, TRIM, 0, y + 0.05, z);
  const half = w / 2 - 0.04;
  bx(k.body, half, 0.18, d, 0x7a1f26, half / 2 + 0.02, y + 0.19, z);
  bx(k.body, half, 0.18, d, 0x1f3a7a, -half / 2 - 0.02, y + 0.19, z);
  bx(k.body, 0.08, 0.2, d, CHROME, 0, y + 0.19, z);
  bx(k.red, half + 0.02, 0.16, d + 0.03, SIREN_RED, half / 2 + 0.02, y + 0.19, z, {}, 'glow');
  bx(k.blue, half + 0.02, 0.16, d + 0.03, SIREN_BLUE, -half / 2 - 0.02, y + 0.19, z, {}, 'glow');
};

/** Track (x of each wheel centre) for a body of overall width W. */
const trackFor = (W: number, wheelW: number): number => W / 2 - wheelW / 2 - 0.02;

/** Four car wheels; the front pair steers. */
const fourWheels = (k: Kit, r: number, w: number, track: number, zf: number, zr: number, rim = SILVER, spoke = DARK): void => {
  k.wheelSet(carWheel(r, w, rim, spoke), [
    [track, r, zf, true],
    [-track, r, zf, true],
    [track, r, zr, false],
    [-track, r, zr, false],
  ]);
};

/** Dark arch flares over each wheel, sitting proud of the body side. */
const arches = (b: PartBuilder, hw: number, r: number, zs: readonly number[], c: number, depth = 0.22): void => {
  for (const z of zs) {
    both((s) => {
      bx(b, depth, 0.16, 2 * r + 0.45, c, s * (hw + depth / 2 - 0.06), 2 * r + 0.06, z);
      bx(b, depth, 0.5, 0.18, c, s * (hw + depth / 2 - 0.06), 2 * r - 0.2, z + r + 0.2, { rx: -0.5 });
      bx(b, depth, 0.5, 0.18, c, s * (hw + depth / 2 - 0.06), 2 * r - 0.2, z - r - 0.2, { rx: 0.5 });
    });
  }
};

// ------------------------------------------------------------------ cars: the shared shell

interface Shell {
  /** Body front / back faces (bumpers stick out 0.15 beyond). */
  readonly zf: number;
  readonly zr: number;
  /** Body width (wheels and mirrors stick out beyond). */
  readonly w: number;
  readonly sill: number;
  readonly floor: number;
  readonly belt: number;
  readonly hood: number;
  readonly deck: number;
  /** The open cabin runs from cabF (windshield base) back to cabR (rear window base). */
  readonly cabF: number;
  readonly cabR: number;
  readonly roof: { readonly y: number; readonly f: number; readonly r: number } | null;
  readonly paint: number;
  readonly lower: number;
  readonly door?: number;
  readonly roofColor?: number;
  readonly pillarColor?: number;
  readonly beltTrim?: number;
  readonly interior?: number;
  /** Door seam z positions, front to back. */
  readonly seams: readonly number[];
  /** Vertical (B/C) pillar z positions. */
  readonly pillars: readonly number[];
  /** False: no trunk and no rear bumper (pickup cab: the bed follows). */
  readonly rear?: boolean;
  /** False: no rear window (a van cab backs straight onto its box). */
  readonly rearGlass?: boolean;
}

/** Hollow car body: floor, hood, trunk, doors, dash, pillars, roof and glass. */
const carShell = (k: Kit, s: Shell): void => {
  const b = k.body;
  const hw = s.w / 2;
  const len = s.zf - s.zr;
  const mid = (s.zf + s.zr) / 2;
  const interior = s.interior ?? 0x2c2a2a;
  const pillar = s.pillarColor ?? TRIM;
  const door = s.door ?? s.paint;
  const rear = s.rear ?? true;

  bx(b, s.w, s.floor - s.sill, len, s.paint, 0, (s.floor + s.sill) / 2, mid);
  bx(b, s.w + 0.06, 0.3, len - 1.0, s.lower, 0, s.sill + 0.15, mid);
  bx(b, s.w + 0.04, 0.5, 0.3, s.lower, 0, s.sill + 0.3, s.zf);
  bx(b, s.w, s.hood - s.floor, s.zf - s.cabF, s.paint, 0, (s.hood + s.floor) / 2, (s.zf + s.cabF) / 2);
  // Hood creases.
  both((side) => bx(b, 0.05, 0.03, s.zf - s.cabF - 0.6, shade(s.paint, 0.82), side * hw * 0.42, s.hood + 0.01, (s.zf + s.cabF) / 2 + 0.1));
  if (s.belt > s.hood + 0.02) bx(b, s.w, s.belt - s.hood, 0.45, s.paint, 0, (s.belt + s.hood) / 2, s.cabF + 0.22);
  if (rear) {
    bx(b, s.w + 0.04, 0.5, 0.3, s.lower, 0, s.sill + 0.3, s.zr);
    bx(b, s.w, s.deck - s.floor, s.cabR - s.zr, s.paint, 0, (s.deck + s.floor) / 2, (s.cabR + s.zr) / 2);
    bx(b, s.w - 0.3, 0.06, 0.1, shade(s.paint, 0.8), 0, s.deck + 0.03, s.zr + 0.12);
  }
  // Doors, belt trim, seams and handles.
  both((side) => {
    bx(b, 0.16, s.belt - s.floor, s.cabF - s.cabR, door, side * (hw - 0.08), (s.belt + s.floor) / 2, (s.cabF + s.cabR) / 2);
    bx(b, 0.2, 0.06, s.cabF - s.cabR, s.beltTrim ?? TRIM, side * (hw - 0.08), s.belt + 0.03, (s.cabF + s.cabR) / 2);
    for (const z of s.seams) bx(b, 0.03, s.belt - s.floor - 0.12, 0.05, TRIM, side * (hw + 0.005), (s.belt + s.floor) / 2 + 0.02, z);
    for (let i = 1; i < s.seams.length; i += 1) bx(b, 0.05, 0.07, 0.28, CHROME, side * (hw + 0.02), s.belt - 0.24, s.seams[i]! + 0.35);
  });
  // Dash and carpet.
  bx(b, s.w - 0.3, 0.38, 0.55, interior, 0, s.belt - 0.2, s.cabF - 0.27);
  bx(b, s.w - 0.34, 0.04, s.cabF - s.cabR, interior, 0, s.floor + 0.02, (s.cabF + s.cabR) / 2);

  const r = s.roof;
  if (!r) return;
  bx(b, s.w - 0.34, 0.16, r.f - r.r, s.roofColor ?? s.paint, 0, r.y - 0.08, (r.f + r.r) / 2);
  both((side) => {
    const xo = side * (hw - 0.12);
    const xi = side * (hw - 0.2);
    beam(b, 0.16, 0.16, [xo, s.belt, s.cabF], [xi, r.y - 0.1, r.f], pillar);
    beam(b, 0.16, 0.16, [xo, s.deck, s.cabR], [xi, r.y - 0.1, r.r], pillar);
    for (const z of s.pillars) bx(b, 0.15, r.y - s.belt, 0.2, pillar, side * (hw - 0.15), (r.y + s.belt) / 2, z);
    bx(b, 0.1, 0.07, r.f - r.r, pillar, side * (hw - 0.2), r.y - 0.16, (r.f + r.r) / 2);
    glass(k, [
      [side * (hw - 0.1), s.belt + 0.03, s.cabF - 0.05],
      [side * (hw - 0.18), r.y - 0.16, r.f - 0.05],
      [side * (hw - 0.18), r.y - 0.16, r.r + 0.05],
      [side * (hw - 0.1), s.deck + 0.03, s.cabR + 0.05],
    ]);
  });
  glass(k, [[hw - 0.2, s.belt, s.cabF], [-(hw - 0.2), s.belt, s.cabF], [-(hw - 0.25), r.y - 0.12, r.f], [hw - 0.25, r.y - 0.12, r.f]]);
  if (s.rearGlass ?? true) glass(k, [[hw - 0.2, s.deck, s.cabR], [-(hw - 0.2), s.deck, s.cabR], [-(hw - 0.25), r.y - 0.12, r.r], [hw - 0.25, r.y - 0.12, r.r]]);
};

interface Face {
  readonly grille?: number;
  readonly grilleW?: number;
  readonly grilleH?: number;
  readonly chromeGrille?: boolean;
  readonly rear?: boolean;
  readonly mirrors?: boolean;
}

/** Lamps, grille, plates, mirrors and exhaust for a shell. */
const carFace = (k: Kit, s: Shell, f: Face = {}): void => {
  const b = k.body;
  const hw = s.w / 2;
  const ly = s.hood - 0.28;
  both((side) => headlamp(k, side * (hw - 0.62), ly, s.zf + 0.02));
  const gw = f.grilleW ?? s.w * 0.34;
  const gh = f.grilleH ?? 0.32;
  bx(b, gw, gh, 0.08, f.grille ?? 0x1a1c20, 0, ly - 0.02, s.zf + 0.02);
  for (const dy of [-gh / 4, gh / 4]) bx(b, gw, 0.04, 0.1, f.chromeGrille ? CHROME : 0x3a3d44, 0, ly - 0.02 + dy, s.zf + 0.03);
  both((side) => bx(b, 0.6, 0.13, 0.05, 0x15161a, side * (hw - 0.65), s.sill + 0.3, s.zf + 0.16));
  plate(b, s.sill + 0.32, s.zf + 0.17);
  if (f.mirrors ?? true) both((side) => mirror(b, side, hw, s.belt + 0.12, s.cabF - 0.3, s.paint));
  if (f.rear ?? true) {
    both((side) => taillamp(k, side * (hw - 0.55), s.deck - 0.28, s.zr - 0.02));
    bx(b, s.w * 0.36, 0.07, 0.06, TAIL_LENS, 0, s.deck - 0.2, s.zr - 0.02);
    plate(b, s.sill + 0.32, s.zr - 0.17);
    cylinder(b, 0.08, 0.08, 0.3, CHROME, { x: -(hw - 0.7), y: s.sill + 0.06, z: s.zr - 0.12, rx: PI / 2 }, 'smooth', 6);
  }
};

const lowerOf = (paint: number): number => mix(paint, 0x1d1f25, 0.7);

const carSeats = (k: Kit, c = SEAT, back = 1.15): void => {
  for (const s of k.def.seats) seatAt(k.body, s, c, 1.25, back);
  steeringWheel(k.body, k.seat(0));
};

// ------------------------------------------------------------------ cars: the family

const buildSedan = (k: Kit): void => {
  const p = k.paint;
  const s: Shell = {
    zf: 4.55, zr: -4.55, w: 3.8, sill: 0.4, floor: 0.58, belt: 1.62, hood: 1.5, deck: 1.6,
    cabF: 1.75, cabR: -3.2, roof: { y: 3.4, f: 0.95, r: -2.45 },
    paint: p, lower: lowerOf(p), seams: [1.6, -0.75, -2.75], pillars: [-0.75],
  };
  carShell(k, s);
  carFace(k, s);
  carSeats(k);
  // A little lip spoiler on the trunk.
  bx(k.body, s.w - 0.6, 0.08, 0.3, shade(p, 0.85), 0, s.deck + 0.05, s.zr + 0.25);
  arches(k.body, s.w / 2, 0.72, [2.9, -2.8], s.lower);
  fourWheels(k, 0.72, 0.55, trackFor(4.3, 0.55), 2.9, -2.8);
};

const buildPolice = (k: Kit): void => {
  const black = 0x14181f;
  const white = 0xf4f5f7;
  const s: Shell = {
    zf: 4.6, zr: -4.85, w: 3.9, sill: 0.42, floor: 0.58, belt: 1.65, hood: 1.52, deck: 1.6,
    cabF: 1.8, cabR: -3.25, roof: { y: 3.32, f: 0.95, r: -2.45 },
    paint: black, lower: 0x0c0e12, door: white, roofColor: white, seams: [1.65, -0.75, -2.8], pillars: [-0.75],
  };
  carShell(k, s);
  carFace(k, s);
  carSeats(k, 0x26272b);
  const b = k.body;
  const hw = s.w / 2;
  // Blue pinstripe and a gold star badge on the front doors.
  both((side) => {
    bx(b, 0.03, 0.1, s.cabF - s.cabR - 0.2, 0x2f5bd3, side * (hw + 0.01), s.belt - 0.5, (s.cabF + s.cabR) / 2);
    cylinder(b, 0.24, 0.24, 0.04, 0xd8b23a, { x: side * (hw + 0.02), y: 1.2, z: 0.5, rz: PI / 2 }, 'smooth', 5);
    // Spot lamp by the A-pillar.
    cylinder(b, 0.1, 0.12, 0.22, CHROME, { x: side * (hw - 0.05), y: s.belt + 0.25, z: s.cabF - 0.15, rx: PI / 2 }, 'smooth', 8);
  });
  // Push bar.
  both((side) => bx(b, 0.12, 0.85, 0.12, 0x101114, side * 0.75, 0.9, 4.86));
  for (const y of [0.72, 1.18]) bx(b, 1.9, 0.11, 0.1, 0x101114, 0, y, 4.88);
  // Antenna.
  rod(b, 0.02, [-1.2, s.deck, -3.9], [-1.2, s.deck + 1.0, -4.0], TRIM, 4);
  lightBar(k, 3.32, 0.15, 2.6);
  arches(b, hw, 0.74, [3.0, -2.95], 0x0c0e12);
  fourWheels(k, 0.74, 0.56, trackFor(4.4, 0.56), 3.0, -2.95, 0xc6ccd4, 0x2b2e34);
};

const buildTaxi = (k: Kit): void => {
  const yellow = 0xffc61a;
  const s: Shell = {
    zf: 4.65, zr: -4.65, w: 3.8, sill: 0.4, floor: 0.58, belt: 1.62, hood: 1.5, deck: 1.6,
    cabF: 1.8, cabR: -3.25, roof: { y: 3.3, f: 0.95, r: -2.45 },
    paint: yellow, lower: 0x26272b, seams: [1.65, -0.75, -2.8], pillars: [-0.75],
  };
  carShell(k, s);
  carFace(k, s);
  carSeats(k);
  const b = k.body;
  const hw = s.w / 2;
  // Checker band along the doors: a black strip with white squares, two staggered rows.
  const z0 = s.cabF - 0.1;
  const z1 = s.cabR + 0.3;
  const sq = 0.3;
  const n = Math.floor((z0 - z1) / (sq * 2));
  both((side) => {
    bx(b, 0.03, sq * 2, z0 - z1, 0x15161a, side * (hw + 0.01), s.belt - 0.45, (z0 + z1) / 2);
    for (let row = 0; row < 2; row += 1) {
      for (let i = 0; i < n; i += 1) {
        const z = z0 - sq / 2 - i * sq * 2 - row * sq;
        bx(b, 0.04, sq, sq, 0xffffff, side * (hw + 0.012), s.belt - 0.45 + (row === 0 ? sq / 2 : -sq / 2), z);
      }
    }
  });
  // Roof sign: housing in the body, the lit FARE panel in its own group.
  const y = 3.3;
  bx(b, 1.6, 0.06, 0.62, TRIM, 0, y + 0.03, -0.6);
  bx(b, 1.5, 0.22, 0.5, 0xfdfbf0, 0, y + 0.17, -0.6);
  bx(b, 1.56, 0.04, 0.56, 0x15161a, 0, y + 0.29, -0.6);
  bx(b, 0.9, 0.06, 0.58, 0x15161a, 0, y + 0.16, -0.6);
  bx(k.sign, 1.44, 0.17, 0.54, 0xfff1a0, 0, y + 0.17, -0.6, {}, 'glow');
  arches(b, hw, 0.72, [2.95, -2.85], 0x26272b);
  fourWheels(k, 0.72, 0.55, trackFor(4.3, 0.55), 2.95, -2.85, 0x9aa0a8);
};

const buildLuxury = (k: Kit): void => {
  const p = k.paint;
  const s: Shell = {
    zf: 5.35, zr: -5.35, w: 4.1, sill: 0.45, floor: 0.68, belt: 1.85, hood: 1.78, deck: 1.8,
    cabF: 2.25, cabR: -3.45, roof: { y: 3.75, f: 1.5, r: -2.75 },
    paint: p, lower: mix(p, 0x141418, 0.55), beltTrim: CHROME, interior: 0x5a4636,
    seams: [2.1, -0.55, -3.0], pillars: [-0.55],
  };
  carShell(k, s);
  carFace(k, s, { grilleW: 1.25, grilleH: 0.62, grille: CHROME, chromeGrille: true });
  carSeats(k, 0xd8c7a6);
  const b = k.body;
  const hw = s.w / 2;
  // Upright grille slats, hood ornament, chrome sill spears.
  for (let i = -2; i <= 2; i += 1) bx(b, 0.05, 0.56, 0.12, 0x2a2b30, i * 0.22, s.hood - 0.3, s.zf + 0.03);
  bx(b, 0.08, 0.16, 0.22, CHROME, 0, s.hood + 0.08, s.zf - 0.2);
  wedge(b, 0.06, 0.14, 0.2, CHROME, { y: s.hood + 0.22, z: s.zf - 0.2, ry: PI });
  both((side) => {
    bx(b, 0.04, 0.06, s.zf - s.zr - 2.6, CHROME, side * (hw + 0.035), s.sill + 0.34, 0);
    bx(b, 0.04, 0.04, s.zf - s.zr - 1.0, CHROME, side * (hw + 0.01), s.belt - 0.06, 0);
  });
  arches(b, hw, 0.8, [3.55, -3.35], s.lower);
  fourWheels(k, 0.8, 0.58, trackFor(4.6, 0.58), 3.55, -3.35, CHROME, 0x8d939c);
};

const buildSuv = (k: Kit): void => {
  const p = k.paint;
  const s: Shell = {
    zf: 5.05, zr: -5.05, w: 4.3, sill: 0.62, floor: 0.98, belt: 2.2, hood: 2.05, deck: 2.2,
    cabF: 2.45, cabR: -4.55, roof: { y: 4.12, f: 1.7, r: -4.3 },
    paint: p, lower: 0x2c2f35, seams: [2.3, -0.4, -2.6], pillars: [-0.4, -2.65],
  };
  carShell(k, s);
  carFace(k, s, { grilleW: 1.6, grilleH: 0.42 });
  carSeats(k);
  const b = k.body;
  const hw = s.w / 2;
  // Roof rails on little feet, lower cladding.
  both((side) => {
    bx(b, 0.12, 0.08, 5.4, SILVER, side * (hw - 0.35), 4.33, -1.3);
    for (const z of [1.2, -1.3, -3.8]) bx(b, 0.14, 0.14, 0.2, TRIM, side * (hw - 0.35), 4.22, z);
    bx(b, 0.04, 0.3, s.zf - s.zr - 1.2, 0x2c2f35, side * (hw + 0.02), s.floor + 0.12, 0);
  });
  // Skid plate, tow hook, rear wiper.
  bx(b, 1.6, 0.12, 0.2, SILVER, 0, s.sill + 0.04, s.zf + 0.1);
  bx(b, 0.2, 0.2, 0.2, TRIM, 0, s.sill + 0.12, s.zr - 0.2);
  bx(b, 0.9, 0.05, 0.05, TRIM, 0.2, s.deck + 0.3, s.cabR - 0.03, { rz: 0.4 });
  arches(b, hw, 0.9, [3.3, -3.15], 0x2c2f35, 0.26);
  fourWheels(k, 0.9, 0.66, trackFor(4.8, 0.66), 3.3, -3.15, 0x9ea5ae);
};

const buildConvertible = (k: Kit): void => {
  const p = k.paint;
  const s: Shell = {
    zf: 4.65, zr: -4.65, w: 3.9, sill: 0.36, floor: 0.45, belt: 1.38, hood: 1.28, deck: 1.38,
    cabF: 1.3, cabR: -1.6, roof: null,
    paint: p, lower: lowerOf(p), beltTrim: CHROME, interior: 0x8a6a4a, seams: [1.2, -1.4], pillars: [],
  };
  carShell(k, s);
  carFace(k, s, { chromeGrille: true });
  for (const seat of k.def.seats) seatAt(k.body, seat, 0xeadcc0, 1.25, 1.1);
  steeringWheel(k.body, k.seat(0), 0.95, 0.85);
  const b = k.body;
  const hw = s.w / 2;
  // Raked windshield in a chrome frame.
  const top = 2.52;
  const zt = s.cabF - 0.75;
  glass(k, [[hw - 0.3, s.belt, s.cabF], [-(hw - 0.3), s.belt, s.cabF], [-(hw - 0.4), top, zt], [hw - 0.4, top, zt]]);
  beam(b, 0.1, 0.1, [-(hw - 0.4), top, zt], [hw - 0.4, top, zt], CHROME);
  both((side) => beam(b, 0.1, 0.1, [side * (hw - 0.3), s.belt, s.cabF], [side * (hw - 0.4), top, zt], CHROME));
  // Folded soft top and headrest fairings.
  bx(b, s.w - 0.6, 0.3, 0.8, 0x2e2b2a, 0, s.deck + 0.12, s.cabR - 0.45);
  both((side) => wedge(b, 1.0, 0.4, 1.3, p, { x: side * 0.95, y: s.deck + 0.2, z: s.cabR - 1.15 }));
  arches(b, hw, 0.68, [2.95, -2.85], s.lower);
  fourWheels(k, 0.68, 0.55, trackFor(4.4, 0.55), 2.95, -2.85, CHROME);
};

const buildPickup = (k: Kit): void => {
  const p = k.paint;
  const lower = 0x2b2d33;
  const s: Shell = {
    zf: 5.35, zr: 0.15, w: 4.3, sill: 0.7, floor: 1.05, belt: 2.3, hood: 2.15, deck: 2.3,
    cabF: 2.75, cabR: 0.15, roof: { y: 4.15, f: 2.0, r: 0.35 },
    paint: p, lower, seams: [2.6, 0.3], pillars: [], rear: false,
  };
  carShell(k, s);
  carFace(k, s, { grilleW: 1.9, grilleH: 0.5, chromeGrille: true, rear: false });
  for (let i = 0; i < 2; i += 1) seatAt(k.body, k.seat(i));
  steeringWheel(k.body, k.seat(0));
  const b = k.body;
  const hw = s.w / 2;
  // Cab back wall below the rear window.
  bx(b, s.w, s.belt - s.floor, 0.16, p, 0, (s.belt + s.floor) / 2, s.cabR + 0.08);
  // The bed.
  const bf = 0.0;
  const br = -5.35;
  const bedFloor = 1.25;
  const wallTop = 2.3;
  bx(b, s.w, bedFloor - s.sill, bf - br, p, 0, (bedFloor + s.sill) / 2, (bf + br) / 2);
  bx(b, s.w + 0.06, 0.3, bf - br - 0.4, lower, 0, s.sill + 0.15, (bf + br) / 2);
  bx(b, s.w - 0.34, 0.04, bf - br - 0.3, 0x2a2a2e, 0, bedFloor + 0.02, (bf + br) / 2);
  bx(b, s.w, wallTop - bedFloor, 0.16, p, 0, (wallTop + bedFloor) / 2, bf - 0.08);
  bx(b, s.w, wallTop - bedFloor, 0.16, p, 0, (wallTop + bedFloor) / 2, br + 0.08);
  bx(b, 0.8, 0.08, 0.05, TRIM, 0, wallTop - 0.25, br - 0.01);
  both((side) => {
    bx(b, 0.16, wallTop - bedFloor, bf - br, p, side * (hw - 0.08), (wallTop + bedFloor) / 2, (bf + br) / 2);
    bx(b, 0.26, 0.06, bf - br, TRIM, side * (hw - 0.09), wallTop + 0.03, (bf + br) / 2);
    taillamp(k, side * (hw - 0.2), wallTop - 0.45, br - 0.02, 0.28, 0.55);
  });
  // Bed benches for the two riders in the back.
  for (let i = 2; i < k.def.seats.length; i += 1) seatAt(b, k.seat(i), 0x4a4038, 1.2, 0.75, false);
  // Rear bumper, plate, hitch.
  bx(b, s.w + 0.04, 0.45, 0.3, CHROME, 0, s.sill + 0.25, br);
  plate(b, s.sill + 0.28, br - 0.17);
  bx(b, 0.18, 0.18, 0.3, TRIM, 0, s.sill + 0.05, br - 0.2);
  arches(b, hw, 0.95, [3.5, -3.1], lower, 0.26);
  fourWheels(k, 0.95, 0.66, trackFor(4.8, 0.66), 3.5, -3.1, 0xa9b0b8);
};

/**
 * Vortex GT: an original hypercar - low wide wedge, darker lower half, a
 * chrome C-sweep round the door, an oval "horseshoe" grille, a glass canopy
 * (riders show through) and a fixed rear wing.
 */
const buildSports = (k: Kit): void => {
  const b = k.body;
  const p = k.paint;
  const low = mix(p, 0x10161f, 0.62);
  const hw = 2.05;
  const cabF = 1.9;
  const cabR = -1.5;
  const belt = 1.22;

  // Nose: dark lower lip loft, painted upper loft.
  loft(b, [sec(cabF, hw, 0.25, 0.5, 0.75, 0.98), sec(4.3, 1.95, 0.25, 0.5, 0.7, 0.98), sec(4.9, 1.7, 0.28, 0.4, 0.45, 0.96)], low);
  loft(b, [sec(cabF, hw, 0.75, 1.05, belt, 0.9), sec(3.0, hw, 0.74, 1.0, 1.12, 0.88), sec(4.3, 1.95, 0.7, 0.85, 0.92, 0.85), sec(4.9, 1.7, 0.45, 0.62, 0.7, 0.85)], p);
  // Tail.
  loft(b, [sec(-4.9, 1.9, 0.3, 0.5, 0.7, 0.98), sec(-4.3, 2.0, 0.25, 0.5, 0.75, 0.98), sec(cabR, hw, 0.25, 0.5, 0.75, 0.98)], low);
  loft(b, [sec(-4.9, 1.9, 0.7, 0.95, 1.1, 0.85), sec(-4.3, 2.0, 0.75, 1.05, 1.25, 0.88), sec(-2.4, hw, 0.75, 1.1, 1.42, 0.82), sec(cabR, hw, 0.75, 1.05, 1.25, 0.88)], p);
  // Haunches over all four wheels.
  for (const z of [3.0, -2.95]) {
    both((side) => {
      bx(b, 0.62, 0.36, 1.9, p, side * (hw - 0.22), 1.33, z);
      wedge(b, 0.62, 0.36, 0.8, p, { x: side * (hw - 0.22), y: 1.33, z: z + 1.35, ry: PI });
      wedge(b, 0.62, 0.36, 0.8, p, { x: side * (hw - 0.22), y: 1.33, z: z - 1.35 });
    });
  }
  // Cabin: floor, side pods (dark lower, painted upper), spine console, dash.
  bx(b, hw * 2, 0.16, cabF - cabR, low, 0, 0.32, (cabF + cabR) / 2);
  both((side) => {
    bx(b, 0.42, 0.55, cabF - cabR, low, side * (hw - 0.21), 0.52, (cabF + cabR) / 2);
    bx(b, 0.32, belt - 0.78, cabF - cabR, p, side * (hw - 0.16), (belt + 0.78) / 2, (cabF + cabR) / 2);
    bx(b, 0.03, belt - 0.4, 0.05, TRIM, side * (hw + 0.005), (belt + 0.4) / 2, cabF - 0.1);
  });
  bx(b, 0.42, 0.42, 2.6, 0x26262c, 0, 0.6, 0.35);
  bx(b, 0.08, 0.04, 2.6, CHROME, 0, 0.83, 0.35);
  bx(b, hw * 2 - 0.7, 0.3, 0.5, 0x202024, 0, 1.05, cabF - 0.2);
  for (const s of k.def.seats) seatAt(b, s, 0x24242a, 1.15, 1.0);
  steeringWheel(b, k.seat(0), 0.95, 0.75);

  // Glass canopy with a dark frame and a centre spine.
  const rf = 0.55;
  const rr = -0.9;
  const ry = 2.62;
  const rx = 1.25;
  glass(k, [[1.6, belt, cabF], [-1.6, belt, cabF], [-rx, ry, rf], [rx, ry, rf]]);
  glass(k, [[rx, ry, rf], [-rx, ry, rf], [-rx, ry, rr], [rx, ry, rr]]);
  glass(k, [[rx, ry, rr], [-rx, ry, rr], [-1.5, 1.42, -2.4], [1.5, 1.42, -2.4]]);
  both((side) => {
    glass(k, [[side * 1.78, belt, cabF - 0.05], [side * rx, ry - 0.04, rf], [side * rx, ry - 0.04, rr], [side * 1.6, 1.38, -2.35], [side * 1.78, belt, cabR]]);
    beam(b, 0.12, 0.12, [side * 1.62, belt, cabF], [side * rx, ry, rf], TRIM);
    beam(b, 0.12, 0.12, [side * rx, ry, rf], [side * rx, ry, rr], TRIM);
    beam(b, 0.12, 0.12, [side * rx, ry, rr], [side * 1.55, 1.42, -2.4], TRIM);
  });
  beam(b, 0.1, 0.06, [0, ry + 0.02, rf + 0.1], [0, ry + 0.02, rr], CHROME);
  beam(b, 0.1, 0.06, [0, ry, rr], [0, 1.45, -2.45], CHROME);
  beam(b, 0.1, 0.05, [0, 1.42, -2.45], [0, 1.12, -4.85], CHROME);

  // The C-sweep round the door, with a dark intake inside its curve.
  both((side) => {
    const x = side * (hw + 0.03);
    const pts: V3[] = [[x, 1.24, 1.7], [x, 1.3, -1.0], [x, 1.08, -1.6], [x, 0.68, -1.65], [x, 0.42, -1.2], [x, 0.4, 1.0]];
    for (let i = 0; i < pts.length - 1; i += 1) beam(b, 0.05, 0.1, pts[i]!, pts[i + 1]!, CHROME);
    bx(b, 0.05, 0.42, 0.45, 0x15161a, side * (hw + 0.01), 0.88, -1.3);
    mirror(b, side, hw - 0.25, belt + 0.1, cabF - 0.35, p);
  });

  // Face: horseshoe grille, slim lamps, intakes.
  cylinder(b, 0.32, 0.32, 0.08, CHROME, { y: 0.56, z: 4.87, rx: PI / 2, sz: 1.2 }, 'smooth', 14);
  cylinder(b, 0.25, 0.25, 0.1, 0x101216, { y: 0.56, z: 4.88, rx: PI / 2, sz: 1.2 }, 'smooth', 14);
  both((side) => {
    headlamp(k, side * 1.2, 0.74, 4.6, 0.75, 0.14);
    bx(b, 0.8, 0.2, 0.08, 0x15161a, side * 1.15, 0.4, 4.86);
  });
  plate(b, 0.3, 4.85);

  // Tail: full-width light strip, wing, diffuser, single centre exhaust.
  taillamp(k, 0, 0.98, -4.92, 3.4, 0.12);
  both((side) => {
    bx(b, 0.12, 0.62, 0.3, low, side * 1.3, 1.45, -4.2);
    bx(b, 0.06, 0.32, 0.8, low, side * 1.9, 1.78, -4.3);
  });
  bx(b, 3.8, 0.08, 0.75, low, 0, 1.8, -4.3, { rx: 0.08 });
  for (let i = -2; i <= 2; i += 1) bx(b, 0.05, 0.22, 0.6, 0x15161a, i * 0.5, 0.3, -4.7);
  cylinder(b, 0.2, 0.2, 0.2, CHROME, { y: 0.5, z: -4.87, rx: PI / 2 }, 'smooth', 10);
  cylinder(b, 0.14, 0.14, 0.22, 0x101216, { y: 0.5, z: -4.87, rx: PI / 2 }, 'smooth', 8);
  plate(b, 0.68, -4.95);

  fourWheels(k, 0.74, 0.62, trackFor(4.6, 0.62), 3.0, -2.95, SILVER, 0x2b2e34);
};

// ------------------------------------------------------------------ vans, ambulance, fire engine

/** The PalmPost delivery van: cream body, orange stripe, solid cargo box. */
const buildVan = (k: Kit): void => {
  const b = k.body;
  const cream = 0xf7f3ea;
  const lower = 0x34363b;
  const orange = 0xf28c28;
  const s: Shell = {
    zf: 5.65, zr: 1.6, w: 4.6, sill: 0.7, floor: 1.15, belt: 2.75, hood: 2.6, deck: 2.75,
    cabF: 4.1, cabR: 1.6, roof: { y: 5.6, f: 3.3, r: 1.6 },
    paint: cream, lower, seams: [3.95, 1.75], pillars: [], rear: false, rearGlass: false,
  };
  carShell(k, s);
  carFace(k, s, { grilleW: 2.0, grilleH: 0.5, rear: false });
  for (const seat of k.def.seats) seatAt(b, seat);
  steeringWheel(b, k.seat(0));
  const hw = s.w / 2;
  const zr = -5.65;
  const len = s.zr - zr;
  const mid = (s.zr + zr) / 2;
  // Cargo box and its underbody.
  bx(b, s.w, 5.6 - s.floor, len, cream, 0, (5.6 + s.floor) / 2, mid);
  bx(b, s.w, s.floor - s.sill, len, cream, 0, (s.floor + s.sill) / 2, mid);
  bx(b, s.w + 0.06, 0.3, len - 0.4, lower, 0, s.sill + 0.15, mid);
  both((side) => {
    bx(b, 0.08, 0.08, len, 0xd9d4c8, side * (hw - 0.02), 5.6, mid);
    // PalmPost stripe (orange band + teal pinstripe) along box and cab doors.
    bx(b, 0.04, 0.6, len - 0.3, orange, side * (hw + 0.01), 2.25, mid);
    bx(b, 0.04, 0.12, len - 0.3, 0x18a3a6, side * (hw + 0.01), 2.65, mid);
    bx(b, 0.04, 0.6, 2.3, orange, side * (hw + 0.01), 2.25, 2.85);
    // Logo: orange sun disc with a white envelope.
    cylinder(b, 0.8, 0.8, 0.04, orange, { x: side * (hw + 0.01), y: 4.05, z: -2.2, rz: PI / 2 }, 'smooth', 14);
    bx(b, 0.05, 0.55, 0.85, 0xffffff, side * (hw + 0.025), 4.05, -2.2);
    beam(b, 0.06, 0.05, [side * (hw + 0.05), 4.3, -2.6], [side * (hw + 0.05), 4.0, -2.2], orange);
    beam(b, 0.06, 0.05, [side * (hw + 0.05), 4.0, -2.2], [side * (hw + 0.05), 4.3, -1.8], orange);
    // Sliding door seam and handle.
    bx(b, 0.03, 3.6, 0.05, 0xb9b3a6, side * (hw + 0.005), 3.05, -0.6);
    bx(b, 0.05, 0.07, 0.3, CHROME, side * (hw + 0.02), 2.95, -0.35);
    // Tall tail lamps.
    taillamp(k, side * (hw - 0.22), 2.0, zr - 0.02, 0.28, 0.7);
  });
  // Roll-up rear door.
  for (let y = 1.6; y < 5.3; y += 0.55) bx(b, s.w - 0.7, 0.04, 0.03, 0xc9c2b4, 0, y, zr - 0.01);
  bx(b, 0.5, 0.08, 0.06, CHROME, 0, 1.75, zr - 0.03);
  bx(b, s.w + 0.04, 0.4, 0.3, lower, 0, s.sill + 0.25, zr);
  plate(b, s.sill + 0.3, zr - 0.17);
  arches(b, hw, 1.0, [4.2, -3.6], lower, 0.24);
  fourWheels(k, 1.0, 0.7, trackFor(5, 0.7), 4.2, -3.6, 0xb5bcc4);
};

/** The ambulance: cab plus a windowed patient module, red stripe and light bars. */
const buildAmbulance = (k: Kit): void => {
  const b = k.body;
  const white = 0xf4f4f4;
  const red = 0xd92b2b;
  const lower = 0x34363b;
  const s: Shell = {
    zf: 6.05, zr: 2.0, w: 4.6, sill: 0.7, floor: 1.15, belt: 2.75, hood: 2.6, deck: 2.75,
    cabF: 4.5, cabR: 2.0, roof: { y: 4.5, f: 3.7, r: 2.0 },
    paint: white, lower, seams: [4.35, 2.15], pillars: [], rear: false, rearGlass: false,
  };
  carShell(k, s);
  carFace(k, s, { grilleW: 1.9, grilleH: 0.5, rear: false });
  for (let i = 0; i < 2; i += 1) seatAt(b, k.seat(i));
  steeringWheel(b, k.seat(0));
  const hw = s.w / 2;
  both((side) => bx(b, 0.04, 0.35, s.cabF - s.cabR - 0.2, red, side * (hw + 0.01), 2.15, (s.cabF + s.cabR) / 2));

  // Patient module, hollow, with side and rear windows.
  const hb = 2.4;
  const zA = 1.8;
  const zB = -6.05;
  const top = 5.3;
  const len = zA - zB;
  const mid = (zA + zB) / 2;
  const winLo = 2.4;
  const winHi = 3.9;
  const g0 = -3.5;
  const g1 = -0.9;
  bx(b, hb * 2, s.floor - s.sill, len + 0.2, white, 0, (s.floor + s.sill) / 2, mid + 0.1);
  bx(b, hb * 2 + 0.06, 0.3, len - 0.4, lower, 0, s.sill + 0.15, mid);
  bx(b, hb * 2 - 0.3, 0.04, len - 0.3, 0x8d96a0, 0, s.floor + 0.02, mid);
  bx(b, hb * 2, 0.16, len, white, 0, top - 0.08, mid);
  bx(b, hb * 2, top - s.floor, 0.16, white, 0, (top + s.floor) / 2, zA - 0.08);
  both((side) => {
    const x = side * (hb - 0.08);
    bx(b, 0.16, winLo - s.floor, len, white, x, (winLo + s.floor) / 2, mid);
    bx(b, 0.16, top - 0.16 - winHi, len, white, x, (top - 0.16 + winHi) / 2, mid);
    bx(b, 0.16, winHi - winLo, g0 - zB, white, x, (winHi + winLo) / 2, (g0 + zB) / 2);
    bx(b, 0.16, winHi - winLo, zA - g1, white, x, (winHi + winLo) / 2, (zA + g1) / 2);
    for (const y of [winLo, winHi]) bx(b, 0.2, 0.08, g1 - g0, TRIM, x, y, (g0 + g1) / 2);
    glass(k, [[side * (hb - 0.06), winLo, g0], [side * (hb - 0.06), winHi, g0], [side * (hb - 0.06), winHi, g1], [side * (hb - 0.06), winLo, g1]]);
    // Livery: red band, roof band, a white plus in a red disc (not a real emblem).
    bx(b, 0.04, 0.35, len - 0.2, red, side * (hb + 0.01), 2.15, mid);
    bx(b, 0.04, 0.2, len - 0.2, red, side * (hb + 0.01), top - 0.35, mid);
    cylinder(b, 0.62, 0.62, 0.04, red, { x: side * (hb + 0.02), y: 3.15, z: -4.8, rz: PI / 2 }, 'smooth', 14);
    bx(b, 0.05, 0.78, 0.24, white, side * (hb + 0.04), 3.15, -4.8);
    bx(b, 0.05, 0.24, 0.78, white, side * (hb + 0.04), 3.15, -4.8);
    // Rear: door frame columns, glass, lamps, corner beacons.
    bx(b, hb - 1.6, winHi - winLo, 0.16, white, side * (hb + 1.6) / 2, (winHi + winLo) / 2, zB + 0.08);
    glass(k, [[side * 0.08, winLo, zB + 0.06], [side * 1.6, winLo, zB + 0.06], [side * 1.6, winHi, zB + 0.06], [side * 0.08, winHi, zB + 0.06]]);
    taillamp(k, side * (hb - 0.3), 1.9, zB - 0.02, 0.3, 0.6);
    bx(b, 0.34, 0.24, 0.1, side > 0 ? 0x7a1f26 : 0x1f3a7a, side * (hb - 0.3), top - 0.3, zB - 0.02);
    bx(side > 0 ? k.red : k.blue, 0.3, 0.2, 0.06, side > 0 ? SIREN_RED : SIREN_BLUE, side * (hb - 0.3), top - 0.3, zB - 0.07, {}, 'glow');
  });
  bx(b, hb * 2, winLo - s.floor, 0.16, white, 0, (winLo + s.floor) / 2, zB + 0.08);
  bx(b, hb * 2, top - winHi, 0.16, white, 0, (top + winHi) / 2, zB + 0.08);
  bx(b, 0.16, winHi - winLo, 0.16, white, 0, (winHi + winLo) / 2, zB + 0.08);
  bx(b, 0.04, top - s.floor - 0.3, 0.04, TRIM, 0, (top + s.floor) / 2, zB - 0.01);
  bx(b, hb * 2 - 0.4, 0.3, 0.04, red, 0, 2.15, zB - 0.01);
  // Inside: two jump seats and a supply cabinet.
  for (let i = 2; i < k.def.seats.length; i += 1) seatAt(b, k.seat(i), 0x2f6f8f, 1.2, 1.1, false);
  bx(b, hb * 2 - 0.5, 1.4, 0.6, 0xdfe4ea, 0, 3.4, zA - 0.5);
  // Rear step bumper and plate.
  bx(b, hb * 2, 0.35, 0.3, lower, 0, s.sill + 0.2, zB);
  plate(b, s.sill + 0.5, zB - 0.02);
  lightBar(k, top, zA - 0.35, 3.4);
  arches(b, hw, 1.0, [4.7], lower, 0.24);
  arches(b, hb, 1.0, [-3.4], lower, 0.2);
  fourWheels(k, 1.0, 0.7, trackFor(5, 0.7), 4.7, -3.4, 0xb5bcc4);
};

/** Station 7's engine: cab-over, compartments, hose reels, roof ladder, light bar. */
const buildFiretruck = (k: Kit): void => {
  const b = k.body;
  const red = 0xd62828;
  const white = 0xf2f2f2;
  const lower = 0x2a2a2e;
  const hw = 2.5;
  const w = hw * 2;
  const sill = 0.75;
  const floor = 1.55;
  const belt = 3.0;
  const zf = 7.35;
  const zr = -7.35;
  const cabB = 3.0;
  const roofY = 4.9;

  // Chassis and skirt.
  bx(b, w, floor - sill, zf - zr, red, 0, (floor + sill) / 2, 0);
  bx(b, w + 0.06, 0.3, zf - zr - 1.0, lower, 0, sill + 0.15, 0);

  // Cab-over: front face, doors, glass, roof, back wall.
  bx(b, w, belt - floor, 0.5, red, 0, (belt + floor) / 2, zf - 0.25);
  bx(b, 2.0, 0.95, 0.08, CHROME, 0, 2.15, zf + 0.02);
  for (let i = -3; i <= 3; i += 1) bx(b, 0.06, 0.85, 0.1, 0x26272b, i * 0.26, 2.15, zf + 0.03);
  both((side) => {
    headlamp(k, side * 1.75, 2.0, zf + 0.02, 0.7, 0.4);
    bx(b, 0.3, 0.18, 0.08, 0xffa31a, side * 1.75, 2.38, zf + 0.02, {}, 'glow');
    bx(b, 0.16, belt - floor, zf - 0.5 - cabB, red, side * (hw - 0.08), (belt + floor) / 2, (zf - 0.5 + cabB) / 2);
    bx(b, 0.2, 0.06, zf - cabB, CHROME, side * (hw - 0.08), belt + 0.03, (zf + cabB) / 2);
    bx(b, 0.03, belt - floor - 0.15, 0.05, TRIM, side * (hw + 0.005), (belt + floor) / 2, 5.5);
    bx(b, 0.05, 0.07, 0.3, CHROME, side * (hw + 0.02), belt - 0.3, 3.9);
    bx(b, 0.04, 0.3, zf - cabB - 0.4, white, side * (hw + 0.01), 2.1, (zf + cabB) / 2);
    beam(b, 0.18, 0.18, [side * (hw - 0.12), belt, zf - 0.02], [side * (hw - 0.2), roofY - 0.1, zf - 0.35], TRIM);
    bx(b, 0.18, roofY - belt, 0.25, TRIM, side * (hw - 0.14), (roofY + belt) / 2, 4.0);
    glass(k, [[side * (hw - 0.1), belt + 0.03, zf - 0.08], [side * (hw - 0.18), roofY - 0.2, zf - 0.38], [side * (hw - 0.18), roofY - 0.2, cabB + 0.1], [side * (hw - 0.1), belt + 0.03, cabB + 0.1]]);
    mirror(b, side, hw, belt + 0.2, zf - 0.5, CHROME);
    // Step under the door.
    bx(b, 0.4, 0.08, 1.0, 0x9aa0a8, side * (hw - 0.1), 1.0, 5.0);
  });
  glass(k, [[hw - 0.2, belt, zf], [-(hw - 0.2), belt, zf], [-(hw - 0.3), roofY - 0.15, zf - 0.35], [hw - 0.3, roofY - 0.15, zf - 0.35]]);
  bx(b, w - 0.1, 0.2, zf - 0.35 - cabB, white, 0, roofY - 0.1, (zf - 0.35 + cabB) / 2);
  bx(b, w, roofY - floor, 0.16, red, 0, (roofY + floor) / 2, cabB + 0.08);
  bx(b, w - 0.4, 0.4, 0.5, 0x2a2a2e, 0, belt - 0.2, zf - 0.75);
  for (const seat of k.def.seats) seatAt(b, seat, 0x2a2a2e);
  steeringWheel(b, k.seat(0));
  bx(b, w + 0.1, 0.5, 0.3, CHROME, 0, 1.0, zf);
  plate(b, 1.0, zf + 0.17);
  lightBar(k, roofY, zf - 1.0, 3.6);

  // Body: compartments, stripes, hose reels.
  const bodyTop = 4.3;
  const bz = (cabB + zr) / 2;
  const bl = cabB - zr;
  bx(b, w, bodyTop - floor, bl, red, 0, (bodyTop + floor) / 2, bz);
  bx(b, w - 0.2, 0.12, bl - 0.2, 0x9aa0a8, 0, bodyTop + 0.06, bz);
  both((side) => {
    const x = side * (hw + 0.01);
    bx(b, 0.04, 0.3, bl - 0.2, white, x, 2.0, bz);
    bx(b, 0.04, 0.06, bl - 0.2, 0xe2b93b, x, 2.22, bz);
    for (const y of [2.9, 3.3, 3.7]) bx(b, 0.03, 0.03, bl - 0.3, 0xa61e1e, x, y, bz);
    for (const z of [2.8, -1.0, -4.0, -6.9]) bx(b, 0.06, bodyTop - floor - 0.2, 0.1, CHROME, x, (bodyTop + floor) / 2, z);
    for (const z of [-2.5, -5.45]) bx(b, 0.06, 0.06, 0.7, CHROME, x + side * 0.02, 2.6, z);
    // Hose reel in a dark recess.
    bx(b, 0.04, 1.6, 1.6, TRIM, side * (hw + 0.005), 3.05, 1.2);
    cylinder(b, 0.6, 0.6, 0.3, 0xe0c25a, { x: side * (hw - 0.05), y: 3.05, z: 1.2, rz: PI / 2 }, 'smooth', 10);
    cylinder(b, 0.68, 0.68, 0.05, CHROME, { x: side * (hw + 0.1), y: 3.05, z: 1.2, rz: PI / 2 }, 'smooth', 10);
    cylinder(b, 0.15, 0.15, 0.36, CHROME, { x: side * (hw - 0.05), y: 3.05, z: 1.2, rz: PI / 2 }, 'smooth', 6);
    // Top rails.
    bx(b, 0.08, 0.08, 7.0, CHROME, side * (hw - 0.12), bodyTop + 0.45, -0.9);
    for (const z of [2.6, -0.9, -4.4]) bx(b, 0.07, 0.45, 0.07, CHROME, side * (hw - 0.12), bodyTop + 0.22, z);
    taillamp(k, side * (hw - 0.3), 2.0, zr - 0.02, 0.35, 0.5);
  });

  // Turntable and the long ladder resting on a rack over the cab.
  cylinder(b, 1.1, 1.1, 0.45, 0x5a5f66, { y: bodyTop + 0.3, z: -5.6 }, 'smooth', 12);
  bx(b, 1.6, 0.5, 1.2, red, 0, bodyTop + 0.75, -5.6);
  both((side) => {
    rod(b, 0.07, [side * 0.75, roofY, 5.6], [side * 0.75, 6.0, 5.6], 0x9aa0a8, 5);
    beam(b, 0.14, 0.24, [side * 0.65, 5.15, -6.9], [side * 0.65, 6.25, 6.4], SILVER);
  });
  bx(b, 1.7, 0.1, 0.16, 0x9aa0a8, 0, 6.0, 5.6);
  for (let i = 0; i <= 9; i += 1) {
    const t = i / 9;
    bx(b, 1.3, 0.07, 0.08, SILVER, 0, 5.15 + (6.25 - 5.15) * t, -6.6 + (6.1 + 6.6) * t);
  }
  // Rear: step, plate.
  bx(b, w, 0.3, 0.3, 0x9aa0a8, 0, 1.0, zr);
  plate(b, 1.4, zr - 0.02);

  arches(b, hw, 1.05, [5.6, -3.0, -5.0], lower, 0.24);
  k.wheelSet(carWheel(1.05, 0.75, CHROME, 0x8d939c, false), [
    [trackFor(5.4, 0.75), 1.05, 5.6, true],
    [-trackFor(5.4, 0.75), 1.05, 5.6, true],
    [trackFor(5.4, 0.75), 1.05, -3.0, false],
    [-trackFor(5.4, 0.75), 1.05, -3.0, false],
    [trackFor(5.4, 0.75), 1.05, -5.0, false],
    [-trackFor(5.4, 0.75), 1.05, -5.0, false],
  ]);
};

// ------------------------------------------------------------------ two wheels and a board

const MOTO_DARK = 0x1b1c20;

const buildMotorcycle = (k: Kit): void => {
  const b = k.body;
  const p = k.paint;
  const r = 0.78;
  const zf = 2.3;
  const zr = -2.2;
  // Frame, swingarm, engine, exhaust.
  beam(b, 0.16, 0.16, [0, 2.1, 1.75], [0, 0.95, 0.75], MOTO_DARK);
  beam(b, 0.16, 0.16, [0, 2.1, 1.75], [0, 1.6, -0.6], MOTO_DARK);
  beam(b, 0.12, 0.12, [0, 1.6, -0.6], [0, 1.2, -2.0], MOTO_DARK);
  both((side) => beam(b, 0.1, 0.16, [side * 0.22, 0.95, -0.1], [side * 0.22, r, zr], SILVER));
  bx(b, 0.75, 0.7, 1.1, 0x4a4d55, 0, 1.0, 0.35);
  for (let i = 0; i < 3; i += 1) bx(b, 0.85, 0.05, 0.75, CHROME, 0, 1.15 + i * 0.13, 0.45);
  rod(b, 0.09, [-0.35, 0.75, 0.6], [-0.42, 0.85, -0.9], CHROME, 6);
  rod(b, 0.15, [-0.42, 0.85, -0.9], [-0.45, 1.0, -2.0], CHROME, 8);
  // Tank, seat, tail.
  k.body.add(new BoxGeometry(0.8, 0.5, 1.3), p, 'smooth', { y: 1.95, z: 0.85 });
  wedge(b, 0.8, 0.3, 0.5, p, { y: 2.35, z: 1.25 });
  bx(b, 0.82, 0.05, 1.3, shade(p, 0.7), 0, 1.72, 0.85);
  bx(b, 0.75, 0.22, 1.25, 0x1b1b1f, 0, 1.29, -0.25);
  bx(b, 0.66, 0.24, 0.95, 0x1b1b1f, 0, 1.43, -1.55);
  bx(b, 0.62, 0.36, 1.5, p, 0, 1.12, -1.5);
  wedge(b, 0.62, 0.3, 0.6, p, { y: 1.45, z: -2.25, ry: PI });
  taillamp(k, 0, 1.25, -2.27, 0.4, 0.14);
  bx(b, 0.34, 0.05, 1.1, p, 0, 1.68, zr + 0.1, { rx: 0.2 });
  // Fork, fender, headlamp, fairing, windscreen.
  both((side) => rod(b, 0.07, [side * 0.22, r, zf], [side * 0.18, 2.15, 1.82], SILVER, 6));
  bx(b, 0.36, 0.06, 1.0, p, 0, r + 0.86, zf, { rx: -0.15 });
  wedge(b, 0.9, 0.55, 0.6, p, { y: 2.15, z: 1.95, ry: PI });
  cylinder(b, 0.22, 0.22, 0.12, HEAD_LENS, { y: 2.05, z: 2.18, rx: PI / 2 }, 'smooth', 10);
  cylinder(k.head, 0.2, 0.2, 0.06, HEAD_GLOW, { y: 2.05, z: 2.26, rx: PI / 2 }, 'glow', 10);
  glass(k, [[0.38, 2.4, 2.15], [-0.38, 2.4, 2.15], [-0.28, 2.85, 1.9], [0.28, 2.85, 1.9]]);
  // Handlebars, grips, mirrors.
  beam(b, 0.08, 0.08, [-0.88, 2.45, 1.55], [0.88, 2.45, 1.55], MOTO_DARK);
  both((side) => {
    rod(b, 0.07, [side * 0.65, 2.45, 1.55], [side * 0.9, 2.45, 1.55], RUBBER, 6);
    rod(b, 0.03, [side * 0.55, 2.45, 1.55], [side * 0.68, 3.0, 1.5], MOTO_DARK, 4);
    bx(b, 0.28, 0.16, 0.06, MOTO_DARK, side * 0.7, 3.06, 1.5);
    // Foot pegs.
    bx(b, 0.3, 0.06, 0.08, SILVER, side * 0.4, 0.75, -0.35);
    bx(b, 0.25, 0.06, 0.08, SILVER, side * 0.38, 0.95, -1.4);
  });
  k.wheelSet(bikeWheel(r, 0.42, 0x3a3d44), [
    [0, r, zf, true],
    [0, r, zr, false],
  ]);
};

const buildBicycle = (k: Kit): void => {
  const b = k.body;
  const p = k.paint;
  const r = 1.05;
  const zf = 1.55;
  const zr = -1.55;
  const tube = 0.07;
  const bb: V3 = [0, 0.8, -0.1];
  const seatTop: V3 = [0, 1.4, -0.5];
  const headTop: V3 = [0, 1.85, 1.15];
  const headLow: V3 = [0, 1.45, 1.28];
  // Cruiser frame.
  rod(b, tube, bb, seatTop, p);
  rod(b, tube, seatTop, headTop, p);
  rod(b, tube, bb, [0, 1.25, 0.65], p);
  rod(b, tube, [0, 1.25, 0.65], headLow, p);
  rod(b, 0.09, headLow, headTop, p);
  both((side) => {
    rod(b, 0.045, [side * 0.05, bb[1], bb[2]], [side * 0.12, r, zr], p, 5);
    rod(b, 0.045, [side * 0.04, seatTop[1], seatTop[2]], [side * 0.12, r, zr], p, 5);
    rod(b, 0.045, [side * 0.06, headLow[1], headLow[2]], [side * 0.12, r, zf], SILVER, 5);
  });
  // Fenders.
  bx(b, 0.24, 0.04, 1.2, p, 0, r + 0.92, zf - 0.2, { rx: 0.35 });
  bx(b, 0.24, 0.04, 1.2, p, 0, r + 0.92, zr + 0.2, { rx: -0.35 });
  bx(b, 0.24, 0.04, 0.8, p, 0, r + 0.6, zr - 0.75, { rx: -1.0 });
  // Saddle on its post.
  rod(b, 0.04, seatTop, [0, 1.42, -0.45], SILVER, 5);
  bx(b, 0.55, 0.14, 0.72, 0x5a3a28, 0, 1.48, -0.42);
  bx(b, 0.38, 0.08, 0.3, 0x5a3a28, 0, 1.47, -0.05);
  // Crank, pedals, chain guard.
  beam(b, 0.06, 0.06, [0.18, 0.55, 0.05], [0.18, 1.05, -0.25], MOTO_DARK);
  beam(b, 0.06, 0.06, [-0.18, 0.55, 0.05], [-0.18, 1.05, -0.25], MOTO_DARK);
  bx(b, 0.3, 0.06, 0.18, MOTO_DARK, 0.32, 0.55, 0.05);
  bx(b, 0.3, 0.06, 0.18, MOTO_DARK, -0.32, 1.05, -0.25);
  cylinder(b, 0.25, 0.25, 0.04, SILVER, { x: -0.14, y: bb[1], z: bb[2], rz: PI / 2 }, 'smooth', 10);
  bx(b, 0.04, 0.22, 1.5, shade(p, 0.8), -0.18, 0.9, -0.85, { rx: -0.13 });
  // Swept-back cruiser bars, grips, bell.
  rod(b, 0.05, headTop, [0, 2.75, 1.0], SILVER, 5);
  beam(b, 0.07, 0.07, [-0.35, 2.78, 1.0], [0.35, 2.78, 1.0], SILVER);
  both((side) => {
    rod(b, 0.04, [side * 0.35, 2.78, 1.0], [side * 0.72, 2.88, 0.68], SILVER, 5);
    rod(b, 0.065, [side * 0.62, 2.86, 0.75], [side * 0.8, 2.9, 0.6], RUBBER, 6);
  });
  cylinder(b, 0.07, 0.07, 0.05, CHROME, { x: 0.25, y: 2.85, z: 1.0 }, 'smooth', 8);
  // Wicker basket over the front wheel, with a lamp.
  const bz = 1.85;
  const by = 2.3;
  const wick = 0xc89b5c;
  bx(b, 0.9, 0.05, 0.7, shade(wick, 0.85), 0, by - 0.25, bz);
  both((side) => bx(b, 0.05, 0.5, 0.7, wick, side * 0.43, by, bz));
  bx(b, 0.9, 0.5, 0.05, wick, 0, by, bz + 0.33);
  bx(b, 0.9, 0.5, 0.05, wick, 0, by, bz - 0.33);
  bx(b, 0.92, 0.05, 0.72, shade(wick, 1.1), 0, by + 0.25, bz);
  rod(b, 0.03, [0, by - 0.27, bz], [0, headLow[1], headLow[2] + 0.1], SILVER, 4);
  cylinder(b, 0.11, 0.11, 0.1, HEAD_LENS, { y: by - 0.1, z: bz + 0.4, rx: PI / 2 }, 'smooth', 8);
  cylinder(k.head, 0.1, 0.1, 0.05, HEAD_GLOW, { y: by - 0.1, z: bz + 0.46, rx: PI / 2 }, 'glow', 8);
  bx(b, 0.14, 0.1, 0.04, TAIL_LENS, 0, r + 0.45, zr - 1.0);
  bx(k.brake, 0.12, 0.08, 0.03, TAIL_GLOW, 0, r + 0.45, zr - 1.03, {}, 'glow');
  k.wheelSet(spokedWheel(r, 0.09, 0xe8ecf0), [
    [0, r, zf, true],
    [0, r, zr, false],
  ]);
};

const buildSkateboard = (k: Kit): void => {
  const b = k.body;
  const p = k.paint;
  // Deck with kicked nose and tail, grip tape on top.
  bx(b, 1.15, 0.08, 2.4, p, 0, 0.41, 0);
  bx(b, 1.1, 0.025, 2.35, 0x222326, 0, 0.455, 0);
  both((side) => {
    bx(b, 1.1, 0.08, 0.46, p, 0, 0.44, side * 1.38, { rx: -side * 0.15 });
    bx(b, 1.05, 0.025, 0.42, 0x222326, 0, 0.483, side * 1.37, { rx: -side * 0.15 });
    // Trucks: baseplate, hanger, kingpin.
    bx(b, 0.3, 0.06, 0.36, 0x3a3d44, 0, 0.34, side * 0.95);
    bx(b, 0.18, 0.12, 0.14, 0x3a3d44, 0, 0.26, side * 0.95);
    bx(b, 0.95, 0.08, 0.12, SILVER, 0, 0.18, side * 0.95);
  });
  bx(b, 0.2, 0.02, 1.6, 0xffffff, 0, 0.365, 0);
  const wheel = (wb: PartBuilder): void => {
    cylinder(wb, 0.13, 0.13, 0.15, 0xf2efe6, { rz: PI / 2 }, 'smooth', 12);
    cylinder(wb, 0.06, 0.06, 0.16, shade(p, 0.9), { rz: PI / 2 }, 'smooth', 6);
  };
  k.wheelSet(wheel, [
    [0.45, 0.13, 0.95, false],
    [-0.45, 0.13, 0.95, false],
    [0.45, 0.13, -0.95, false],
    [-0.45, 0.13, -0.95, false],
  ]);
  // The front truck turns: one pivot carries the two front wheels.
  k.trucks.push({ x: 0, y: 0.13, z: 0.95, wheels: [0, 1] });
};

// ------------------------------------------------------------------ boats

const lum = (c: number): number => ((((c >> 16) & 255) * 0.299) + (((c >> 8) & 255) * 0.587) + ((c & 255) * 0.114)) / 255;

interface HullSection {
  readonly z: number;
  readonly hw: number;
  readonly keel: number;
  readonly chine: number;
  readonly deck: number;
}

/** A two-tone hull: a darker bottom up to the chines, painted topsides above. */
const hull = (b: PartBuilder, sections: readonly HullSection[], top: number, bottom: number, chineIn = 0.82): void => {
  loft(b, sections.map((s) => ({ z: s.z, pts: [[0, s.keel], [s.hw * chineIn, s.chine], [-s.hw * chineIn, s.chine]] as const })), bottom);
  loft(b, sections.map((s) => ({ z: s.z, pts: [[s.hw * chineIn, s.chine], [s.hw, s.deck], [-s.hw, s.deck], [-s.hw * chineIn, s.chine]] as const })), top);
};

/** A boat propeller (axis Z): hub plus three blades. */
const propeller = (r: number, c = 0xc9a64a) => (b: PartBuilder): void => {
  cylinder(b, r * 0.25, r * 0.25, r * 0.5, c, { rx: PI / 2 }, 'smooth', 6);
  for (let i = 0; i < 3; i += 1) {
    const a = (i * PI * 2) / 3;
    bx(b, r * 0.4, r, 0.05, c, Math.sin(a) * r * 0.5, Math.cos(a) * r * 0.5, 0, { rz: -a, ry: 0.4 });
  }
};

/** A railing: posts and a top rail between the given deck points (all at their own deck height). */
const railing = (b: PartBuilder, pts: readonly V3[], h: number, c = CHROME, every = 2.4): void => {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const z = pts[i + 1]!;
    beam(b, 0.07, 0.07, [a[0], a[1] + h, a[2]], [z[0], z[1] + h, z[2]], c);
    const n = Math.max(1, Math.round(Math.hypot(z[0] - a[0], z[2] - a[2]) / every));
    for (let j = 0; j < n; j += 1) {
      const t = j / n;
      const x = a[0] + (z[0] - a[0]) * t;
      const y = a[1] + (z[1] - a[1]) * t;
      const zz = a[2] + (z[2] - a[2]) * t;
      bx(b, 0.06, h, 0.06, c, x, y + h / 2, zz);
    }
  }
  const last = pts[pts.length - 1]!;
  bx(b, 0.06, h, 0.06, c, last[0], last[1] + h / 2, last[2]);
};

const navLights = (b: PartBuilder, x: number, y: number, z: number): void => {
  // Port (red) is the LEFT side, which is +X here; starboard green on -X.
  bx(b, 0.12, 0.12, 0.2, 0xff3030, x, y, z, {}, 'glow');
  bx(b, 0.12, 0.12, 0.2, 0x30ff6a, -x, y, z, {}, 'glow');
};

const buildSpeedboat = (k: Kit): void => {
  const b = k.body;
  const p = k.paint;
  const bottom = lum(p) > 0.55 ? 0x1e3a5f : 0xf2f2f2;
  const cushion = 0xf2efe6;
  const sole = 1.15;
  const gun = 2.0;
  const zt = -6.0;
  const zb = 2.4;
  // Aft hull up to the cockpit sole, fore hull up to the bow deck.
  hull(b, [
    { z: zt, hw: 2.4, keel: 0.15, chine: 0.45, deck: sole },
    { z: -3.0, hw: 2.5, keel: 0.0, chine: 0.38, deck: sole },
    { z: zb, hw: 2.45, keel: 0.05, chine: 0.45, deck: sole },
  ], p, bottom);
  hull(b, [
    { z: zb, hw: 2.45, keel: 0.05, chine: 0.45, deck: gun },
    { z: 4.6, hw: 1.9, keel: 0.35, chine: 0.8, deck: 2.15 },
    { z: 6.5, hw: 0.2, keel: 1.2, chine: 1.6, deck: 2.3 },
  ], p, bottom);
  // Gunwales, rub rail, transom, sole.
  both((side) => {
    bx(b, 0.25, gun - sole, zb - zt, p, side * 2.3, (gun + sole) / 2, (zb + zt) / 2);
    bx(b, 0.32, 0.08, zb - zt, 0x2a2d33, side * 2.32, gun, (zb + zt) / 2);
    bx(b, 0.04, 0.18, zb - zt - 0.4, bottom, side * 2.44, 1.65, (zb + zt) / 2);
  });
  bx(b, 4.5, gun - sole, 0.25, p, 0, (gun + sole) / 2, zt + 0.12);
  bx(b, 4.4, 0.05, zb - zt - 0.3, 0xd9cbb0, 0, sole + 0.02, (zb + zt) / 2);
  // Rear sun pad and the four seats.
  bx(b, 4.2, 0.35, 1.3, cushion, 0, sole + 0.2, zt + 0.95);
  for (const s of k.def.seats) {
    bx(b, 1.2, s.y - sole - 0.28, 0.9, shade(p, 0.92), s.x, (s.y - 0.28 + sole) / 2, s.z + 0.1);
    seatAt(b, s, cushion, 1.2, 1.0);
  }
  // Consoles, wheel, windshield.
  both((side) => {
    bx(b, 1.4, 0.95, 0.8, p, side * 1.0, sole + 0.47, 1.85);
    bx(b, 1.3, 0.08, 0.6, 0x1b1c20, side * 1.0, sole + 0.98, 1.8, { rx: -0.3 });
  });
  steeringWheel(b, k.seat(0), 0.9, 0.9);
  glass(k, [[2.25, gun, zb], [-2.25, gun, zb], [-1.95, 2.75, 1.85], [1.95, 2.75, 1.85]]);
  both((side) => {
    glass(k, [[side * 2.3, gun, zb], [side * 2.0, 2.75, 1.85], [side * 2.3, gun, 1.2]]);
  });
  beam(b, 0.07, 0.07, [-1.95, 2.75, 1.85], [1.95, 2.75, 1.85], CHROME);
  // Wakeboard tower over the rear seats.
  both((side) => beam(b, 0.14, 0.14, [side * 2.3, gun, -1.0], [side * 1.4, 3.32, -1.6], 0x2a2d33));
  beam(b, 0.18, 0.18, [-1.4, 3.32, -1.6], [1.4, 3.32, -1.6], 0x2a2d33);
  // Bow: hatch, cleats, rails, nav lights, lamp.
  bx(b, 1.2, 0.06, 1.2, shade(p, 0.9), 0, 2.13, 3.6);
  railing(b, [[1.9, 2.15, 2.6], [0.8, 2.25, 5.6]], 0.35);
  railing(b, [[-1.9, 2.15, 2.6], [-0.8, 2.25, 5.6]], 0.35);
  navLights(b, 1.2, 2.3, 5.4);
  bx(b, 0.3, 0.14, 0.1, HEAD_LENS, 0, 2.35, 6.2);
  bx(k.head, 0.28, 0.12, 0.05, HEAD_GLOW, 0, 2.35, 6.27, {}, 'glow');
  // Outboard motor and its prop.
  bx(b, 0.75, 0.9, 0.62, 0x1a1b1f, 0, gun + 0.15, zt - 0.2);
  bx(b, 0.77, 0.12, 0.64, p, 0, gun + 0.35, zt - 0.2);
  bx(b, 0.22, 1.7, 0.28, 0x2a2d33, 0, 0.95, zt - 0.3);
  bx(b, 0.3, 0.2, 0.5, 0x2a2d33, 0, 0.3, zt - 0.3);
  k.rotor(propeller(0.32), 0, 0.3, zt - 0.5, 'z');
};

const buildJetski = (k: Kit): void => {
  const b = k.body;
  const p = k.paint;
  const bottom = 0x24262b;
  hull(b, [
    { z: -3.1, hw: 1.1, keel: 0.2, chine: 0.38, deck: 1.0 },
    { z: -1.0, hw: 1.2, keel: 0.0, chine: 0.3, deck: 1.05 },
    { z: 1.5, hw: 1.15, keel: 0.05, chine: 0.4, deck: 1.1 },
    { z: 2.8, hw: 0.7, keel: 0.4, chine: 0.7, deck: 1.25 },
    { z: 3.2, hw: 0.15, keel: 0.75, chine: 0.9, deck: 1.3 },
  ], p, bottom, 0.8);
  // White accent stripe along the topsides.
  both((side) => bx(b, 0.04, 0.12, 3.6, 0xffffff, side * 1.16, 0.82, -0.3, { ry: side * -0.02 }));
  // Seat pedestal, saddle, footwells.
  bx(b, 0.95, 0.35, 3.1, p, 0, 1.17, -0.95);
  bx(b, 0.78, 0.15, 1.7, 0x1c1c22, 0, 1.43, -0.45);
  bx(b, 0.74, 0.25, 1.0, 0x1c1c22, 0, 1.48, -1.65);
  both((side) => bx(b, 0.32, 0.05, 2.4, 0x1c1c22, side * 0.82, 1.06, -0.8));
  // Front cowl, display, windscreen.
  loft(b, [
    sec(0.3, 0.55, 1.0, 1.55, 1.75, 0.7),
    sec(1.6, 0.8, 1.0, 1.45, 1.6, 0.75),
    sec(3.0, 0.38, 1.05, 1.18, 1.27, 0.7),
  ], p);
  bx(b, 0.5, 0.05, 0.35, 0x1b1c20, 0, 1.78, 0.45, { rx: 0.4 });
  glass(k, [[0.5, 1.7, 0.55], [-0.5, 1.7, 0.55], [-0.4, 2.0, 0.35], [0.4, 2.0, 0.35]]);
  both((side) => {
    bx(b, 0.32, 0.1, 0.06, HEAD_LENS, side * 0.35, 1.5, 1.72, { ry: side * -0.3 });
    bx(k.head, 0.3, 0.08, 0.04, HEAD_GLOW, side * 0.36, 1.5, 1.76, { ry: side * -0.3 }, 'glow');
  });
  // Handlebar column and bars.
  rod(b, 0.08, [0, 1.65, 0.45], [0, 2.05, 0.6], 0x1b1c20, 6);
  beam(b, 0.08, 0.08, [-0.72, 2.1, 0.6], [0.72, 2.1, 0.6], 0x1b1c20);
  both((side) => rod(b, 0.07, [side * 0.5, 2.1, 0.6], [side * 0.78, 2.1, 0.6], RUBBER, 6));
  // Jet nozzle and a grab handle.
  cylinder(b, 0.22, 0.26, 0.4, 0x2a2d33, { y: 0.55, z: -3.15, rx: PI / 2 }, 'smooth', 8);
  beam(b, 0.08, 0.08, [-0.35, 1.7, -2.3], [0.35, 1.7, -2.3], 0x1b1c20);
};

const buildYacht = (k: Kit): void => {
  const b = k.body;
  const p = k.paint;
  const light = lum(p) > 0.55;
  const accent = light ? 0x1b2a41 : 0xf6f6f2;
  const tint = 0x1d3550;
  const teak = 0xc9a26b;
  const cushion = 0xf3efe4;
  const deck = 1.6;
  const fly = 4.1;
  hull(b, [
    { z: -14.4, hw: 4.7, keel: 0.35, chine: 0.9, deck },
    { z: -10, hw: 5.0, keel: 0.0, chine: 0.7, deck },
    { z: 4, hw: 4.9, keel: 0.0, chine: 0.8, deck: 1.75 },
    { z: 10, hw: 3.8, keel: 0.25, chine: 1.2, deck: 2.05 },
    { z: 15, hw: 0.3, keel: 1.4, chine: 2.0, deck: 2.5 },
  ], p, accent, 0.8);
  // Hull windows and boot stripe.
  both((side) => {
    bx(b, 0.08, 0.3, 7, tint, side * 4.5, 1.28, 2.5);
    bx(b, 0.06, 0.12, 22, accent, side * 4.62, 1.5, -2.5);
  });
  // Swim platform, steps, teak aft deck.
  bx(b, 8.8, 0.2, 0.8, teak, 0, 0.75, -14.6);
  for (let i = 0; i < 2; i += 1) bx(b, 1.6, 0.2, 0.4, teak, 2.8, 1.05 + i * 0.3, -14.2 + i * 0.35);
  bx(b, 8.6, 0.04, 11, teak, 0, deck + 0.02, -8.8);
  // Aft deck lounge: the five main-deck seats and a table.
  for (let i = 2; i <= 6; i += 1) {
    const s = k.seat(i);
    seatAt(b, s, cushion, 1.5, 0.95, false);
    bx(b, 1.5, s.y - deck - 0.28, 1.0, p, s.x, (s.y - 0.28 + deck) / 2, s.z + 0.1);
  }
  cylinder(b, 0.9, 0.9, 0.08, teak, { y: deck + 1.0, z: -4.5 }, 'smooth', 12);
  cylinder(b, 0.12, 0.12, 1.0, CHROME, { y: deck + 0.5, z: -4.5 }, 'smooth', 6);
  // Salon: painted box, wraparound tinted windows, aft glass doors.
  const sf = 9.0;
  const sr = -0.5;
  bx(b, 7.6, fly - deck, sf - sr, p, 0, (fly + deck) / 2, (sf + sr) / 2);
  bx(b, 7.7, 1.0, sf - sr - 1.2, tint, 0, 3.0, (sf + sr) / 2 + 0.2);
  bx(b, 4.0, 1.9, 0.06, tint, 0, deck + 1.05, sr - 0.02);
  wedge(b, 7.6, 0.9, 1.6, p, { y: fly - 0.45, z: sf + 0.8, ry: PI });
  // Flybridge deck with an overhang.
  bx(b, 8.4, 0.16, 11.5, p, 0, fly - 0.06, 4.25);
  bx(b, 8.5, 0.08, 11.6, accent, 0, fly - 0.16, 4.25);
  // Helm console, windscreen, helm seats and the lounge seat.
  bx(b, 7.0, 1.0, 0.9, p, 0, fly + 0.5, 7.4);
  bx(b, 6.6, 0.08, 0.7, 0x1b1c20, 0, fly + 1.02, 7.3, { rx: -0.35 });
  glass(k, [[3.4, fly + 1.0, 7.85], [-3.4, fly + 1.0, 7.85], [-3.1, fly + 1.75, 7.45], [3.1, fly + 1.75, 7.45]]);
  beam(b, 0.07, 0.07, [-3.1, fly + 1.75, 7.45], [3.1, fly + 1.75, 7.45], CHROME);
  steeringWheel(b, k.seat(0), 1.05, 0.95);
  for (const i of [0, 1, 7]) {
    const s = k.seat(i);
    seatAt(b, s, cushion, 1.4, 1.1);
    bx(b, 1.2, s.y - fly - 0.28, 0.9, shade(p, 0.9), s.x, (s.y - 0.28 + fly) / 2, s.z + 0.1);
  }
  bx(b, 2.6, 0.3, 1.0, cushion, 2.0, fly + 0.15, 0.2);
  // Flybridge railing.
  railing(b, [[4.05, fly, 9.5], [4.05, fly, -1.3], [-4.05, fly, -1.3], [-4.05, fly, 9.5]], 0.95);
  // Radar arch, dome, mast and its spinning antenna.
  both((side) => beam(b, 0.5, 0.35, [side * 3.7, fly, 3.0], [side * 2.4, 8.2, 3.6], p));
  bx(b, 5.6, 0.45, 1.2, p, 0, 8.3, 3.6);
  dome(b, 0.65, 0xf8f8f8, { x: 1.4, y: 8.52, z: 3.6 });
  rod(b, 0.06, [-1.2, 8.5, 3.6], [-1.2, 9.85, 3.6], 0xe8e8e8, 5);
  bx(b, 0.12, 0.12, 0.12, 0xffffff, -1.2, 9.92, 3.6, {}, 'glow');
  bx(b, 0.3, 0.3, 0.3, 0x2a2d33, 0, 8.68, 3.6);
  k.rotor((rb) => {
    bx(rb, 2.0, 0.14, 0.22, 0x2a2d33, 0, 0, 0);
    bx(rb, 0.2, 0.14, 0.2, 0x2a2d33, 0, -0.12, 0);
  }, 0, 8.95, 3.6, 'y');
  // Foredeck: sun pads, side rails, bow rail, anchor, nav lights.
  bx(b, 4.6, 0.3, 3.2, cushion, 0, 2.18, 11.0, { rx: -0.06 });
  bx(b, 4.7, 0.06, 3.3, accent, 0, 2.02, 11.0, { rx: -0.06 });
  both((side) => {
    railing(b, [[side * 4.75, deck, -14.0], [side * 4.85, deck, -1.0], [side * 4.7, 1.8, 6], [side * 3.6, 2.05, 10.2], [side * 1.6, 2.3, 13.3], [0, 2.45, 14.8]], 1.0);
    // Side decks along the salon.
    bx(b, 0.9, 0.04, 9.5, teak, side * 4.2, deck + 0.12, 4.25);
  });
  bx(b, 0.5, 0.35, 0.3, 0x9aa0a8, 0, 1.95, 14.6);
  navLights(b, 4.0, fly + 0.4, 8.8);
  bx(b, 0.5, 0.18, 0.12, HEAD_LENS, 0, 8.05, 4.25);
  bx(k.head, 0.46, 0.15, 0.06, HEAD_GLOW, 0, 8.05, 4.33, {}, 'glow');
  // Rudders and twin props under the stern.
  both((side) => {
    bx(b, 0.08, 0.6, 0.7, 0x5a5f66, side * 1.6, 0.35, -13.4);
    rod(b, 0.06, [side * 1.6, 0.45, -11.0], [side * 1.6, 0.45, -12.6], 0x9aa0a8, 5);
    k.rotor(propeller(0.4), side * 1.6, 0.45, -12.7, 'z');
  });
};

// ------------------------------------------------------------------ aircraft

const buildHeli = (k: Kit): void => {
  const b = k.body;
  const p = k.paint;
  const stripe = lum(p) > 0.6 ? 0x1d3c6e : 0xf4f4f4;
  const floor = 0.95;
  const hw = 1.32;
  const belt = 1.75;
  const roofY = 3.68;
  const zf = 3.1;
  const zr = -1.3;
  // Skids and struts (touching y = 0).
  both((side) => {
    rod(b, 0.1, [side * 1.65, 0.1, -2.1], [side * 1.65, 0.1, 2.5], 0x2a2d33, 6);
    rod(b, 0.1, [side * 1.65, 0.1, 2.5], [side * 1.65, 0.45, 3.0], 0x2a2d33, 6);
    for (const z of [1.8, -0.9]) rod(b, 0.07, [side * 1.65, 0.1, z], [side * 1.05, 0.75, z], 0x2a2d33, 5);
  });
  // Cabin floor, lower walls, nose.
  bx(b, hw * 2, 0.28, zf - zr, p, 0, floor - 0.14, (zf + zr) / 2);
  bx(b, hw * 2 - 0.3, 0.03, zf - zr - 0.2, 0x34363b, 0, floor + 0.01, (zf + zr) / 2);
  both((side) => {
    bx(b, 0.12, belt - floor + 0.28, zf - zr, p, side * (hw - 0.06), (belt + floor - 0.28) / 2, (zf + zr) / 2);
    bx(b, 0.04, 0.16, zf - zr, stripe, side * (hw + 0.01), 1.3, (zf + zr) / 2);
  });
  loft(b, [sec(zf, hw, floor - 0.28, 1.3, belt, 0.95), sec(3.9, 1.0, 0.85, 1.25, 1.6, 0.85), sec(4.3, 0.45, 1.05, 1.25, 1.4, 0.8)], p);
  bx(b, hw * 2 - 0.4, 0.35, 0.5, 0x1b1c20, 0, belt + 0.05, zf - 0.2);
  for (const s of k.def.seats) seatAt(b, s, 0x2f3238, 1.2, 1.1);
  rod(b, 0.04, [k.seat(0).x, floor, 2.4], [k.seat(0).x, 1.9, 2.2], 0x1b1c20, 5);
  // Glass canopy and its frame.
  const rf = 1.9;
  glass(k, [[hw - 0.05, belt, zf], [-(hw - 0.05), belt, zf], [-(hw - 0.2), roofY - 0.1, rf], [hw - 0.2, roofY - 0.1, rf]]);
  glass(k, [[0.9, 1.4, 3.95], [-0.9, 1.4, 3.95], [-(hw - 0.05), belt, zf], [hw - 0.05, belt, zf]]);
  both((side) => {
    glass(k, [[side * hw, belt, zf], [side * (hw - 0.15), roofY - 0.1, rf], [side * (hw - 0.15), roofY - 0.1, zr], [side * hw, belt, zr]]);
    beam(b, 0.12, 0.12, [side * hw, belt, zf], [side * (hw - 0.15), roofY - 0.1, rf], 0x1b1c20);
    bx(b, 0.12, roofY - belt, 0.14, 0x1b1c20, side * (hw - 0.08), (roofY + belt) / 2, 0.6);
  });
  bx(b, 0.08, 0.1, 1.2, 0x1b1c20, 0, roofY - 0.05, (zf + rf) / 2 + 0.2, { rx: 0.9 });
  // Roof, engine fairing, rear fuselage taper into the boom.
  bx(b, (hw - 0.15) * 2, 0.25, rf - zr + 0.2, p, 0, roofY + 0.05, (rf + zr) / 2 - 0.1);
  bx(b, 1.5, 0.45, 2.6, shade(p, 0.9), 0, roofY + 0.38, -0.9);
  loft(b, [sec(-3.3, 0.38, 2.25, 2.55, 2.85, 0.9), sec(zr, hw, floor - 0.28, 2.2, roofY + 0.2, 0.75)], p);
  loft(b, [sec(-6.1, 0.2, 2.6, 2.75, 2.88, 0.9), sec(-3.3, 0.38, 2.25, 2.55, 2.85, 0.9)], p);
  bx(b, 0.06, 0.14, 2.6, stripe, 0, 2.95, -4.6);
  // Tail fin, stabiliser, beacons.
  bx(b, 0.12, 1.5, 0.85, p, 0, 3.4, -5.75, { rx: -0.35 });
  bx(b, 2.0, 0.1, 0.6, p, 0, 2.75, -5.1);
  bx(b, 0.12, 0.12, 0.12, 0xff3030, 0, roofY + 0.65, -2.0, {}, 'glow');
  bx(b, 0.12, 0.12, 0.12, 0xff3030, 1.0, 2.75, -5.1, {}, 'glow');
  bx(b, 0.12, 0.12, 0.12, 0x30ff6a, -1.0, 2.75, -5.1, {}, 'glow');
  // Landing light under the nose.
  bx(b, 0.3, 0.1, 0.3, HEAD_LENS, 0, 0.95, 3.9);
  bx(k.head, 0.26, 0.06, 0.26, HEAD_GLOW, 0, 0.9, 3.9, {}, 'glow');
  // Mast and rotors.
  cylinder(b, 0.14, 0.18, 0.4, 0x5a5f66, { y: roofY + 0.62, z: 0.0 }, 'smooth', 8);
  k.rotor((rb) => {
    cylinder(rb, 0.32, 0.32, 0.22, 0x3a3d44, {}, 'smooth', 8);
    bx(rb, 0.42, 0.06, 12.6, 0x2a2d33, 0, 0.06, 0);
    bx(rb, 12.6, 0.06, 0.42, 0x2a2d33, 0, 0.06, 0);
    for (const t of [6.1, -6.1]) {
      bx(rb, 0.44, 0.07, 0.3, 0xf2c94c, 0, 0.06, t);
      bx(rb, 0.3, 0.07, 0.44, 0xf2c94c, t, 0.06, 0);
    }
  }, 0, roofY + 0.88, 0.0, 'y');
  k.rotor((rb) => {
    cylinder(rb, 0.1, 0.1, 0.12, 0x3a3d44, { rz: PI / 2 }, 'smooth', 6);
    bx(rb, 0.04, 1.5, 0.18, 0x2a2d33, 0, 0, 0);
    bx(rb, 0.04, 0.18, 1.5, 0x2a2d33, 0, 0, 0);
  }, -0.25, 3.15, -5.7, 'x');
};

const buildPlane = (k: Kit): void => {
  const b = k.body;
  const p = k.paint;
  const stripe = lum(p) > 0.6 ? 0x2f6fb5 : 0xf2f2f2;
  const hw = 1.1;
  const floor = 1.35;
  const belt = 2.45;
  const wingY = 4.1;
  const zf = 3.0;
  const zr = -2.2;
  // Gear: nose leg and wheel, two main legs.
  rod(b, 0.07, [0, 1.25, 4.65], [0, 0.42, 4.65], 0x9aa0a8, 6);
  both((side) => beam(b, 0.12, 0.08, [side * 0.9, 1.15, 0.4], [side * 1.68, 0.5, 0.4], 0x9aa0a8));
  // Cabin: floor, walls, glass, seats, panel.
  bx(b, hw * 2, 0.4, zf - zr, p, 0, floor - 0.2, (zf + zr) / 2);
  bx(b, hw * 2 - 0.3, 0.03, zf - zr - 0.3, 0x34363b, 0, floor + 0.01, (zf + zr) / 2);
  both((side) => {
    bx(b, 0.12, belt - floor, zf - zr, p, side * (hw - 0.06), (belt + floor) / 2, (zf + zr) / 2);
    bx(b, 0.04, 0.18, 12.0, stripe, side * (hw + 0.01), 1.9, -0.6);
    glass(k, [[side * (hw - 0.05), belt, zf], [side * (hw - 0.1), wingY, 2.1], [side * (hw - 0.1), wingY, -0.6], [side * (hw - 0.05), belt, zr]]);
    beam(b, 0.12, 0.12, [side * (hw - 0.06), belt, zf], [side * (hw - 0.1), wingY, 2.1], 0x2a2d33);
    bx(b, 0.12, wingY - belt, 0.14, 0x2a2d33, side * (hw - 0.08), (wingY + belt) / 2, 0.15);
    beam(b, 0.12, 0.12, [side * (hw - 0.06), belt, zr], [side * (hw - 0.1), wingY, -0.6], 0x2a2d33);
    // Wing struts.
    beam(b, 0.14, 0.08, [side * hw, floor - 0.1, 0.7], [side * 4.4, wingY, 0.7], 0xd8dce2);
  });
  glass(k, [[hw - 0.05, belt, zf], [-(hw - 0.05), belt, zf], [-(hw - 0.1), wingY, 2.1], [hw - 0.1, wingY, 2.1]]);
  for (const s of k.def.seats) seatAt(b, s, 0x5a4636, 1.2, 1.1);
  bx(b, hw * 2 - 0.3, 0.45, 0.3, 0x1b1c20, 0, belt - 0.1, zf - 0.2);
  beam(b, 0.6, 0.08, [0, 2.2, 2.4], [0, 2.2, 2.5], 0x1b1c20);
  rod(b, 0.04, [0, 2.2, 2.75], [0, 2.2, 2.45], 0x1b1c20, 5);
  // Engine cowl and spinner.
  loft(b, [sec(zf, hw, floor - 0.4, 2.0, belt + 0.15, 0.9), sec(5.4, 1.0, 1.2, 2.0, 2.5, 0.85), sec(6.3, 0.62, 1.55, 2.0, 2.3, 0.8)], p);
  both((side) => bx(b, 0.14, 0.14, 0.5, 0x5a5f66, side * 0.4, 1.15, 5.6));
  bx(b, 0.9, 0.3, 0.06, 0x1b1c20, 0, 1.7, 6.32);
  // Tail cone, fin, rudder, stabiliser.
  loft(b, [sec(-6.6, 0.22, 2.2, 2.45, 2.65, 0.8), sec(zr, hw, floor - 0.4, 2.0, wingY - 0.05, 0.75)], p);
  bx(b, 0.12, 2.3, 1.3, p, 0, 3.75, -5.75, { rx: -0.35 });
  bx(b, 0.13, 1.6, 0.5, stripe, 0, 3.95, -6.4, { rx: -0.35 });
  bx(b, 5.6, 0.12, 1.3, p, 0, 2.55, -6.0);
  bx(b, 5.6, 0.13, 0.35, stripe, 0, 2.55, -6.55);
  // High wing with coloured tips, nav lights and a landing light.
  bx(b, 18.0, 0.3, 2.7, p, 0, wingY + 0.15, 0.75);
  both((side) => {
    bx(b, 1.2, 0.32, 2.72, stripe, side * 8.4, wingY + 0.15, 0.75);
    bx(b, 6.0, 0.06, 0.6, shade(p, 0.85), side * 5.5, wingY + 0.03, -0.35);
  });
  navLights(b, 8.95, wingY + 0.15, 1.2);
  bx(b, 0.4, 0.14, 0.08, HEAD_LENS, 3.0, wingY + 0.12, 2.12);
  bx(k.head, 0.36, 0.11, 0.05, HEAD_GLOW, 3.0, wingY + 0.12, 2.16, {}, 'glow');
  bx(b, 0.12, 0.12, 0.12, 0xff3030, 0, 5.0, -6.5, {}, 'glow');
  // Propeller (axis Z) with its spinner.
  k.rotor((rb) => {
    rb.add(new CylinderGeometry(0.02, 0.34, 0.6, 10), 0xe8e8ec, 'smooth', { rx: PI / 2, z: 0.2 });
    bx(rb, 0.2, 2.5, 0.06, 0x2a2d33, 0, 0, 0, { ry: 0.25 });
    for (const t of [1.15, -1.15]) bx(rb, 0.21, 0.18, 0.07, 0xf2c94c, 0, t, 0, { ry: 0.25 });
  }, 0, 2.0, 6.45, 'z');
  k.wheelSet(carWheel(0.42, 0.28, 0xd8dce2), [[0, 0.42, 4.65, true]]);
  k.wheelSet(carWheel(0.5, 0.34, 0xd8dce2), [
    [1.75, 0.5, 0.4, false],
    [-1.75, 0.5, 0.4, false],
  ]);
};

// ------------------------------------------------------------------ registry, cache, instancing

const BUILDERS: Readonly<Record<string, (k: Kit) => void>> = {
  sedan: buildSedan,
  suv: buildSuv,
  sports: buildSports,
  luxury: buildLuxury,
  convertible: buildConvertible,
  pickup: buildPickup,
  police: buildPolice,
  ambulance: buildAmbulance,
  taxi: buildTaxi,
  van: buildVan,
  motorcycle: buildMotorcycle,
  bicycle: buildBicycle,
  skateboard: buildSkateboard,
  speedboat: buildSpeedboat,
  jetski: buildJetski,
  yacht: buildYacht,
  heli: buildHeli,
  plane: buildPlane,
  firetruck: buildFiretruck,
};

/** Built geometry per (key, paint), shared by every instance and never disposed. */
const CACHE = new Map<string, Template>();

const defFor = (key: string): VehicleDef => {
  try {
    return vehicleByKey(key);
  } catch {
    return vehicleByKey('sedan');
  }
};

const templateFor = (key: string, paint: number): Template => {
  const id = `${key}:${paint}`;
  let t = CACHE.get(id);
  if (!t) {
    const builder = BUILDERS[key] ?? buildSedan;
    const kit = new Kit(defFor(key), paint);
    builder(kit);
    t = toTemplate(kit);
    CACHE.set(id, t);
  }
  return t;
};

/**
 * A new instance of a vehicle model. Light groups (headlights, brake
 * lights, siren halves, taxi FARE glow) start hidden; the caller toggles
 * their `visible`.
 */
export const buildVehicleModel = (key: string, paint: number): VehicleModel => {
  const t = templateFor(key, paint);
  const root = new Group();
  root.name = `vehicle-${key}`;
  const body = meshesFor(t.body, `${key}-body`);
  root.add(body);
  if (t.glass) {
    const pane = new Mesh(t.glass, GLASS);
    pane.name = `${key}-glass`;
    pane.renderOrder = 2;
    body.add(pane);
  }
  const lights = (g: Geo | null, name: string): Object3D | null => {
    if (!g) return null;
    const o = meshesFor(g, `${key}-${name}`, false);
    o.visible = false;
    body.add(o);
    return o;
  };
  const headlights = lights(t.head, 'headlights');
  const brakeLights = lights(t.brake, 'brake');
  const red = lights(t.red, 'siren-red');
  const blue = lights(t.blue, 'siren-blue');
  const taxiSign = lights(t.sign, 'fare');

  const wheels: Object3D[] = [];
  const steering: Object3D[] = [];
  const pivots = new Map<number, Object3D>();
  for (const truck of t.trucks) {
    const pivot = new Object3D();
    pivot.name = `${key}-truck`;
    pivot.position.set(truck.x, truck.y, truck.z);
    root.add(pivot);
    steering.push(pivot);
    for (const i of truck.wheels) pivots.set(i, pivot);
  }
  t.wheels.forEach((w, i) => {
    const wheel = meshesFor(w.geo, `${key}-wheel${i}`);
    const truck = pivots.get(i);
    if (truck) {
      wheel.position.set(w.x - truck.position.x, w.y - truck.position.y, w.z - truck.position.z);
      truck.add(wheel);
    } else if (w.steer) {
      const pivot = new Object3D();
      pivot.name = `${key}-steer${i}`;
      pivot.position.set(w.x, w.y, w.z);
      pivot.add(wheel);
      root.add(pivot);
      steering.push(pivot);
    } else {
      wheel.position.set(w.x, w.y, w.z);
      root.add(wheel);
    }
    wheels.push(wheel);
  });

  const rotors = t.rotors.map((r, i) => {
    const object = meshesFor(r.geo, `${key}-rotor${i}`);
    object.position.set(r.x, r.y, r.z);
    body.add(object);
    return { object, axis: r.axis };
  });

  return {
    root,
    body,
    wheels,
    steering,
    rotors,
    headlights,
    brakeLights,
    sirens: red && blue ? { red, blue } : null,
    taxiSign,
    dispose: () => {
      // Geometry and materials are shared through the cache: only detach.
      root.removeFromParent();
    },
  };
};
