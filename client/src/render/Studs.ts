import { MeshLambertMaterial, type Material, type MeshLambertMaterialParameters } from 'three';

/**
 * ROBLOX STUDS, drawn by the shader: every studded surface in the world gets
 * the classic grid of small square inlets, computed per pixel from the WORLD
 * position and the face's orientation - so a floor, a cliff face, a tree
 * canopy block and a wall all carry studs of exactly the same size, on any
 * geometry, with no texture and no UVs.
 *
 * The pattern fades out where the studs would shrink below a few pixels, so
 * distant cliffs read as clean plastic rather than shimmering.
 */

/** World units per stud. */
export const STUD_SIZE = 1.1;

const VERTEX_HEAD = /* glsl */ `
varying vec3 vStudPos;
varying vec3 vStudNormal;
`;

const VERTEX_BODY = /* glsl */ `
{
  vec4 studWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    studWorld = instanceMatrix * studWorld;
  #endif
  studWorld = modelMatrix * studWorld;
  vStudPos = studWorld.xyz;
  vec3 studN = objectNormal;
  #ifdef USE_INSTANCING
    studN = mat3(instanceMatrix) * studN;
  #endif
  vStudNormal = mat3(modelMatrix) * studN;
}
`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vStudPos;
varying vec3 vStudNormal;
uniform float uStudStrength;
`;

const FRAGMENT_BODY = /* glsl */ `
{
  vec3 an = abs(normalize(vStudNormal));
  vec2 sp = an.y > 0.57 ? vStudPos.xz : (an.x > an.z ? vStudPos.zy : vStudPos.xy);
  sp /= ${STUD_SIZE.toFixed(3)};
  vec2 f = fract(sp) - 0.5;
  float d = max(abs(f.x), abs(f.y));
  float fw = max(fwidth(sp.x), fwidth(sp.y));
  float fade = 1.0 - smoothstep(0.18, 0.42, fw);
  float edge = 0.19;
  float inset = 1.0 - smoothstep(edge - fw, edge + fw, d);
  float rim = smoothstep(edge - fw, edge, d) * (1.0 - smoothstep(edge + 0.02, edge + 0.05 + fw, d));
  float lit = step(0.0, f.x - f.y);
  float k = 1.0 - inset * 0.15 + rim * mix(-0.09, 0.11, lit);
  diffuseColor.rgb *= mix(1.0, k, fade * uStudStrength);
}
`;

/** Patch a material so it draws studs. `strength` 0..1 scales how deep they read. */
export const studify = <T extends Material>(material: T, strength = 1): T => {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uStudStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_BODY}`);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|studs:${strength}`;
  return material;
};

/** A studded Lambert plastic, the default material of the world. */
export const studPlastic = (params: MeshLambertMaterialParameters = {}, strength = 1): MeshLambertMaterial =>
  studify(new MeshLambertMaterial(params), strength);
