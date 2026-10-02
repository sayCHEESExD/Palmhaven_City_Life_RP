import { accessoryById, itemById, propById, vehicleById } from '@palmhaven/shared';
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { buildAccessory, buildItem } from '../models/items.js';
import { buildProp } from '../models/props.js';
import { buildVehicleModel } from '../models/vehicles.js';
import { PartBuilder } from '../render/PartBuilder.js';

const SIZE = 128;

/**
 * ICONS DRAWN FROM THE MODELS THEMSELVES: every item, accessory, piece of
 * furniture and vehicle is rendered once, off screen, into a small picture
 * for the hotbar, the shops and the phone. The sofa in the shop is exactly the
 * sofa in your living room, and there is no icon atlas to ship.
 */
export class IconFactory {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 200);
  private readonly target = new WebGLRenderTarget(SIZE, SIZE);
  private readonly cache = new Map<string, string>();
  private readonly pixels = new Uint8Array(SIZE * SIZE * 4);
  private readonly canvas = document.createElement('canvas');
  private readonly holder = new Group();

  constructor(private readonly renderer: WebGLRenderer) {
    this.target.texture.colorSpace = SRGBColorSpace;
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const rim = new DirectionalLight(0xfff0d8, 0.9);
    rim.position.set(-4, 2, -3);
    this.scene.add(rim);
    this.scene.add(this.holder);
  }

  item(id: number): string {
    const item = itemById(id);
    return item ? this.icon(`item:${item.key}`, () => this.built((b) => buildItem(b, item.key))) : '';
  }

  accessory(id: number): string {
    const acc = accessoryById(id);
    return acc ? this.icon(`acc:${acc.key}`, () => this.built((b) => buildAccessory(b, acc.key))) : '';
  }

  prop(id: number): string {
    const prop = propById(id);
    return prop ? this.icon(`prop:${prop.key}`, () => this.built((b) => buildProp(b, prop.key))) : '';
  }

  vehicle(id: number, paint?: number): string {
    const def = vehicleById(id);
    if (!def) return '';
    const color = paint ?? def.paints[0]!;
    return this.icon(`veh:${def.key}:${color}`, () => buildVehicleModel(def.key, color).root, false, 0.9);
  }

  private built(build: (b: PartBuilder) => void): Object3D {
    const b = new PartBuilder();
    build(b);
    return b.build('icon');
  }

  private icon(key: string, build: () => Object3D, disposeGeometry = true, turn = 0.6): string {
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const url = this.render(build(), disposeGeometry, turn);
    this.cache.set(key, url);
    return url;
  }

  private render(object: Object3D, disposeGeometry: boolean, turn: number): string {
    this.holder.clear();
    const pivot = new Group();
    pivot.add(object);
    this.holder.add(pivot);
    pivot.rotation.y = -turn;
    pivot.updateMatrixWorld(true);
    const raw = new Box3().setFromObject(pivot).getSize(new Vector3());
    pivot.scale.multiplyScalar(4 / Math.max(0.05, raw.x, raw.y, raw.z));
    pivot.updateMatrixWorld(true);
    const box = new Box3().setFromObject(pivot);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.62 + 0.001;
    const distance = radius / Math.tan((this.camera.fov * Math.PI) / 360);
    this.camera.position.set(centre.x + distance * 0.35, centre.y + distance * 0.42, centre.z + distance * 0.84);
    this.camera.lookAt(centre);
    this.camera.near = distance * 0.1;
    this.camera.far = distance * 4;
    this.camera.updateProjectionMatrix();

    const previousTarget = this.renderer.getRenderTarget();
    const previousClear = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.setClearAlpha(previousClear);

    const ctx = this.canvas.getContext('2d')!;
    const image = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 1) image.data.set(this.pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    ctx.putImageData(image, 0, 0);
    this.holder.clear();
    if (disposeGeometry) {
      object.traverse((child) => {
        const mesh = child as unknown as { isMesh?: boolean; geometry?: { dispose(): void } };
        if (mesh.isMesh) mesh.geometry?.dispose();
      });
    }
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.target.dispose();
  }
}
