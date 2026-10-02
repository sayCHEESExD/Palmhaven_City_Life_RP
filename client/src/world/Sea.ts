import { WATER_Y, isLand } from '@palmhaven/shared';
import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial } from 'three';

/** The grid: cells this big over the play area, then four big quads out to OUTER. */
const CELL = 20;
const AREA = { x0: -1500, z0: -1040, x1: 800, z1: 1000 } as const;
const OUTER = 4000;

const clock = { value: 0 };

const SHALLOW = new Color(0x52e0d6);
const MID = new Color(0x22b4e0);
const DEEP = new Color(0x1478c8);
const BED_NEAR = new Color(0xe9d7a3);
const BED_FAR = new Color(0x0f4f8a);

/**
 * THE SEA AND THE BAY: tropical turquoise over the sandy shallows, deepening
 * to blue offshore, with drifting Roblox-water cell lines drawn in the shader
 * and a seabed under it that shows through near the shore.
 *
 * A grid with the land cut out, coloured per vertex by how close the shore is.
 */
export class Sea {
  readonly root = new Group();
  private readonly material: MeshBasicMaterial;
  private readonly bedMaterial: MeshLambertMaterial;

  constructor() {
    this.material = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.88, depthWrite: false });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms['uSeaTime'] = clock;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSeaPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vSeaPos;
uniform float uSeaTime;
vec2 seaHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float seaCells(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = seaHash(i + g);
      o = 0.5 + 0.42 * sin(uSeaTime * 0.6 + 6.2831 * o);
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  vec2 p = vSeaPos.xz * 0.07 + vec2(uSeaTime * 0.03, uSeaTime * 0.018);
  float edge = seaCells(p);
  float line = 1.0 - smoothstep(0.03, 0.12, edge);
  float far = smoothstep(240.0, 650.0, length(vSeaPos.xz - cameraPosition.xz));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.98, 1.0), line * 0.5 * (1.0 - far));
  diffuseColor.rgb *= 0.95 + 0.07 * sin(vSeaPos.x * 0.05 + vSeaPos.z * 0.04 + uSeaTime);
}`,
        );
    };
    this.material.customProgramCacheKey = () => 'palm-sea';
    this.bedMaterial = new MeshLambertMaterial({ vertexColors: true });

    const { surface, bed } = buildGrids();
    const water = new Mesh(surface, this.material);
    water.renderOrder = 1;
    water.frustumCulled = false;
    this.root.add(water);
    const floor = new Mesh(bed, this.bedMaterial);
    floor.frustumCulled = false;
    this.root.add(floor);
  }

  update(delta: number): void {
    clock.value = (clock.value + delta) % 10_000;
  }

  /** Night tint: the sea darkens with the sky. */
  setNight(night: number): void {
    const k = 1 - night * 0.62;
    this.material.color.setRGB(k, k, k * 1.05);
    this.bedMaterial.color.setRGB(k, k, k);
  }

  dispose(): void {
    this.root.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.material.dispose();
    this.bedMaterial.dispose();
    this.root.removeFromParent();
  }
}

/** How near the shore a point is: 1 on the beach, 0 far out. */
const shallowness = (x: number, z: number): number => {
  if (isLand(x, z)) return 1;
  let best = 0;
  for (const [r, w] of [[14, 1], [32, 0.7], [60, 0.4], [100, 0.18]] as const) {
    for (let a = 0; a < 8; a += 1) {
      const ang = (a / 8) * Math.PI * 2;
      if (isLand(x + Math.cos(ang) * r, z + Math.sin(ang) * r)) {
        best = Math.max(best, w);
        break;
      }
    }
    if (best >= w) break;
  }
  return best;
};

const buildGrids = (): { surface: BufferGeometry; bed: BufferGeometry } => {
  const nx = Math.ceil((AREA.x1 - AREA.x0) / CELL);
  const nz = Math.ceil((AREA.z1 - AREA.z0) / CELL);
  const shade = new Float32Array((nx + 1) * (nz + 1));
  for (let i = 0; i <= nx; i += 1) for (let j = 0; j <= nz; j += 1) shade[i * (nz + 1) + j] = shallowness(AREA.x0 + i * CELL, AREA.z0 + j * CELL);

  const sp: number[] = [];
  const sc: number[] = [];
  const bp: number[] = [];
  const bc: number[] = [];
  const c = new Color();
  const waterColor = (k: number): Color => (k > 0.5 ? c.copy(MID).lerp(SHALLOW, (k - 0.5) * 2) : c.copy(DEEP).lerp(MID, k * 2));
  const push = (pos: number[], col: number[], x: number, y: number, z: number, color: Color): void => {
    pos.push(x, y, z);
    col.push(color.r, color.g, color.b);
  };
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const x0 = AREA.x0 + i * CELL;
      const z0 = AREA.z0 + j * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      const k00 = shade[i * (nz + 1) + j]!;
      const k10 = shade[(i + 1) * (nz + 1) + j]!;
      const k01 = shade[i * (nz + 1) + j + 1]!;
      const k11 = shade[(i + 1) * (nz + 1) + j + 1]!;
      // Cells wholly inside the land are skipped.
      const inland = isLand(x0 + 2, z0 + 2) && isLand(x1 - 2, z0 + 2) && isLand(x0 + 2, z1 - 2) && isLand(x1 - 2, z1 - 2) && isLand((x0 + x1) / 2, (z0 + z1) / 2);
      if (inland) continue;
      const corners: [number, number, number][] = [
        [x0, z0, k00],
        [x0, z1, k01],
        [x1, z1, k11],
        [x1, z0, k10],
      ];
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        const [x, z, k] = corners[idx]!;
        push(sp, sc, x, WATER_Y, z, waterColor(Math.min(1, k)));
        const depth = -1.6 - (1 - k) * 7;
        push(bp, bc, x, depth, z, c.copy(BED_FAR).lerp(BED_NEAR, Math.min(1, k * 1.15)));
      }
    }
  }
  // The open ocean beyond the grid.
  const deep = DEEP;
  const quad = (x0: number, z0: number, x1: number, z1: number): void => {
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]] as const) {
      push(sp, sc, x, WATER_Y, z, deep);
      push(bp, bc, x, -9, z, BED_FAR);
    }
  };
  quad(-OUTER, -OUTER, OUTER, AREA.z0);
  quad(-OUTER, AREA.z1, OUTER, OUTER);
  quad(-OUTER, AREA.z0, AREA.x0, AREA.z1);
  quad(AREA.x1, AREA.z0, OUTER, AREA.z1);

  const make = (pos: number[], col: number[]): BufferGeometry => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    const normals = new Float32Array(pos.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    g.setAttribute('normal', new BufferAttribute(normals, 3));
    return g;
  };
  return { surface: make(sp, sc), bed: make(bp, bc) };
};
