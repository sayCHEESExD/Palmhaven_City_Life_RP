import { BufferAttribute, BufferGeometry, Color, Matrix4, Mesh, Quaternion, Vector3, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * GEOMETRY BUILDERS for the city's custom surfaces. Each collects quads and
 * boxes with exactly the attributes its shader reads, then merges into ONE
 * mesh: a chunk of city is a handful of draw calls however many buildings,
 * roads and lawns it holds.
 */

const COLOR = new Color();

class Arrays {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly uv: number[] = [];
  readonly color: number[] = [];
  readonly extra: number[] = [];
  constructor(readonly extraName: string, readonly extraSize: number) {}

  get empty(): boolean {
    return this.position.length === 0;
  }

  /** One quad: corners a, b, c, d counter-clockwise seen from the front. */
  quad(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    n: [number, number, number],
    uvs: [number, number, number, number, number, number, number, number],
    color: number,
    extra: readonly number[],
  ): void {
    COLOR.set(color);
    const corners = [a, b, c, a, c, d];
    const uvIndex = [0, 1, 2, 0, 2, 3];
    for (let i = 0; i < 6; i += 1) {
      const p = corners[i]!;
      this.position.push(p[0], p[1], p[2]);
      this.normal.push(n[0], n[1], n[2]);
      const k = uvIndex[i]!;
      this.uv.push(uvs[k * 2]!, uvs[k * 2 + 1]!);
      this.color.push(COLOR.r, COLOR.g, COLOR.b);
      for (let e = 0; e < this.extraSize; e += 1) this.extra.push(extra[e] ?? 0);
    }
  }

  geometry(): BufferGeometry | null {
    if (this.empty) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.normal), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.color), 3));
    if (this.extraSize > 0) g.setAttribute(this.extraName, new BufferAttribute(new Float32Array(this.extra), this.extraSize));
    g.computeBoundingSphere();
    return g;
  }
}

/** Add an axis-aligned box's faces (sides with metric UVs: u centred across the face, v up from the bottom). */
const boxFaces = (arr: Arrays, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, extra: readonly number[], skip = ''): void => {
  const w = x1 - x0;
  const d = z1 - z0;
  const h = y1 - y0;
  // +Z (south) face
  if (!skip.includes('s')) arr.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [-w / 2, 0, w / 2, 0, w / 2, h, -w / 2, h], color, extra);
  // -Z (north)
  if (!skip.includes('n')) arr.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-w / 2, 0, w / 2, 0, w / 2, h, -w / 2, h], color, extra);
  // +X (east)
  if (!skip.includes('e')) arr.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [-d / 2, 0, d / 2, 0, d / 2, h, -d / 2, h], color, extra);
  // -X (west)
  if (!skip.includes('w')) arr.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [-d / 2, 0, d / 2, 0, d / 2, h, -d / 2, h], color, extra);
  // Top
  if (!skip.includes('t')) arr.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0, z1, x1, z1, x1, z0, x0, z0], color, extra);
  // Bottom
  if (skip.includes('B')) arr.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [x0, z0, x1, z0, x1, z1, x0, z1], color, extra);
};

/** Window-walled boxes for the facade shader. */
export class FacadeBuilder {
  private readonly arr = new Arrays('facade', 3);

  get empty(): boolean {
    return this.arr.empty;
  }

  /** A box whose walls carry windows. `baseOffset` = how far above the building's base this box starts. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, pattern: number, seed: number, baseOffset = 0, skip = ''): void {
    boxFaces(this.arr, x0, y0, z0, x1, y1, z1, color, [pattern, seed % 997, baseOffset], skip);
  }

  build(material: Material, name: string): Mesh | null {
    const g = this.arr.geometry();
    if (!g) return null;
    const mesh = new Mesh(g, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Road segments with their own lane markings. */
export class RoadBuilder {
  private readonly arr = new Arrays('roadInfo', 2);

  get empty(): boolean {
    return this.arr.empty;
  }

  /**
   * A straight stretch from (x0,z0) to (x1,z1), `width` wide, at height y.
   * `markings` false = plain asphalt (intersection squares).
   */
  segment(x0: number, z0: number, x1: number, z1: number, width: number, y: number, markings: boolean, yEnd = y): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.01) return;
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    // Right-hand side when facing along the segment: right = (-dz, dx) rotated per the game's convention.
    const rx = -dz;
    const rz = dx;
    const hw = width / 2;
    const a: [number, number, number] = [x0 - rx * hw, y, z0 - rz * hw];
    const b: [number, number, number] = [x0 + rx * hw, y, z0 + rz * hw];
    const c: [number, number, number] = [x1 + rx * hw, yEnd, z1 + rz * hw];
    const d: [number, number, number] = [x1 - rx * hw, yEnd, z1 - rz * hw];
    // Wind so the face points up.
    const up = (b[0] - a[0]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[0] - a[0]);
    const info = [markings ? len : -1, hw];
    if (up < 0) this.arr.quad(a, b, c, d, [0, 1, 0], [-hw, 0, hw, 0, hw, len, -hw, len], 0xffffff, info);
    else this.arr.quad(a, d, c, b, [0, 1, 0], [-hw, 0, -hw, len, hw, len, hw, 0], 0xffffff, info);
  }

  build(material: Material, name: string): Mesh | null {
    const g = this.arr.geometry();
    if (!g) return null;
    const mesh = new Mesh(g, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Flat ground surfaces (lawns, sand, tarmac, decks, pools) with a surface kind for the shader. */
export class SurfaceBuilder {
  private readonly arr = new Arrays('surface', 1);

  get empty(): boolean {
    return this.arr.empty;
  }

  rect(x0: number, z0: number, x1: number, z1: number, y: number, color: number, surface: number): void {
    this.arr.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [x0, z1, x1, z1, x1, z0, x0, z0], color, [surface]);
  }

  /** A raised slab with sides (a deck, a dock). */
  slab(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, surface: number): void {
    boxFaces(this.arr, x0, y0, z0, x1, y1, z1, color, [surface]);
  }

  /** Arbitrary triangles (a polygon fan), all at height y. */
  triangles(points: readonly (readonly [number, number])[], indices: readonly number[], y: number, color: number, surface: number): void {
    COLOR.set(color);
    for (let i = 0; i < indices.length; i += 3) {
      const tri = [points[indices[i]!]!, points[indices[i + 1]!]!, points[indices[i + 2]!]!];
      // Upward winding.
      const cross = (tri[1]![0] - tri[0]![0]) * (tri[2]![1] - tri[0]![1]) - (tri[1]![1] - tri[0]![1]) * (tri[2]![0] - tri[0]![0]);
      const order = cross > 0 ? [0, 2, 1] : [0, 1, 2];
      for (const k of order) {
        const p = tri[k]!;
        this.arr.position.push(p[0], y, p[1]);
        this.arr.normal.push(0, 1, 0);
        this.arr.uv.push(p[0], p[1]);
        this.arr.color.push(COLOR.r, COLOR.g, COLOR.b);
        this.arr.extra.push(surface);
      }
    }
  }

  /** One quad with its own corner heights (a sloped shelf), corners counter-clockwise from above. */
  quad3(a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], color: number, surface: number): void {
    this.arr.quad(a, b, c, d, [0, 1, 0], [a[0], a[2], b[0], b[2], c[0], c[2], d[0], d[2]], color, [surface]);
  }

  /** A vertical wall strip along a polyline (sea walls, beach shelves). */
  wall(input: readonly (readonly [number, number])[], yTop: number, yBottom: number, color: number, surface: number, closed = true): void {
    // Faces point to the LEFT of each edge; a closed outline is turned clockwise so that is outward.
    let area = 0;
    for (let i = 0; i < input.length; i += 1) {
      const a = input[i]!;
      const b = input[(i + 1) % input.length]!;
      area += a[0] * b[1] - b[0] * a[1];
    }
    const points = closed && area > 0 ? [...input].reverse() : input;
    const n = points.length;
    for (let i = 0; i < (closed ? n : n - 1); i += 1) {
      const a = points[i]!;
      const b = points[(i + 1) % n]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      this.arr.quad([a[0], yBottom, a[1]], [b[0], yBottom, b[1]], [b[0], yTop, b[1]], [a[0], yTop, a[1]], [nx, 0, nz], [0, 0, len, 0, len, yTop - yBottom, 0, yTop - yBottom], color, [surface]);
    }
  }

  build(material: Material, name: string, shadows = true): Mesh | null {
    const g = this.arr.geometry();
    if (!g) return null;
    const mesh = new Mesh(g, material);
    mesh.name = name;
    mesh.receiveShadow = shadows;
    return mesh;
  }
}

/** Sidewalk slabs and plazas (pavement shader). */
export class PavementBuilder {
  private readonly arr = new Arrays('', 0);

  get empty(): boolean {
    return this.arr.empty;
  }

  slab(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void {
    boxFaces(this.arr, x0, y0, z0, x1, y1, z1, color, []);
  }

  rect(x0: number, z0: number, x1: number, z1: number, y: number, color: number): void {
    this.arr.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [x0, z1, x1, z1, x1, z0, x0, z0], color, []);
  }

  build(material: Material, name: string): Mesh | null {
    const g = this.arr.geometry();
    if (!g) return null;
    const mesh = new Mesh(g, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return mesh;
  }
}

/** Interior floors (floor shader: `floorKind`). */
export class FloorBuilder {
  private readonly arr = new Arrays('floorKind', 1);

  get empty(): boolean {
    return this.arr.empty;
  }

  /** A rotated rectangle (a building's interior), given as four world corners. */
  quad(corners: readonly (readonly [number, number])[], y: number, color: number, kind: number): void {
    const [a, b, c, d] = corners as [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]];
    const cross = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const p = (q: readonly [number, number]): [number, number, number] => [q[0], y, q[1]];
    if (cross < 0) this.arr.quad(p(a), p(b), p(c), p(d), [0, 1, 0], [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]], color, [kind]);
    else this.arr.quad(p(a), p(d), p(c), p(b), [0, 1, 0], [a[0], a[1], d[0], d[1], c[0], c[1], b[0], b[1]], color, [kind]);
  }

  build(material: Material, name: string): Mesh | null {
    const g = this.arr.geometry();
    if (!g) return null;
    const mesh = new Mesh(g, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    return mesh;
  }
}

const M = new Matrix4();
const Q = new Quaternion();
const V = new Vector3();
const S = new Vector3();

/**
 * BAKING: take finished objects (a vehicle model, a prop group), apply their
 * world transform, and merge every mesh into one geometry per material. Used
 * for the hundreds of static parked cars and props, which would otherwise be
 * thousands of draw calls.
 */
export class Baker {
  private readonly byMaterial = new Map<Material, BufferGeometry[]>();
  private readonly flags = new Map<Material, { cast: boolean; receive: boolean }>();

  get empty(): boolean {
    return this.byMaterial.size === 0;
  }

  add(object: Object3D, x: number, y: number, z: number, yaw: number, scale = 1): void {
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.set(1, 1, 1);
    object.updateMatrixWorld(true);
    Q.setFromAxisAngle(V.set(0, 1, 0), yaw);
    M.compose(V.set(x, y, z), Q, S.set(scale, scale, scale));
    object.traverseVisible((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!material) return;
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      g.applyMatrix4(M);
      let list = this.byMaterial.get(material);
      if (!list) {
        list = [];
        this.byMaterial.set(material, list);
        this.flags.set(material, { cast: mesh.castShadow, receive: mesh.receiveShadow });
      }
      list.push(g);
    });
  }

  build(name: string): Mesh[] {
    const out: Mesh[] = [];
    for (const [material, list] of this.byMaterial) {
      // Only attributes every part shares can be merged.
      const names = Object.keys(list[0]!.attributes).filter((attr) => list.every((g) => g.getAttribute(attr) !== undefined));
      for (const g of list) for (const attr of Object.keys(g.attributes)) if (!names.includes(attr)) g.deleteAttribute(attr);
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, material);
      const f = this.flags.get(material)!;
      mesh.castShadow = f.cast;
      mesh.receiveShadow = f.receive;
      mesh.name = name;
      out.push(mesh);
    }
    this.byMaterial.clear();
    return out;
  }
}
