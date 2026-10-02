import { FLOOR_LIFT } from './BuildingArt.js';
import {
  CURB,
  HOUSE_STYLES,
  city,
  cityPlan,
  furnitureSolids,
  houseToWorld,
  propById,
  quarterYaw,
  type WorldCollision,
} from '@palmhaven/shared';
import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { buildProp } from '../models/props.js';
import { PartBuilder } from '../render/PartBuilder.js';
import type { NetHouseState } from '../net/netTypes.js';

interface HomeView {
  signature: string;
  furniture: Group | null;
  doors: { leaf: Mesh; open: number }[];
  locked: boolean;
}

const doorMaterial = new MeshLambertMaterial({ color: 0x8a5a3a });

/**
 * EVERY HOME'S INSIDE AND FRONT DOOR: the furniture each owner placed (built
 * when their layout changes, merged per home), the furniture's collision for
 * prediction (the same boxes the server uses), and the front doors - shut and
 * solid when locked, swung open otherwise.
 */
export class Homes {
  readonly root = new Group();
  private readonly views = new Map<number, HomeView>();

  constructor() {
    const plan = cityPlan();
    for (const plot of plan.houses) {
      const doors = city().doors.filter((d) => d.house === plot.id);
      const view: HomeView = { signature: '', furniture: null, doors: [], locked: false };
      for (const d of doors) {
        const leaf = new Mesh(new BoxGeometry(d.width, d.height - 0.1, 0.25), doorMaterial);
        leaf.geometry.translate(d.width / 2, (d.height - 0.1) / 2, 0);
        const hinge = new Group();
        hinge.position.set(d.x - Math.cos(d.rot) * (d.width / 2), d.y, d.z + Math.sin(d.rot) * (d.width / 2));
        hinge.rotation.y = d.rot;
        hinge.add(leaf);
        leaf.position.z = -0.4;
        leaf.castShadow = true;
        this.root.add(hinge);
        view.doors.push({ leaf, open: 1 });
      }
      this.views.set(plot.id, view);
    }
  }

  /** Sync from the replicated homes; collision groups follow the same data the server uses. */
  sync(houses: ArrayLike<NetHouseState> | null, collision: WorldCollision, me: string): void {
    if (!houses) return;
    const plan = cityPlan();
    for (let i = 0; i < houses.length; i += 1) {
      const state = houses[i];
      const plot = plan.houses[i];
      const view = this.views.get(i);
      if (!state || !plot || !view) continue;
      const pieces: { id: number; kind: number; x: number; z: number; rot: number }[] = [];
      state.furniture?.forEach((f) => pieces.push({ id: f.id, kind: f.kind, x: f.x, z: f.z, rot: f.rot }));
      pieces.sort((a, b) => a.id - b.id);
      const signature = `${state.owner}|${state.locked}|${pieces.map((p) => `${p.id}:${p.kind}:${p.x}:${p.z}:${p.rot}`).join(',')}`;
      if (signature === view.signature) continue;
      view.signature = signature;
      view.locked = state.locked;
      collision.setGroup(`furn:${i}`, furnitureSolids(plot, pieces));
      const doors = city().doors.filter((d) => d.house === i);
      collision.setGroup(
        `door:${i}`,
        state.locked
          ? doors.map((d) => {
              const half = d.width / 2;
              const sideways = Math.abs(Math.sin(d.rot)) > 0.5;
              return sideways
                ? { minX: d.x - 0.5, maxX: d.x + 0.5, minY: d.y, maxY: d.y + d.height, minZ: d.z - half, maxZ: d.z + half }
                : { minX: d.x - half, maxX: d.x + half, minY: d.y, maxY: d.y + d.height, minZ: d.z - 0.5, maxZ: d.z + 0.5 };
            })
          : [],
        state.owner || null,
      );
      if (view.furniture) {
        view.furniture.traverse((child) => {
          const mesh = child as Mesh;
          if (mesh.isMesh) mesh.geometry.dispose();
        });
        view.furniture.removeFromParent();
        view.furniture = null;
      }
      if (pieces.length > 0) {
        const b = new PartBuilder();
        for (const piece of pieces) {
          const def = propById(piece.kind);
          if (!def) continue;
          const at = houseToWorld(plot, piece.x, piece.z);
          const sub = new PartBuilder();
          buildProp(sub, def.key);
          b.absorb(sub, { x: at.x, y: CURB + FLOOR_LIFT + (def.wallY ?? 0), z: at.z, ry: plot.rot + quarterYaw(piece.rot) });
        }
        view.furniture = b.build(`home-${i}`);
        this.root.add(view.furniture);
      }
    }
    void me;
    void HOUSE_STYLES;
  }

  /** Doors ease shut when locked and open when not. */
  update(delta: number): void {
    for (const view of this.views.values()) {
      for (const door of view.doors) {
        const want = view.locked ? 0 : 1;
        door.open += (want - door.open) * Math.min(1, delta * 6);
        door.leaf.rotation.y = door.open * 1.4;
      }
    }
  }

  dispose(): void {
    this.root.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.root.removeFromParent();
  }
}
