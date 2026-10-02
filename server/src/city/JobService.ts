import {
  MessageType,
  NPC_LOOKS,
  PAY,
  PAYCHECK_SECONDS,
  city,
  itemByKey,
  jobById,
  placeOf,
  type FxMessage,
  type JobActionKind,
  type JobId,
  type Task,
} from '@palmhaven/shared';
import { addMoney, dressCitizen, near, type Citizen } from './Citizen.js';
import type { RoomContext } from './RoomContext.js';
import type { VehicleService } from './VehicleService.js';

const PARCELS_PER_LOAD = 3;
const CALL_SECONDS = 300;

/**
 * JOBS: switching, paychecks, and the job loops that are not counter work -
 * parcels, taxi fares, police and medical dispatch calls. (Cooking and the
 * register live in `ShopService`, which owns the counters.)
 *
 * Every step is checked against the server's own idea of where the player and
 * their vehicle are; the client only asks.
 */
export class JobService {
  private readonly parcel = itemByKey('parcel').id;
  private readonly medkit = itemByKey('medkit').id;
  private readonly tray = itemByKey('tray').id;

  constructor(
    private readonly ctx: RoomContext,
    private readonly vehicles: VehicleService,
  ) {}

  setJob(c: Citizen, id: JobId): void {
    const job = jobById(id);
    if (!job || c.profile.job === id) return;
    if (c.player.status !== 0) {
      this.ctx.notify(c, 'bad', 'Not while you are in custody!');
      return;
    }
    const old = jobById(c.profile.job);
    // The old job's vehicle goes back to the depot.
    if (c.vehicle) {
      const def = this.vehicles.defOf(c.vehicle);
      if (def?.job && def.job === old?.id) this.vehicles.despawn(c.vehicle);
    }
    c.profile.job = id;
    this.clearTask(c);
    c.nextTaskAt = this.ctx.now() + 3500;
    c.paycheckAt = this.ctx.now() + PAYCHECK_SECONDS * 1000;
    dressCitizen(c);
    c.dirty = true;
    this.ctx.notify(c, 'gold', id === 'civilian' ? 'You are off the clock. Enjoy Palmhaven!' : `You are now a ${job.name}! ${job.how}`);
  }

  clearTask(c: Citizen): void {
    const task = c.task;
    if (task?.kind === 'taxi' && task.stage === 'dropoff') {
      const v = this.vehicles.drivenBy(c);
      if (v) v.state.fare = 0;
    }
    c.task = null;
    this.refreshHeld(c);
    c.dirty = true;
  }

  setTask(c: Citizen, task: Task | null): void {
    c.task = task;
    this.refreshHeld(c);
    c.dirty = true;
  }

  /** What shows in their hands: job gear while working, else their own pick. */
  refreshHeld(c: Citizen): void {
    const task = c.task;
    if (task?.kind === 'delivery' && task.stage === 'dropoff') c.player.item = this.parcel;
    else if (task?.kind === 'medic') c.player.item = this.medkit;
    else if (task?.kind === 'order' && task.stage === 'serve') c.player.item = this.tray;
    else c.player.item = c.profile.held;
  }

  // ------------------------------------------------------------------ tick

  tick(c: Citizen): void {
    const now = this.ctx.now();
    if (now >= c.paycheckAt) {
      c.paycheckAt = now + PAYCHECK_SECONDS * 1000;
      const job = jobById(c.profile.job);
      if (job && c.player.status === 0) {
        addMoney(c, job.salary);
        this.ctx.notify(c, 'gold', job.id === 'civilian' ? `City stipend: +$${job.salary}` : `Paycheck: +$${job.salary} for working as a ${job.name}!`);
        this.ctx.send(c, MessageType.Fx, { kind: 'cash', x: c.player.x, y: c.player.y + 3, z: c.player.z, data: job.salary } satisfies FxMessage);
      }
    }
    const task = c.task;
    if (task?.expires && now > task.expires) {
      this.ctx.notify(c, 'info', 'That call has been handled by someone else.');
      this.clearTask(c);
      c.nextTaskAt = now + 4000;
    }
    switch (c.profile.job) {
      case 'police':
      case 'medic':
        if (!c.task && now >= c.nextTaskAt && c.player.status === 0) this.dispatch(c);
        break;
      case 'taxi':
        this.tickTaxi(c, now);
        break;
      default:
        break;
    }
  }

  /** A call somewhere in the city: a suspect for the police, a patient for the medics. */
  private dispatch(c: Citizen): void {
    const spot = this.pick(city().curbside, c.player.x, c.player.z, 160, 750);
    if (!spot) return;
    const police = c.profile.job === 'police';
    this.setTask(c, {
      kind: police ? 'police' : 'medic',
      stage: 'goto',
      x: spot.x,
      y: spot.y,
      z: spot.z,
      label: police ? `Suspect reported on ${spot.label}` : `Someone needs help on ${spot.label}`,
      reward: police ? PAY.policeCall : PAY.medicCall,
      look: Math.floor(this.ctx.random() * NPC_LOOKS),
      expires: this.ctx.now() + CALL_SECONDS * 1000,
    });
    this.ctx.notify(c, 'info', police ? 'Dispatch: a new call is on your map!' : 'Dispatch: a patient needs you. Check your map!');
  }

  private tickTaxi(c: Citizen, now: number): void {
    const v = this.vehicles.drivenBy(c);
    const inTaxi = v?.def.key === 'taxi';
    const task = c.task;
    if (!task) {
      if (inTaxi && now >= c.nextTaskAt) {
        const spot = this.pick(city().curbside, c.player.x, c.player.z, 120, 520);
        if (!spot) return;
        this.setTask(c, { kind: 'taxi', stage: 'pickup', x: spot.x, y: spot.y, z: spot.z, label: `Pick up a fare on ${spot.label}`, reward: 0, look: Math.floor(this.ctx.random() * NPC_LOOKS) });
        this.ctx.notify(c, 'info', 'A new fare is waiting. Check your map!');
      }
      return;
    }
    if (!inTaxi || !v) return;
    if (v.speed > 4) return;
    if (task.stage === 'pickup' && near(c, task.x, task.z, 13)) {
      const drop = this.pick(city().curbside, task.x, task.z, 300, 1000);
      if (!drop) return;
      const distance = Math.hypot(drop.x - task.x, drop.z - task.z);
      v.state.fare = (task.look ?? 0) + 1;
      this.setTask(c, { kind: 'taxi', stage: 'dropoff', x: drop.x, y: drop.y, z: drop.z, label: `Drive your passenger to ${drop.label}`, reward: Math.round(PAY.taxiBase + PAY.taxiPerUnit * distance), look: task.look ?? 0 });
      this.ctx.notify(c, 'good', 'Passenger aboard! Head for the destination.');
    } else if (task.stage === 'dropoff' && near(c, task.x, task.z, 13)) {
      v.state.fare = 0;
      addMoney(c, task.reward);
      c.profile.stats.fares += 1;
      this.ctx.notify(c, 'gold', `Fare complete: +$${task.reward}`);
      this.ctx.send(c, MessageType.Fx, { kind: 'cash', x: c.player.x, y: c.player.y + 3, z: c.player.z, data: task.reward } satisfies FxMessage);
      this.clearTask(c);
      c.nextTaskAt = now + 5000;
    }
  }

  /** A real player rode in this driver's taxi. */
  playerFare(passenger: Citizen, info: { driver: string; travelled: number }): void {
    const driver = this.ctx.citizen(info.driver);
    if (!driver || driver.profile.job !== 'taxi' || info.travelled < 120) return;
    addMoney(driver, PAY.playerFare);
    driver.profile.stats.fares += 1;
    this.ctx.notify(driver, 'gold', `Tip from your passenger: +$${PAY.playerFare}`);
    this.ctx.notify(passenger, 'info', 'Thanks for riding Palmhaven Taxi!');
  }

  // ------------------------------------------------------------ deliveries

  /** At the depot's counter: start the job, load the van. */
  loadParcels(c: Citizen, deskX: number, deskZ: number): void {
    if (c.profile.job !== 'delivery') this.setJob(c, 'delivery');
    const task = c.task;
    if (task?.kind === 'delivery' && task.stage === 'dropoff' && (task.left ?? 0) > 0) {
      this.ctx.notify(c, 'info', `You still have ${task.left} parcel${task.left === 1 ? '' : 's'} to deliver!`);
      return;
    }
    this.nextParcel(c, PARCELS_PER_LOAD, deskX, deskZ);
    this.ctx.notify(c, 'good', `Loaded ${PARCELS_PER_LOAD} parcels. Grab a PalmPost van from your phone and go!`);
  }

  private nextParcel(c: Citizen, left: number, fromX: number, fromZ: number): void {
    const door = this.pick(city().doorsteps, fromX, fromZ, 140, 800);
    if (!door) return;
    const distance = Math.hypot(door.x - fromX, door.z - fromZ);
    this.setTask(c, {
      kind: 'delivery',
      stage: 'dropoff',
      x: door.x,
      y: door.y,
      z: door.z,
      label: `Deliver a parcel to ${door.label}`,
      reward: Math.round(PAY.deliveryBase + PAY.deliveryPerUnit * distance),
      left,
    });
  }

  action(c: Citizen, action: JobActionKind): void {
    const task = c.task;
    if (action === 'cancel') {
      if (!task) return;
      this.clearTask(c);
      c.nextTaskAt = this.ctx.now() + 8000;
      this.ctx.notify(c, 'info', 'Task cancelled.');
      return;
    }
    if (!task || c.player.vehicle !== 0 || c.player.status !== 0) return;
    if (!near(c, task.x, task.z, 8)) return;
    const pay = (text: string): void => {
      addMoney(c, task.reward);
      this.ctx.notify(c, 'gold', `${text} +$${task.reward}`);
      this.ctx.send(c, MessageType.Fx, { kind: 'cash', x: c.player.x, y: c.player.y + 3, z: c.player.z, data: task.reward } satisfies FxMessage);
    };
    if (action === 'deliver' && task.kind === 'delivery' && task.stage === 'dropoff') {
      pay('Parcel delivered!');
      c.profile.stats.deliveries += 1;
      const left = (task.left ?? 1) - 1;
      if (left > 0) {
        this.nextParcel(c, left, task.x, task.z);
      } else {
        const depot = placeOf('depot');
        this.setTask(c, { kind: 'delivery', stage: 'pickup', x: depot.x, y: depot.y, z: depot.z, label: 'Van empty! Load more parcels at the PalmPost depot', reward: 0 });
      }
      return;
    }
    if (action === 'arrest' && task.kind === 'police') {
      pay('Suspect arrested!');
      c.profile.stats.arrests += 1;
      this.ctx.fx({ kind: 'cuff', x: task.x, y: task.y, z: task.z, who: c.sessionId });
      this.clearTask(c);
      c.nextTaskAt = this.ctx.now() + 6000;
      return;
    }
    if (action === 'treat' && task.kind === 'medic') {
      pay('Patient treated!');
      c.profile.stats.treated += 1;
      this.ctx.fx({ kind: 'heal', x: task.x, y: task.y, z: task.z, who: c.sessionId });
      this.clearTask(c);
      c.nextTaskAt = this.ctx.now() + 6000;
    }
  }

  /** A random point from a list, at a sensible distance. */
  private pick<T extends { x: number; z: number }>(list: readonly T[], x: number, z: number, min: number, max: number): T | null {
    const fits = list.filter((p) => {
      const d = Math.hypot(p.x - x, p.z - z);
      return d >= min && d <= max;
    });
    const pool = fits.length > 0 ? fits : list;
    if (pool.length === 0) return null;
    return pool[Math.floor(this.ctx.random() * pool.length)]!;
  }

  /** For a medic's E on a resting player, or a hospital bed. */
  get medkitId(): number {
    return this.medkit;
  }
}
