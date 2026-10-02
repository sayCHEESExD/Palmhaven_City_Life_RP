import type { Aabb } from '../types/math.js';
import type { Ramp } from '../world/buildings.js';
import { city } from '../world/city.js';
import { SWIM_Y, WORLD_BOUNDS, isLand } from '../world/layout.js';

/** Grid cell for the broad phase, in world units. */
const CELL = 16;
const EPS = 1e-4;

export interface MoveResult {
  value: number;
  y: number;
  hit: boolean;
}

/**
 * THE WORLD AS THE SIMULATION SEES IT, shared by the server (authority) and
 * every client (prediction), so both collide against the exact same shapes:
 *
 *   - axis-aligned BOXES: block slabs, walls, furniture, parked cars, docks;
 *   - RAMPS: sloped floors (the pier, the causeway bridges);
 *   - the GROUND at y = 0 on land, and the sea beyond it, where a walker
 *     swims at `SWIM_Y`;
 *   - DYNAMIC GROUPS, keyed, set at run time: a home's furniture, a locked
 *     front door. A group may EXEMPT one mover (the owner walks through their
 *     own locked door).
 *
 * A mover is a square of half-width r and some height. Horizontal moves
 * resolve one axis at a time; a face no higher than `step` above the feet is
 * stepped onto rather than blocking.
 */
export class WorldCollision {
  private readonly solids: (Aabb | null)[] = [];
  private readonly exempt: (string | null)[] = [];
  private readonly grid = new Map<number, number[]>();
  private readonly seen: number[] = [];
  private stamp = 1;
  private readonly marks: number[] = [];
  private readonly groups = new Map<string, number[]>();
  private readonly groupKeys = new Map<string, string>();
  private readonly free: number[] = [];
  private readonly ramps: readonly Ramp[];
  /** Who is moving right now: their exemptions apply. */
  mover = '';

  constructor() {
    const data = city();
    for (const box of data.solids) this.add(box, null);
    this.ramps = data.ramps;
  }

  /** Every solid, for diagnostics and the camera's occlusion test. */
  get boxes(): readonly Aabb[] {
    return this.solids.filter((box): box is Aabb => box !== null);
  }

  /** Solids near a point, for the camera (allocation-free iteration). */
  forEachNear(minX: number, maxX: number, minZ: number, maxZ: number, visit: (box: Aabb) => void): void {
    for (const index of this.query(minX, maxX, minZ, maxZ)) {
      const box = this.solids[index];
      if (box && !this.isExempt(index)) visit(box);
    }
  }

  /**
   * Replace a dynamic group's boxes. Cheap when unchanged: the boxes are
   * compared by value first, so calling this on every patch costs nothing.
   */
  setGroup(key: string, boxes: readonly Aabb[], exemptMover: string | null = null): void {
    const signature = `${exemptMover ?? ''}#${boxes.map((b) => `${b.minX.toFixed(2)},${b.maxX.toFixed(2)},${b.minY.toFixed(2)},${b.maxY.toFixed(2)},${b.minZ.toFixed(2)},${b.maxZ.toFixed(2)}`).join('|')}`;
    if (this.groupKeys.get(key) === signature) return;
    this.groupKeys.set(key, signature);
    for (const index of this.groups.get(key) ?? []) this.remove(index);
    const indices: number[] = [];
    for (const box of boxes) indices.push(this.add(box, exemptMover));
    this.groups.set(key, indices);
  }

  clearGroup(key: string): void {
    this.setGroup(key, []);
  }

  private add(box: Aabb, exempt: string | null): number {
    const index = this.free.pop() ?? this.solids.length;
    this.solids[index] = box;
    this.exempt[index] = exempt;
    this.marks[index] = 0;
    for (let cx = Math.floor(box.minX / CELL); cx <= Math.floor(box.maxX / CELL); cx += 1) {
      for (let cz = Math.floor(box.minZ / CELL); cz <= Math.floor(box.maxZ / CELL); cz += 1) {
        const key = cellKey(cx, cz);
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(index);
      }
    }
    return index;
  }

  private remove(index: number): void {
    const box = this.solids[index];
    if (!box) return;
    for (let cx = Math.floor(box.minX / CELL); cx <= Math.floor(box.maxX / CELL); cx += 1) {
      for (let cz = Math.floor(box.minZ / CELL); cz <= Math.floor(box.maxZ / CELL); cz += 1) {
        const list = this.grid.get(cellKey(cx, cz));
        if (!list) continue;
        const at = list.indexOf(index);
        if (at >= 0) list.splice(at, 1);
      }
    }
    this.solids[index] = null;
    this.exempt[index] = null;
    this.free.push(index);
  }

  private isExempt(index: number): boolean {
    const who = this.exempt[index];
    return who !== null && who !== undefined && who === this.mover;
  }

  /** Candidate solids overlapping an XZ rectangle, each once. Reuses one array. */
  private query(minX: number, maxX: number, minZ: number, maxZ: number): readonly number[] {
    const out = this.seen;
    out.length = 0;
    this.stamp += 1;
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx += 1) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz += 1) {
        const list = this.grid.get(cellKey(cx, cz));
        if (!list) continue;
        for (const index of list) {
          if (this.marks[index] === this.stamp) continue;
          this.marks[index] = this.stamp;
          const b = this.solids[index];
          if (!b) continue;
          if (b.maxX <= minX || b.minX >= maxX || b.maxZ <= minZ || b.minZ >= maxZ) continue;
          if (this.isExempt(index)) continue;
          out.push(index);
        }
      }
    }
    return out;
  }

  /** True when a mover box (half-width r, height h) at (x, y, z) overlaps any solid. */
  blocked(x: number, y: number, z: number, r: number, h: number): boolean {
    for (const index of this.query(x - r, x + r, z - r, z + r)) {
      const b = this.solids[index]!;
      if (b.maxY > y + EPS && b.minY < y + h - EPS) return true;
    }
    return false;
  }

  /** True when a rectangle (axis-aligned, half extents) at height y..y+h overlaps a solid. */
  blockedRect(x: number, z: number, ex: number, ez: number, y: number, h: number): boolean {
    for (const index of this.query(x - ex, x + ex, z - ez, z + ez)) {
      const b = this.solids[index]!;
      if (b.maxY > y + EPS && b.minY < y + h - EPS) return true;
    }
    return false;
  }

  /**
   * Move horizontally along one axis, stepping up low faces.
   *
   * Writes the new coordinate on that axis into `out.value`, a raised `y` into
   * `out.y` when a step was taken, and `out.hit` when a wall stopped it.
   */
  moveAxis(axis: 'x' | 'z', x: number, y: number, z: number, delta: number, r: number, h: number, step: number, out: MoveResult): void {
    out.y = y;
    out.hit = false;
    let nx = axis === 'x' ? x + delta : x;
    let nz = axis === 'z' ? z + delta : z;
    let ny = y;

    for (let pass = 0; pass < 3; pass += 1) {
      let collided = false;
      for (const index of this.query(nx - r, nx + r, nz - r, nz + r)) {
        const b = this.solids[index]!;
        if (b.maxY <= ny + EPS || b.minY >= ny + h - EPS) continue;
        const rise = b.maxY - ny;
        if (rise <= step && !this.blocked(nx, b.maxY, nz, r, h)) {
          ny = b.maxY;
          collided = true;
          break;
        }
        if (axis === 'x') nx = delta > 0 ? b.minX - r - EPS : b.maxX + r + EPS;
        else nz = delta > 0 ? b.minZ - r - EPS : b.maxZ + r + EPS;
        out.hit = true;
        collided = true;
        break;
      }
      if (!collided) break;
    }
    if (axis === 'x') {
      if ((delta > 0 && nx < x) || (delta < 0 && nx > x)) nx = x;
    } else if ((delta > 0 && nz < z) || (delta < 0 && nz > z)) nz = z;

    out.value = axis === 'x' ? nx : nz;
    out.y = ny;
  }

  /** Height of a ramp under (x, z), or -Infinity. */
  rampAt(x: number, z: number): number {
    let best = Number.NEGATIVE_INFINITY;
    for (const ramp of this.ramps) {
      if (x < ramp.minX || x > ramp.maxX || z < ramp.minZ || z > ramp.maxZ) continue;
      const t = ramp.axis === 'x' ? (x - ramp.minX) / (ramp.maxX - ramp.minX) : (z - ramp.minZ) / (ramp.maxZ - ramp.minZ);
      const y = ramp.y0 + (ramp.y1 - ramp.y0) * t;
      if (y > best) best = y;
    }
    return best;
  }

  /** The ground with no boxes: 0 on land, the swimmer's level at sea. */
  groundAt(x: number, z: number): number {
    return isLand(x, z) ? 0 : SWIM_Y;
  }

  /**
   * The highest floor under the footprint at or below `y + tolerance`: a box
   * top, a ramp, or the ground (land or sea).
   */
  floorBelow(x: number, y: number, z: number, radius: number, tolerance = EPS, water = true): number {
    const r = radius * 0.92;
    let floor = water ? this.groundAt(x, z) : 0;
    const ramp = this.rampAt(x, z);
    if (ramp > floor && ramp <= y + tolerance + 1.2) floor = ramp;
    for (const index of this.query(x - r, x + r, z - r, z + r)) {
      const b = this.solids[index]!;
      if (b.maxY <= y + tolerance && b.maxY > floor) floor = b.maxY;
    }
    return floor;
  }

  /** The lowest ceiling above a head at `headY`, or +Infinity. */
  ceilingAbove(x: number, headY: number, z: number, radius: number): number {
    const r = radius * 0.92;
    let ceiling = Number.POSITIVE_INFINITY;
    for (const index of this.query(x - r, x + r, z - r, z + r)) {
      const b = this.solids[index]!;
      if (b.minY >= headY - EPS && b.minY < ceiling) ceiling = b.minY;
    }
    return ceiling;
  }

  /** Keep a position inside the world. */
  clampToBounds(position: { x: number; z: number }, r: number): void {
    const b = WORLD_BOUNDS;
    if (position.x < b.x0 + r) position.x = b.x0 + r;
    if (position.x > b.x1 - r) position.x = b.x1 - r;
    if (position.z < b.z0 + r) position.z = b.z0 + r;
    if (position.z > b.z1 - r) position.z = b.z1 - r;
  }
}

const cellKey = (cx: number, cz: number): number => (cx + 4096) * 8192 + (cz + 4096);
