import { CURB, signalPhase, type CityPlan } from '@palmhaven/shared';
import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { buildPalm, buildSignalMast, buildStreetLamp, buildTree } from '../models/props.js';
import { PartBuilder, partMaterials, type PartKind } from '../render/PartBuilder.js';

/**
 * THE THINGS THERE ARE HUNDREDS OF - palms, trees, street lamps, traffic
 * signals - drawn as instanced meshes: one model, one draw call per material,
 * however many stand along the streets.
 */

const M = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const S = new Vector3();
const UP = new Vector3(0, 1, 0);

interface Placement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

const instance = (root: Group, geometries: Partial<Record<PartKind, BufferGeometry>>, placements: readonly Placement[], name: string): void => {
  if (placements.length === 0) return;
  const materials = partMaterials();
  for (const [kind, geometry] of Object.entries(geometries) as [PartKind, BufferGeometry][]) {
    const mesh = new InstancedMesh(geometry, materials[kind] as Material, placements.length);
    placements.forEach((p, i) => {
      Q.setFromAxisAngle(UP, p.yaw);
      M.compose(P.set(p.x, p.y, p.z), Q, S.set(p.scale, p.scale, p.scale));
      mesh.setMatrixAt(i, M);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = kind !== 'glow';
    mesh.receiveShadow = false;
    mesh.name = `${name}-${kind}`;
    root.add(mesh);
  }
};

const PALM_HEIGHTS = [10.5, 13, 15.5, 18] as const;
const LENS_COLORS = { red: new Color(0xff2a2a), yellow: new Color(0xffc21a), green: new Color(0x2aff6a) } as const;
const LENS_OFF = new Color(0x2a2a2a);

export class CityInstances {
  readonly root = new Group();
  private lenses: InstancedMesh | null = null;
  private readonly lensInfo: { intersection: number; axis: 'ns' | 'ew'; color: 'red' | 'yellow' | 'green' }[] = [];
  private lastPhaseCheck = -1;

  constructor(plan: CityPlan) {
    // Palms in four heights; each instance gets the nearest, scaled to fit.
    const byHeight: Placement[][] = PALM_HEIGHTS.map(() => []);
    for (const palm of plan.palms) {
      let best = 0;
      PALM_HEIGHTS.forEach((h, i) => {
        if (Math.abs(h - palm.height) < Math.abs(PALM_HEIGHTS[best]! - palm.height)) best = i;
      });
      byHeight[best]!.push({ x: palm.x, y: palm.y, z: palm.z, yaw: palm.yaw, scale: palm.height / PALM_HEIGHTS[best]! });
    }
    PALM_HEIGHTS.forEach((h, i) => {
      const b = new PartBuilder();
      buildPalm(b, h, 0.12);
      instance(this.root, b.geometries(), byHeight[i]!, `palms-${h}`);
    });
    // Trees.
    for (const kind of ['round', 'cone', 'shrub'] as const) {
      const list = plan.trees.filter((t) => t.kind === kind).map((t) => ({ x: t.x, y: t.y, z: t.z, yaw: (t.x * 13.1 + t.z * 7.7) % (Math.PI * 2), scale: t.size }));
      const b = new PartBuilder();
      buildTree(b, kind);
      instance(this.root, b.geometries(), list, `trees-${kind}`);
    }
    // Street lamps.
    {
      const b = new PartBuilder();
      buildStreetLamp(b);
      instance(this.root, b.geometries(), plan.lamps.map((l) => ({ x: l.x, y: l.y, z: l.z, yaw: l.rot, scale: 1 })), 'lamps');
    }
    // Traffic signals and their lenses.
    {
      const b = new PartBuilder();
      const { lamps } = buildSignalMast(b);
      instance(this.root, b.geometries(), plan.signals.map((s) => ({ x: s.x, y: CURB, z: s.z, yaw: s.rot, scale: 1 })), 'signals');
      const lensGeometry = new SphereGeometry(0.32, 8, 6);
      const total = plan.signals.length * lamps.length;
      if (total > 0) {
        const lenses = new InstancedMesh(lensGeometry, new MeshBasicMaterial({ fog: false }), total);
        lenses.instanceMatrix.setUsage(DynamicDrawUsage);
        let i = 0;
        for (const s of plan.signals) {
          for (const lamp of lamps) {
            Q.setFromAxisAngle(UP, s.rot);
            P.set(lamp.x, lamp.y, lamp.z).applyQuaternion(Q).add(new Vector3(s.x, CURB, s.z));
            M.compose(P, Q, S.set(1, 1, 1));
            lenses.setMatrixAt(i, M);
            lenses.setColorAt(i, LENS_OFF);
            this.lensInfo.push({ intersection: s.intersection, axis: s.axis, color: lamp.color });
            i += 1;
          }
        }
        lenses.instanceMatrix.needsUpdate = true;
        lenses.computeBoundingSphere();
        lenses.name = 'signal-lenses';
        this.lenses = lenses;
        this.root.add(lenses);
      }
    }
  }

  /** Re-colour the lenses when the phases change (checked a few times a second). */
  update(nowMs: number): void {
    const lenses = this.lenses;
    if (!lenses) return;
    const tick = Math.floor(nowMs / 250);
    if (tick === this.lastPhaseCheck) return;
    this.lastPhaseCheck = tick;
    for (let i = 0; i < this.lensInfo.length; i += 1) {
      const info = this.lensInfo[i]!;
      const phase = signalPhase(info.intersection, nowMs);
      const showing = info.axis === 'ns' ? phase.ns : phase.ew;
      lenses.setColorAt(i, showing === info.color ? LENS_COLORS[info.color] : LENS_OFF);
    }
    if (lenses.instanceColor) lenses.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.root.traverse((child) => {
      const mesh = child as InstancedMesh;
      if (mesh.isInstancedMesh) mesh.geometry.dispose();
    });
    this.root.removeFromParent();
  }
}
