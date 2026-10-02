import { BLOXITY_EMOTE } from '@palmhaven/shared';
import { Box3, Group, Vector3, type Mesh, type Object3D } from 'three';
import { PoseBuffer } from '../animation/PoseBuffer.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { PLAYER_MODEL_YAW_OFFSET } from '../config/worldVisuals.js';
import { ACTION_SECONDS, CHEER_SECONDS, bump, clamp, damp, ramp, type Motion } from './Motion.js';
import { BloxityEmotePlayer, emoteSecondsSince } from '../animation/BloxityEmotes.js';
import { playerModelLoader } from './PlayerModelLoader.js';

/** How tall the avatar stands, world units. */
export const AVATAR_HEIGHT = 3.4;
/** Height of the hips above the feet: where a seat point sits. */
export const HIP_HEIGHT = 1.45;

let unitScale = 0;

const avatarScale = (): number => {
  if (unitScale > 0) return unitScale;
  const probe = playerModelLoader.createInstance();
  probe.updateMatrixWorld(true);
  const height = new Box3().setFromObject(probe).getSize(new Vector3()).y;
  unitScale = height > 0.1 ? AVATAR_HEIGHT / height : 1;
  return unitScale;
};

/**
 * THE PLAYER'S OWN BLOXITY AVATAR, animated procedurally on the rig's twelve
 * bones: walk, run, jump, swim; sitting, lying, driving, riding and boarding;
 * a dozen emotes; cuffed; eating, strumming, snapping photos, fishing.
 *
 *   root      the avatar's place on the player (normalised to AVATAR_HEIGHT)
 *     visual  what `BloxityAvatar` scales by the avatar's height proportion
 *       model the bundled body, or the player's Bloxity body once it loads
 *
 * `root` is also posed as a whole: lowered onto a seat, laid flat on a bed.
 */
export class AvatarBody {
  readonly root = new Group();
  readonly visual = new Group();
  private readonly defaultModel: Object3D;
  private model: Object3D;
  private rig: PlayerRig;
  private readonly animator = new AvatarAnimator();

  constructor() {
    this.defaultModel = playerModelLoader.createInstance();
    this.model = this.defaultModel;
    this.model.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.visual.add(this.model);
    this.root.add(this.visual);
    this.root.scale.setScalar(avatarScale());
    this.rig = new PlayerRig(this.model, this.model);
    this.castShadows();
  }

  get body(): { visual: Group; model: Object3D } {
    return { visual: this.visual, model: this.model };
  }

  setModel(next: Object3D | null): Object3D {
    const target = next ?? this.defaultModel;
    if (target === this.model) return target;
    const previous = this.model;
    previous.removeFromParent();
    releaseBody(previous);
    target.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.model = target;
    this.visual.add(target);
    this.rig = new PlayerRig(target, target);
    this.castShadows();
    return target;
  }

  update(dt: number, motion: Motion): void {
    this.animator.update(dt, motion, this.rig, this.root);
  }

  get rigRef(): PlayerRig {
    return this.rig;
  }

  bindPose(): void {
    this.rig.applyPose(new PoseBuffer());
  }

  reset(): void {
    this.animator.reset();
    this.root.rotation.set(0, 0, 0);
    this.root.position.set(0, 0, 0);
  }

  private castShadows(): void {
    this.model.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
  }

  dispose(): void {
    releaseBody(this.model);
    this.root.removeFromParent();
  }
}

const releaseBody = (model: Object3D): void => {
  if (model.userData['bloxityBody'] !== true) return;
  model.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
};

/** Emote ids (see EMOTES in shared). */
const E = { wave: 1, dance: 2, dance2: 3, cheer: 4, point: 5, laugh: 6, clap: 7, think: 8, sit: 9, lie: 10, pushups: 11, phone: 12 } as const;

/**
 * The procedural animation, in the rig's convention (`PlayerRig`): +X pitch
 * swings a limb BACKWARD (a limb raised forward is negative X), +Z on a left
 * limb swings it out to the side; a negative X on the spine or neck bows it
 * forward.
 */
class AvatarAnimator {
  private readonly pose = new PoseBuffer();
  /** A Bloxity catalogue emote, laid over the whole body by the rig. */
  private readonly bloxity = new BloxityEmotePlayer();
  private phase = 0;
  private time = Math.random() * 10;
  private move = 0;
  private run = 0;
  private air = 0;
  private dip = 0;
  private hold = 0;
  private seat = 0;
  private swim = 0;

  reset(): void {
    this.move = 0;
    this.air = 0;
    this.dip = 0;
    this.seat = 0;
  }

  update(dt: number, m: Motion, rig: PlayerRig, root: Group): void {
    this.time += dt;
    const p = this.pose;
    p.reset();
    const posed = m.pose !== 0;
    const speed = posed ? 0 : m.speed;
    this.move = damp(this.move, clamp(speed / 3, 0, 1), 8, dt);
    this.run = damp(this.run, clamp((speed - 13) / 7, 0, 1), 6, dt);
    this.air = damp(this.air, m.grounded || posed || m.swimming ? 0 : 1, 10, dt);
    this.hold = damp(this.hold, m.holding && !posed ? 1 : 0, 12, dt);
    this.seat = damp(this.seat, posed ? 1 : 0, 14, dt);
    this.swim = damp(this.swim, m.swimming && !posed ? 1 : 0, 6, dt);
    if (m.landed) this.dip = 1;
    this.dip = Math.max(0, this.dip - dt * 4);
    root.rotation.set(0, 0, 0);
    root.position.set(0, 0, 0);

    // A Bloxity emote holds a standing, still, free body; anything else stops it
    // (and it never resumes until a new one is chosen). Never throws: cosmetic.
    try {
      const free = !posed && speed < BLOXITY_EMOTE.stopSpeed && !m.cuffed && !m.swimming;
      this.bloxity.update(dt, this.time, m.bxId, m.bxId ? emoteSecondsSince(m.bxStart) : 0, free);
    } catch {
      this.bloxity.clear();
    }

    if (posed) {
      this.posed(p, m, root);
      rig.applyPose(p, this.bloxity);
      return;
    }

    const ground = (1 - this.air) * (1 - this.swim);
    const emoteActive = m.emote !== 0 && speed < 1.5;

    // ------------------------------------------------------- walk and run
    if (speed > 0.2) this.phase = (this.phase + (speed / (4.4 + this.run * 2)) * Math.PI * dt) % (Math.PI * 2);
    const sin = Math.sin(this.phase);
    const cos = Math.cos(this.phase);
    const legs = (0.7 + this.run * 0.25) * this.move * ground;
    p.add('LegL1', -legs * sin);
    p.add('LegR1', legs * sin);
    p.add('LegL2', (0.35 + this.run * 0.4) * Math.max(0, cos) * this.move * ground);
    p.add('LegR2', (0.35 + this.run * 0.4) * Math.max(0, -cos) * this.move * ground);
    const arms = (0.7 + this.run * 0.35) * this.move * ground;
    p.add('ArmL1', arms * sin, 0, 0.06);
    p.add('ArmR1', -arms * sin * (1 - this.hold), 0, -0.06);
    p.add('ArmL2', -0.5 * this.run * this.move);
    p.add('ArmR2', -0.5 * this.run * this.move * (1 - this.hold));
    p.add('Spine1', (-0.04 - 0.12 * this.run) * this.move, 0.08 * legs * sin);
    // Idle breathing.
    const still = (1 - this.move) * ground;
    const breath = Math.sin(this.time * 2.2);
    p.add('Spine1', breath * 0.025 * still);
    if (!emoteActive) p.add('Neck1', 0, Math.sin(this.time * 0.45) * 0.14 * still);
    p.add('ArmL1', breath * 0.03 * still, 0, 0.03 * still);
    // In the air.
    p.add('LegL1', -0.5 * this.air);
    p.add('LegR1', 0.3 * this.air);
    p.add('ArmL1', -0.3 * this.air, 0, 1.2 * this.air);
    p.add('ArmR1', -0.3 * this.air * (1 - this.hold), 0, -1.2 * this.air * (1 - this.hold));
    const dip = this.dip * this.dip;
    p.add('LegL1', -0.35 * dip);
    p.add('LegR1', -0.35 * dip);
    p.add('LegL2', 0.7 * dip);
    p.add('LegR2', 0.7 * dip);

    // ------------------------------------------------------------ swimming
    if (this.swim > 0.01) {
      const s = this.swim;
      const stroke = this.time * (3 + Math.min(1, m.speed / 6) * 3);
      const moving = clamp(m.speed / 4, 0, 1);
      root.rotation.x = 0.9 * moving * s;
      root.position.y = -0.2 * s;
      p.add('ArmL1', (-1.6 + Math.sin(stroke) * 1.6) * s * moving + Math.sin(stroke) * 0.3 * s * (1 - moving), 0, 0.5 * s);
      p.add('ArmR1', (-1.6 - Math.sin(stroke) * 1.6) * s * moving - Math.sin(stroke) * 0.3 * s * (1 - moving), 0, -0.5 * s);
      p.add('LegL1', Math.sin(stroke * 1.6) * 0.45 * s);
      p.add('LegR1', -Math.sin(stroke * 1.6) * 0.45 * s);
      p.add('Neck1', -0.6 * moving * s);
    }

    // ---------------------------------------------------------- held item
    this.holdPose(p, m);

    // -------------------------------------------------------- item uses
    if (m.actionTime >= 0) {
      const t = m.actionTime / ACTION_SECONDS;
      if (t <= 1) {
        const k = bump(t, 0, 1);
        switch (m.actionKind) {
          case 'eat':
          case 'drink':
            p.add('ArmR1', -1.0 * k, 0, 0.25 * k);
            p.add('ArmR2', -1.6 * k);
            p.add('Neck1', (m.actionKind === 'drink' ? 0.35 : -0.1) * k);
            break;
          case 'strum':
            p.add('ArmR2', Math.sin(t * Math.PI * 10) * 0.35 * k);
            p.add('Neck1', -0.15 * k, Math.sin(this.time * 4) * 0.2 * k);
            break;
          case 'photo':
            p.add('ArmR1', -1.3 * k, 0, 0.2 * k);
            p.add('ArmL1', -1.3 * k, 0, -0.2 * k);
            p.add('ArmR2', -0.9 * k);
            p.add('ArmL2', -0.9 * k);
            break;
          case 'fish': {
            const back = bump(t, 0, 0.4);
            const throwF = bump(t, 0.3, 0.8);
            p.add('ArmR1', -2.2 * back + 0.6 * throwF);
            p.add('Spine1', 0.15 * back - 0.2 * throwF);
            break;
          }
          case 'wave':
            p.add('ArmR1', -0.4 * k, 0, Math.sin(t * Math.PI * 6) * 0.4 * k);
            break;
          case 'party':
          case 'use':
            p.add('ArmR1', -0.8 * k);
            break;
        }
      }
    }

    // ------------------------------------------------------------- cheer
    if (m.cheerTime >= 0 && m.cheerTime < CHEER_SECONDS) {
      const env = ramp(m.cheerTime, 0, 0.15) * (1 - ramp(m.cheerTime, CHEER_SECONDS - 0.25, CHEER_SECONDS));
      const pump = Math.abs(Math.sin(m.cheerTime * 9));
      p.add('ArmL1', -2.7 * env * (0.8 + 0.2 * pump), 0, 0.3 * env);
      p.add('ArmR1', (-2.7 + 1.5 * this.hold) * env * (0.8 + 0.2 * (1 - pump)), 0, -0.3 * env);
      p.add('Neck1', 0.25 * env);
    }

    // ------------------------------------------------------------- cuffed
    if (m.cuffed) {
      p.add('ArmL1', 0.55, 0, -0.35);
      p.add('ArmR1', 0.55 - p.rotations[6 * 3]!, 0, 0.35);
      p.add('ArmL2', -0.5);
      p.add('ArmR2', -0.5);
      p.add('Neck1', 0.12);
    }

    // ------------------------------------------------------------- emotes
    if (emoteActive && !m.cuffed) this.emote(p, m, root);

    root.position.y += -0.1 * dip;
    rig.applyPose(p, this.bloxity);
  }

  /** Item-specific holds: a surfboard carried upright, a balloon held high, a parcel in both hands. */
  private holdPose(p: PoseBuffer, m: Motion): void {
    const h = this.hold;
    if (h < 0.01) return;
    const key = m.heldKey;
    if (key === 'parcel' || key === 'tray' || key === 'boombox' || key === 'beachball') {
      p.add('ArmR1', -1.25 * h, 0, 0.12 * h);
      p.add('ArmL1', -1.25 * h, 0, -0.12 * h);
      p.add('ArmR2', -0.35 * h);
      p.add('ArmL2', -0.35 * h);
      return;
    }
    if (key === 'surfboard') {
      p.add('ArmR1', -0.15 * h, 0, -0.35 * h);
      return;
    }
    if (key === 'balloon' || key === 'umbrella' || key === 'sign') {
      p.add('ArmR1', -2.3 * h, 0, -0.15 * h);
      p.add('ArmR2', -0.2 * h);
      if (key === 'sign') p.add('ArmL1', -2.3 * h, 0, 0.15 * h);
      return;
    }
    if (key === 'guitar') {
      p.add('ArmR1', -0.7 * h, 0, 0.35 * h);
      p.add('ArmR2', -1.1 * h);
      p.add('ArmL1', -1.1 * h, 0, -0.5 * h);
      p.add('ArmL2', -0.5 * h);
      return;
    }
    // The Roblox tool hold.
    p.add('ArmR1', -1.5 * h + 0.04 * Math.sin(this.phase * 2) * this.move * h);
    p.add('ArmR2', -0.1 * h);
  }

  /** Sitting, lying, driving, riding, swinging, boarding. The seat point is the hips. */
  private posed(p: PoseBuffer, m: Motion, root: Group): void {
    const t = this.time;
    switch (m.pose) {
      case 1: // sit
      case 3: // swing
      case 5: // drive
        root.position.y = -HIP_HEIGHT;
        p.add('LegL1', -1.5);
        p.add('LegR1', -1.5);
        p.add('LegL2', 1.45);
        p.add('LegR2', 1.45);
        if (m.pose === 5) {
          const turn = m.steer * 0.45;
          p.add('ArmL1', -1.05 - turn * 0.4, 0, 0.12);
          p.add('ArmR1', -1.05 + turn * 0.4, 0, -0.12);
          p.add('ArmL2', -0.45);
          p.add('ArmR2', -0.45);
          p.add('Spine1', 0.05, -turn * 0.3);
          p.add('Neck1', 0, -turn * 0.5);
        } else if (m.pose === 3) {
          p.add('ArmL1', -2.4, 0, 0.1);
          p.add('ArmR1', -2.4, 0, -0.1);
          const swing = Math.sin(t * 2.2) * 0.35;
          root.rotation.x = swing;
          p.add('LegL2', -swing * 0.8);
          p.add('LegR2', -swing * 0.8);
        } else {
          p.add('ArmL1', -0.35, 0, 0.12);
          p.add('ArmR1', -0.35, 0, -0.12);
          p.add('ArmL2', -0.3);
          p.add('ArmR2', -0.3);
          p.add('Spine1', Math.sin(t * 2) * 0.02);
          p.add('Neck1', 0, Math.sin(t * 0.4) * 0.25);
        }
        return;
      case 2: // lie on the back, head toward -z
        root.rotation.x = -Math.PI / 2;
        root.position.set(0, 0.32, HIP_HEIGHT);
        p.add('ArmL1', 0, 0, 0.25);
        p.add('ArmR1', 0, 0, -0.25);
        p.add('Spine1', Math.sin(t * 1.4) * 0.03);
        return;
      case 4: // ride: straddle, hands forward to the bars
        root.position.y = -HIP_HEIGHT * 0.95;
        p.add('LegL1', -1.15, 0, 0.32);
        p.add('LegR1', -1.15, 0, -0.32);
        p.add('LegL2', 1.3);
        p.add('LegR2', 1.3);
        p.add('ArmL1', -1.25 - m.steer * 0.25, 0, 0.18);
        p.add('ArmR1', -1.25 + m.steer * 0.25, 0, -0.18);
        p.add('Spine1', -0.35, -m.steer * 0.2);
        return;
      case 6: // board: side-on, knees soft, arms out for balance
        root.position.y = -0.1;
        root.rotation.y = Math.PI / 2;
        p.add('LegL1', -0.25, 0, 0.35);
        p.add('LegR1', 0.25, 0, -0.35);
        p.add('LegL2', 0.45);
        p.add('LegR2', 0.45);
        p.add('ArmL1', 0, 0, 1 + Math.sin(t * 1.7) * 0.15);
        p.add('ArmR1', 0, 0, -1 - Math.sin(t * 1.9) * 0.15);
        p.add('Neck1', 0, -Math.PI / 2 * 0.8);
        p.add('Spine1', 0, -0.3);
        return;
      default:
        return;
    }
  }

  private emote(p: PoseBuffer, m: Motion, root: Group): void {
    const t = m.emoteTime;
    const k = ramp(t, 0, 0.2);
    switch (m.emote) {
      case E.wave:
        p.add('ArmR1', -0.3 * k, 0, -2.5 * k);
        p.add('ArmR2', (-0.6 + Math.sin(t * 12) * 0.5) * k);
        p.add('Neck1', 0, 0.2 * k);
        break;
      case E.dance: {
        const beat = t * 7.5;
        root.position.y = Math.abs(Math.sin(beat)) * 0.25;
        p.add('ArmL1', (-1.8 + Math.sin(beat) * 1.0) * k, 0, 0.4 * k);
        p.add('ArmR1', (-1.8 - Math.sin(beat) * 1.0) * k, 0, -0.4 * k);
        p.add('ArmL2', -0.8 * k);
        p.add('ArmR2', -0.8 * k);
        p.add('Spine1', 0, Math.sin(beat * 0.5) * 0.35 * k);
        p.add('LegL1', -Math.max(0, Math.sin(beat)) * 0.5 * k);
        p.add('LegR1', -Math.max(0, -Math.sin(beat)) * 0.5 * k);
        p.add('Neck1', Math.sin(beat) * 0.15 * k);
        break;
      }
      case E.dance2: {
        const beat = t * 5;
        root.rotation.y = Math.sin(beat * 0.5) * 0.5;
        p.add('Spine1', 0, Math.sin(beat) * 0.3 * k, Math.sin(beat) * 0.15 * k);
        p.add('ArmL1', -1.1 * k, 0, (0.9 + Math.sin(beat) * 0.3) * k);
        p.add('ArmR1', -1.1 * k, 0, (-0.9 + Math.sin(beat) * 0.3) * k);
        p.add('LegL1', Math.sin(beat) * 0.35 * k);
        p.add('LegR1', -Math.sin(beat) * 0.35 * k);
        p.add('LegL2', Math.max(0, Math.sin(beat)) * 0.4 * k);
        p.add('LegR2', Math.max(0, -Math.sin(beat)) * 0.4 * k);
        break;
      }
      case E.cheer: {
        const pump = Math.abs(Math.sin(t * 9));
        p.add('ArmL1', -2.7 * k * (0.8 + 0.2 * pump), 0, 0.3 * k);
        p.add('ArmR1', -2.7 * k * (0.8 + 0.2 * (1 - pump)), 0, -0.3 * k);
        p.add('Neck1', 0.3 * k);
        root.position.y = Math.abs(Math.sin(t * 9)) * 0.3 * k;
        break;
      }
      case E.point:
        p.add('ArmR1', -1.55 * k, 0, 0.05 * k);
        p.add('Neck1', -0.05 * k, 0.1 * k);
        break;
      case E.laugh:
        p.add('Spine1', (0.15 + Math.sin(t * 14) * 0.08) * k);
        p.add('Neck1', 0.35 * k);
        p.add('ArmL1', -0.4 * k, 0, -0.3 * k);
        p.add('ArmR1', -0.4 * k, 0, 0.3 * k);
        p.add('ArmL2', -1.4 * k);
        p.add('ArmR2', -1.4 * k);
        break;
      case E.clap: {
        const clap = Math.abs(Math.sin(t * 9));
        p.add('ArmL1', -1.3 * k, 0, (-0.35 + clap * 0.5) * k);
        p.add('ArmR1', -1.3 * k, 0, (0.35 - clap * 0.5) * k);
        p.add('ArmL2', -0.4 * k);
        p.add('ArmR2', -0.4 * k);
        break;
      }
      case E.think:
        p.add('ArmR1', -1.2 * k, 0, 0.35 * k);
        p.add('ArmR2', -2.2 * k);
        p.add('ArmL1', -0.6 * k, 0, -0.6 * k);
        p.add('ArmL2', -1.2 * k);
        p.add('Neck1', 0.1 * k, 0, 0.18 * k);
        break;
      case E.sit:
        root.position.y = -HIP_HEIGHT * k + 0.1;
        p.add('LegL1', -1.5 * k, 0, 0.2 * k);
        p.add('LegR1', -1.5 * k, 0, -0.2 * k);
        p.add('LegL2', 0.3 * k);
        p.add('LegR2', 0.3 * k);
        p.add('ArmL1', 0.4 * k, 0, 0.3 * k);
        p.add('ArmR1', 0.4 * k, 0, -0.3 * k);
        break;
      case E.lie:
        root.rotation.x = -Math.PI / 2 * k;
        root.position.set(0, 0.32 * k, HIP_HEIGHT * k);
        p.add('ArmL1', -2.8 * k, 0, 0.3 * k);
        p.add('ArmR1', -2.8 * k, 0, -0.3 * k);
        p.add('ArmL2', -1.6 * k);
        p.add('ArmR2', -1.6 * k);
        break;
      case E.pushups: {
        const up = (Math.sin(t * 4) + 1) / 2;
        root.rotation.x = (Math.PI / 2 - 0.12) * k;
        root.position.set(0, (0.9 + up * 0.6) * k, -HIP_HEIGHT * 0.9 * k);
        p.add('ArmL1', -1.55 * k, 0, 0.2 * k);
        p.add('ArmR1', -1.55 * k, 0, -0.2 * k);
        p.add('ArmL2', -1.1 * (1 - up) * k);
        p.add('ArmR2', -1.1 * (1 - up) * k);
        break;
      }
      case E.phone:
        p.add('ArmR1', -0.5 * k, 0, 0.55 * k);
        p.add('ArmR2', -2.4 * k);
        p.add('Neck1', 0, 0.15 * k, -0.12 * k);
        p.add('ArmL1', 0, 0, 0.1 * k);
        break;
    }
  }
}
