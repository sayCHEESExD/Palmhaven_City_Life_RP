/**
 * THE MAP OF PALMHAVEN, as data both the server and every client read.
 *
 * World units (a character stands 3.4 tall). +X is east, +Z is SOUTH, so the
 * map UI draws x to the right and z downward with north at the top.
 *
 *   - Palmhaven Key, the city island: a long north-south key with the street
 *     grid, the beach and the Atlantic to the east, Biscay Bay to the west.
 *   - The mainland across the bay, with the airport.
 *   - Two causeways cross the bay, each with a raised bridge span that boats
 *     pass under.
 *
 * Ground is y = 0. City blocks (sidewalks, lawns, building floors) are a
 * 0.3-high slab, so every curb is a real step. Water is everything that is
 * not land; its surface is `WATER_Y`.
 */

export interface Rect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

export const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({
  x0: Math.min(x0, x1),
  z0: Math.min(z0, z1),
  x1: Math.max(x0, x1),
  z1: Math.max(z0, z1),
});

export const inRect = (r: Rect, x: number, z: number, pad = 0): boolean =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

export const rectCenter = (r: Rect): { x: number; z: number } => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

/** The sea's surface. */
export const WATER_Y = -1.1;
/** Where a swimmer's feet hang: chest-deep. */
export const SWIM_Y = -2.5;
/** Top of a city block: sidewalks, lawns, building floors. */
export const CURB = 0.3;
/** Full width of a road, curb to curb. */
export const ROAD_WIDTH = 22;
export const ROAD_HALF = ROAD_WIDTH / 2;
/** Width of the sidewalk ring round every block. */
export const SIDEWALK = 6;

// ------------------------------------------------------------------ land

/** The mainland shore. */
export const MAINLAND_SHORE = -640;
/** Palmhaven Key: a rounded rectangle. */
export const ISLAND = { x0: -300, z0: -860, x1: 385, z1: 660, round: 70 } as const;
/** Where the sand begins, and where it meets the sea. */
export const BEACH_X0 = 268;
export const BEACH_X1 = ISLAND.x1;
/** The mainland: everything west of its shore, out to the edge of the world. */
export const MAINLAND = { x0: -1500, z0: -900, x1: MAINLAND_SHORE, z1: 900, round: 60 } as const;

/** Playable world: beyond this is open ocean nobody can reach. */
export const WORLD_BOUNDS = rect(-1480, -1000, 760, 960);

const inRounded = (r: { x0: number; z0: number; x1: number; z1: number; round: number }, x: number, z: number): boolean => {
  if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) return false;
  const k = r.round;
  const cx = x < r.x0 + k ? r.x0 + k : x > r.x1 - k ? r.x1 - k : x;
  const cz = z < r.z0 + k ? r.z0 + k : z > r.z1 - k ? r.z1 - k : z;
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz <= k * k;
};

export interface Avenue {
  readonly name: string;
  readonly x: number;
  readonly z0: number;
  readonly z1: number;
}

export interface Street {
  readonly name: string;
  readonly z: number;
  readonly x0: number;
  readonly x1: number;
}

/** North-south avenues, west to east. */
export const AVENUES: readonly Avenue[] = [
  { name: 'Bayshore Drive', x: -200, z0: -740, z1: 560 },
  { name: 'Palm Avenue', x: -60, z0: -740, z1: 560 },
  { name: 'Coral Avenue', x: 90, z0: -740, z1: 560 },
  { name: 'Ocean Drive', x: 240, z0: -740, z1: 560 },
];

const STREET_NAMES = [
  'Lighthouse Rd', '72nd Street', '61st Street', 'Mercy Way', 'Venetian Causeway', 'Flamingo St',
  'Main Street', 'Lincoln Road', 'Espanola Way', 'Sunset Causeway', 'Marina Blvd', 'South Pointe Dr',
] as const;

const STREET_Z = [-740, -620, -500, -380, -260, -140, -20, 100, 220, 340, 460, 560] as const;

/** East-west streets, north to south. */
export const STREETS: readonly Street[] = STREET_Z.map((z, i) => ({ name: STREET_NAMES[i]!, z, x0: -200, x1: 240 }));

/** The two causeways run west from Bayshore Drive to the mainland. */
export const CAUSEWAY_Z = [-260, 340] as const;
/** The mainland's north-south road. */
export const AIRPORT_BLVD_X = -700;
/** Each causeway's raised span: ramps up, a deck, ramps down. Boats pass under the deck. */
export const BRIDGE = { rampW0: -575, deck0: -535, deck1: -425, rampE1: -385, deckTop: 7, deckThickness: 1.2, halfWidth: 16 } as const;

export interface RoadSegment {
  readonly id: number;
  readonly name: string;
  /** Centre line from (x0,z0) to (x1,z1): always axis-aligned. */
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly width: number;
  /** Two-way with a double yellow centre line. */
  readonly lanes: number;
}

/** Every road, as straight centre-line segments (intersections overlap). */
export const ROADS: readonly RoadSegment[] = (() => {
  const out: RoadSegment[] = [];
  let id = 0;
  for (const a of AVENUES) out.push({ id: id++, name: a.name, x0: a.x, z0: a.z0 - ROAD_HALF, x1: a.x, z1: a.z1 + ROAD_HALF, width: ROAD_WIDTH, lanes: 4 });
  for (const s of STREETS) out.push({ id: id++, name: s.name, x0: s.x0 - ROAD_HALF, z0: s.z, x1: s.x1 + ROAD_HALF, z1: s.z, width: ROAD_WIDTH, lanes: 4 });
  // The causeways, west across the bay.
  for (const z of CAUSEWAY_Z) out.push({ id: id++, name: z < 0 ? 'Venetian Causeway' : 'Sunset Causeway', x0: AVENUES[0]!.x - ROAD_HALF, z0: z, x1: AIRPORT_BLVD_X, z1: z, width: ROAD_WIDTH, lanes: 4 });
  // The mainland: Airport Boulevard and the terminal road.
  out.push({ id: id++, name: 'Airport Blvd', x0: AIRPORT_BLVD_X, z0: CAUSEWAY_Z[0] - ROAD_HALF - 60, x1: AIRPORT_BLVD_X, z1: CAUSEWAY_Z[1] + ROAD_HALF + 60, width: ROAD_WIDTH, lanes: 4 });
  out.push({ id: id++, name: 'Terminal Road', x0: AIRPORT_BLVD_X, z0: -150, x1: -960, z1: -150, width: ROAD_WIDTH, lanes: 4 });
  return out;
})();

export const roadRect = (r: RoadSegment): Rect =>
  r.x0 === r.x1 ? rect(r.x0 - r.width / 2, r.z0, r.x0 + r.width / 2, r.z1) : rect(r.x0, r.z0 - r.width / 2, r.x1, r.z0 + r.width / 2);

/** Where avenues meet streets (and causeways meet the mainland road). */
export interface Intersection {
  readonly id: number;
  readonly x: number;
  readonly z: number;
}

export const INTERSECTIONS: readonly Intersection[] = (() => {
  const out: Intersection[] = [];
  let id = 0;
  for (const s of STREETS) for (const a of AVENUES) out.push({ id: id++, x: a.x, z: s.z });
  for (const z of CAUSEWAY_Z) out.push({ id: id++, x: AIRPORT_BLVD_X, z });
  out.push({ id: id++, x: AIRPORT_BLVD_X, z: -150 });
  return out;
})();

/** A city block: the raised slab between four roads. `col` -1 is the bayfront strip, 3 the promenade. */
export interface Block {
  readonly id: number;
  readonly col: number;
  readonly row: number;
  readonly r: Rect;
}

export const BLOCKS: readonly Block[] = (() => {
  const out: Block[] = [];
  let id = 0;
  for (let row = 0; row < STREETS.length - 1; row += 1) {
    const z0 = STREETS[row]!.z + ROAD_HALF;
    const z1 = STREETS[row + 1]!.z - ROAD_HALF;
    for (let col = 0; col < AVENUES.length - 1; col += 1) {
      out.push({ id: id++, col, row, r: rect(AVENUES[col]!.x + ROAD_HALF, z0, AVENUES[col + 1]!.x - ROAD_HALF, z1) });
    }
  }
  // The bayfront: west of Bayshore Drive, split by the causeways.
  const west = AVENUES[0]!.x - ROAD_HALF;
  const bay = ISLAND.x0 + 2;
  out.push({ id: id++, col: -1, row: 0, r: rect(bay, STREETS[0]!.z - ROAD_HALF, west, CAUSEWAY_Z[0] - ROAD_HALF) });
  out.push({ id: id++, col: -1, row: 1, r: rect(bay, CAUSEWAY_Z[0] + ROAD_HALF, west, CAUSEWAY_Z[1] - ROAD_HALF) });
  out.push({ id: id++, col: -1, row: 2, r: rect(bay, CAUSEWAY_Z[1] + ROAD_HALF, west, STREETS[STREETS.length - 1]!.z + ROAD_HALF) });
  // The promenade between Ocean Drive and the sand.
  out.push({ id: id++, col: 3, row: 0, r: rect(AVENUES[3]!.x + ROAD_HALF, STREETS[0]!.z - ROAD_HALF, BEACH_X0, STREETS[STREETS.length - 1]!.z + ROAD_HALF) });
  // The north and south ends of the key: parks.
  out.push({ id: id++, col: 4, row: 0, r: rect(AVENUES[0]!.x - ROAD_HALF, -800, AVENUES[3]!.x + ROAD_HALF, STREETS[0]!.z - ROAD_HALF) });
  out.push({ id: id++, col: 4, row: 1, r: rect(AVENUES[0]!.x - ROAD_HALF, STREETS[STREETS.length - 1]!.z + ROAD_HALF, AVENUES[3]!.x + ROAD_HALF, 618) });
  return out;
})();

export const blockAt = (col: number, row: number): Block => {
  const found = BLOCKS.find((b) => b.col === col && b.row === row);
  if (!found) throw new Error(`no block ${col},${row}`);
  return found;
};

/** The causeways' landfill (the raised span between deck0 and deck1 is open water). */
const CAUSEWAY_HALF = 20;

/** Piers and docks: walkable slabs over water. Land as far as `isLand` is concerned is ground you stand on at y >= 0. */
export const isLand = (x: number, z: number): boolean => {
  if (inRounded(ISLAND, x, z)) return true;
  if (inRounded(MAINLAND, x, z)) return true;
  if (x > MAINLAND_SHORE - 4 && x < ISLAND.x0 + 4) {
    for (const cz of CAUSEWAY_Z) {
      if (Math.abs(z - cz) <= CAUSEWAY_HALF && (x < BRIDGE.deck0 || x > BRIDGE.deck1)) return true;
    }
  }
  return false;
};

/** True on the sand. */
export const isBeach = (x: number, z: number): boolean => x >= BEACH_X0 && inRounded(ISLAND, x, z);

/** Every land rectangle the ground mesh is made of (approximate for the rounded ends; the mesh rounds them itself). */
export const CAUSEWAY_FILLS: readonly Rect[] = CAUSEWAY_Z.flatMap((z) => [
  rect(MAINLAND_SHORE - 4, z - CAUSEWAY_HALF, BRIDGE.deck0, z + CAUSEWAY_HALF),
  rect(BRIDGE.deck1, z - CAUSEWAY_HALF, ISLAND.x0 + 4, z + CAUSEWAY_HALF),
]);

// ------------------------------------------------------------- airport

export const AIRPORT = {
  runway: rect(-1300, 30, -760, 70),
  taxiway: rect(-1180, -20, -800, -4),
  apron: rect(-1060, -128, -840, -20),
  terminal: rect(-1040, -240, -880, -172),
  hangars: rect(-1200, -150, -1080, -40),
  helipad: { x: -820, z: -80, r: 14 },
  tower: { x: -1100, z: -190 },
} as const;
