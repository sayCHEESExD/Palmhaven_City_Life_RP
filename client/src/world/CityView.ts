import { CURB, WATER_Y, city, type CityPlan } from '@palmhaven/shared';
import { Group, Mesh, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import { buildFerrisWheel, buildLandmark, buildProp } from '../models/props.js';
import { buildVehicleModel } from '../models/vehicles.js';
import { PartBuilder, partMaterials } from '../render/PartBuilder.js';
import { buildBuilding, type BuildKit } from './BuildingArt.js';
import { Ground } from './Ground.js';
import { CityInstances } from './Instances.js';
import { CITY_UNIFORMS, facadeMaterial, floorMaterial, neonMaterial, pavementMaterial } from './materials.js';
import { Baker, FacadeBuilder, FloorBuilder, PavementBuilder } from './meshers.js';
import { SignAtlas, SignBuilder } from './SignAtlas.js';

/** Chunk size: the city is cut into squares this big for culling. */
const CHUNK = 160;

interface Chunk {
  readonly key: string;
  readonly center: Vector3;
  readonly radius: number;
  readonly major: Group;
  readonly detail: Group;
}

interface ChunkBuild {
  readonly kit: BuildKit;
  readonly baker: Baker;
  readonly x: number;
  readonly z: number;
}

/**
 * THE WHOLE CITY ON SCREEN.
 *
 * Static geometry is merged per 160-unit chunk into a few meshes: MAJOR
 * (buildings, signs, exterior detail - drawn as far as the fog) and DETAIL
 * (interiors, furniture, props, parked cars - drawn only near the camera).
 * The ground, the roads and the instanced palms and lamps are global.
 */
export class CityView {
  readonly root = new Group();
  private readonly ground: Ground;
  private readonly instances: CityInstances;
  private readonly chunks: Chunk[] = [];
  private readonly atlas = new SignAtlas();
  private readonly wheel: { pivot: Group; spin: number } | null;
  private majorRange = 900;
  private detailRange = 330;

  constructor() {
    const plan = city().plan;
    // Every glowing part in town (lamps, screens, neon) brightens at night.
    (partMaterials() as Record<string, unknown>)['glow'] = neonMaterial();

    this.ground = new Ground(plan);
    this.instances = new CityInstances(plan);
    this.root.add(this.ground.root, this.instances.root);

    const builds = new Map<string, ChunkBuild>();
    const chunkOf = (x: number, z: number): ChunkBuild => {
      const cx = Math.floor(x / CHUNK);
      const cz = Math.floor(z / CHUNK);
      const key = `${cx},${cz}`;
      let build = builds.get(key);
      if (!build) {
        build = {
          kit: {
            facade: new FacadeBuilder(),
            parts: new PartBuilder(),
            detail: new PartBuilder(),
            pave: new PavementBuilder(),
            floors: new FloorBuilder(),
            signs: new SignBuilder(this.atlas),
          },
          baker: new Baker(),
          x: (cx + 0.5) * CHUNK,
          z: (cz + 0.5) * CHUNK,
        };
        builds.set(key, build);
      }
      return build;
    };

    for (const b of plan.buildings) buildBuilding(b, chunkOf(b.x, b.z).kit);
    for (const p of plan.props) {
      const sub = new PartBuilder();
      buildProp(sub, p.key);
      chunkOf(p.x, p.z).kit.detail.absorb(sub, { x: p.x, y: p.y, z: p.z, ry: p.rot });
    }
    // Parked cars, boats in their slips, showroom and firehouse displays.
    const cache = new Map<string, Object3D>();
    const vehicle = (key: string, paint: number): Object3D => {
      const id = `${key}:${paint}`;
      let model = cache.get(id);
      if (!model) {
        model = buildVehicleModel(key, paint).root;
        cache.set(id, model);
      }
      return model;
    };
    for (const v of plan.parked) chunkOf(v.x, v.z).baker.add(vehicle(v.key, v.paint), v.x, v.floating ? WATER_Y - 0.5 : CURB, v.z, v.rot);
    for (const d of city().displays) chunkOf(d.x, d.z).baker.add(vehicle(d.key, d.key === 'firetruck' ? 0xd62828 : d.key === 'plane' ? 0xf2f2f2 : d.key === 'luxury' ? 0xf3f1ec : 0x5ec8f2), d.x, d.y, d.z, d.rot);
    // Landmarks.
    let wheel: CityView['wheel'] = null;
    for (const lm of plan.landmarks) {
      if (lm.kind === 'ferris') {
        const ferris = buildFerrisWheel();
        const base = ferris.base.build('ferris-base');
        base.position.set(lm.x, lm.y, lm.z);
        base.rotation.y = lm.rot;
        const pivot = new Group();
        pivot.position.set(ferris.hub.x, ferris.hub.y, ferris.hub.z);
        const spinning = ferris.wheel.build('ferris-wheel');
        spinning.position.set(-ferris.hub.x, -ferris.hub.y, -ferris.hub.z);
        pivot.add(spinning);
        base.add(pivot);
        this.root.add(base);
        wheel = { pivot, spin: 0 };
        continue;
      }
      const sub = new PartBuilder();
      buildLandmark(sub, lm.kind, lm.text);
      const kit = chunkOf(lm.x, lm.z).kit;
      kit.parts.absorb(sub, { x: lm.x, y: lm.y, z: lm.z, ry: lm.rot, sx: lm.scale ?? 1, sy: lm.scale ?? 1, sz: lm.scale ?? 1 });
      if (lm.kind === 'welcome_sign' && lm.text) {
        kit.signs.add({ text: lm.text, style: 'board', fg: '#ff4f8b', bg: '#fff6e4' }, lm.x + Math.sin(lm.rot) * 0.6, 4.4, lm.z + Math.cos(lm.rot) * 0.6, lm.rot, 3.4, 20);
      }
    }
    this.wheel = wheel;

    // Merge each chunk.
    for (const [key, build] of builds) {
      const major = new Group();
      const detail = new Group();
      major.name = `chunk-${key}`;
      detail.name = `chunk-${key}-detail`;
      const add = (group: Group, mesh: Mesh | null): void => {
        if (mesh) group.add(mesh);
      };
      add(major, build.kit.facade.build(facadeMaterial(), `facade-${key}`));
      major.add(build.kit.parts.build(`parts-${key}`));
      add(major, build.kit.signs.build(`signs-${key}`));
      add(major, build.kit.pave.build(pavementMaterial(), `pave-${key}`));
      add(detail, build.kit.floors.build(floorMaterial(), `floors-${key}`));
      detail.add(build.kit.detail.build(`detail-${key}`));
      for (const mesh of build.baker.build(`parked-${key}`)) detail.add(mesh);
      this.root.add(major, detail);
      this.chunks.push({ key, center: new Vector3(build.x, 10, build.z), radius: CHUNK * 0.75, major, detail });
    }
  }

  /** How far away chunks are drawn (the fog decides the first, the device the second). */
  setRanges(major: number, detail: number): void {
    this.majorRange = major;
    this.detailRange = detail;
  }

  update(delta: number, camera: PerspectiveCamera, nowMs: number, night: number): void {
    CITY_UNIFORMS.uTime.value = (CITY_UNIFORMS.uTime.value + delta) % 10_000;
    CITY_UNIFORMS.uNight.value = night;
    const p = camera.position;
    for (const chunk of this.chunks) {
      const d = Math.hypot(chunk.center.x - p.x, chunk.center.z - p.z) - chunk.radius;
      chunk.major.visible = d < this.majorRange;
      chunk.detail.visible = d < this.detailRange;
    }
    this.instances.update(nowMs);
    if (this.wheel) {
      this.wheel.spin += delta * 0.08;
      this.wheel.pivot.rotation.x = this.wheel.spin;
    }
  }

  dispose(): void {
    this.ground.dispose();
    this.instances.dispose();
    this.root.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.atlas.texture.dispose();
    this.root.removeFromParent();
  }
}

export type { CityPlan };
