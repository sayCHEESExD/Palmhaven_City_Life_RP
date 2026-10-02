import { BufferGeometry, InstancedMesh, Matrix4, Mesh, Raycaster, Vector3, type Object3D } from 'three';

/**
 * DEV ONLY (never imported by the game): scans the live scene for the two
 * visual bugs that are easy to make and hard to spot by eye.
 *
 *   zFights(root)  coplanar, overlapping faces of different colours - they
 *                  shimmer as the camera moves.
 *   blockedSigns(root)  sign faces with geometry standing right in front of them.
 *
 * Run from the console: (await import('/src/dev/anomalies.ts')).zFights(scene)
 */

interface Tri {
  a: Vector3;
  b: Vector3;
  c: Vector3;
  n: Vector3;
  d: number;
  color: number;
  hex: string;
  mesh: string;
}

const triangles = (root: Object3D, filter: (mesh: Mesh) => boolean): Tri[] => {
  const out: Tri[] = [];
  const m = new Matrix4();
  const one = (mesh: Mesh, matrix: Matrix4, name: string): void => {
    const geometry = mesh.geometry as BufferGeometry;
    const pos = geometry.getAttribute('position');
    if (!pos) return;
    const col = geometry.getAttribute('color');
    const index = geometry.getIndex();
    const count = index ? index.count : pos.count;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const base = (material as { color?: { getHex(): number } } | undefined)?.color?.getHex() ?? 0xffffff;
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      const a = new Vector3().fromBufferAttribute(pos, ia).applyMatrix4(matrix);
      const b = new Vector3().fromBufferAttribute(pos, ib).applyMatrix4(matrix);
      const c = new Vector3().fromBufferAttribute(pos, ic).applyMatrix4(matrix);
      const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
      const area = n.length();
      if (area < 1e-4) continue;
      n.divideScalar(area);
      const color = col ? ((Math.round(col.getX(ia) * 31) << 10) | (Math.round(col.getY(ia) * 31) << 5) | Math.round(col.getZ(ia) * 31)) : base;
      const hex = col ? `#${[col.getX(ia), col.getY(ia), col.getZ(ia)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}` : `#${base.toString(16).padStart(6, '0')}`;
      out.push({ a, b, c, n, d: n.dot(a), color: color ^ ((material as { id?: number } | undefined)?.id ?? 0) * 7919, hex, mesh: name });
    }
  };
  root.updateMatrixWorld(true);
  root.traverseVisible((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !filter(mesh)) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material || material.transparent || !material.depthWrite) return;
    const name = mesh.name || mesh.parent?.name || '?';
    if ((mesh as InstancedMesh).isInstancedMesh) {
      const inst = mesh as InstancedMesh;
      for (let i = 0; i < Math.min(inst.count, 400); i += 1) {
        inst.getMatrixAt(i, m);
        one(mesh, m.clone().premultiply(mesh.matrixWorld), `${name}#${i}`);
      }
    } else one(mesh, mesh.matrixWorld, name);
  });
  return out;
};

/** Project onto the plane's dominant axes. */
const flat = (t: Tri, p: Vector3): [number, number] => {
  const ax = Math.abs(t.n.x);
  const ay = Math.abs(t.n.y);
  const az = Math.abs(t.n.z);
  if (ay >= ax && ay >= az) return [p.x, p.z];
  if (ax >= az) return [p.y, p.z];
  return [p.x, p.y];
};

const area2 = (poly: [number, number][]): number => {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x0, y0] = poly[i]!;
    const [x1, y1] = poly[(i + 1) % poly.length]!;
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
};

/** Area of the overlap of two triangles (Sutherland-Hodgman). */
const overlap = (p: [number, number][], q: [number, number][]): number => {
  if (area2(p) < 0) p = [...p].reverse();
  if (area2(q) < 0) q = [...q].reverse();
  let out: [number, number][] = p;
  for (let i = 0; i < 3 && out.length > 0; i += 1) {
    const [ax, ay] = q[i]!;
    const [bx, by] = q[(i + 1) % 3]!;
    const side = (x: number, y: number): number => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j += 1) {
      const cur = input[j]!;
      const prev = input[(j + input.length - 1) % input.length]!;
      const sc = side(cur[0], cur[1]);
      const sp = side(prev[0], prev[1]);
      if (sc >= 0 !== sp >= 0) {
        const t = sp / (sp - sc);
        out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
      }
      if (sc >= 0) out.push(cur);
    }
  }
  return out.length >= 3 ? Math.abs(area2(out)) : 0;
};

export interface ZFight {
  meshes: string;
  colors: string;
  normal: string;
  size: string;
  at: [number, number, number];
  gap: number;
  area: number;
}

/**
 * Faces facing the same way, within `tolerance` of the same plane, overlapping
 * by more than `minArea`, and of different colour or material.
 */
export const zFights = (root: Object3D, tolerance = 0.03, minArea = 0.02, filter: (mesh: Mesh) => boolean = () => true): ZFight[] => {
  const tris = triangles(root, filter);
  const buckets = new Map<string, Tri[]>();
  const CELL = 12;
  const keyOf = (t: Tri, dShift: number, cx: number, cy: number): string =>
    `${Math.round(t.n.x * 40)},${Math.round(t.n.y * 40)},${Math.round(t.n.z * 40)},${Math.floor(t.d / tolerance) + dShift},${cx},${cy}`;
  for (const t of tris) {
    const pts = [flat(t, t.a), flat(t, t.b), flat(t, t.c)];
    const x0 = Math.floor(Math.min(...pts.map((p) => p[0])) / CELL);
    const x1 = Math.floor(Math.max(...pts.map((p) => p[0])) / CELL);
    const y0 = Math.floor(Math.min(...pts.map((p) => p[1])) / CELL);
    const y1 = Math.floor(Math.max(...pts.map((p) => p[1])) / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) continue; // huge ground polygons: checked by hand
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cy = y0; cy <= y1; cy += 1) {
        const key = keyOf(t, 0, cx, cy);
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push(t);
      }
    }
  }
  const found = new Map<string, ZFight>();
  const seen = new Set<string>();
  for (const [key, list] of buckets) {
    const parts = key.split(',');
    const neighbour = buckets.get([parts[0], parts[1], parts[2], Number(parts[3]) + 1, parts[4], parts[5]].join(',')) ?? [];
    const pool = [...list, ...neighbour];
    if (pool.length > 3000) continue;
    for (let i = 0; i < list.length; i += 1) {
      const t = list[i]!;
      for (let j = i + 1; j < pool.length; j += 1) {
        const u = pool[j]!;
        if (t === u || t.color === u.color) continue;
        if (t.n.dot(u.n) < 0.998 || Math.abs(t.d - u.d) > tolerance) continue;
        const area = overlap([flat(t, t.a), flat(t, t.b), flat(t, t.c)], [flat(u, u.a), flat(u, u.b), flat(u, u.c)]);
        if (area < minArea) continue;
        const at = new Vector3().add(t.a).add(t.b).add(t.c).divideScalar(3);
        const spot = `${Math.round(at.x / 4)},${Math.round(at.y / 4)},${Math.round(at.z / 4)}`;
        const meshes = [t.mesh.replace(/-\d+,-?\d+/, ''), u.mesh.replace(/-\d+,-?\d+/, '')].sort().join(' | ');
        if (seen.has(spot + meshes)) continue;
        seen.add(spot + meshes);
        const prev = found.get(spot);
        const span = (q: Tri): string => { const xs = [q.a.x, q.b.x, q.c.x]; const ys = [q.a.y, q.b.y, q.c.y]; const zs = [q.a.z, q.b.z, q.c.z]; return [xs, ys, zs].map((v) => (Math.max(...v) - Math.min(...v)).toFixed(2)).join('x'); };
        if (!prev || area > prev.area) found.set(spot, { meshes, colors: `${t.hex} ${u.hex}`, normal: [t.n.x, t.n.y, t.n.z].map((v) => v.toFixed(1)).join(','), size: `${span(t)} / ${span(u)}`, at: [+at.x.toFixed(1), +at.y.toFixed(2), +at.z.toFixed(1)], gap: +Math.abs(t.d - u.d).toFixed(3), area: +area.toFixed(2) });
      }
    }
  }
  return [...found.values()].sort((a, b) => b.area - a.area);
};

export interface BlockedSign {
  at: [number, number, number];
  blocked: number;
  by: string[];
}

/** Every sign quad, sampled on a 4x3 grid and looked at from 3 units in front. */
export const blockedSigns = (root: Object3D, depth = 3): BlockedSign[] => {
  const signs: Mesh[] = [];
  const solid: Object3D[] = [];
  root.updateMatrixWorld(true);
  root.traverseVisible((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name.startsWith('signs')) signs.push(mesh);
    else {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (material && !material.transparent) solid.push(mesh);
    }
  });
  const rc = new Raycaster();
  const out: BlockedSign[] = [];
  for (const mesh of signs) {
    const pos = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    // Signs are quads: 4 vertices each (indexed) or 6 (two triangles).
    const stride = index ? 4 : 6;
    for (let q = 0; q + stride <= pos.count; q += stride) {
      const v = [0, 1, 2, stride === 4 ? 3 : 5].map((k) => new Vector3().fromBufferAttribute(pos, q + k).applyMatrix4(mesh.matrixWorld));
      const n = new Vector3().subVectors(v[1]!, v[0]!).cross(new Vector3().subVectors(v[2]!, v[0]!)).normalize();
      const center = v.reduce((s, p) => s.add(p), new Vector3()).divideScalar(4);
      // The front is the side the text faces: try both, keep the open one.
      let worst = 1;
      let by: string[] = [];
      for (const side of [1, -1]) {
        let hits = 0;
        const names = new Set<string>();
        for (let i = 0; i < 4; i += 1) {
          for (let j = 0; j < 3; j += 1) {
            const s = (i + 0.5) / 4;
            const t = (j + 0.5) / 3;
            const p = new Vector3().copy(v[0]!).lerp(v[1]!, s).lerp(new Vector3().copy(v[3]!).lerp(v[2]!, s), t);
            const from = p.clone().addScaledVector(n, side * depth);
            rc.set(from, n.clone().multiplyScalar(-side));
            rc.far = depth - 0.03;
            const hit = rc.intersectObjects(solid, false)[0];
            if (hit) {
              hits += 1;
              names.add(hit.object.name || hit.object.parent?.name || '?');
            }
          }
        }
        if (hits / 12 < worst) {
          worst = hits / 12;
          by = [...names];
        }
      }
      if (worst > 0.15) out.push({ at: [+center.x.toFixed(1), +center.y.toFixed(1), +center.z.toFixed(1)], blocked: +worst.toFixed(2), by });
    }
  }
  return out.sort((a, b) => b.blocked - a.blocked);
};
