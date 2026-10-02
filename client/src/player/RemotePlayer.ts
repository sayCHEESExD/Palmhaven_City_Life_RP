import { STATUS, itemById, jobByIndex } from '@palmhaven/shared';
import { AvatarDresser } from '../bloxity/AvatarDresser.js';
import { lookFromState } from '../bloxity/avatarLook.js';
import type { NetPlayerState } from '../net/netTypes.js';
import { accessoryKey, accessoryModel, heldKey, heldModel } from './gear.js';
import type { ActionKind } from './Motion.js';
import { NamePlate } from './NamePlate.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const FOLLOW_RATE = 14;
const SNAP_DISTANCE = 16;

const shortestAngle = (from: number, to: number): number => {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
};

export const actionOf = (itemId: number): ActionKind => {
  switch (itemById(itemId)?.use) {
    case 'eat':
      return 'eat';
    case 'drink':
      return 'drink';
    case 'strum':
      return 'strum';
    case 'photo':
      return 'photo';
    case 'fish':
      return 'fish';
    case 'wave':
      return 'wave';
    case 'party':
      return 'party';
    default:
      return 'use';
  }
};

/**
 * Another resident, drawn from replicated state ONLY: smoothed toward their
 * replicated position (or seated in a vehicle by the game), named, dressed in
 * their own avatar plus whatever they wear, holding what they hold, and
 * playing their emotes and item uses.
 */
export class RemotePlayer {
  readonly character: PlayerCharacter;
  readonly plate = new NamePlate();
  private readonly dresser: AvatarDresser;
  private lastLook = '';
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private targetYaw = 0;
  private placed = false;
  private lastItemUse = -1;
  private lastEmoteSeq = -1;
  private wasGrounded = true;
  private grounded = true;
  private speed = 0;
  private verticalVelocity = 0;
  private turnRate = 0;
  private plateKey = '';
  /** In a vehicle: the game places the body each frame. */
  seated = false;
  vehicle = 0;
  seat = -1;
  pose = 0;
  status = 0;
  job = 0;
  displayName = '';

  get position(): { readonly x: number; readonly y: number; readonly z: number } {
    return { x: this.targetX, y: this.targetY, z: this.targetZ };
  }

  constructor(state: NetPlayerState) {
    this.character = new PlayerCharacter();
    this.character.root.add(this.plate.sprite);
    this.dresser = new AvatarDresser(this.character);
    this.apply(state);
    this.character.setPosition(this.targetX, this.targetY, this.targetZ);
    this.character.setYaw(this.targetYaw);
    this.placed = true;
  }

  apply(state: NetPlayerState): void {
    this.targetX = state.x;
    this.targetY = state.y;
    this.targetZ = state.z;
    this.targetYaw = state.rotationY;
    this.grounded = state.grounded;
    this.speed = state.speed;
    this.verticalVelocity = state.verticalVelocity;
    this.vehicle = state.vehicle;
    this.seat = state.seat;
    this.pose = state.pose;
    this.status = state.status;
    this.job = state.job;
    this.displayName = state.displayName;
    this.seated = state.vehicle !== 0;

    const job = jobByIndex(state.job);
    const title = state.status & STATUS.jailed ? 'In Jail' : state.status & STATUS.cuffed ? 'Cuffed' : job.id === 'civilian' ? '' : job.title;
    const titleColor = state.status ? '#ff6b6b' : job.color;
    const key = `${state.displayName}|${state.avatarUrl}|${title}|${titleColor}`;
    if (key !== this.plateKey) {
      this.plateKey = key;
      this.plate.set(state.displayName, state.avatarUrl, this.character.height, title, titleColor);
    }

    this.character.setHeld(heldKey(state.item), () => heldModel(state.item));
    this.character.setWorn('hat', accessoryKey(state.hat), () => accessoryModel(state.hat));
    this.character.setWorn('face', accessoryKey(state.face), () => accessoryModel(state.face));
    this.character.setWorn('back', accessoryKey(state.back), () => accessoryModel(state.back));

    const m = this.character.motion;
    m.cuffed = (state.status & STATUS.cuffed) !== 0;
    m.swimming = state.swimming;
    if (this.lastItemUse >= 0 && state.itemUse !== this.lastItemUse) this.character.act(actionOf(state.item));
    this.lastItemUse = state.itemUse;
    // A Bloxity emote: the animator samples the clip at (room clock - start).
    this.character.motion.bxId = state.bxEmote ?? '';
    this.character.motion.bxStart = state.bxEmoteAt ?? 0;
    if (state.emoteSeq !== this.lastEmoteSeq) {
      this.lastEmoteSeq = state.emoteSeq;
      this.character.motion.emote = 0;
      this.character.setEmote(state.emote);
    } else if (state.emote === 0) {
      this.character.setEmote(0);
    }
    this.dressFrom(state);
  }

  private dressFrom(state: NetPlayerState): void {
    const avatar = state.avatar;
    if (!avatar) return;
    const look = lookFromState(avatar);
    const key = JSON.stringify(look);
    if (key === this.lastLook) return;
    this.lastLook = key;
    this.dresser.setLook(look.appearance, look.proportions);
  }

  /** On foot (or sitting on a bench): smooth toward the replicated transform. */
  update(delta: number): void {
    const dt = Math.max(0, delta);
    const m = this.character.motion;
    if (!this.seated) {
      const position = this.character.root.position;
      const gap = Math.hypot(this.targetX - position.x, this.targetY - position.y, this.targetZ - position.z);
      const yawBefore = this.character.root.rotation.y;
      if (!this.placed || gap > SNAP_DISTANCE || this.pose !== 0) {
        position.set(this.targetX, this.targetY, this.targetZ);
        this.character.setYaw(this.targetYaw);
        this.placed = true;
      } else {
        const alpha = 1 - Math.exp(-FOLLOW_RATE * dt);
        position.x += (this.targetX - position.x) * alpha;
        position.y += (this.targetY - position.y) * alpha;
        position.z += (this.targetZ - position.z) * alpha;
        const yaw = this.character.root.rotation.y;
        this.character.setYaw(yaw + shortestAngle(yaw, this.targetYaw) * Math.min(1, alpha * 1.5));
      }
      const turn = shortestAngle(yawBefore, this.character.root.rotation.y);
      this.turnRate += ((dt > 0 ? turn / dt : 0) - this.turnRate) * Math.min(1, dt * 10);
      m.pose = this.pose;
      m.speed = this.speed;
    } else {
      m.speed = 0;
    }
    m.grounded = this.grounded;
    m.verticalVelocity = this.verticalVelocity;
    m.turnRate = this.turnRate;
    m.landed = this.grounded && !this.wasGrounded;
    this.wasGrounded = this.grounded;
    this.character.update(dt);
  }

  dispose(): void {
    this.plate.dispose();
    this.dresser.dispose();
    this.character.dispose();
  }
}
