import type { Aabb } from '../types/math.js';
import { CURB } from './layout.js';
import { HOUSE_STYLES, furnishArea, type HousePlot } from './houses.js';
import { propById, propFootprint, rotateXZ, type PropDef, type SeatPose } from './props.js';

/**
 * FURNITURE IN A HOME: the rules for where a piece may go (used by the server
 * to enforce and by the client's build mode to preview green or red, so a
 * preview that fits is never refused), and the world transforms for its
 * collision and its seats.
 *
 * Pieces are stored in HOUSE-LOCAL coordinates (door on +z), so a layout
 * moves with its owner to any home of the same style.
 */

export interface FurniturePiece {
  readonly id: number;
  readonly kind: number;
  readonly x: number;
  readonly z: number;
  /** Quarter turns, 0..3. */
  readonly rot: number;
}

export const quarter = (rot: number): number => ((Math.round(rot) % 4) + 4) % 4;
export const quarterYaw = (rot: number): number => quarter(rot) * (Math.PI / 2);

/** Snap a placement to the half-unit grid. */
export const snapHalf = (v: number): number => Math.round(v * 2) / 2;

/** Why a piece cannot go here, or null when it can. */
export const furnitureProblem = (
  plot: HousePlot,
  pieces: Iterable<FurniturePiece>,
  kind: number,
  x: number,
  z: number,
  rot: number,
  ignore = -1,
): string | null => {
  const def = propById(kind);
  if (!def?.furniture) return 'That is not furniture.';
  const style = HOUSE_STYLES[plot.style];
  const area = furnishArea(style);
  const yaw = quarterYaw(rot);
  const f = propFootprint(def, { x, z, rot: yaw });
  if (f.minX < area.x0 - 0.01 || f.maxX > area.x1 + 0.01 || f.minZ < area.z0 - 0.01 || f.maxZ > area.z1 + 0.01) return 'Keep it inside the house.';
  if (def.solid && f.minX < 3 && f.maxX > -3 && f.maxZ > style.d / 2 - 3.5) return 'Keep the front door clear.';
  if (!def.solid) return null;
  let count = 0;
  for (const other of pieces) {
    count += 1;
    if (other.id === ignore) continue;
    const odef = propById(other.kind);
    if (!odef?.solid) continue;
    const g = propFootprint(odef, { x: other.x, z: other.z, rot: quarterYaw(other.rot) });
    if (f.minX < g.maxX - 0.05 && f.maxX > g.minX + 0.05 && f.minZ < g.maxZ - 0.05 && f.maxZ > g.minZ + 0.05) return `That overlaps the ${odef.name}.`;
  }
  if (ignore < 0 && count >= style.capacity) return 'Your home is full!';
  return null;
};

/** House-local point -> world. */
export const houseToWorld = (plot: HousePlot, lx: number, lz: number): { x: number; z: number } => {
  const r = rotateXZ(lx, lz, plot.rot);
  return { x: plot.x + r.x, z: plot.z + r.z };
};

/** World point -> house-local. */
export const worldToHouse = (plot: HousePlot, wx: number, wz: number): { x: number; z: number } => rotateXZ(wx - plot.x, wz - plot.z, -plot.rot);

/** True when a world point is inside a home's walls. */
export const insideHouse = (plot: HousePlot, wx: number, wz: number, margin = 0): boolean => {
  const style = HOUSE_STYLES[plot.style];
  const l = worldToHouse(plot, wx, wz);
  return Math.abs(l.x) < style.w / 2 - margin && Math.abs(l.z) < style.d / 2 - margin;
};

/** Collision boxes for a home's furniture, in world space. */
export const furnitureSolids = (plot: HousePlot, pieces: Iterable<FurniturePiece>): Aabb[] => {
  const out: Aabb[] = [];
  for (const piece of pieces) {
    const def = propById(piece.kind);
    if (!def?.solid) continue;
    const w = houseToWorld(plot, piece.x, piece.z);
    const f = propFootprint(def, { x: w.x, z: w.z, rot: plot.rot + quarterYaw(piece.rot) });
    out.push({ minX: f.minX, maxX: f.maxX, minY: CURB, maxY: CURB + def.h, minZ: f.minZ, maxZ: f.maxZ });
  }
  return out;
};

export interface FurnitureSeat {
  readonly fid: number;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rot: number;
  readonly pose: SeatPose;
}

/** Every seat on a piece, in world space. */
export const seatsOfPiece = (plot: HousePlot, piece: FurniturePiece, def: PropDef | undefined = propById(piece.kind)): FurnitureSeat[] => {
  if (!def?.seats) return [];
  const out: FurnitureSeat[] = [];
  const at = houseToWorld(plot, piece.x, piece.z);
  const yaw = plot.rot + quarterYaw(piece.rot);
  def.seats.forEach((seat, index) => {
    const o = rotateXZ(seat.x, seat.z, yaw);
    out.push({ fid: piece.id, index, x: at.x + o.x, y: CURB + seat.y, z: at.z + o.z, rot: yaw + seat.rot, pose: seat.pose });
  });
  return out;
};
