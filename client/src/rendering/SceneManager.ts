import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, Scene, Vector3 } from 'three';

/**
 * The scene root and the base lighting rig: a sky-blue hemisphere over a
 * warm bounce, a soft ambient so no flank is ever black, and a sun that casts
 * the shadows. `Atmosphere` retunes all of it with the time of day.
 */
export class SceneManager {
  readonly scene = new Scene();
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly ambient: AmbientLight;
  private readonly sunDir = new Vector3(0.45, 0.85, -0.35).normalize();

  constructor() {
    this.scene.fog = new Fog(0xcfe6f7, 260, 900);
    this.setBackground(0xcfe6f7);

    this.hemi = new HemisphereLight(0xdcefff, 0x9aa678, 1.3);
    this.hemi.position.set(0, 80, 0);
    this.scene.add(this.hemi);

    this.ambient = new AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambient);

    this.sun = new DirectionalLight(0xfff6e4, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.camera.left = -90;
    this.sun.shadow.camera.right = 90;
    this.sun.shadow.camera.top = 90;
    this.sun.shadow.camera.bottom = -90;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 2;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  setSunDirection(x: number, y: number, z: number): void {
    this.sunDir.set(x, y, z).normalize();
  }

  /** Keep the shadow frustum over the player. */
  followShadow(x: number, y: number, z: number): void {
    // Snap to a coarse grid so the shadow map does not shimmer as the camera glides.
    const sx = Math.round(x / 4) * 4;
    const sz = Math.round(z / 4) * 4;
    this.sun.target.position.set(sx, y, sz);
    this.sun.position.set(sx + this.sunDir.x * 160, y + this.sunDir.y * 160, sz + this.sunDir.z * 160);
    this.sun.target.updateMatrixWorld();
  }

  setBackground(color: number): void {
    if (this.scene.background instanceof Color) this.scene.background.setHex(color);
    else this.scene.background = new Color(color);
  }
}
