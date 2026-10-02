/**
 * A PLAYTEST WITH REAL CLIENTS against a running server started with
 * `--dev-cheats` (the default for `npm run dev:server`).
 *
 * Three bots join one room and play the loop end to end, each asserting what
 * the OTHERS see - which is the thing that breaks in multiplayer:
 *
 *   join -> see each other -> walk -> take a job -> spawn, drive, ride a car ->
 *   buy at a shop -> move into a home and decorate -> give money -> chat ->
 *   emote and sit -> police cuff / struggle / release -> leave
 *
 * Usage: start the server, then `npm run verify:multiplayer`.
 */
import { Client } from 'colyseus.js';
import { HOUSE_STYLES, MessageType, ROOM_NAME, SHOPS, city, cityPlan, jobById, vehicleByKey } from '../shared/dist/index.js';

const ENDPOINT = process.env.ENDPOINT ?? 'ws://localhost:2940';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};
const pass = (message) => console.log(`  ok    ${message}`);
const check = (ok, message) => (ok ? pass(message) : fail(message));

/** Poll until `test` holds or `ms` passes. */
const until = async (test, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (test()) return true;
    } catch {
      /* state not there yet */
    }
    await wait(40);
  }
  try {
    return !!test();
  } catch {
    return false;
  }
};

class Bot {
  constructor(name) {
    this.name = name;
    this.self = null;
    this.notices = [];
    this.chats = [];
    this.fx = [];
    this.respawns = [];
    this.seq = 0;
    this.input = null;
    this.timer = null;
  }

  async join(roomId) {
    const client = new Client(ENDPOINT);
    const options = { playerId: `mp-${this.name}-${Math.random().toString(36).slice(2, 8)}`, identity: { displayName: this.name, avatarUrl: '' } };
    this.room = roomId ? await client.joinById(roomId, options) : await client.create(ROOM_NAME, options);
    this.id = this.room.sessionId;
    this.room.onMessage(MessageType.Self, (m) => (this.self = m));
    this.room.onMessage(MessageType.Notice, (m) => this.notices.push(m));
    this.room.onMessage(MessageType.Chat, (m) => this.chats.push(m));
    this.room.onMessage(MessageType.Fx, (m) => this.fx.push(m));
    this.room.onMessage(MessageType.Respawn, (m) => this.respawns.push(m));
    for (const type of [MessageType.AuthState, 'friends']) this.room.onMessage(type, () => {});
    // Input at the real 60 Hz pace the server budgets for.
    let last = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const frames = Math.min(6, Math.floor((now - last) / (1000 / 60)));
      if (frames <= 0) return;
      last += frames * (1000 / 60);
      for (let i = 0; i < frames; i += 1) {
        const input = this.input ?? { moveX: 0, moveZ: 0, jump: false, sprint: false, down: false, cameraYaw: 0 };
        this.room.send(MessageType.Move, { seq: ++this.seq, dt: 1 / 60, ...input });
      }
    }, 30);
    return this;
  }

  send(type, payload) {
    this.room.send(type, payload);
  }

  /** Requests are rate limited per player: keep them apart. */
  async act(type, payload, gap = 140) {
    this.room.send(type, payload);
    await wait(gap);
  }

  player(id = this.id) {
    return this.room.state.players.get(id);
  }

  tp(x, y, z) {
    this.room.send('dev', { tp: [x, z, y] });
  }

  async leave() {
    clearInterval(this.timer);
    await this.room.leave(true);
  }
}

console.log(`multiplayer playtest (${ENDPOINT})`);

let a;
let b;
let c;
try {
  a = await new Bot('Alex').join();
  b = await new Bot('Blair').join(a.room.roomId);
  c = await new Bot('Casey').join(a.room.roomId);
} catch (error) {
  console.log(`  FAIL  could not join: ${error?.message ?? error}`);
  console.log('        start the server first: npm run dev:server');
  process.exit(1);
}
const bots = [a, b, c];

// --- join ----------------------------------------------------------------
check(await until(() => bots.every((bot) => bot.room.state.players.size === 3)), 'all three see three players');
check(await until(() => bots.every((bot) => bot.self && bot.self.money > 0)), `everyone gets their private state (money ${a.self?.money})`);
check(await until(() => b.player(a.id)?.displayName === 'Alex'), 'names replicate');

// --- walking -----------------------------------------------------------------
{
  await until(() => a.player()?.ready);
  const start = { x: a.player().x, z: a.player().z };
  a.input = { moveX: 0, moveZ: 1, jump: false, sprint: true, down: false, cameraYaw: a.player().rotationY };
  await wait(1200);
  a.input = null;
  const seen = b.player(a.id);
  const moved = Math.hypot(seen.x - start.x, seen.z - start.z);
  check(moved > 8, `Blair sees Alex walk ${moved.toFixed(1)} units`);
}

// --- jobs ----------------------------------------------------------------------
await a.act(MessageType.SetJob, { job: 'police' });
check(await until(() => a.self.job === 'police'), 'Alex is a police officer');
check(await until(() => b.player(a.id).job === jobById('police').index), 'Blair sees the uniform (job replicated)');

// --- vehicles ------------------------------------------------------------------
{
  const def = vehicleByKey('police');
  await a.act(MessageType.SpawnVehicle, { kind: def.id, paint: 0 });
  const ok = await until(() => a.self.spawned > 0 && b.room.state.vehicles.get(String(a.self.spawned)));
  check(ok, `Alex's police cruiser spawns for everyone (${def.name})`);
  const vid = a.self.spawned;
  const car = a.room.state.vehicles.get(String(vid));
  a.tp(car.x + 4, car.y + 1, car.z);
  await wait(500);
  await a.act(MessageType.EnterVehicle, { id: vid, drive: true });
  check(await until(() => a.player().vehicle === vid && a.player().seat === 0), 'Alex takes the wheel');
  const v0 = { ...b.room.state.vehicles.get(String(vid)).toJSON() };
  a.input = { moveX: 0, moveZ: 1, jump: false, sprint: false, down: false, cameraYaw: 0 };
  await wait(1500);
  a.input = { moveX: 0, moveZ: 0, jump: true, sprint: false, down: false, cameraYaw: 0 };
  await wait(1500);
  a.input = null;
  const v1 = b.room.state.vehicles.get(String(vid));
  const moved = Math.hypot(v1.x - v0.x, v1.z - v0.z);
  check(moved > 10, `Blair watches the cruiser drive ${moved.toFixed(1)} units`);
  await a.act(MessageType.VehicleAction, { action: 'siren' });
  check(await until(() => (b.room.state.vehicles.get(String(vid)).flags & 2) !== 0), 'the siren replicates');
  // Blair hops in the back.
  b.tp(v1.x + 5, v1.y + 1, v1.z);
  await wait(400);
  await b.act(MessageType.EnterVehicle, { id: vid, drive: false });
  check(await until(() => b.player().vehicle === vid && b.player().seat > 0), 'Blair rides as a passenger');
  await b.act(MessageType.ExitVehicle, {});
  check(await until(() => b.player().vehicle === 0), 'Blair gets out');
  await a.act(MessageType.ExitVehicle, {});
  check(await until(() => a.player().vehicle === 0), 'Alex gets out');
  // Strangers cannot drive off in it.
  c.tp(v1.x - 5, v1.y + 1, v1.z);
  await wait(400);
  await c.act(MessageType.EnterVehicle, { id: vid, drive: true });
  await wait(300);
  check(c.player().vehicle === 0 || c.player().seat !== 0, 'Casey cannot take the wheel of somebody else\'s car');
  if (c.player().vehicle) await c.act(MessageType.ExitVehicle, {});
}

// --- shopping --------------------------------------------------------------------
{
  const reg = city().interactables.find((it) => it.shop === 'grocery' && it.kind === 'register');
  b.tp(reg.x, reg.y + 0.5, reg.z);
  await wait(500);
  const before = b.self.money;
  const item = SHOPS.grocery.stock[0];
  await b.act(MessageType.Buy, { shop: 'grocery', id: item.id ?? item });
  check(await until(() => b.self.items.some((s) => s.id === (item.id ?? item))), 'Blair buys groceries');
  check(b.self.money < before, `and pays for them (${before} -> ${b.self.money})`);
  // Too far away to buy at a shop on the other side of town.
  const notices = b.notices.length;
  const before2 = b.self.money;
  await b.act(MessageType.Buy, { shop: 'clothing', id: SHOPS.clothing.stock[0].id ?? SHOPS.clothing.stock[0] });
  await wait(300);
  check(b.self.money === before2, 'buying from across town is refused');
  void notices;
}

// --- housing ------------------------------------------------------------------------
{
  const free = cityPlan().houses.find((p, i) => HOUSE_STYLES[p.style].price === 0 && !c.room.state.houses[i]?.owner);
  await c.act(MessageType.ClaimHouse, { house: free.id, go: true });
  check(await until(() => c.self.house === free.id), `Casey moves into ${free.address}`);
  check(await until(() => a.room.state.houses[free.id].owner === c.id), 'Alex sees who lives there');
  await wait(400);
  const state = c.room.state.houses[free.id];
  const count = state.furniture.size;
  const piece = [...state.furniture.values()].find((f) => f.kind > 0);
  if (piece) {
    await c.act(MessageType.RemoveFurniture, { fid: piece.id });
    check(await until(() => b.room.state.houses[free.id].furniture.size === count - 1), 'Casey stores a piece of furniture; Blair sees it go');
    check(c.self.furniture.some((s) => s.id === piece.kind), 'it lands in storage');
    await c.act(MessageType.PlaceFurniture, { kind: piece.kind, x: piece.x, z: piece.z, rot: piece.rot });
    check(await until(() => b.room.state.houses[free.id].furniture.size === count), 'and places it back');
  } else fail('the free home came unfurnished');
  await c.act(MessageType.LockHouse, { locked: true });
  check(await until(() => a.room.state.houses[free.id].locked), 'the front door locks');
  await c.act(MessageType.LockHouse, { locked: false });
}

// --- money between players -----------------------------------------------------------
{
  const pa = a.player();
  b.tp(pa.x + 2, pa.y + 1, pa.z);
  await wait(500);
  const before = b.self.money;
  const mine = a.self.money;
  await a.act(MessageType.GiveMoney, { to: b.id, amount: 100 });
  check(await until(() => b.self.money === before + 100), 'Alex hands Blair $100');
  check(a.self.money === mine - 100, 'and it leaves Alex\'s wallet');
}

// --- chat, emotes ----------------------------------------------------------------------
await a.act(MessageType.Say, { line: 2 });
check(await until(() => b.chats.some((m) => m.from === a.id)), 'Blair hears Alex\'s quick chat');
await b.act(MessageType.Emote, { emote: 2 });
check(await until(() => a.player(b.id).emote === 2), 'Alex sees Blair dance');
// Bloxity emotes: a catalogue id from the portal's picker, replicated to everyone.
await b.act(MessageType.BloxityEmote, { id: '000000000000000000000e01' });
check(await until(() => a.player(b.id).bxEmote === '000000000000000000000e01' && a.player(b.id).emote === 0), "Alex sees Blair's Bloxity wave");
await b.act(MessageType.BloxityEmote, { id: 'not-an-emote' });
check(a.player(b.id).bxEmote === '000000000000000000000e01', 'a malformed emote id is ignored');
b.input = { moveX: 0, moveZ: 1, jump: false, sprint: false, down: false, cameraYaw: 0 };
await wait(600);
b.input = null;
check(await until(() => a.player(b.id).bxEmote === ''), "walking off ends Blair's emote for everyone");

// --- police: cuff, struggle, release -------------------------------------------------------
{
  await a.act(MessageType.PlayerAction, { target: b.id, action: 'cuff' }, 300);
  check(await until(() => (a.player(b.id).status & 1) !== 0), 'Alex cuffs Blair');
  await a.act(MessageType.PlayerAction, { target: b.id, action: 'release' }, 300);
  check(await until(() => (a.player(b.id).status & 1) === 0), 'and lets Blair go');
  // Civilians cannot cuff anyone.
  await c.act(MessageType.SetJob, { job: 'civilian' });
  c.tp(a.player().x + 2, a.player().y + 1, a.player().z);
  await wait(400);
  await c.act(MessageType.PlayerAction, { target: a.id, action: 'cuff' }, 300);
  check((a.player().status & 1) === 0, 'a civilian cannot cuff an officer');
}

// --- leaving ---------------------------------------------------------------------------------
{
  const vid = a.self.spawned;
  await a.leave();
  check(await until(() => b.room.state.players.size === 2), 'Alex leaves; two remain');
  check(await until(() => !b.room.state.vehicles.get(String(vid))), 'Alex\'s cruiser goes with them');
}

for (const bot of [b, c]) await bot.leave();

if (failures > 0) {
  console.log(`\n${failures} multiplayer problem(s)`);
  process.exit(1);
}
console.log('\nmultiplayer OK');
process.exit(0);
