import { BEACH_X0, BLOCKS, CURB, NPC_LOOKS, POSE, SHOPS, city, rng, type ShopId, type Task } from '@palmhaven/shared';
import { Group, type Scene } from 'three';
import { NpcCharacter, type NpcLook } from '../player/NpcCharacter.js';
import { NPC_LOOK_LIST, STAFF_LOOKS } from '../player/npcLooks.js';
import type { NetShopState } from '../net/netTypes.js';

/**
 * THE PEOPLE OF PALMHAVEN who are not players: staff behind every counter
 * (a cashier steps aside when a player takes the shift), customers waiting at
 * staffed counters, sunbathers on the sand, people sitting at cafe tables,
 * walkers on the sidewalks round the camera, and the suspect, patient or fare
 * your job has sent you to.
 *
 * Lightweight on purpose: NPCs are created as they come into range, animated
 * only when near, and the walkers are recycled round the camera.
 */

interface Actor {
  npc: NpcCharacter | null;
  readonly look: NpcLook;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pose: number;
  emote: number;
  /** Hidden while a player works this counter. */
  hidden: boolean;
  readonly shop?: ShopId;
}

interface Walker {
  npc: NpcCharacter;
  block: number;
  /** Distance along the block's sidewalk loop. */
  s: number;
  speed: number;
  dir: 1 | -1;
}

const NEAR = 150;

export class Life {
  readonly root = new Group();
  private readonly fixed: Actor[] = [];
  private readonly customers = new Map<ShopId, Actor>();
  private readonly walkers: Walker[] = [];
  private target: { npc: NpcCharacter; key: string } | null = null;
  private time = 0;

  constructor(private readonly scene: Scene, private readonly walkerCount: number) {
    const data = city();
    const r = rng(0x11fe);
    const staffFor = (kind: string, building: number): NpcLook | null => {
      const b = building >= 0 ? data.plan.buildings[building] : undefined;
      switch (kind) {
        case 'register':
          return b?.interior === 'cafe' || b?.interior === 'burger' ? STAFF_LOOKS.cook : STAFF_LOOKS.cashier;
        case 'dealer':
          return STAFF_LOOKS.clerk;
        case 'jobdesk':
          return STAFF_LOOKS.clerk;
        case 'depot':
          return STAFF_LOOKS.mechanic;
        case 'hangar':
          return STAFF_LOOKS.pilot;
        case 'boats':
          return STAFF_LOOKS.captain;
        case 'jail':
          return STAFF_LOOKS.officer;
        default:
          return null;
      }
    };
    for (const it of data.interactables) {
      const look = staffFor(it.kind, it.building);
      if (!look) continue;
      this.fixed.push({ npc: null, look, x: it.bx, y: it.y, z: it.bz, yaw: Math.atan2(it.x - it.bx, it.z - it.bz), pose: POSE.stand, emote: 0, hidden: false, ...(it.kind === 'register' && it.shop ? { shop: it.shop } : {}) });
    }
    // Reception desks: nurses, an officer, a banker.
    for (const b of data.plan.buildings) {
      if (b.interior !== 'hospital' && b.interior !== 'police' && b.interior !== 'bank') continue;
      const look = b.interior === 'hospital' ? STAFF_LOOKS.nurse : b.interior === 'police' ? STAFF_LOOKS.officer : STAFF_LOOKS.banker;
      const desk = data.plan.buildings.indexOf(b);
      const seats = data.interactables.filter((i) => i.building === desk);
      void seats;
      const local = b.interior === 'hospital' ? { x: -20, z: 10 - 2.7 } : b.interior === 'police' ? { x: 0, z: 8 - 2.7 } : { x: 2, z: -5.5 - 2.7 };
      const c = Math.cos(b.rot);
      const s = Math.sin(b.rot);
      this.fixed.push({ npc: null, look, x: b.x + local.x * c + local.z * s, y: b.base, z: b.z - local.x * s + local.z * c, yaw: b.rot, pose: POSE.stand, emote: 0, hidden: false });
    }
    // Lifeguards by their towers, sunbathers on towels and loungers, people at cafe tables.
    for (const p of data.plan.props) {
      if (p.key === 'lifeguard_tower') this.fixed.push({ npc: null, look: STAFF_LOOKS.lifeguard, x: p.x - 5, y: 0, z: p.z + 2, yaw: Math.PI / 2, pose: POSE.stand, emote: 0, hidden: false });
    }
    for (const seat of data.seats) {
      const beach = seat.x > BEACH_X0 && seat.pose === 'lie';
      const lounge = seat.pose === 'sit' && r() < 0.1;
      if (!(beach && r() < 0.35) && !lounge) continue;
      const look = NPC_LOOK_LIST[Math.floor(r() * NPC_LOOK_LIST.length)]!;
      this.fixed.push({ npc: null, look, x: seat.x, y: seat.y, z: seat.z, yaw: seat.rot, pose: seat.pose === 'lie' ? POSE.lie : POSE.sit, emote: 0, hidden: false });
    }
    this.root.name = 'life';
  }

  /** Staffed counters: hide the NPC cashier while a player works; show waiting customers. */
  syncShops(shops: Iterable<[string, NetShopState]> | null): void {
    const staffed = new Set<string>();
    const waiting = new Map<ShopId, number>();
    if (shops) {
      for (const [id, s] of shops) {
        if (s.worker) staffed.add(id);
        if (s.customer > 0) waiting.set(id as ShopId, s.customer);
      }
    }
    for (const actor of this.fixed) if (actor.shop) actor.hidden = staffed.has(actor.shop);
    for (const shop of Object.keys(SHOPS) as ShopId[]) {
      const look = waiting.get(shop);
      const existing = this.customers.get(shop);
      if (!look) {
        if (existing) {
          existing.npc?.dispose();
          this.customers.delete(shop);
        }
        continue;
      }
      if (existing) continue;
      const spot = city().customerSpots[shop];
      if (!spot) continue;
      const actor: Actor = { npc: null, look: NPC_LOOK_LIST[(look - 1) % NPC_LOOK_LIST.length]!, x: spot.x, y: spot.y, z: spot.z, yaw: spot.rot, pose: POSE.stand, emote: 0, hidden: false };
      this.customers.set(shop, actor);
    }
  }

  /** Where a waiting customer stands (for their order bubble). */
  customerAt(shop: ShopId): { x: number; y: number; z: number } | null {
    const a = this.customers.get(shop);
    return a ? { x: a.x, y: a.y, z: a.z } : null;
  }

  /** The NPC at your job target: a suspect, a patient on the ground, a fare waving you down. */
  syncTask(task: Task | null): void {
    const key = task && (task.kind === 'police' || task.kind === 'medic' || (task.kind === 'taxi' && task.stage === 'pickup')) ? `${task.kind}:${task.x}:${task.z}:${task.look ?? 0}` : '';
    if (this.target?.key === key) return;
    this.target?.npc.dispose();
    this.target = null;
    if (!task || !key) return;
    const look = NPC_LOOK_LIST[(task.look ?? 0) % NPC_LOOK_LIST.length]!;
    const npc = new NpcCharacter(look);
    npc.root.position.set(task.x, task.y, task.z);
    npc.root.rotation.y = Math.random() * Math.PI * 2;
    if (task.kind === 'medic') npc.character.motion.pose = POSE.lie;
    else if (task.kind === 'police') npc.character.setEmote(8);
    else npc.character.setEmote(1);
    this.scene.add(npc.root);
    this.target = { npc, key };
  }

  update(delta: number, cx: number, cz: number): void {
    this.time += delta;
    const show = (actor: Actor): void => {
      const near = !actor.hidden && Math.hypot(actor.x - cx, actor.z - cz) < NEAR;
      if (near && !actor.npc) {
        actor.npc = new NpcCharacter(actor.look);
        actor.npc.root.position.set(actor.x, actor.y, actor.z);
        actor.npc.root.rotation.y = actor.yaw;
        actor.npc.character.motion.pose = actor.pose;
        this.root.add(actor.npc.root);
      } else if (!near && actor.npc) {
        actor.npc.dispose();
        actor.npc = null;
      }
      actor.npc?.update(delta);
    };
    for (const actor of this.fixed) show(actor);
    for (const actor of this.customers.values()) show(actor);
    this.target?.npc.update(delta);
    this.updateWalkers(delta, cx, cz);
  }

  private updateWalkers(delta: number, cx: number, cz: number): void {
    const blocks = BLOCKS.filter((b) => b.col >= 0 && b.col <= 2);
    while (this.walkers.length < this.walkerCount) {
      const near = blocks.filter((b) => Math.hypot((b.r.x0 + b.r.x1) / 2 - cx, (b.r.z0 + b.r.z1) / 2 - cz) < 220);
      const block = near[Math.floor(Math.random() * near.length)] ?? blocks[0]!;
      const npc = new NpcCharacter(NPC_LOOK_LIST[Math.floor(Math.random() * NPC_LOOKS) % NPC_LOOK_LIST.length]!);
      this.root.add(npc.root);
      const perimeter = 2 * (block.r.x1 - block.r.x0 + block.r.z1 - block.r.z0);
      this.walkers.push({ npc, block: block.id, s: Math.random() * perimeter, speed: 3.2 + Math.random() * 2.2, dir: Math.random() < 0.5 ? 1 : -1 });
    }
    for (let i = this.walkers.length - 1; i >= 0; i -= 1) {
      const w = this.walkers[i]!;
      const block = BLOCKS[w.block]!;
      const inset = 3.6;
      const x0 = block.r.x0 + inset;
      const x1 = block.r.x1 - inset;
      const z0 = block.r.z0 + inset;
      const z1 = block.r.z1 - inset;
      const wlen = x1 - x0;
      const dlen = z1 - z0;
      const perimeter = 2 * (wlen + dlen);
      w.s = (w.s + w.speed * w.dir * delta + perimeter) % perimeter;
      let x: number;
      let z: number;
      let yaw: number;
      const s = w.s;
      if (s < wlen) {
        x = x0 + s;
        z = z0;
        yaw = Math.PI / 2;
      } else if (s < wlen + dlen) {
        x = x1;
        z = z0 + (s - wlen);
        yaw = 0;
      } else if (s < 2 * wlen + dlen) {
        x = x1 - (s - wlen - dlen);
        z = z1;
        yaw = -Math.PI / 2;
      } else {
        x = x0;
        z = z1 - (s - 2 * wlen - dlen);
        yaw = Math.PI;
      }
      if (w.dir < 0) yaw += Math.PI;
      const far = Math.hypot(x - cx, z - cz);
      if (far > 260) {
        w.npc.dispose();
        this.walkers.splice(i, 1);
        continue;
      }
      w.npc.root.position.set(x, CURB, z);
      w.npc.root.rotation.y = yaw;
      const m = w.npc.character.motion;
      m.speed = w.speed;
      m.grounded = true;
      if (far < NEAR) w.npc.update(delta);
      w.npc.root.visible = far < 200;
    }
  }

  dispose(): void {
    for (const actor of [...this.fixed, ...this.customers.values()]) actor.npc?.dispose();
    for (const w of this.walkers) w.npc.dispose();
    this.target?.npc.dispose();
    this.root.removeFromParent();
  }
}
