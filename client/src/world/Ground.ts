import {
  AIRPORT,
  AIRPORT_BLVD_X,
  AVENUES,
  BEACH_X0,
  BLOCKS,
  BRIDGE,
  CAUSEWAY_FILLS,
  CAUSEWAY_Z,
  CURB,
  ISLAND,
  MAINLAND,
  ROAD_HALF,
  ROAD_WIDTH,
  STREETS,
  type CityPlan,
  type GroundPatch,
} from '@palmhaven/shared';
import { BoxGeometry, CylinderGeometry, DoubleSide, Group, ShapeUtils, Vector2 } from 'three';
import { wedge } from '../models/shapes.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { groundMaterial, pavementMaterial, roadMaterial } from './materials.js';
import { PavementBuilder, RoadBuilder, SurfaceBuilder } from './meshers.js';

/**
 * THE GROUND OF PALMHAVEN: the key and the mainland, their sea walls and the
 * beach shelf, every city block's sidewalk slab, the road network with its
 * markings, the lots on top of the blocks (lawns, lots, pools, courts), the
 * docks and the pier, and the two causeway bridges.
 *
 * Built once into a few big meshes: the ground is cheap and always visible.
 */

const SURF = { grass: 0, sand: 1, tarmac: 2, deck: 3, pool: 4, court: 5 } as const;
const GRASS = 0x79c25a;
const SAND = 0xf2dca6;
const SEAWALL = 0xcfc8ba;
const SIDEWALK_COLOR = 0xe9e3d7;

/** The outline of a rounded rectangle, clockwise from the top-left, with arcs of `steps` segments. */
const roundedOutline = (r: { x0: number; z0: number; x1: number; z1: number; round: number }, steps = 8): [number, number][] => {
  const k = r.round;
  const out: [number, number][] = [];
  const arc = (cx: number, cz: number, from: number): void => {
    for (let i = 0; i <= steps; i += 1) {
      const a = from + (i / steps) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * k, cz + Math.sin(a) * k]);
    }
  };
  arc(r.x1 - k, r.z0 + k, -Math.PI / 2);
  arc(r.x1 - k, r.z1 - k, 0);
  arc(r.x0 + k, r.z1 - k, Math.PI / 2);
  arc(r.x0 + k, r.z0 + k, Math.PI);
  return out;
};

/** Clip a polygon to x <= cut (keep 'below') or x >= cut. */
const clipX = (poly: [number, number][], cut: number, keepBelow: boolean): [number, number][] => {
  const inside = (p: [number, number]): boolean => (keepBelow ? p[0] <= cut : p[0] >= cut);
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (cut - a[0]) / (b[0] - a[0]);
      out.push([cut, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
};

const fillPolygon = (s: SurfaceBuilder, poly: [number, number][], y: number, color: number, surface: number): void => {
  const contour = poly.map((p) => new Vector2(p[0], p[1]));
  const tris = ShapeUtils.triangulateShape(contour, []);
  const indices: number[] = [];
  for (const t of tris) indices.push(t[0]!, t[1]!, t[2]!);
  s.triangles(poly, indices, y, color, surface);
};

const PATCH_COLOR: Record<GroundPatch['kind'], number> = {
  grass: GRASS,
  parking: 0x5e5d62,
  plaza: 0xf2eadb,
  court: 0x3f7fcf,
  pool: 0x34c6e4,
  dirt: 0xe6c891,
  tarmac: 0x56565b,
  driveway: 0xcfc7b8,
  runway: 0x45464b,
  field: 0x5fb64a,
  sand: SAND,
  deck: 0xc99a62,
  helipad: 0x60656d,
  garden: 0x6dbb55,
};

export class Ground {
  readonly root = new Group();

  constructor(plan: CityPlan) {
    const surfaces = new SurfaceBuilder();
    const pave = new PavementBuilder();
    // Decals on the land and the sidewalk blocks, one depth layer each.
    // Decals on the land and the sidewalk blocks, one depth layer each (see
    // `groundMaterial(layer)`): a patch, its markings, lines on those.
    const decals: SurfaceBuilder[] = [];
    const paveDecals: PavementBuilder[] = [];
    const decal = (layer: number): SurfaceBuilder => (decals[layer] ??= new SurfaceBuilder());
    const paveDecal = (layer: number): PavementBuilder => (paveDecals[layer] ??= new PavementBuilder());
    const roads = new RoadBuilder();
    const parts = new PartBuilder();

    // ------------------------------------------------------------ land
    const island = roundedOutline(ISLAND);
    fillPolygon(surfaces, clipX(island, BEACH_X0, true), -0.05, GRASS, SURF.grass);
    const beach = clipX(island, BEACH_X0, false);
    fillPolygon(surfaces, beach, -0.04, SAND, SURF.sand);
    // The beach shelves into the sea; elsewhere a sea wall drops to the water.
    const n = island.length;
    let first = 0;
    for (let i = 0; i < n; i += 1) {
      if (island[i]![0] >= BEACH_X0 && island[(i + 1) % n]![0] < BEACH_X0) first = (i + 1) % n;
    }
    const walled: [number, number][] = [];
    const shelf: [number, number][] = [];
    for (let k = 0; k < n; k += 1) {
      const p = island[(first + k) % n]!;
      if (p[0] < BEACH_X0) walled.push(p);
      else shelf.push(p);
    }
    surfaces.wall([...walled].reverse(), -0.05, -6, SEAWALL, SURF.tarmac, false);
    for (let i = 0; i < shelf.length - 1; i += 1) {
      const a = shelf[i]!;
      const b = shelf[i + 1]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      const ox = (dz / len) * 14;
      const oz = (-dx / len) * 14;
      surfaces.quad3([a[0], -0.04, a[1]], [a[0] + ox, -3.2, a[1] + oz], [b[0] + ox, -3.2, b[1] + oz], [b[0], -0.04, b[1]], 0xe9cf95, SURF.sand);
    }
    const mainland = roundedOutline(MAINLAND, 6);
    fillPolygon(surfaces, mainland, -0.05, GRASS, SURF.grass);
    surfaces.wall(mainland, -0.05, -6, SEAWALL, SURF.tarmac);
    for (const fill of CAUSEWAY_FILLS) {
      surfaces.rect(fill.x0, fill.z0, fill.x1, fill.z1, -0.05, GRASS, SURF.grass);
      surfaces.wall([[fill.x0, fill.z0], [fill.x1, fill.z0], [fill.x1, fill.z1], [fill.x0, fill.z1]], -0.05, -6, SEAWALL, SURF.tarmac);
    }

    // ---------------------------------------------------------- blocks
    for (const block of BLOCKS) pave.slab(block.r.x0, -0.6, block.r.z0, block.r.x1, CURB, block.r.z1, SIDEWALK_COLOR);

    // ----------------------------------------------------------- roads
    const Y = 0.03;
    for (const a of AVENUES) {
      for (let i = 0; i < STREETS.length - 1; i += 1) roads.segment(a.x, STREETS[i]!.z + ROAD_HALF, a.x, STREETS[i + 1]!.z - ROAD_HALF, ROAD_WIDTH, Y, true);
    }
    for (const s of STREETS) {
      for (let i = 0; i < AVENUES.length - 1; i += 1) roads.segment(AVENUES[i]!.x + ROAD_HALF, s.z, AVENUES[i + 1]!.x - ROAD_HALF, s.z, ROAD_WIDTH, Y, true);
      for (const a of AVENUES) roads.segment(a.x, s.z - ROAD_HALF, a.x, s.z + ROAD_HALF, ROAD_WIDTH, Y, false);
    }
    for (const cz of CAUSEWAY_Z) {
      const west = AIRPORT_BLVD_X + ROAD_HALF;
      const east = AVENUES[0]!.x - ROAD_HALF;
      roads.segment(east, cz, BRIDGE.rampE1, cz, ROAD_WIDTH, Y, true);
      roads.segment(BRIDGE.rampE1, cz, BRIDGE.deck1, cz, ROAD_WIDTH, Y, true, BRIDGE.deckTop + 0.03);
      roads.segment(BRIDGE.deck1, cz, BRIDGE.deck0, cz, ROAD_WIDTH, BRIDGE.deckTop + 0.03, true);
      roads.segment(BRIDGE.deck0, cz, BRIDGE.rampW0, cz, ROAD_WIDTH, BRIDGE.deckTop + 0.03, true, Y);
      roads.segment(BRIDGE.rampW0, cz, west, cz, ROAD_WIDTH, Y, true);
      roads.segment(AIRPORT_BLVD_X, cz - ROAD_HALF, AIRPORT_BLVD_X, cz + ROAD_HALF, ROAD_WIDTH, Y, false);
      // Sidewalk strips along the causeway.
      for (const side of [-1, 1]) pave.slab(MAINLAND.x1 - 4, -0.4, cz + side * ROAD_HALF + (side < 0 ? -6 : 0), BRIDGE.rampW0, CURB, cz + side * ROAD_HALF + (side < 0 ? 0 : 6), SIDEWALK_COLOR);
      for (const side of [-1, 1]) pave.slab(BRIDGE.rampE1, -0.4, cz + side * ROAD_HALF + (side < 0 ? -6 : 0), ISLAND.x0 + 4, CURB, cz + side * ROAD_HALF + (side < 0 ? 0 : 6), SIDEWALK_COLOR);
      // The raised span: embankment ramps, the deck, railings and piers.
      wedge(parts, BRIDGE.halfWidth * 2, BRIDGE.deckTop, BRIDGE.deck0 - BRIDGE.rampW0, 0xd7d0c4, { x: (BRIDGE.rampW0 + BRIDGE.deck0) / 2, y: BRIDGE.deckTop / 2 - 0.02, z: cz, ry: Math.PI / 2 });
      wedge(parts, BRIDGE.halfWidth * 2, BRIDGE.deckTop, BRIDGE.rampE1 - BRIDGE.deck1, 0xd7d0c4, { x: (BRIDGE.deck1 + BRIDGE.rampE1) / 2, y: BRIDGE.deckTop / 2 - 0.02, z: cz, ry: -Math.PI / 2 });
      parts.add(new BoxGeometry(BRIDGE.deck1 - BRIDGE.deck0, BRIDGE.deckThickness, BRIDGE.halfWidth * 2), 0xd7d0c4, 'smooth', { x: (BRIDGE.deck0 + BRIDGE.deck1) / 2, y: BRIDGE.deckTop - BRIDGE.deckThickness / 2 - 0.02, z: cz });
      for (const side of [-1, 1]) {
        const z = cz + side * (BRIDGE.halfWidth - 0.4);
        parts.add(new BoxGeometry(BRIDGE.rampE1 - BRIDGE.rampW0, 0.5, 0.8), 0x2bb3a3, 'smooth', { x: (BRIDGE.rampW0 + BRIDGE.rampE1) / 2, y: BRIDGE.deckTop + 1.15, z });
        for (let x = BRIDGE.deck0; x <= BRIDGE.deck1; x += 5) parts.add(new BoxGeometry(0.4, 1.2, 0.4), 0xf3f0ea, 'smooth', { x, y: BRIDGE.deckTop + 0.6, z });
      }
      for (const x of [BRIDGE.deck0 + 20, (BRIDGE.deck0 + BRIDGE.deck1) / 2, BRIDGE.deck1 - 20]) {
        for (const side of [-1, 1]) parts.add(new CylinderGeometry(1.4, 1.6, BRIDGE.deckTop + 6, 10), 0xc8c1b4, 'smooth', { x, y: (BRIDGE.deckTop - 6) / 2 - 1.2, z: cz + side * 9 });
      }
    }
    // The mainland roads.
    const blvd: number[] = [CAUSEWAY_Z[0] - ROAD_HALF - 60, CAUSEWAY_Z[0], -150, CAUSEWAY_Z[1], CAUSEWAY_Z[1] + ROAD_HALF + 60];
    for (let i = 0; i < blvd.length - 1; i += 1) {
      const z0 = blvd[i]! + (i === 0 ? 0 : ROAD_HALF);
      const z1 = blvd[i + 1]! - (i === blvd.length - 2 ? 0 : ROAD_HALF);
      roads.segment(AIRPORT_BLVD_X, z0, AIRPORT_BLVD_X, z1, ROAD_WIDTH, Y, true);
    }
    roads.segment(AIRPORT_BLVD_X, -150 - ROAD_HALF, AIRPORT_BLVD_X, -150 + ROAD_HALF, ROAD_WIDTH, Y, false);
    roads.segment(AIRPORT_BLVD_X - ROAD_HALF, -150, -972, -150, ROAD_WIDTH, Y, true);
    for (const side of [-1, 1]) pave.slab(AIRPORT_BLVD_X + side * ROAD_HALF + (side < 0 ? -6 : 0), -0.4, blvd[0]!, AIRPORT_BLVD_X + side * ROAD_HALF + (side < 0 ? 0 : 6), CURB, blvd[blvd.length - 1]!, SIDEWALK_COLOR);
    pave.slab(-1040, -0.4, -172, -700 - ROAD_HALF - 6, CURB, -161, SIDEWALK_COLOR);

    // --------------------------------------------------------- patches
    // A patch inside a bigger one (a garden in a lawn) stacks a layer above it.
    const placed: { p: GroundPatch; level: number }[] = [];
    const size = (q: GroundPatch): number => (q.x1 - q.x0) * (q.z1 - q.z0);
    for (const p of [...plan.patches].sort((a, b) => size(b) - size(a))) {
      let level = 1;
      for (const q of placed) {
        if ((q.p.y ?? CURB) !== (p.y ?? CURB)) continue;
        if (q.p.x0 < p.x1 && p.x0 < q.p.x1 && q.p.z0 < p.z1 && p.z0 < q.p.z1) level = Math.max(level, q.level + 3);
      }
      placed.push({ p, level });
      this.patch(p, level, decal, paveDecal);
    }
    // Runway paint, over the runway and the apron round it.
    const MARK = Math.max(1, ...placed.map((q) => q.level)) + 3;
    // Runway markings: centre dashes and threshold bars.
    const rw = AIRPORT.runway;
    const rz = (rw.z0 + rw.z1) / 2;
    for (let x = rw.x0 + 40; x < rw.x1 - 40; x += 24) decal(MARK).rect(x, rz - 0.5, x + 12, rz + 0.5, 0.07, 0xf5f5f0, SURF.tarmac);
    for (const end of [rw.x0 + 6, rw.x1 - 26]) for (let i = 0; i < 8; i += 1) decal(MARK).rect(end, rw.z0 + 3 + i * 4.4, end + 20, rw.z0 + 5 + i * 4.4, 0.07, 0xf5f5f0, SURF.tarmac);
    for (const side of [rw.z0 + 1, rw.z1 - 2]) decal(MARK).rect(rw.x0, side, rw.x1, side + 1, 0.07, 0xf5f5f0, SURF.tarmac);
    for (let x = AIRPORT.taxiway.x0; x < AIRPORT.taxiway.x1; x += 8) decal(MARK).rect(x, (AIRPORT.taxiway.z0 + AIRPORT.taxiway.z1) / 2 - 0.25, x + 5, (AIRPORT.taxiway.z0 + AIRPORT.taxiway.z1) / 2 + 0.25, 0.06, 0xffd23f, SURF.tarmac);

    // ----------------------------------------------------------- docks
    for (const d of plan.docks) {
      if (d.kind === 'concrete') continue;
      surfaces.slab(d.x0, d.top - 0.5, d.z0, d.x1, d.top, d.z1, 0xc99a62, SURF.deck);
      const long = d.x1 - d.x0 > d.z1 - d.z0;
      const length = long ? d.x1 - d.x0 : d.z1 - d.z0;
      for (let a = 0; a <= length; a += 6) {
        for (const side of [0, 1]) {
          const x = long ? d.x0 + a : side ? d.x1 - 0.3 : d.x0 + 0.3;
          const z = long ? (side ? d.z1 - 0.3 : d.z0 + 0.3) : d.z0 + a;
          // Posts stop just under the planks: flush tops would shimmer through the deck.
          parts.add(new CylinderGeometry(0.3, 0.3, d.top + 3.95, 6), 0x8a6644, 'smooth', { x, y: (d.top - 0.05 - 4) / 2, z });
        }
      }
    }

    const add = (mesh: import('three').Mesh | null): void => {
      if (mesh) this.root.add(mesh);
    };
    const gm = groundMaterial();
    gm.side = DoubleSide;
    gm.polygonOffset = true;
    gm.polygonOffsetFactor = 1;
    gm.polygonOffsetUnits = 1;
    add(surfaces.build(gm, 'ground'));
    add(pave.build(pavementMaterial(), 'sidewalks'));
    paveDecals.forEach((layer, i) => add(layer.build(pavementMaterial(i), `plazas-${i}`)));
    decals.forEach((layer, i) => add(layer.build(groundMaterial(i), `ground-decals-${i}`)));
    add(roads.build(roadMaterial(), 'roads'));
    this.root.add(parts.build('ground-parts'));
  }

  private patch(p: GroundPatch, level: number, decal: (layer: number) => SurfaceBuilder, paveDecal: (layer: number) => PavementBuilder): void {
    const y = (p.y ?? CURB) + 0.01;
    const s = decal(level);
    const marks = decal(level + 1);
    const lines = decal(level + 2);
    const pave = paveDecal(level);
    const color = PATCH_COLOR[p.kind];
    switch (p.kind) {
      case 'plaza':
      case 'driveway':
        pave.rect(p.x0, p.z0, p.x1, p.z1, y, color);
        return;
      case 'grass':
      case 'garden':
      case 'field':
        s.rect(p.x0, p.z0, p.x1, p.z1, y, color, SURF.grass);
        if (p.kind === 'field') {
          const mx = (p.x0 + p.x1) / 2;
          marks.rect(mx - 0.25, p.z0 + 3, mx + 0.25, p.z1 - 3, y + 0.01, 0xf7f7f2, SURF.tarmac);
          for (const z of [p.z0 + 3, p.z1 - 3.5]) marks.rect(p.x0 + 3, z, p.x1 - 3, z + 0.5, y + 0.01, 0xf7f7f2, SURF.tarmac);
          for (const x of [p.x0 + 3, p.x1 - 3.5]) marks.rect(x, p.z0 + 3, x + 0.5, p.z1 - 3, y + 0.01, 0xf7f7f2, SURF.tarmac);
        }
        return;
      case 'parking': {
        s.rect(p.x0, p.z0, p.x1, p.z1, y, color, SURF.tarmac);
        const horizontal = p.x1 - p.x0 > p.z1 - p.z0;
        const span = horizontal ? p.x1 - p.x0 : p.z1 - p.z0;
        const across = horizontal ? p.z1 - p.z0 : p.x1 - p.x0;
        const rows = across >= 30 ? [0, 1] : [0.5];
        for (const row of rows) {
          for (let a = 2; a <= span - 2; a += 6) {
            const depth = 9;
            const c0 = row === 1 ? (horizontal ? p.z1 : p.x1) - depth : (horizontal ? p.z0 : p.x0) + (row === 0.5 ? across / 2 - depth / 2 : 0);
            if (horizontal) marks.rect(p.x0 + a - 0.15, c0, p.x0 + a + 0.15, c0 + depth, y + 0.01, 0xf2f2ee, SURF.tarmac);
            else marks.rect(c0, p.z0 + a - 0.15, c0 + depth, p.z0 + a + 0.15, y + 0.01, 0xf2f2ee, SURF.tarmac);
          }
        }
        return;
      }
      case 'court': {
        s.rect(p.x0, p.z0, p.x1, p.z1, y, 0x2f9a5c, SURF.court);
        marks.rect(p.x0 + 2, p.z0 + 2, p.x1 - 2, p.z1 - 2, y + 0.01, color, SURF.court);
        const mx = (p.x0 + p.x1) / 2;
        lines.rect(mx - 0.2, p.z0 + 2, mx + 0.2, p.z1 - 2, y + 0.02, 0xffffff, SURF.tarmac);
        return;
      }
      case 'pool':
        s.slab(p.x0 - 1, y - 0.1, p.z0 - 1, p.x1 + 1, y + 0.15, p.z1 + 1, 0xf7f3ea, SURF.tarmac);
        marks.rect(p.x0, p.z0, p.x1, p.z1, y + 0.16, color, SURF.pool);
        return;
      case 'deck':
        s.rect(p.x0, p.z0, p.x1, p.z1, y, color, SURF.deck);
        return;
      case 'helipad': {
        s.rect(p.x0, p.z0, p.x1, p.z1, y, color, SURF.tarmac);
        const cx = (p.x0 + p.x1) / 2;
        const cz = (p.z0 + p.z1) / 2;
        marks.rect(cx - 3, cz - 0.6, cx + 3, cz + 0.6, y + 0.01, 0xffffff, SURF.tarmac);
        marks.rect(cx - 3, cz - 4, cx - 1.8, cz + 4, y + 0.01, 0xffffff, SURF.tarmac);
        marks.rect(cx + 1.8, cz - 4, cx + 3, cz + 4, y + 0.01, 0xffffff, SURF.tarmac);
        return;
      }
      default:
        s.rect(p.x0, p.z0, p.x1, p.z1, y, color, p.kind === 'dirt' || p.kind === 'sand' ? SURF.sand : SURF.tarmac);
        return;
    }
  }

  dispose(): void {
    this.root.traverse((child) => {
      const mesh = child as import('three').Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.root.removeFromParent();
  }
}
