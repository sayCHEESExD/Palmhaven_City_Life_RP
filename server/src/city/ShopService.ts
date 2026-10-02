import {
  MessageType,
  NPC_LOOKS,
  ORDER_SIZE,
  PAY,
  SHOPS,
  accessoryById,
  city,
  itemById,
  propById,
  shopSells,
  vehicleById,
  type FxMessage,
  type Interactable,
  type ShopId,
} from '@palmhaven/shared';
import { ShopState } from '../rooms/state/GameState.js';
import { addItem, addMoney, dressCitizen, near, spend, type Citizen } from './Citizen.js';
import type { JobService } from './JobService.js';
import type { RoomContext } from './RoomContext.js';

const STAFFED: readonly ShopId[] = ['cafe', 'burger', 'grocery', 'clothing'];
/** A worker must stand this close to their register. */
const WORK_RANGE = 12;
/** Shoppers must be this close to a counter, a desk or a machine of the shop. */
const BUY_RANGE = 16;

interface Counter {
  readonly shop: ShopId;
  readonly state: ShopState;
  readonly register: Interactable;
  nextCustomerAt: number;
}

/**
 * EVERY PURCHASE, and the staffed counters.
 *
 * Buying is checked against the shop's own counters (you buy a car at Palm
 * Motors' desk, a soda at a vending machine), the stock list and the wallet.
 * A cafe, the burger joint, FreshMart and Coastline Threads can be STAFFED by a
 * player on the matching job: NPC customers come in, order, and are served at
 * the register - and a staffer earns a cut of what real players buy.
 */
export class ShopService {
  private readonly counters: Counter[] = [];

  constructor(
    private readonly ctx: RoomContext,
    private readonly jobs: JobService,
  ) {
    for (const shop of STAFFED) {
      const register = city().interactables.find((i) => i.kind === 'register' && i.shop === shop);
      if (!register) continue;
      const state = new ShopState();
      state.shop = shop;
      ctx.state.shops.set(shop, state);
      this.counters.push({ shop, state, register, nextCustomerAt: 0 });
    }
  }

  // ------------------------------------------------------------- buying

  private atShop(c: Citizen, shop: ShopId): boolean {
    for (const it of city().interactables) {
      const matches = it.shop === shop || (shop === 'vending' && it.kind === 'vending') || (shop === 'gas' && it.kind === 'pump');
      if (matches && near(c, it.x, it.z, BUY_RANGE)) return true;
    }
    return false;
  }

  buy(c: Citizen, shop: ShopId, id: number, paint?: number): void {
    const def = SHOPS[shop];
    if (!def || !shopSells(shop, id)) return;
    if (!this.atShop(c, shop)) {
      this.ctx.notify(c, 'bad', `Visit ${def.name} to buy that.`);
      return;
    }
    let price = 0;
    let name = '';
    switch (def.kind) {
      case 'vehicles': {
        const v = vehicleById(id);
        if (!v) return;
        if (c.profile.vehicles.includes(id)) {
          this.ctx.notify(c, 'info', `You already own the ${v.name}. Spawn it from your phone!`);
          return;
        }
        price = v.price;
        name = v.name;
        if (!spend(c, price)) return this.broke(c, price);
        c.profile.vehicles.push(id);
        void paint;
        break;
      }
      case 'accessories': {
        const a = accessoryById(id);
        if (!a) return;
        if (c.profile.accessories.includes(id)) {
          c.profile.wearing[a.slot] = c.profile.wearing[a.slot] === id ? 0 : id;
          dressCitizen(c);
          c.dirty = true;
          return;
        }
        price = a.price;
        name = a.name;
        if (!spend(c, price)) return this.broke(c, price);
        c.profile.accessories.push(id);
        c.profile.wearing[a.slot] = id;
        dressCitizen(c);
        break;
      }
      case 'items': {
        const item = itemById(id);
        if (!item) return;
        price = item.price;
        name = item.name;
        if (!item.consumable && c.profile.items.some((s) => s.id === id)) {
          this.ctx.notify(c, 'info', `You already have a ${item.name}.`);
          return;
        }
        if (c.profile.money < price) return this.broke(c, price);
        if (!addItem(c, id, 1)) {
          this.ctx.notify(c, 'bad', `You can't carry more ${item.name}s.`);
          return;
        }
        spend(c, price);
        // Take it in hand straight away.
        c.profile.held = id;
        this.jobs.refreshHeld(c);
        break;
      }
      case 'furniture': {
        const prop = propById(id);
        if (!prop?.furniture) return;
        price = prop.furniture.price;
        name = prop.name;
        if (!spend(c, price)) return this.broke(c, price);
        const stack = c.profile.furniture.find((s) => s.id === id);
        if (stack) (stack as { count: number }).count = Math.min(99, stack.count + 1);
        else c.profile.furniture.push({ id, count: 1 });
        break;
      }
    }
    c.dirty = true;
    this.ctx.persist(c);
    this.ctx.notify(c, 'good', `Bought ${name} for $${price.toLocaleString('en-US')}!`);
    this.ctx.send(c, MessageType.Fx, { kind: 'cash', x: c.player.x, y: c.player.y + 3, z: c.player.z, data: -price } satisfies FxMessage);
    this.commission(c, shop, price);
  }

  private broke(c: Citizen, price: number): void {
    this.ctx.notify(c, 'bad', `You need $${price.toLocaleString('en-US')}. Work a job to earn more!`);
  }

  /** A staffer working the counter gets a cut of a real player's purchase. */
  private commission(buyer: Citizen, shop: ShopId, price: number): void {
    const counter = this.counters.find((k) => k.shop === shop);
    if (!counter?.state.worker || counter.state.worker === buyer.sessionId) return;
    const worker = this.ctx.citizen(counter.state.worker);
    if (!worker) return;
    const cut = Math.max(1, Math.round(price * PAY.shopCommission));
    addMoney(worker, cut);
    this.ctx.notify(worker, 'gold', `${buyer.player.displayName || 'A customer'} bought something: +$${cut} commission!`);
  }

  // ----------------------------------------------------------- the counters

  tick(): void {
    const now = this.ctx.now();
    for (const counter of this.counters) {
      const def = SHOPS[counter.shop];
      const reg = counter.register;
      let worker = counter.state.worker ? this.ctx.citizen(counter.state.worker) : undefined;
      if (worker && (worker.profile.job !== def.worker || !near(worker, reg.bx, reg.bz, WORK_RANGE + 6) || worker.player.vehicle !== 0)) {
        if (worker.task && (worker.task.kind === 'order' || worker.task.kind === 'sale')) this.jobs.clearTask(worker);
        worker = undefined;
        counter.state.worker = '';
        counter.state.customer = 0;
        counter.state.order = '';
      }
      if (!worker) {
        for (const c of this.ctx.citizens()) {
          if (c.profile.job !== def.worker || c.player.vehicle !== 0 || !near(c, reg.bx, reg.bz, WORK_RANGE)) continue;
          if (this.counters.some((k) => k.state.worker === c.sessionId)) continue;
          worker = c;
          counter.state.worker = c.sessionId;
          counter.nextCustomerAt = now + 3000;
          this.ctx.notify(c, 'info', `You're working the ${def.name} counter. Customers are on their way!`);
          break;
        }
      }
      if (!worker) continue;
      if (counter.state.customer === 0 && now >= counter.nextCustomerAt) this.newCustomer(counter, worker);
    }
  }

  private newCustomer(counter: Counter, worker: Citizen): void {
    const def = SHOPS[counter.shop];
    const look = Math.floor(this.ctx.random() * NPC_LOOKS);
    const chef = def.worker === 'chef';
    const size = ORDER_SIZE.min + Math.floor(this.ctx.random() * (ORDER_SIZE.max - ORDER_SIZE.min + 1));
    const menu = chef ? Object.keys(def.stations ?? {}) : def.stock.map((id) => String(id));
    const order: string[] = [];
    for (let i = 0; i < size; i += 1) order.push(menu[Math.floor(this.ctx.random() * menu.length)]!);
    counter.state.customer = look + 1;
    counter.state.order = order.join(',');
    counter.state.since = this.ctx.now();
    const reg = counter.register;
    const names = order.map((key) => (chef ? itemByKeySafe(key) : nameOfStock(def.kind, Number(key))));
    this.jobs.setTask(worker, {
      kind: chef ? 'order' : 'sale',
      stage: chef ? 'make' : 'serve',
      x: reg.bx,
      y: reg.y,
      z: reg.bz,
      label: chef ? `Order: ${names.join(', ')}` : `Ring up the customer at the register`,
      reward: chef ? PAY.chefOrder * order.length : PAY.clerkSale,
      order: chef ? order : names,
      made: [],
    });
  }

  /** A worker pressed E at a kitchen station: make the next thing on the order that it makes. */
  station(c: Citizen, it: Interactable): void {
    const counter = this.counters.find((k) => k.state.worker === c.sessionId && k.register.building === it.building);
    const task = c.task;
    if (!counter || !task || task.kind !== 'order' || task.stage !== 'make') {
      this.ctx.notify(c, 'info', c.profile.job === 'chef' ? 'Wait at the counter for an order.' : 'Only the cooks use the kitchen!');
      return;
    }
    const stations = SHOPS[counter.shop].stations ?? {};
    const made = [...(task.made ?? [])];
    const order = task.order ?? [];
    const pending = [...order];
    for (const done of made) {
      const at = pending.indexOf(done);
      if (at >= 0) pending.splice(at, 1);
    }
    const next = pending.find((key) => stations[key] === it.prop);
    if (!next) {
      this.ctx.notify(c, 'info', 'Nothing on this order comes from here.');
      return;
    }
    made.push(next);
    const ready = made.length >= order.length;
    this.jobs.setTask(c, { ...task, made, stage: ready ? 'serve' : 'make', label: ready ? 'Order ready! Serve it at the register' : task.label });
    this.ctx.fx({ kind: 'eat', x: it.bx, y: it.y + 3, z: it.bz, who: c.sessionId, data: 0 });
  }

  /** A worker pressed E at their register: hand the order over, or ring up the sale. */
  register(c: Citizen, it: Interactable): void {
    const counter = this.counters.find((k) => k.state.worker === c.sessionId && k.register.id === it.id);
    const task = c.task;
    if (!counter || !task || (task.kind !== 'order' && task.kind !== 'sale')) return;
    if (task.stage !== 'serve') {
      this.ctx.notify(c, 'info', 'Make everything on the order first!');
      return;
    }
    addMoney(c, task.reward);
    c.profile.stats.served += 1;
    this.ctx.notify(c, 'gold', task.kind === 'order' ? `Order served! +$${task.reward}` : `Sale rung up! +$${task.reward}`);
    this.ctx.send(c, MessageType.Fx, { kind: 'cash', x: c.player.x, y: c.player.y + 3, z: c.player.z, data: task.reward } satisfies FxMessage);
    counter.state.customer = 0;
    counter.state.order = '';
    counter.nextCustomerAt = this.ctx.now() + 5000 + this.ctx.random() * 6000;
    this.jobs.clearTask(c);
  }

  /** True when this citizen is staffing the shop this register belongs to. */
  isWorkerAt(c: Citizen, it: Interactable): boolean {
    return this.counters.some((k) => k.state.worker === c.sessionId && k.register.building === it.building);
  }

  /** A worker left the room. */
  release(c: Citizen): void {
    for (const counter of this.counters) {
      if (counter.state.worker !== c.sessionId) continue;
      counter.state.worker = '';
      counter.state.customer = 0;
      counter.state.order = '';
    }
  }
}

const itemByKeySafe = (key: string): string => {
  for (let id = 1; id < 200; id += 1) {
    const item = itemById(id);
    if (!item) break;
    if (item.key === key) return item.name;
  }
  return key;
};

const nameOfStock = (kind: string, id: number): string => {
  if (kind === 'accessories') return accessoryById(id)?.name ?? 'item';
  return itemById(id)?.name ?? 'item';
};
