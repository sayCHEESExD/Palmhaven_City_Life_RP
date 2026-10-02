import { clockText, daylight, timeOfDay } from '@palmhaven/shared';
import { Color, Fog } from 'three';
import type { SceneManager } from '../rendering/SceneManager.js';
import type { Sky } from './Sky.js';

/**
 * THE TIME OF DAY: one clock (the server's) drives the sky, the sun, the
 * fog, and every lit window and street lamp. Long bright Miami days, a pink
 * sunset, a short blue night with the city glowing.
 */

const DAY = {
  top: new Color(0x2f8fe6),
  mid: new Color(0x8cc8f4),
  bottom: new Color(0xd7ecfa),
  fog: new Color(0xcfe6f7),
  sun: new Color(0xfff4e0),
  hemiSky: new Color(0xdcefff),
  hemiGround: new Color(0x9aa678),
  cloud: new Color(0xffffff),
};
const DUSK = {
  top: new Color(0x3a4fa8),
  mid: new Color(0xf28fb0),
  bottom: new Color(0xffc48a),
  fog: new Color(0xf2b4a6),
  sun: new Color(0xffb27a),
  hemiSky: new Color(0xffc6c0),
  hemiGround: new Color(0x8a6a78),
  cloud: new Color(0xffd0dc),
};
const NIGHT = {
  top: new Color(0x0a1230),
  mid: new Color(0x1b2a5a),
  bottom: new Color(0x2c3a6e),
  fog: new Color(0x1d2850),
  sun: new Color(0x9fb4ff),
  hemiSky: new Color(0x4a5a9a),
  hemiGround: new Color(0x262a3a),
  cloud: new Color(0x3a4a7a),
};

const A = new Color();
const B = new Color();
const C = new Color();
const D = new Color();
const E = new Color();

export class Atmosphere {
  /** 0 day .. 1 night. */
  night = 0;
  /** 0..1 how sunset-pink it is. */
  dusk = 0;
  clock = '12:00 PM';

  constructor(
    private readonly scene: SceneManager,
    private readonly sky: Sky,
  ) {}

  update(nowMs: number, fogNear: number, fogFar: number): void {
    const t = timeOfDay(nowMs);
    const light = daylight(t);
    this.night = 1 - light;
    // Dusk peaks while the light changes.
    this.dusk = Math.max(0, 1 - Math.abs(light - 0.5) * 2) * (t > 0.5 ? 1 : 0.7);
    this.clock = clockText(t);

    const mixSet = (out: Color, key: keyof typeof DAY): Color => out.copy(NIGHT[key]).lerp(DAY[key], light).lerp(DUSK[key], this.dusk * 0.75);
    this.sky.setColors(mixSet(A, 'top'), mixSet(B, 'mid'), mixSet(C, 'bottom'), mixSet(D, 'cloud'), this.night * 0.9);
    const fog = this.scene.scene.fog as Fog;
    fog.color.copy(mixSet(E, 'fog'));
    fog.near = fogNear;
    fog.far = fogFar;
    this.scene.setBackground(E.getHex());

    const sun = this.scene.sun;
    sun.color.copy(mixSet(A, 'sun'));
    sun.intensity = 0.35 + light * 1.95;
    this.scene.hemi.color.copy(mixSet(B, 'hemiSky'));
    this.scene.hemi.groundColor.copy(mixSet(C, 'hemiGround'));
    this.scene.hemi.intensity = 0.75 + light * 0.6;
    this.scene.ambient.intensity = 0.42 + light * 0.2;
    // The sun swings across the sky; at night the "sun" is the moon, high in the east.
    const angle = (t - 0.25) * Math.PI * 2;
    const height = Math.max(0.35, Math.sin(angle));
    this.scene.setSunDirection(Math.cos(angle) * 0.8 + 0.2, height, -0.45);
  }
}
