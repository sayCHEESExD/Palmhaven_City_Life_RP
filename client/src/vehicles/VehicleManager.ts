import { vehicleById, vehicleObstacles, type Obstacle } from '@palmhaven/shared';
import type { Scene } from 'three';
import type { NetVehicleState } from '../net/netTypes.js';
import { VehicleView } from './VehicleView.js';

/**
 * EVERY VEHICLE IN THE ROOM, drawn. Synced from the replicated map; the one
 * the local player drives is drawn from their prediction instead.
 */
export class VehicleManager {
  private readonly views = new Map<number, VehicleView>();
  private readonly circles: Obstacle[] = [];
  /** Fired when a vehicle's horn counter moves (somebody honked). */
  onHorn: ((view: VehicleView) => void) | null = null;

  constructor(private readonly scene: Scene) {}

  get(id: number): VehicleView | undefined {
    return this.views.get(id);
  }

  all(): IterableIterator<VehicleView> {
    return this.views.values();
  }

  sync(vehicles: Iterable<[string, NetVehicleState]> | null): void {
    const seen = new Set<number>();
    if (vehicles) {
      for (const [, v] of vehicles) {
        seen.add(v.id);
        let view = this.views.get(v.id);
        if (!view) {
          if (!vehicleById(v.kind)) continue;
          view = new VehicleView(v.id, v.kind, v.paint);
          this.views.set(v.id, view);
          this.scene.add(view.root);
          view.horn = v.horn;
        }
        view.setTarget(v.x, v.y, v.z, v.yaw, v.vx, v.vz, v.vy);
        view.flags = v.flags;
        view.setFare(v.fare);
        if (v.horn !== view.horn) {
          view.horn = v.horn;
          this.onHorn?.(view);
        }
      }
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      view.dispose();
      this.views.delete(id);
    }
  }

  /** Vehicle bodies for prediction, from the replicated transforms. */
  obstacles(vehicles: Iterable<[string, NetVehicleState]> | null): readonly Obstacle[] {
    this.circles.length = 0;
    if (!vehicles) return this.circles;
    for (const [, v] of vehicles) {
      const def = vehicleById(v.kind);
      if (def) vehicleObstacles(def, v, v.id, this.circles);
    }
    return this.circles;
  }

  update(delta: number, exactId: number, exact: { x: number; y: number; z: number; yaw: number; speed: number } | null, steer: number, night: number): void {
    for (const view of this.views.values()) {
      const isExact = view.id === exactId && exact !== null;
      if (isExact) {
        view.setExact(exact.x, exact.y, exact.z, exact.yaw);
        view.setSpeed(exact.speed);
      }
      view.update(delta, isExact, isExact ? steer : 0, night);
    }
  }

  dispose(): void {
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
  }
}
