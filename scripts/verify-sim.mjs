/**
 * The shared simulations, stepped in-process exactly as the server and the
 * client's prediction step them.
 *
 *   - walking, running and jumping move a citizen and keep them on the ground
 *   - nobody, on foot or at the wheel, ever ends up inside a wall
 *   - the sea is swum, and boats stay on it
 *   - aircraft take off from the runway
 *   - the same inputs always give the same result (prediction depends on it)
 */
import {
  AIRPORT,
  BOAT_Y,
  SWIM_Y,
  WorldCollision,
  city,
  createMotion,
  createSimEvents,
  createSimParams,
  createVehicleEvents,
  createVehicleMotion,
  isLand,
  stepPlayer,
  stepVehicle,
  vehicleByKey,
  vehicleObstacles,
} from '../shared/dist/index.js';

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};
const pass = (message) => console.log(`  ok    ${message}`);
const check = (ok, message) => (ok ? pass(message) : fail(message));

const collision = new WorldCollision();
const data = city();
const DT = 1 / 60;

/** A tiny seeded generator so failures reproduce. */
const rng = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const input = (over = {}) => ({ moveX: 0, moveZ: 0, jump: false, sprint: false, down: false, cameraYaw: 0, ...over });

/** The deepest a circle of radius r sits inside any tall solid, 0 when clear. */
const penetration = (x, y, z, r, height) => {
  let worst = 0;
  for (const b of data.solids) {
    if (b.maxY - b.minY < 1.5) continue;
    // The body's core band: a head brushing a ceiling is not being in a wall.
    if (y + height * 0.75 <= b.minY || y + 0.4 >= b.maxY) continue;
    const dx = Math.max(b.minX - x, 0, x - b.maxX);
    const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
    if (dx > 0 || dz > 0) continue;
    // Inside the box in plan: how far to the nearest face.
    const depth = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
    worst = Math.max(worst, depth);
  }
  return worst;
};

console.log('shared simulation');

// --- on foot -------------------------------------------------------------
{
  const spawn = data.placeById.get('spawn');
  const m = createMotion(spawn.x, spawn.y, spawn.z, spawn.yaw);
  const params = createSimParams();
  const events = createSimEvents();
  for (let i = 0; i < 30; i += 1) stepPlayer(m, input(), params, DT, collision, events);
  check(m.grounded, `standing at the spawn plaza (y ${m.y.toFixed(2)})`);
  const x0 = m.x;
  const z0 = m.z;
  for (let i = 0; i < 90; i += 1) stepPlayer(m, input({ moveZ: 1, cameraYaw: spawn.yaw, sprint: true }), params, DT, collision, events);
  const moved = Math.hypot(m.x - x0, m.z - z0);
  check(moved > 12, `running 1.5s covers ground (${moved.toFixed(1)} units)`);
  let jumped = false;
  let peak = m.y;
  const base = m.y;
  for (let i = 0; i < 80; i += 1) {
    stepPlayer(m, input({ jump: i < 2 }), params, DT, collision, events);
    jumped ||= events.jumped;
    peak = Math.max(peak, m.y);
  }
  check(jumped && peak - base > 3 && m.grounded, `jumping rises ${(peak - base).toFixed(1)} and lands again`);
}

// --- nobody walks through walls -----------------------------------------
{
  const params = createSimParams();
  const events = createSimEvents();
  let worst = 0;
  let where = '';
  for (let walker = 0; walker < 24; walker += 1) {
    const r = rng(walker + 1);
    const place = data.places[walker % data.places.length];
    const m = createMotion(place.x, place.y, place.z, 0);
    let cameraYaw = r() * Math.PI * 2;
    for (let i = 0; i < 1800; i += 1) {
      if (i % 90 === 0) cameraYaw = r() * Math.PI * 2;
      stepPlayer(m, input({ moveZ: 1, sprint: r() < 0.5, jump: r() < 0.02, cameraYaw }), params, DT, collision, events);
      const depth = penetration(m.x, m.y, m.z, params.radius, 4);
      if (depth > worst) {
        worst = depth;
        where = `${place.id} walker at ${m.x.toFixed(1)},${m.y.toFixed(1)},${m.z.toFixed(1)}`;
      }
    }
  }
  check(worst < 0.05, `24 random walkers never enter a wall${worst > 0 ? ` (worst ${worst.toFixed(2)} - ${where})` : ''}`);
}

// --- swimming --------------------------------------------------------------
{
  const params = createSimParams();
  const events = createSimEvents();
  const m = createMotion(560, 0, 0, 0);
  for (let i = 0; i < 240; i += 1) stepPlayer(m, input({ moveZ: 1, cameraYaw: Math.PI / 2 }), params, DT, collision, events);
  check(!isLand(560, 0) && m.swimming && Math.abs(m.y - SWIM_Y) < 0.6, `the sea is swum (y ${m.y.toFixed(2)}, swimming ${m.swimming})`);
}

// --- cars ----------------------------------------------------------------
const drive = (key, x, y, z, yaw, seconds, pick, label) => {
  const def = vehicleByKey(key);
  const m = createVehicleMotion(x, y, z, yaw);
  const events = createVehicleEvents();
  let worst = 0;
  let distance = 0;
  let maxSpeed = 0;
  let peak = y;
  let leftWater = false;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    stepVehicle(m, pick(i), def, { fuel: 100, self: 1 }, DT, collision, [], events);
    distance += events.travelled;
    maxSpeed = Math.max(maxSpeed, Math.hypot(m.vx, m.vz));
    peak = Math.max(peak, m.y);
    if (def.class === 'boat' && isLand(m.x, m.z)) leftWater = true;
    if (def.class !== 'heli' && def.class !== 'plane') worst = Math.max(worst, penetration(m.x, m.y, m.z, 0, def.height));
  }
  return { m, worst, distance, maxSpeed, peak, leftWater, def, label };
};

{
  // Straight up Ocean Drive from the spawn end.
  const r = drive('sedan', 240 - 4.4, 0.3, 300, Math.PI, 6, () => input({ moveZ: 1 }), 'sedan');
  check(r.maxSpeed > 20 && r.distance > 80, `a sedan drives up the avenue (${r.distance.toFixed(0)} units, top ${r.maxSpeed.toFixed(1)})`);
  // Random joyriders: no car ends up in a building.
  let worst = 0;
  let where = '';
  for (let k = 0; k < 16; k += 1) {
    const random = rng(100 + k);
    const ax = [-200, -60, 90, 240][k % 4];
    let steer = 0;
    const result = drive(['sedan', 'sports', 'suv', 'motorcycle'][k % 4], ax + 4.4, 0.3, -500 + k * 60, k % 2 ? 0 : Math.PI, 30, (i) => {
      if (i % 50 === 0) steer = random() * 2 - 1;
      return input({ moveZ: random() < 0.9 ? 1 : -1, moveX: steer, sprint: random() < 0.3 });
    }, 'joyrider');
    if (result.worst > worst) {
      worst = result.worst;
      where = `${result.def.key} at ${result.m.x.toFixed(1)},${result.m.z.toFixed(1)}`;
    }
  }
  check(worst < 0.3, `16 random joyriders never drive into a building${worst > 0 ? ` (worst ${worst.toFixed(2)} - ${where})` : ''}`);
}

// --- boats -----------------------------------------------------------------
{
  const marina = data.placeById.get('marina');
  // Out in open water east of the beach, heading along the coast.
  const r = drive('speedboat', 520, BOAT_Y, -200, 0, 12, (i) => input({ moveZ: 1, moveX: i > 300 ? 0.4 : 0 }), 'speedboat');
  check(r.distance > 100 && Math.abs(r.m.y - BOAT_Y) < 0.8, `a speedboat planes across the sea (${r.distance.toFixed(0)} units, y ${r.m.y.toFixed(2)})`);
  const beach = drive('jetski', 430, BOAT_Y, 0, -Math.PI / 2, 8, () => input({ moveZ: 1 }), 'jetski');
  check(!beach.leftWater, 'a jet ski driven at the beach stops at the shore');
  check(!!marina, 'the marina is on the map');
}

// --- aircraft ---------------------------------------------------------------
{
  const def = vehicleByKey('plane');
  const spot = data.placeById.get('airport');
  check(!!def && !!spot, 'the airport and a plane exist');
  // Down the runway: full throttle, then pull up.
  const runway = AIRPORT.runway;
  const r = drive('plane', runway.x0 + 20, 0.3, (runway.z0 + runway.z1) / 2, Math.PI / 2, 20, (i) => input({ moveZ: 1, jump: i > 360 }), 'plane');
  check(r.peak > 12, `a plane takes off from the runway (peak ${r.peak.toFixed(1)})`);
  const h = drive('heli', -820, 0.3, -80, 0, 6, () => input({ jump: true }), 'heli');
  check(h.peak > 15, `a helicopter lifts off the helipad (peak ${h.peak.toFixed(1)})`);
}

// --- determinism -------------------------------------------------------------
{
  const run = () => {
    const def = vehicleByKey('sports');
    const m = createVehicleMotion(90 + 4.4, 0.3, 0, Math.PI);
    const events = createVehicleEvents();
    const random = rng(7);
    for (let i = 0; i < 900; i += 1) stepVehicle(m, input({ moveZ: 1, moveX: Math.sin(i / 40), sprint: random() < 0.5 }), def, { fuel: 50, self: 1 }, DT, collision, [], events);
    const p = createMotion(-60, 0.3, 0, 0);
    const pe = createSimEvents();
    const params = createSimParams();
    const obstacles = [];
    vehicleObstacles(def, m, 1, obstacles);
    for (let i = 0; i < 600; i += 1) stepPlayer(p, input({ moveZ: 1, cameraYaw: i / 100, jump: i % 70 === 0 }), params, DT, collision, pe, obstacles);
    return JSON.stringify([m, p]);
  };
  check(run() === run(), 'identical inputs give identical vehicle and player states');
}

if (failures > 0) {
  console.log(`\n${failures} simulation problem(s)`);
  process.exit(1);
}
console.log('\nsim OK');
