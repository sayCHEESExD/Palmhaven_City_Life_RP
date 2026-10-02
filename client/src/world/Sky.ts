import { BackSide, BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, ShaderMaterial, SphereGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seededRandom } from '../models/shapes.js';

/** How far out the dome sits. Inside the camera's far plane. */
const DOME_RADIUS = 1500;

/**
 * THE SKY OVER THE SEA: a soft gradient dome down to a hazy horizon, and
 * banks of chunky block clouds drifting slowly past. It follows the viewer,
 * and the weather retints it - grey for rain and storms, deep blue for a
 * starry night, warm for a heatwave.
 */
export class Sky {
  readonly root = new Group();
  private readonly domeMaterial: ShaderMaterial;
  private readonly cloudMaterial: MeshBasicMaterial;
  private readonly clouds: Mesh;
  private readonly disposables: (BufferGeometry | ShaderMaterial | MeshBasicMaterial)[] = [];
  private time = 0;

  constructor() {
    this.domeMaterial = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new Color(0x5aa8e8) },
        midColor: { value: new Color(0xc4e2f6) },
        bottomColor: { value: new Color(0xe6f2fa) },
        stars: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform float stars;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main() {
          float h = clamp(vDir.y, -1.0, 1.0);
          vec3 sky = mix(midColor, topColor, clamp(h * 1.8, 0.0, 1.0));
          vec3 low = mix(bottomColor, midColor, clamp((h + 0.02) * 6.0, 0.0, 1.0));
          vec3 color = h > 0.04 ? sky : low;
          if (stars > 0.0 && h > 0.05) {
            vec3 cell = floor(vDir * 180.0);
            float s = step(0.996, hash(cell));
            color += vec3(s) * stars * smoothstep(0.05, 0.3, h);
          }
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const domeGeometry = new SphereGeometry(DOME_RADIUS, 24, 16);
    this.disposables.push(domeGeometry, this.domeMaterial);
    const dome = new Mesh(domeGeometry, this.domeMaterial);
    dome.frustumCulled = false;
    dome.renderOrder = -2;
    this.root.add(dome);

    this.cloudMaterial = new MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.95 });
    this.disposables.push(this.cloudMaterial);
    this.clouds = this.buildClouds();
    this.root.add(this.clouds);
  }

  private buildClouds(): Mesh {
    const r = seededRandom(0xc10d);
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < 34; i += 1) {
      const a = r() * Math.PI * 2;
      const d = 260 + r() * 820;
      const cx = Math.cos(a) * d;
      const cz = Math.sin(a) * d;
      const cy = 170 + r() * 160;
      const blobs = 4 + Math.floor(r() * 5);
      for (let k = 0; k < blobs; k += 1) {
        const size = 24 + r() * 34;
        const g = new BoxGeometry(size * 2.3, size * 0.75, size * 1.5);
        g.translate(cx + (k - blobs / 2) * 36 + r() * 12, cy + r() * 16, cz + (r() - 0.5) * 36);
        parts.push(g);
      }
    }
    const merged = mergeGeometries(parts, false)!;
    for (const g of parts) g.dispose();
    this.disposables.push(merged);
    const clouds = new Mesh(merged, this.cloudMaterial);
    clouds.renderOrder = -1;
    clouds.frustumCulled = false;
    return clouds;
  }

  /** The weather's sky: zenith, horizon, haze, cloud brightness and how many stars. */
  setColors(top: Color, mid: Color, bottom: Color, cloud: Color, stars: number): void {
    (this.domeMaterial.uniforms['topColor']!.value as Color).copy(top);
    (this.domeMaterial.uniforms['midColor']!.value as Color).copy(mid);
    (this.domeMaterial.uniforms['bottomColor']!.value as Color).copy(bottom);
    this.domeMaterial.uniforms['stars']!.value = stars;
    this.cloudMaterial.color.copy(cloud);
  }

  /** Keep the sky centred on the viewer. */
  follow(x: number, z: number): void {
    this.root.position.set(x, 0, z);
  }

  update(delta: number): void {
    this.time += delta;
    this.clouds.rotation.y = this.time * 0.004;
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
    this.root.removeFromParent();
  }
}
