import * as THREE from 'three';

type FurnitureFinish = 'wood-horizontal' | 'wood-vertical' | 'textile';

const surfaceFunctions = /* glsl */`
varying vec3 vFurniturePosition;
varying vec3 vFurnitureNormal;

float furnitureHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float furnitureNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 blend = fract(p);
  blend = blend * blend * (3.0 - 2.0 * blend);
  return mix(
    mix(furnitureHash(cell), furnitureHash(cell + vec2(1.0, 0.0)), blend.x),
    mix(furnitureHash(cell + vec2(0.0, 1.0)), furnitureHash(cell + vec2(1.0)), blend.x),
    blend.y
  );
}

// Suppress detail below a pixel, including the weave when the entire flat is visible.
float furnitureThread(float phase) {
  float coverage = 1.0 - smoothstep(0.7, 3.0, fwidth(phase));
  return sin(phase) * coverage;
}

vec3 furnitureBump(vec3 viewPosition, vec3 surfaceNormal, float height) {
  vec3 dx = dFdx(viewPosition);
  vec3 dy = dFdy(viewPosition);
  vec3 tangentX = cross(dy, surfaceNormal);
  vec3 tangentY = cross(surfaceNormal, dx);
  float determinant = dot(dx, tangentX);
  vec3 gradient = sign(determinant) * (dFdx(height) * tangentX + dFdy(height) * tangentY);
  return normalize(abs(determinant) * surfaceNormal - gradient);
}
`;

/** Geometry remains in metres: finish detail follows the piece as it is moved or rotated. */
export function furnitureMaterial(color: THREE.ColorRepresentation, finish: FurnitureFinish): THREE.MeshStandardMaterial {
  const textile = finish === 'textile';
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: textile ? 0.96 : 0.4,
    metalness: 0,
    clearcoat: textile ? 0 : 0.13,
    clearcoatRoughness: 0.46,
    sheen: textile ? 0.32 : 0,
    sheenColor: color,
    sheenRoughness: 0.88,
  });
  material.customProgramCacheKey = () => `varpet-furniture-${finish}-v1`;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFurniturePosition;\nvarying vec3 vFurnitureNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurniturePosition = position;\nvFurnitureNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${surfaceFunctions}`)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        vec3 furnitureNormal = abs(normalize(vFurnitureNormal));
        // A face projection keeps weave/pores the same size on the top and sides.
        vec2 furnitureUv = furnitureNormal.y > max(furnitureNormal.x, furnitureNormal.z)
          ? vFurniturePosition.xz
          : (furnitureNormal.x > furnitureNormal.z ? vFurniturePosition.zy : vFurniturePosition.xy);
        float furnitureHeight;
        float furnitureRoughness;
        ${textile ? /* glsl */`
          float warp = furnitureThread(furnitureUv.x * 1900.0);
          float weft = furnitureThread(furnitureUv.y * 1900.0);
          float yarn = furnitureNoise(furnitureUv * 55.0);
          float weave = warp * weft;
          diffuseColor.rgb *= 0.97 + yarn * 0.055 + weave * 0.025;
          furnitureHeight = weave * 0.00024 + yarn * 0.00035;
          furnitureRoughness = 0.02 * weave;
        ` : /* glsl */`
          vec2 grainUv = ${finish === 'wood-horizontal' ? 'furnitureUv.yx' : 'furnitureUv'};
          float warp = sin(grainUv.y * 3.2 + furnitureNoise(grainUv * vec2(2.0, 0.75)) * 4.0);
          float grainPhase = grainUv.x * 255.0 + warp * 3.7;
          float ribbon = furnitureNoise(vec2(grainUv.x * 20.0 + warp * 0.7, grainUv.y * 1.6));
          float grain = furnitureThread(grainPhase);
          float pores = furnitureThread(grainPhase * 3.3 + ribbon * 5.0);
          diffuseColor.rgb *= 0.89 + ribbon * 0.19 + grain * 0.035 + pores * 0.012;
          furnitureHeight = grain * 0.00016 + pores * 0.000045;
          furnitureRoughness = (1.0 - ribbon) * 0.09 + grain * 0.025;
        `}
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + furnitureRoughness, 0.05, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = furnitureBump(-vViewPosition, normal, furnitureHeight);');
  };
  return material;
}
