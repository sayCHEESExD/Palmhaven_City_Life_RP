// Static checks on the generated city: nothing built overlaps anything else,
// every road is clear, every door and interaction point is reachable, and
// every named place is standing room.
import {
  city,
  cityPlan,
  footprintOf,
  ROADS,
  roadRect,
  WorldCollision,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  propByKey,
  propFootprint,
  vehicleBox,
  HOUSE_STYLES,
  furnitureProblem,
  propById,
  isLand,
} from '../shared/dist/index.js';

const problems = [];
const warn = (msg) => problems.push(msg);

const plan = cityPlan();
const data = city();
console.log(`buildings ${plan.buildings.length}, props ${plan.props.length}, palms ${plan.palms.length}, trees ${plan.trees.length}, lamps ${plan.lamps.length}, parked ${plan.parked.length}, docks ${plan.docks.length}, houses ${plan.houses.length}`);
console.log(`solids ${data.solids.length}, seats ${data.seats.length}, interactables ${data.interactables.length}, doors ${data.doors.length}, places ${data.places.length}, doorsteps ${data.doorsteps.length}, curbside ${data.curbside.length}`);

const overlap = (a, b, pad = 0) => a.x0 < b.x1 - pad && a.x1 > b.x0 + pad && a.z0 < b.z1 - pad && a.z1 > b.z0 + pad;

// Buildings never overlap each other, and never sit on a road.
const fps = plan.buildings.map((b) => ({ b, f: footprintOf(b) }));
for (let i = 0; i < fps.length; i += 1) {
  for (let j = i + 1; j < fps.length; j += 1) {
    if (overlap(fps[i].f, fps[j].f, 0.05)) warn(`buildings overlap: ${fps[i].b.name} (#${fps[i].b.id}) & ${fps[j].b.name} (#${fps[j].b.id})`);
  }
}
const roads = ROADS.map((r) => roadRect(r));
for (const { b, f } of fps) {
  for (const r of roads) if (overlap(f, r, 0.05)) warn(`building on a road: ${b.name} (#${b.id})`);
  if (!isLand((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2)) warn(`building in the sea: ${b.name}`);
}

// Props, palms, trees and parked cars clear of buildings and roads.
const things = [];
for (const p of plan.props) {
  const def = propByKey(p.key);
  const f = propFootprint(def, p);
  things.push({ name: `prop ${p.key}@${p.x.toFixed(0)},${p.z.toFixed(0)}`, f: { x0: f.minX, x1: f.maxX, z0: f.minZ, z1: f.maxZ }, solid: def.solid });
}
for (const p of plan.palms) things.push({ name: `palm@${p.x.toFixed(0)},${p.z.toFixed(0)}`, f: { x0: p.x - 0.6, x1: p.x + 0.6, z0: p.z - 0.6, z1: p.z + 0.6 }, solid: true });
for (const t of plan.trees) things.push({ name: `tree@${t.x.toFixed(0)},${t.z.toFixed(0)}`, f: { x0: t.x - 0.7, x1: t.x + 0.7, z0: t.z - 0.7, z1: t.z + 0.7 }, solid: true });
for (const v of plan.parked) {
  const box = vehicleBox(v.key, v.x, 0, v.z, v.rot);
  things.push({ name: `parked ${v.key}@${v.x.toFixed(0)},${v.z.toFixed(0)}`, f: { x0: box.minX, x1: box.maxX, z0: box.minZ, z1: box.maxZ }, solid: true, car: true, floating: v.floating });
}
for (const t of things) {
  for (const { b, f } of fps) if (overlap(t.f, f, 0.05)) warn(`${t.name} inside building ${b.name} (#${b.id})`);
  if (!t.floating) for (const r of roads) if (overlap(t.f, r, 0.05)) warn(`${t.name} on a road`);
}
for (let i = 0; i < things.length; i += 1) {
  if (!things[i].solid) continue;
  for (let j = i + 1; j < things.length; j += 1) {
    if (!things[j].solid) continue;
    if (overlap(things[i].f, things[j].f, 0.1)) warn(`overlap: ${things[i].name} & ${things[j].name}`);
  }
}

// Every named place and every interaction point is somewhere a person can stand.
const collision = new WorldCollision();
for (const place of data.places) {
  const floor = collision.floorBelow(place.x, place.y + 2, place.z, PLAYER_RADIUS, 0.05);
  if (collision.blocked(place.x, floor + 0.01, place.z, PLAYER_RADIUS, PLAYER_HEIGHT)) warn(`place ${place.id} is blocked`);
}
for (const it of data.interactables) {
  const floor = collision.floorBelow(it.x, it.y + 2, it.z, PLAYER_RADIUS * 0.8, 0.05);
  if (collision.blocked(it.x, floor + 0.01, it.z, PLAYER_RADIUS * 0.7, PLAYER_HEIGHT)) warn(`interactable ${it.label} (${it.kind}) front is blocked at ${it.x.toFixed(1)},${it.z.toFixed(1)}`);
}
for (const door of data.doors) {
  const out = { x: door.x + Math.sin(door.rot) * 2, z: door.z + Math.cos(door.rot) * 2 };
  const inside = { x: door.x - Math.sin(door.rot) * 2, z: door.z - Math.cos(door.rot) * 2 };
  for (const [name, p] of [['outside', out], ['inside', inside]]) {
    const floor = collision.floorBelow(p.x, door.y + 2, p.z, PLAYER_RADIUS, 0.05);
    if (collision.blocked(p.x, floor + 0.01, p.z, PLAYER_RADIUS, PLAYER_HEIGHT)) warn(`door of building #${door.building} blocked ${name}`);
  }
}
for (const d of data.doorsteps.slice(0, 400)) {
  const floor = collision.floorBelow(d.x, d.y + 2, d.z, PLAYER_RADIUS, 0.05);
  if (collision.blocked(d.x, floor + 0.01, d.z, PLAYER_RADIUS, PLAYER_HEIGHT)) warn(`doorstep ${d.label} blocked`);
}

// Every house style's starter furniture is valid in its own rules.
for (const plot of plan.houses) {
  const style = HOUSE_STYLES[plot.style];
  const pieces = [];
  for (const item of style.starter) {
    const def = propByKey(item.key);
    const rot = Math.round(item.rot / (Math.PI / 2));
    const problem = furnitureProblem(plot, pieces, def.id, item.x, item.z, rot);
    if (problem) warn(`${style.name} starter ${item.key}: ${problem}`);
    pieces.push({ id: pieces.length + 1, kind: def.id, x: item.x, z: item.z, rot });
  }
  break;
}
for (const style of Object.values(HOUSE_STYLES)) {
  const plot = plan.houses.find((h) => h.style === style.id);
  if (!plot) {
    warn(`no ${style.name} plots`);
    continue;
  }
  const pieces = [];
  for (const item of style.starter) {
    const def = propByKey(item.key);
    const rot = Math.round(item.rot / (Math.PI / 2));
    const problem = furnitureProblem(plot, pieces, def.id, item.x, item.z, rot);
    if (problem) warn(`${style.name} starter ${item.key}: ${problem}`);
    pieces.push({ id: pieces.length + 1, kind: def.id, x: item.x, z: item.z, rot });
  }
  console.log(`${style.name}: ${plan.houses.filter((h) => h.style === style.id).length} plots`);
}
void propById;

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 120)) console.log(` - ${p}`);
  process.exitCode = 1;
} else {
  console.log('\ncity OK');
}
