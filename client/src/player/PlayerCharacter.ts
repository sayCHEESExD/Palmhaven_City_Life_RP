import { Group, type Object3D } from 'three';
import { attachToMount, measureMounts } from '../animation/rig/BoneMounts.js';
import { AVATAR_HEIGHT, AvatarBody } from './AvatarBody.js';
import { createMotion, type ActionKind, type Motion } from './Motion.js';

export type WornSlot = 'hat' | 'face' | 'back';

/**
 * A RESIDENT ON SCREEN: their own Bloxity avatar, what is in their right
 * hand, and what they wear - a hat, sunglasses, a backpack or wings - each
 * riding its bone so it follows every step and dance.
 *
 *   root      physics transform (position + facing). Gameplay owns it.
 *     avatar  the player's own avatar body, animated procedurally
 */
export class PlayerCharacter {
  readonly root = new Group();
  readonly motion: Motion = createMotion();

  private readonly avatar = new AvatarBody();
  private heldKey = '';
  private held: Object3D | null = null;
  private heldBuild: (() => Object3D | null) | null = null;
  private readonly worn: Record<WornSlot, { key: string; object: Object3D | null; build: (() => Object3D | null) | null }> = {
    hat: { key: '', object: null, build: null },
    face: { key: '', object: null, build: null },
    back: { key: '', object: null, build: null },
  };

  constructor() {
    this.root.add(this.avatar.root);
  }

  get height(): number {
    return AVATAR_HEIGHT;
  }

  get body(): { visual: Group; model: Object3D } {
    return this.avatar.body;
  }

  /** Wear a different avatar body; everything held or worn moves to the new bones. */
  setModel(next: Object3D | null): Object3D {
    const model = this.avatar.setModel(next);
    if (this.held) {
      this.held.removeFromParent();
      this.mountHand(this.held);
    }
    for (const slot of ['hat', 'face', 'back'] as const) {
      const worn = this.worn[slot];
      if (worn.object) {
        worn.object.removeFromParent();
        this.mountWorn(worn.object, slot);
      }
    }
    return model;
  }

  /** Put something in the hand. Same key again is a no-op, so this is safe to call every patch. */
  setHeld(key: string, build: () => Object3D | null): void {
    if (key === this.heldKey) return;
    this.heldKey = key;
    this.heldBuild = build;
    if (this.held) {
      this.held.removeFromParent();
      this.held = null;
    }
    this.motion.holding = key !== '';
    this.motion.heldKey = key;
    if (!key) return;
    const object = build();
    if (!object) return;
    this.held = object;
    this.mountHand(object);
  }

  /** Wear an accessory in a slot ('' takes it off). */
  setWorn(slot: WornSlot, key: string, build: () => Object3D | null): void {
    const worn = this.worn[slot];
    if (worn.key === key) return;
    worn.key = key;
    worn.build = build;
    worn.object?.removeFromParent();
    worn.object = null;
    if (!key) return;
    const object = build();
    if (!object) return;
    worn.object = object;
    this.mountWorn(object, slot);
  }

  /** Wear something that is not a catalogue accessory (an NPC's hat). */
  wear(object: Object3D, where: 'head' | 'back'): void {
    this.mountWorn(object, where === 'head' ? 'hat' : 'back');
  }

  private atOrigin(run: () => void): void {
    const r = this.root;
    const position = r.position.clone();
    const rotation = r.rotation.clone();
    const parent = r.parent;
    r.removeFromParent();
    r.position.set(0, 0, 0);
    r.rotation.set(0, 0, 0);
    this.avatar.bindPose();
    const avatarPos = this.avatar.root.position.clone();
    const avatarRot = this.avatar.root.rotation.clone();
    this.avatar.root.position.set(0, 0, 0);
    this.avatar.root.rotation.set(0, 0, 0);
    r.updateMatrixWorld(true);
    run();
    this.avatar.root.position.copy(avatarPos);
    this.avatar.root.rotation.copy(avatarRot);
    r.position.copy(position);
    r.rotation.copy(rotation);
    parent?.add(r);
  }

  private mountWorn(object: Object3D, slot: WornSlot): void {
    this.atOrigin(() => {
      const mounts = measureMounts(this.avatar.rigRef, this.root, AVATAR_HEIGHT);
      const mount = slot === 'back' ? mounts.back : mounts.head;
      if (slot !== 'back') object.scale.multiplyScalar(mounts.headSize);
      if (mount) attachToMount(object, mount, this.root);
      else this.root.add(object);
    });
  }

  private mountHand(object: Object3D): void {
    this.atOrigin(() => {
      const mounts = measureMounts(this.avatar.rigRef, this.root, AVATAR_HEIGHT);
      if (mounts.hand) attachToMount(object, mounts.hand, this.root);
      else {
        object.position.set(-0.6, 2, 1.2);
        this.root.add(object);
      }
    });
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  /** Play one item use. */
  act(kind: ActionKind): void {
    this.motion.actionKind = kind;
    this.motion.actionTime = 0;
  }

  cheer(): void {
    this.motion.cheerTime = 0;
  }

  /** Start (or switch) an emote. */
  setEmote(emote: number): void {
    if (emote === this.motion.emote) return;
    this.motion.emote = emote;
    this.motion.emoteTime = 0;
  }

  update(delta: number): void {
    const dt = Math.max(0, delta);
    const m = this.motion;
    if (m.actionTime >= 0) m.actionTime += dt;
    if (m.cheerTime >= 0) m.cheerTime += dt;
    if (m.emote) m.emoteTime += dt;
    this.avatar.update(dt, m);
  }

  resetAnimation(): void {
    this.avatar.reset();
  }

  dispose(): void {
    this.held?.removeFromParent();
    for (const slot of ['hat', 'face', 'back'] as const) this.worn[slot].object?.removeFromParent();
    this.avatar.dispose();
    this.root.removeFromParent();
  }
}
