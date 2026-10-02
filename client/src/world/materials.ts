import { Color, DoubleSide, MeshBasicMaterial, MeshLambertMaterial, type Texture } from 'three';

/**
 * THE CITY'S SURFACES, drawn by the shader rather than by textures: a whole
 * Art Deco hotel is ONE box whose windows, ledges and lit rooms are computed
 * per pixel from metric UVs, so the skyline costs a handful of triangles per
 * building and no texture memory at all. Same for the road markings, the
 * sidewalk tiles, the lawns and the sand.
 *
 * Shared uniforms (`CITY_UNIFORMS`) carry the time of day, so every lit
 * window and street lamp in town follows the one clock.
 */
export const CITY_UNIFORMS = {
  uNight: { value: 0 },
  uTime: { value: 0 },
};

const patch = (material: MeshLambertMaterial, key: string, vertexHead: string, vertexBody: string, fragmentHead: string, fragmentBody: string, emissiveBody = ''): MeshLambertMaterial => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uNight'] = CITY_UNIFORMS.uNight;
    shader.uniforms['uTime'] = CITY_UNIFORMS.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexBody}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uNight;\nuniform float uTime;\n${fragmentHead}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fragmentBody}`);
    if (emissiveBody) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissiveBody}`);
  };
  material.customProgramCacheKey = () => key;
  return material;
};

/** A decal layer wins the depth test against the layers below it at any distance. */
const decal = (material: MeshLambertMaterial, layer: number): void => {
  if (layer <= 0) return;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -layer;
  material.polygonOffsetUnits = -4 * layer;
};

const HASH = /* glsl */ `
float cityHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cityNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = cityHash(i); float b = cityHash(i + vec2(1.0, 0.0));
  float c = cityHash(i + vec2(0.0, 1.0)); float d = cityHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

/**
 * FACADES. Attribute `facade` (vec3): pattern, seed, and the height of the
 * box's base above the building's base (so stacked boxes keep their floors).
 * UV: u is metres across the face from its centre, v metres up from the box's
 * base. Patterns: 0 plain, 1 deco, 2 grid, 3 glass, 4 house, 5 shopfront,
 * 6 industrial.
 */
let facade: MeshLambertMaterial | null = null;
export const facadeMaterial = (): MeshLambertMaterial => {
  if (facade) return facade;
  facade = patch(
    new MeshLambertMaterial({ vertexColors: true }),
    'palm-facade',
    /* glsl */ `attribute vec3 facade; varying vec3 vFacade; varying vec2 vFacadeUv; varying vec3 vFacadeNormal;`,
    /* glsl */ `vFacade = facade; vFacadeUv = uv; vFacadeNormal = normalize(mat3(modelMatrix) * objectNormal);`,
    /* glsl */ `varying vec3 vFacade; varying vec2 vFacadeUv; varying vec3 vFacadeNormal;
${HASH}
float box(vec2 p, vec2 lo, vec2 hi) { return step(lo.x, p.x) * step(p.x, hi.x) * step(lo.y, p.y) * step(p.y, hi.y); }
`,
    /* glsl */ `
float litWindow = 0.0;
{
  float pattern = floor(vFacade.x + 0.5);
  float seed = mod(floor(vFacade.y + 0.5), 997.0);
  vec2 uv = vec2(vFacadeUv.x, vFacadeUv.y + vFacade.z);
  bool side = abs(vFacadeNormal.y) < 0.5;
  vec3 wall = diffuseColor.rgb;
  vec3 glass = vec3(0.13, 0.17, 0.27);
  vec3 frame = vec3(0.95, 0.95, 0.93);
  float fw = max(fwidth(uv.x), fwidth(uv.y));
  float fade = 1.0 - smoothstep(0.35, 0.9, fw);
  if (side && pattern > 0.5) {
    float cellW = 4.0;
    float cellH = 4.5;
    vec2 cell = vec2(floor(uv.x / cellW + 0.5), floor(uv.y / cellH));
    vec2 f = vec2(uv.x - cell.x * cellW, uv.y - cell.y * cellH);
    float win = 0.0;
    float frm = 0.0;
    float ledge = 0.0;
    float sky = clamp((f.y - 1.0) / 2.6, 0.0, 1.0);
    if (pattern < 1.5) {
      // Art deco: windows with white frames and a shading eyebrow above.
      win = box(f, vec2(-1.15, 1.25), vec2(1.15, 3.35));
      frm = box(f, vec2(-1.35, 1.05), vec2(1.35, 3.55)) - win;
      ledge = box(f, vec2(-1.6, 3.65), vec2(1.6, 3.95));
      if (cell.y < 0.5) { win = box(f, vec2(-1.5, 0.0), vec2(1.5, 3.2)); frm = box(f, vec2(-1.7, 0.0), vec2(1.7, 3.4)) - win; ledge = 0.0; }
    } else if (pattern < 2.5) {
      // Modern grid: big panes, slim mullions.
      win = box(f, vec2(-1.75, 0.55), vec2(1.75, 4.05));
      frm = box(f, vec2(-1.9, 0.45), vec2(1.9, 4.15)) - win + box(f, vec2(-0.06, 0.55), vec2(0.06, 4.05));
    } else if (pattern < 3.5) {
      // Curtain wall glass with thin mullions and floor bands.
      win = 1.0 - box(f, vec2(-2.0, 0.0), vec2(-1.92, 4.5)) - box(f, vec2(1.92, 0.0), vec2(2.0, 4.5)) - box(f, vec2(-2.0, 0.0), vec2(2.0, 0.22));
      frm = 1.0 - win;
      glass = mix(vec3(0.24, 0.42, 0.62), vec3(0.62, 0.82, 0.95), sky * 0.7);
      wall = mix(wall, frame, 0.6);
    } else if (pattern < 4.5) {
      // Houses: fewer, taller windows with white frames.
      cellW = 7.0;
      cell = vec2(floor(uv.x / cellW + 0.5), floor(uv.y / cellH));
      f = vec2(uv.x - cell.x * cellW, uv.y - cell.y * cellH);
      win = box(f, vec2(-1.2, 1.0), vec2(1.2, 3.5));
      frm = box(f, vec2(-1.45, 0.8), vec2(1.45, 3.75)) - win;
      ledge = box(f, vec2(-1.6, 0.7), vec2(1.6, 0.9));
      glass = vec3(0.32, 0.48, 0.62);
    } else if (pattern < 5.5) {
      // Shopfront: tall display glass on the street, deco windows above.
      if (uv.y < 7.6) {
        win = box(f, vec2(-1.8, 0.6), vec2(1.8, 6.6));
        frm = box(f, vec2(-2.0, 0.4), vec2(2.0, 6.8)) - win;
        glass = mix(vec3(0.2, 0.32, 0.42), vec3(0.75, 0.88, 0.95), sky * 0.4);
      } else {
        win = box(f, vec2(-1.15, 1.25), vec2(1.15, 3.35));
        frm = box(f, vec2(-1.35, 1.05), vec2(1.35, 3.55)) - win;
      }
    } else {
      // Industrial: ribbed panels and a clerestory strip.
      float rib = step(0.85, fract(uv.x / 1.2));
      wall *= 1.0 - rib * 0.12;
      win = box(vec2(f.x, uv.y), vec2(-1.8, 6.2), vec2(1.8, 7.3));
      frm = box(vec2(f.x, uv.y), vec2(-1.95, 6.05), vec2(1.95, 7.45)) - win;
    }
    win = clamp(win, 0.0, 1.0);
    frm = clamp(frm, 0.0, 1.0);
    float on = step(0.58, cityHash(cell + vec2(seed * 0.013, seed * 0.029)));
    vec3 night = mix(vec3(1.0, 0.82, 0.5), vec3(0.85, 0.9, 1.0), cityHash(cell + 7.3));
    vec3 pane = mix(glass * (0.82 + 0.3 * sky), glass * 0.5, uNight);
    vec3 c = wall;
    c = mix(c, frame * mix(1.0, 0.92, step(0.5, pattern - 3.5)), frm * fade);
    c = mix(c, wall * 0.78, ledge * fade);
    c = mix(c, pane, win * fade);
    litWindow = win * on * uNight * fade;
    diffuseColor.rgb = c;
  } else if (!side) {
    // Roof tops: a subtle membrane texture.
    diffuseColor.rgb *= 0.95 + 0.05 * cityNoise(uv * 0.6);
  }
  vLitOut = litWindow;
}
`,
    /* glsl */ `totalEmissiveRadiance += vec3(1.0, 0.86, 0.6) * vLitOut * 0.95;`,
  );
  // vLitOut is declared as a plain local in the fragment main via a define trick:
  const original = facade.onBeforeCompile;
  facade.onBeforeCompile = (shader, renderer) => {
    original.call(facade, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'void main() {\n  float vLitOut = 0.0;');
  };
  return facade;
};

/**
 * ROADS. UV: u metres across from the centre line (positive = right-hand
 * lanes going +v), v metres along. Attribute-free: lanes, the double yellow,
 * dashed white lane lines, edge lines, crosswalk zebras and stop lines at
 * both ends of every segment between intersections.
 */
let road: MeshLambertMaterial | null = null;
export const roadMaterial = (): MeshLambertMaterial => {
  if (road) return road;
  road = patch(
    new MeshLambertMaterial({ color: 0x8a8580 }),
    'palm-road',
    /* glsl */ `attribute vec2 roadInfo; varying vec2 vRoadUv; varying vec2 vRoadInfo; varying vec3 vRoadWorld;`,
    /* glsl */ `vRoadUv = uv; vRoadInfo = roadInfo; vRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    /* glsl */ `varying vec2 vRoadUv; varying vec2 vRoadInfo; varying vec3 vRoadWorld;\n${HASH}`,
    /* glsl */ `
{
  float u = vRoadUv.x;
  float v = vRoadUv.y;
  float len = vRoadInfo.x;
  float hw = vRoadInfo.y;
  float kind = 0.0;
  vec3 asphalt = vec3(0.55, 0.52, 0.5) * (0.93 + 0.08 * cityNoise(vRoadWorld.xz * 0.35)) * (0.97 + 0.03 * cityNoise(vRoadWorld.xz * 3.0));
  vec3 c = asphalt;
  float fw = max(fwidth(u), fwidth(v)) + 0.001;
  float aa = 1.0 - smoothstep(0.6, 1.4, fw);
  vec3 white = vec3(0.96, 0.95, 0.9);
  vec3 yellow = vec3(0.98, 0.76, 0.12);
  if (len > 0.0) {
    float yel = (1.0 - smoothstep(0.12 - fw, 0.12 + fw, abs(abs(u) - 0.32)));
    float lane = (1.0 - smoothstep(0.1 - fw, 0.1 + fw, abs(abs(u) - hw * 0.5))) * step(fract(v / 9.0), 0.5);
    float edge = (1.0 - smoothstep(0.12 - fw, 0.12 + fw, abs(abs(u) - (hw - 0.7))));
    float inner = step(7.5, v) * step(v, len - 7.5);
    c = mix(c, yellow, yel * inner * aa);
    c = mix(c, white, lane * inner * aa * 0.92);
    c = mix(c, white, edge * aa * 0.9);
    // Crosswalk zebras at both ends, stop lines for the lanes arriving.
    float zebra = step(fract((u + hw) / 1.8), 0.55) * step(abs(u), hw - 1.0);
    float cross = (step(0.8, v) * step(v, 5.6) + step(len - 5.6, v) * step(v, len - 0.8));
    c = mix(c, white, zebra * cross * aa);
    float stopA = step(6.3, v) * step(v, 7.0) * step(u, -0.5) * step(-hw + 0.8, u);
    float stopB = step(len - 7.0, v) * step(v, len - 6.3) * step(0.5, u) * step(u, hw - 0.8);
    c = mix(c, white, (stopA + stopB) * aa);
  }
  diffuseColor.rgb = c;
}
`,
  );
  return road;
};

/** Sidewalks and plazas: warm concrete in 2-unit slabs. */
const pavements = new Map<number, MeshLambertMaterial>();
/**
 * `layer` > 0 is a DECAL drawn flush on the layer below (a plaza on a sidewalk
 * block): pulled toward the camera by a polygon offset rather than lifted by a
 * hair-thin height gap, which loses the depth test at a distance.
 */
export const pavementMaterial = (layer = 0): MeshLambertMaterial => {
  const cached = pavements.get(layer);
  if (cached) return cached;
  const pavement = patch(
    new MeshLambertMaterial({ vertexColors: true }),
    'palm-pavement',
    /* glsl */ `varying vec3 vPaveWorld; varying vec3 vPaveNormal;`,
    /* glsl */ `vPaveWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vPaveNormal = normalize(mat3(modelMatrix) * objectNormal);`,
    /* glsl */ `varying vec3 vPaveWorld; varying vec3 vPaveNormal;\n${HASH}`,
    /* glsl */ `
{
  if (vPaveNormal.y > 0.5) {
    vec2 p = vPaveWorld.xz / 2.0;
    vec2 g = abs(fract(p) - 0.5);
    float fw = max(fwidth(p.x), fwidth(p.y));
    float fade = 1.0 - smoothstep(0.2, 0.5, fw);
    float tone = 0.94 + 0.08 * cityHash(floor(p));
    diffuseColor.rgb *= mix(1.0, tone, fade);
    float line = smoothstep(0.46, 0.5, max(g.x, g.y));
    diffuseColor.rgb *= 1.0 - line * 0.12 * fade;
  } else {
    diffuseColor.rgb *= 0.86;
  }
}
`,
  );
  decal(pavement, layer);
  pavements.set(layer, pavement);
  return pavement;
};

/** Grass, sand, dirt, tarmac and decks: vertex-coloured ground with world-space variation. */
const grounds = new Map<number, MeshLambertMaterial>();
/** `layer` as for `pavementMaterial`: 0 is the land itself, 1+ decals stacked on it. */
export const groundMaterial = (layer = 0): MeshLambertMaterial => {
  const cached = grounds.get(layer);
  if (cached) return cached;
  const ground = patch(
    new MeshLambertMaterial({ vertexColors: true }),
    'palm-ground',
    /* glsl */ `attribute float surface; varying float vSurface; varying vec3 vGroundWorld;`,
    /* glsl */ `vSurface = surface; vGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    /* glsl */ `varying float vSurface; varying vec3 vGroundWorld;\n${HASH}`,
    /* glsl */ `
{
  vec2 p = vGroundWorld.xz;
  float s = floor(vSurface + 0.5);
  if (s < 0.5) {
    // Grass: patches and mowing stripes.
    float n = cityNoise(p * 0.08) * 0.6 + cityNoise(p * 0.5) * 0.4;
    diffuseColor.rgb *= 0.86 + n * 0.24;
    diffuseColor.rgb *= 0.97 + 0.03 * step(0.5, fract(p.x / 6.0));
  } else if (s < 1.5) {
    // Sand: fine grain, ripples.
    float n = cityNoise(p * 0.9) * 0.5 + cityNoise(p * 0.12) * 0.5;
    diffuseColor.rgb *= 0.92 + n * 0.12 + 0.03 * sin(p.x * 0.7 + cityNoise(p * 0.05) * 6.0);
  } else if (s < 2.5) {
    // Tarmac: speckled.
    diffuseColor.rgb *= 0.92 + cityHash(floor(p * 3.0)) * 0.1;
  } else if (s < 3.5) {
    // Wooden deck planks.
    float plank = fract(p.x / 1.2);
    diffuseColor.rgb *= 0.88 + 0.12 * cityHash(vec2(floor(p.x / 1.2), floor(p.y / 6.0)));
    diffuseColor.rgb *= 1.0 - smoothstep(0.9, 0.98, plank) * 0.3;
  } else if (s < 4.5) {
    // Pool water.
    float w = sin(p.x * 1.3 + uTime * 1.4) * sin(p.y * 1.1 - uTime * 1.1);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.97, 1.0), smoothstep(0.6, 0.95, w) * 0.5);
  } else if (s < 5.5) {
    // Court: lines.
    diffuseColor.rgb *= 0.97 + 0.03 * cityNoise(p);
  }
}
`,
  );
  decal(ground, layer);
  grounds.set(layer, ground);
  return ground;
};

/** Interior floors: tile, wood, marble, checker, carpet, terrazzo, concrete (attribute `floorKind`). */
let floor: MeshLambertMaterial | null = null;
export const floorMaterial = (): MeshLambertMaterial => {
  if (floor) return floor;
  floor = patch(
    new MeshLambertMaterial({ vertexColors: true }),
    'palm-floor',
    /* glsl */ `attribute float floorKind; varying float vFloorKind; varying vec3 vFloorWorld;`,
    /* glsl */ `vFloorKind = floorKind; vFloorWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    /* glsl */ `varying float vFloorKind; varying vec3 vFloorWorld;\n${HASH}`,
    /* glsl */ `
{
  vec2 p = vFloorWorld.xz;
  float k = floor(vFloorKind + 0.5);
  float fw = max(fwidth(p.x), fwidth(p.y));
  if (k < 0.5) {
    vec2 g = abs(fract(p / 2.0) - 0.5);
    diffuseColor.rgb *= 1.0 - smoothstep(0.46, 0.5, max(g.x, g.y)) * 0.15;
  } else if (k < 1.5) {
    float row = floor(p.y / 0.9);
    float board = floor((p.x + row * 2.3) / 4.0);
    diffuseColor.rgb *= 0.86 + 0.16 * cityHash(vec2(board, row));
    diffuseColor.rgb *= 1.0 - smoothstep(0.92, 1.0, fract(p.y / 0.9)) * 0.25;
  } else if (k < 2.5) {
    float vein = cityNoise(p * 0.7 + cityNoise(p * 0.2) * 3.0);
    diffuseColor.rgb *= 0.93 + vein * 0.1;
    vec2 g = abs(fract(p / 3.0) - 0.5);
    diffuseColor.rgb *= 1.0 - smoothstep(0.48, 0.5, max(g.x, g.y)) * 0.1;
  } else if (k < 3.5) {
    vec2 c = floor(p / 1.6);
    float check = mod(c.x + c.y, 2.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.13, 0.15), check * 0.85);
  } else if (k < 4.5) {
    diffuseColor.rgb *= 0.94 + 0.06 * cityHash(floor(p * 6.0));
  } else if (k < 5.5) {
    diffuseColor.rgb *= 0.9 + 0.1 * cityHash(floor(p * 2.5));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.9, 0.82), step(0.93, cityHash(floor(p * 5.0))) * 0.6);
  } else {
    diffuseColor.rgb *= 0.92 + 0.06 * cityNoise(p * 0.3);
  }
}
`,
  );
  return floor;
};

/** Neon and lamp glass: unlit, and brighter at night. */
let neon: MeshBasicMaterial | null = null;
export const neonMaterial = (): MeshBasicMaterial => {
  if (neon) return neon;
  neon = new MeshBasicMaterial({ vertexColors: true, fog: false });
  neon.onBeforeCompile = (shader) => {
    shader.uniforms['uNight'] = CITY_UNIFORMS.uNight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.78, 1.25, uNight);');
  };
  neon.customProgramCacheKey = () => 'palm-neon';
  return neon;
};

/** Sign faces: the shared sign atlas texture. */
export const signMaterial = (map: Texture): MeshBasicMaterial => {
  const m = new MeshBasicMaterial({ map, transparent: true, alphaTest: 0.05, side: DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms['uNight'] = CITY_UNIFORMS.uNight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(0.9, 1.3, uNight);');
  };
  m.customProgramCacheKey = () => 'palm-sign';
  return m;
};

/** Window glass on homes, shops, vehicles. */
export const glassMaterial = (): MeshLambertMaterial => new MeshLambertMaterial({ color: new Color(0x9fd4ff), transparent: true, opacity: 0.35, depthWrite: false });
