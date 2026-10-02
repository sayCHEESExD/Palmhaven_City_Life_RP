import type { InteriorKind } from './interiors.js';
import type { ShopId } from '../config/shops.js';

/**
 * Building and lot vocabulary shared by the plan, the collision builder and
 * the client's city renderer.
 */

export type BuildingKind =
  | 'deco'
  | 'condo'
  | 'tower'
  | 'house'
  | 'shop'
  | 'civic'
  | 'warehouse'
  | 'school'
  | 'lighthouse'
  | 'terminal'
  | 'hangar'
  | 'controltower'
  | 'kiosk'
  | 'motel'
  | 'storefront';

/** How the walls are windowed (drawn by the facade shader). */
export type FacadePattern = 'deco' | 'grid' | 'glass' | 'house' | 'shopfront' | 'industrial' | 'plain';
export type RoofKind = 'flat' | 'gable' | 'hip';

export interface BuildingStyle {
  readonly wall: number;
  readonly trim: number;
  readonly accent: number;
  readonly roof: number;
  readonly pattern: FacadePattern;
  readonly roofKind: RoofKind;
  /** Art deco ornament: rounded corner towers, vertical fins, a stepped crown. */
  readonly ornament?: 'corner' | 'fins' | 'crown' | 'none';
  readonly awning?: number;
}

export interface Tier {
  readonly w: number;
  readonly d: number;
  /** Top of this tier, above the slab. */
  readonly top: number;
}

export interface BuildingSpec {
  readonly id: number;
  readonly kind: BuildingKind;
  readonly name: string;
  /** Centre of the footprint. */
  readonly x: number;
  readonly z: number;
  /** Local size: w across the front, d front to back. */
  readonly w: number;
  readonly d: number;
  /** Yaw the FRONT faces: 0 south (+z), PI north, PI/2 east, -PI/2 west. */
  readonly rot: number;
  /** Wall height above the slab (the roof sits on top). */
  readonly h: number;
  readonly style: BuildingStyle;
  readonly interior: InteriorKind | null;
  readonly sign?: string;
  readonly shop?: ShopId;
  /** A claimable home: the index into HOUSES. */
  readonly house?: number;
  /** Stacked setbacks above the base (towers). */
  readonly tiers?: readonly Tier[];
  readonly seed: number;
  /** Ground level under the building (a slab top, or bare ground off the blocks). */
  readonly base: number;
}

export type PatchKind =
  | 'grass'
  | 'parking'
  | 'plaza'
  | 'court'
  | 'pool'
  | 'dirt'
  | 'tarmac'
  | 'driveway'
  | 'runway'
  | 'field'
  | 'sand'
  | 'deck'
  | 'helipad'
  | 'garden';

export interface GroundPatch {
  readonly kind: PatchKind;
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  /** Surface height (defaults to the slab top). */
  readonly y?: number;
}

/** A walkable deck over water (piers, docks). */
export interface Dock {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly top: number;
  readonly kind: 'wood' | 'concrete';
}

/** A sloped floor, rising from y0 at the low edge to y1 at the high edge along an axis. */
export interface Ramp {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly axis: 'x' | 'z';
  /** Height at the min edge of the axis, and at the max edge. */
  readonly y0: number;
  readonly y1: number;
}

/** A static parked vehicle (scenery with collision). */
export interface ParkedVehicle {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly rot: number;
  readonly paint: number;
  /** Afloat (a boat in a slip). */
  readonly floating?: boolean;
}

export interface Palm {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly height: number;
  readonly lean: number;
  readonly yaw: number;
}

export interface Tree {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly size: number;
  readonly kind: 'round' | 'cone' | 'shrub';
}

/** A traffic signal on a corner, its arm reaching over the road along `rot`. */
export interface Signal {
  readonly x: number;
  readonly z: number;
  readonly rot: number;
  /** Which phase shows green to the traffic under this arm. */
  readonly axis: 'ns' | 'ew';
  readonly intersection: number;
}

/** A big set piece with its own model. */
export interface Landmark {
  readonly kind: 'ferris' | 'lighthouse_lamp' | 'flagpoles' | 'gas_canopy' | 'welcome_sign' | 'water_tower' | 'stage' | 'palm_sign';
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly rot: number;
  readonly scale?: number;
  readonly text?: string;
}

export const WINDOW_CELL = { w: 4, h: 4.5 } as const;

/** A width that holds whole window bays with a margin, so facades line up. */
export const bayWidth = (target: number): number => Math.max(1, Math.round((target - 1.2) / WINDOW_CELL.w)) * WINDOW_CELL.w + 1.2;

/** World footprint of a building. */
export const footprintOf = (b: Pick<BuildingSpec, 'x' | 'z' | 'w' | 'd' | 'rot'>): { x0: number; z0: number; x1: number; z1: number } => {
  const side = Math.abs(Math.sin(b.rot)) > 0.5;
  const ex = (side ? b.d : b.w) / 2;
  const ez = (side ? b.w : b.d) / 2;
  return { x0: b.x - ex, z0: b.z - ez, x1: b.x + ex, z1: b.z + ez };
};
