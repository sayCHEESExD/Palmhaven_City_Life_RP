import { Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, BoxGeometry, Quaternion, Vector3 } from 'three';

const MAX_PARTICLES = 700;
const C = new Color();
const M = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const S = new Vector3();
const DUMMY = new Object3D();

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  gravity: number;
  spin: number;
  color: number;
}

/**
 * ONE-SHOT EFFECTS as one instanced mesh of little cubes: cash bursts,
 * confetti, splashes, sparkles, music notes, sparks off a crash. Cheap
 * enough to fire freely, capped so nothing piles up.
 */
export class Effects {
  readonly root = new Group();
  private readonly mesh: InstancedMesh;
  private readonly particles: Particle[] = [];

  constructor() {
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ fog: true }), MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < MAX_PARTICLES; i += 1) this.mesh.setColorAt(i, C.setHex(0xffffff));
    this.root.add(this.mesh);
  }

  private emit(x: number, y: number, z: number, count: number, colors: readonly number[], speed: number, up: number, gravity: number, size: number, life: number): void {
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: up * (0.6 + Math.random() * 0.6),
        vz: Math.sin(a) * s,
        life: 0,
        max: life * (0.7 + Math.random() * 0.6),
        size: size * (0.7 + Math.random() * 0.6),
        gravity,
        spin: (Math.random() - 0.5) * 12,
        color: colors[i % colors.length]!,
      });
    }
  }

  cash(x: number, y: number, z: number): void {
    this.emit(x, y, z, 22, [0x2fbf71, 0x8dffb2, 0xffd166], 5, 12, 26, 0.32, 1.1);
  }

  confetti(x: number, y: number, z: number): void {
    this.emit(x, y, z, 70, [0xff6f91, 0xffd166, 0x2ec4b6, 0x4dabf7, 0x9b5de5, 0xffffff], 9, 18, 18, 0.35, 2.2);
  }

  splash(x: number, y: number, z: number): void {
    this.emit(x, y, z, 26, [0xe6fbff, 0x9fe6ff, 0xffffff], 4, 10, 30, 0.28, 0.9);
  }

  sparkle(x: number, y: number, z: number, color = 0xffe066): void {
    this.emit(x, y, z, 18, [color, 0xffffff], 2.5, 6, 2, 0.22, 1.2);
  }

  heal(x: number, y: number, z: number): void {
    this.emit(x, y, z, 24, [0x7bff9e, 0xffffff, 0xff8fb1], 2, 7, -2, 0.3, 1.6);
  }

  notes(x: number, y: number, z: number): void {
    this.emit(x, y, z, 4, [0xff6f91, 0x4dabf7, 0xffd166, 0x9b5de5], 1.2, 5, -1, 0.3, 1.4);
  }

  sparks(x: number, y: number, z: number): void {
    this.emit(x, y, z, 18, [0xffd166, 0xff9f43, 0xffffff], 9, 6, 26, 0.18, 0.6);
  }

  smoke(x: number, y: number, z: number): void {
    this.emit(x, y, z, 6, [0xdddddd, 0xbbbbbb], 1.5, 3, -1, 0.6, 1.3);
  }

  update(delta: number): void {
    const dt = Math.min(0.1, Math.max(0, delta));
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i]!;
      p.life += dt;
      if (p.life >= p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 1 - dt * 1.5;
      p.vz *= 1 - dt * 1.5;
      const k = 1 - p.life / p.max;
      DUMMY.rotation.set(p.life * p.spin, p.life * p.spin * 0.7, 0);
      Q.setFromEuler(DUMMY.rotation);
      const size = p.size * (0.4 + 0.6 * k);
      M.compose(P.set(p.x, p.y, p.z), Q, S.set(size, size, size));
      this.mesh.setMatrixAt(n, M);
      this.mesh.setColorAt(n, C.setHex(p.color));
      n += 1;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.root.removeFromParent();
  }
}
