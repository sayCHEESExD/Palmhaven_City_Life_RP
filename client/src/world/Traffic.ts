import { AVENUES, CURB, ROAD_HALF, STREETS, signalPhase } from '@palmhaven/shared';
import { Group, Vector2 } from 'three';
import { buildVehicleModel, type VehicleModel } from '../models/vehicles.js';

/**
 * AMBIENT TRAFFIC: cars cruising the island grid in the right-hand lanes,
 * stopping at red lights, queueing behind each other and pausing for anyone
 * in the road. Purely cosmetic and client-side - each player sees their own
 * traffic, so it costs no bandwidth - spawned round the camera and recycled
 * when it drives out of range. A car you drive into is shunted aside and
 * replaced.
 */

const LANE = 4.4;
const CRUISE = [20, 27] as const;
const SPAWN_RADIUS = 260;
const DESPAWN_RADIUS = 380;
const KINDS = ['sedan', 'sedan', 'suv', 'pickup', 'convertible', 'taxi', 'luxury', 'van'] as const;
const PAINTS = [0xf2f2f2, 0xd94a4a, 0x3a7bd5, 0x2f2f36, 0x58c27d, 0xf5c542, 0x8c2f4b, 0x9aa0a6, 0xff6f91, 0x6fd3c4, 0x1f2a44] as const;

interface Node {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly out: Edge[];
}

interface Edge {
  readonly from: Node;
  readonly to: Node;
  readonly dx: number;
  readonly dz: number;
  readonly axis: 'ns' | 'ew';
  /** Lane start (just past the junction) and the stop line. */
  readonly sx: number;
  readonly sz: number;
  readonly ex: number;
  readonly ez: number;
  readonly length: number;
}

interface Car {
  model: VehicleModel;
  root: Group;
  edge: Edge;
  /** Distance along the edge's lane, or along the turn when turning. */
  s: number;
  turn: { next: Edge; p0: Vector2; p1: Vector2; p2: Vector2; length: number } | null;
  speed: number;
  cruise: number;
  x: number;
  z: number;
  yaw: number;
  knocked: number;
  kx: number;
  kz: number;
  wheel: number;
}

const buildGraph = (): Node[] => {
  const nodes: Node[] = [];
  STREETS.forEach((s, si) => AVENUES.forEach((a, ai) => nodes.push({ id: si * AVENUES.length + ai, x: a.x, z: s.z, out: [] })));
  const at = (si: number, ai: number): Node | undefined => (si >= 0 && si < STREETS.length && ai >= 0 && ai < AVENUES.length ? nodes[si * AVENUES.length + ai] : undefined);
  const link = (a: Node, b: Node): void => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    const rx = -dz;
    const rz = dx;
    const sx = a.x + dx * (ROAD_HALF + 1) + rx * LANE;
    const sz = a.z + dz * (ROAD_HALF + 1) + rz * LANE;
    const ex = b.x - dx * (ROAD_HALF + 7.5) + rx * LANE;
    const ez = b.z - dz * (ROAD_HALF + 7.5) + rz * LANE;
    a.out.push({ from: a, to: b, dx, dz, axis: Math.abs(dz) > 0.5 ? 'ns' : 'ew', sx, sz, ex, ez, length: Math.hypot(ex - sx, ez - sz) });
  };
  for (let si = 0; si < STREETS.length; si += 1) {
    for (let ai = 0; ai < AVENUES.length; ai += 1) {
      const node = at(si, ai)!;
      for (const [ds, da] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const other = at(si + ds, ai + da);
        if (other) link(node, other);
      }
    }
  }
  return nodes;
};

export class Traffic {
  readonly root = new Group();
  private readonly nodes = buildGraph();
  private readonly edges: Edge[] = this.nodes.flatMap((n) => n.out);
  private readonly cars: Car[] = [];
  private readonly pool: Car[] = [];
  private spawnCooldown = 0;

  constructor(private readonly max: number) {}

  /** Cars nearby for the minimap and sounds. */
  get active(): readonly Car[] {
    return this.cars;
  }

  update(delta: number, nowMs: number, cx: number, cz: number, blockers: readonly { x: number; z: number; r: number }[], night: number): void {
    const dt = Math.min(0.1, Math.max(0, delta));
    this.spawnCooldown -= dt;
    // Recycle distant cars; top up near the camera.
    for (let i = this.cars.length - 1; i >= 0; i -= 1) {
      const car = this.cars[i]!;
      if (Math.hypot(car.x - cx, car.z - cz) > DESPAWN_RADIUS || car.knocked > 2.5) this.recycle(i);
    }
    if (this.cars.length < this.max && this.spawnCooldown <= 0) {
      this.spawnCooldown = 0.25;
      this.spawn(cx, cz);
    }
    for (const car of this.cars) this.drive(car, dt, nowMs, blockers);
    for (const car of this.cars) {
      car.root.position.set(car.x, CURB * 0 + 0.05, car.z);
      car.root.rotation.y = car.yaw;
      car.wheel += (car.speed / 0.75) * dt;
      for (const w of car.model.wheels) w.rotation.x = car.wheel;
      if (car.model.headlights) car.model.headlights.visible = night > 0.55;
      if (car.model.taxiSign) car.model.taxiSign.visible = true;
      if (car.model.brakeLights) car.model.brakeLights.visible = night > 0.55 || car.speed < car.cruise * 0.4;
    }
  }

  private spawn(cx: number, cz: number): void {
    // An edge whose lane passes near the edge of the spawn ring, out of sight-ish.
    const candidates = this.edges.filter((e) => {
      const mx = (e.sx + e.ex) / 2;
      const mz = (e.sz + e.ez) / 2;
      const d = Math.hypot(mx - cx, mz - cz);
      return d > 70 && d < SPAWN_RADIUS;
    });
    const edge = candidates[Math.floor(Math.random() * candidates.length)];
    if (!edge) return;
    const s = Math.random() * edge.length * 0.6;
    const x = edge.sx + edge.dx * s;
    const z = edge.sz + edge.dz * s;
    if (this.cars.some((c) => Math.hypot(c.x - x, c.z - z) < 16)) return;
    let car = this.pool.pop();
    if (!car) {
      const kind = KINDS[Math.floor(Math.random() * KINDS.length)]!;
      const paint = kind === 'taxi' ? 0xffc61a : kind === 'van' ? 0xf7f3ea : PAINTS[Math.floor(Math.random() * PAINTS.length)]!;
      const model = buildVehicleModel(kind, paint);
      car = { model, root: model.root, edge, s, turn: null, speed: 0, cruise: 0, x, z, yaw: 0, knocked: 0, kx: 0, kz: 0, wheel: 0 };
    }
    car.edge = edge;
    car.s = s;
    car.turn = null;
    car.cruise = CRUISE[0] + Math.random() * (CRUISE[1] - CRUISE[0]);
    car.speed = car.cruise * 0.6;
    car.x = x;
    car.z = z;
    car.yaw = Math.atan2(edge.dx, edge.dz);
    car.knocked = 0;
    car.root.visible = true;
    this.root.add(car.root);
    this.cars.push(car);
  }

  private recycle(index: number): void {
    const car = this.cars[index]!;
    this.cars.splice(index, 1);
    car.root.removeFromParent();
    if (this.pool.length < 8) this.pool.push(car);
    else car.model.dispose();
  }

  private drive(car: Car, dt: number, nowMs: number, blockers: readonly { x: number; z: number; r: number }[]): void {
    if (car.knocked > 0) {
      car.knocked += dt;
      car.x += car.kx * dt;
      car.z += car.kz * dt;
      car.kx *= 1 - dt * 2;
      car.kz *= 1 - dt * 2;
      car.yaw += dt * 2 * Math.sign(car.kx + car.kz);
      car.speed = 0;
      return;
    }
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    // Something in the road ahead? A player, their car, another car.
    let gap = Infinity;
    for (const b of blockers) {
      const dx = b.x - car.x;
      const dz = b.z - car.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * -fz + dz * fx);
      if (ahead > 0 && side < b.r + 2.4) gap = Math.min(gap, ahead - b.r);
      // Driven into: get shunted out of the way.
      if (Math.hypot(dx, dz) < b.r + 1.6 && b.r > 3) {
        car.knocked = 0.01;
        const d = Math.hypot(dx, dz) || 1;
        car.kx = (-dx / d) * 18;
        car.kz = (-dz / d) * 18;
        return;
      }
    }
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * -fz + dz * fx);
      if (ahead > 0 && side < 2.6) gap = Math.min(gap, ahead - 10);
    }
    // A red light at the end of this block.
    if (!car.turn) {
      const toStop = car.edge.length - car.s;
      const phase = signalPhase(car.edge.to.id, nowMs)[car.edge.axis];
      if (phase !== 'green' && toStop > -0.5 && toStop < 40) gap = Math.min(gap, toStop - 0.5);
    }
    const want = gap < 1 ? 0 : Math.min(car.cruise, Math.max(0, (gap - 1) * 1.6));
    car.speed += Math.max(-40 * dt, Math.min(14 * dt, want - car.speed));
    car.s += car.speed * dt;
    if (!car.turn) {
      if (car.s >= car.edge.length) {
        const options = car.edge.to.out.filter((e) => e.to !== car.edge.from);
        const next = options.length > 0 ? options[Math.floor(Math.random() * options.length)]! : car.edge.to.out[0]!;
        const p0 = new Vector2(car.edge.ex, car.edge.ez);
        const p2 = new Vector2(next.sx, next.sz);
        const straight = Math.abs(next.dx * car.edge.dx + next.dz * car.edge.dz) > 0.9;
        const p1 = straight ? p0.clone().add(p2).multiplyScalar(0.5) : intersectLines(p0, car.edge.dx, car.edge.dz, p2, next.dx, next.dz);
        car.turn = { next, p0, p1, p2, length: p0.distanceTo(p1) + p1.distanceTo(p2) };
        car.s -= car.edge.length;
      } else {
        car.x = car.edge.sx + car.edge.dx * car.s;
        car.z = car.edge.sz + car.edge.dz * car.s;
        car.yaw = Math.atan2(car.edge.dx, car.edge.dz);
      }
    }
    if (car.turn) {
      const t = Math.min(1, car.s / car.turn.length);
      const { p0, p1, p2 } = car.turn;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      const x = a * p0.x + b * p1.x + c * p2.x;
      const z = a * p0.y + b * p1.y + c * p2.y;
      const tx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
      const tz = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
      car.x = x;
      car.z = z;
      if (Math.hypot(tx, tz) > 1e-4) car.yaw = Math.atan2(tx, tz);
      if (t >= 1) {
        car.edge = car.turn.next;
        car.s -= car.turn.length;
        car.turn = null;
      }
    }
  }

  dispose(): void {
    for (const car of [...this.cars, ...this.pool]) car.model.dispose();
    this.cars.length = 0;
    this.pool.length = 0;
    this.root.removeFromParent();
  }
}

const intersectLines = (p: Vector2, dx: number, dz: number, q: Vector2, ex: number, ez: number): Vector2 => {
  // p + t d = q - u e (the second line is followed back from q).
  const det = dx * -ez - dz * -ex;
  if (Math.abs(det) < 1e-6) return p.clone().add(q).multiplyScalar(0.5);
  const t = ((q.x - p.x) * -ez - (q.y - p.y) * -ex) / det;
  return new Vector2(p.x + dx * t, p.y + dz * t);
};
