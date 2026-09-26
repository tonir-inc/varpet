import * as THREE from 'three';
import type { SceneDocument } from '../contracts';
import { getPresetForMaterial } from '../core/finish-presets';

export type FinishSurface = 'floor' | 'wall-front' | 'wall-back';
export interface FinishReveal {
  entityId: string;
  surface: FinishSurface;
  point: [number, number, number];
  previousScene: SceneDocument;
  startedAt: number;
  reducedMotion?: boolean;
}
export interface FinishAppearance {
  color: string;
  accent: string;
  /** 4 retains the original room's quiet, parallel floor joints. */
  pattern: number;
  size: [number, number];
  roughness: number;
}
export interface FinishMaterialProjection {
  material: THREE.MeshStandardMaterial;
  update(now: number): boolean;
}

const patternIds = { solid: 0, tile: 1, wood: 2, terrazzo: 3 } as const;

/** Project assignments and their stored colors always win over catalog defaults. */
export function finishAppearance(document: SceneDocument, entityId: string, surface: string, fallback: string, jointSpacing?: number): FinishAppearance {
  const assignment = document.project?.finishes.find(item => item.entityId === entityId && item.surface === surface);
  const material = document.project?.materials.find(item => item.id === assignment?.materialId);
  const preset = material && getPresetForMaterial(material);
  return {
    color: material?.color ?? fallback,
    accent: preset?.accent ?? '#827863',
    pattern: preset ? patternIds[preset.pattern] : material || !jointSpacing ? 0 : 4,
    size: preset?.size ?? [1, jointSpacing ?? 1],
    roughness: preset?.roughness ?? (surface === 'floor' ? 0.84 : 0.94),
  };
}

const fragmentDeclarations = /* glsl */`
varying vec3 vFinishWorld;
uniform vec3 uFinishBase;
uniform vec3 uFinishAccent;
uniform vec4 uFinishPattern;
uniform vec3 uFinishPreviousBase;
uniform vec3 uFinishPreviousAccent;
uniform vec4 uFinishPreviousPattern;
uniform vec3 uFinishAxisU;
uniform vec3 uFinishAxisV;
uniform vec3 uFinishOrigin;
uniform float uFinishRadius;
uniform float uFinishFeather;
uniform float uFinishProgress;

float finishHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float finishNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(finishHash(i), finishHash(i + vec2(1.0, 0.0)), f.x),
    mix(finishHash(i + vec2(0.0, 1.0)), finishHash(i + vec2(1.0)), f.x), f.y);
}
float finishJoint(vec2 p, vec2 dimensions, float width) {
  vec2 cell = fract(p / dimensions);
  vec2 edge = min(cell, 1.0 - cell) * dimensions;
  vec2 aa = max(fwidth(p), vec2(0.0001));
  vec2 inside = smoothstep(vec2(width) - aa, vec2(width) + aa, edge);
  return 1.0 - min(inside.x, inside.y);
}
vec3 finishColorAt(vec2 p, vec3 base, vec3 accent, vec4 spec) {
  vec2 size = max(spec.yz, vec2(0.02));
  if (spec.x < 0.5) return base;
  if (spec.x < 1.5) {
    vec2 cell = floor(p / size);
    float tone = (finishHash(cell) - 0.5) * 0.045;
    float stone = (finishNoise(p * 5.0) - 0.5) * 0.025;
    vec3 ceramic = base * (1.0 + tone + stone);
    return mix(ceramic, accent, finishJoint(p, size, 0.0018) * 0.82);
  }
  if (spec.x < 2.5) {
    // Staggered end joints, individual plank tones, and fine longitudinal grain.
    float row = floor(p.y / size.y);
    vec2 plankPoint = vec2(p.x + mod(row, 3.0) * size.x / 3.0, p.y);
    vec2 cell = floor(plankPoint / size);
    float plankTone = finishHash(cell) - 0.5;
    float grainNoise = finishNoise(vec2(p.x * 1.3, p.y * 47.0));
    float phase = p.y * 190.0 + finishNoise(vec2(p.x * 0.55, p.y * 4.0)) * 12.0;
    float grain = sin(phase) * (1.0 - smoothstep(0.8, 2.8, fwidth(phase)));
    vec3 wood = mix(base, accent, 0.14 + grainNoise * 0.13 + grain * 0.035);
    wood *= 1.0 + plankTone * 0.14;
    return mix(wood, accent * 0.74, finishJoint(plankPoint, size, 0.0011) * 0.60);
  }
  if (spec.x < 3.5) {
    // Two offset aggregate scales avoid a visible regular dot grid.
    vec3 terrazzo = base * (0.985 + finishNoise(p * 7.0) * 0.03);
    for (int layer = 0; layer < 2; layer++) {
      float scale = layer == 0 ? 27.0 : 49.0;
      vec2 q = p * scale + float(layer) * 13.7;
      vec2 cell = floor(q); vec2 local = fract(q);
      float seed = finishHash(cell + float(layer) * 7.0);
      vec2 center = vec2(0.22) + vec2(finishHash(cell + 3.1), finishHash(cell + 7.3)) * 0.56;
      vec2 chip = (local - center) * vec2(1.0 + seed, 1.4 - seed * 0.4);
      float distanceToChip = max(abs(chip.x) * 0.86 + abs(chip.y) * 0.5, abs(chip.y));
      float radius = 0.07 + seed * 0.12;
      float aa = max(fwidth(distanceToChip), 0.002);
      float aggregate = 1.0 - smoothstep(radius - aa, radius + aa, distanceToChip);
      vec3 chipColor = mix(accent, base * 1.16, step(0.64, seed));
      terrazzo = mix(terrazzo, chipColor, aggregate * 0.74);
    }
    return terrazzo;
  }
  float y = fract(p.y / size.y);
  float edge = min(y, 1.0 - y) * size.y;
  float aa = max(fwidth(p.y), 0.0001);
  float joint = 1.0 - smoothstep(0.001 - aa, 0.001 + aa, edge);
  return mix(base, accent, joint * 0.095);
}
`;

/** Physical coordinates keep every wall segment, tile, and reveal continuous around openings. */
export function makeFinishMaterial(
  appearance: FinishAppearance,
  axes: { u: THREE.Vector3; v: THREE.Vector3 },
  transition?: { reveal: FinishReveal; previous: FinishAppearance; radius: number },
): FinishMaterialProjection {
  const previous = transition?.previous ?? appearance;
  const pattern = (value: FinishAppearance) => new THREE.Vector4(value.pattern, value.size[0], value.size[1], value.roughness);
  const feather = transition ? Math.min(0.24, Math.max(0.10, transition.radius * 0.025)) : 0.1;
  const active = !!transition && !transition.reveal.reducedMotion;
  const uniforms = {
    uFinishBase: { value: new THREE.Color(appearance.color) },
    uFinishAccent: { value: new THREE.Color(appearance.accent) },
    uFinishPattern: { value: pattern(appearance) },
    uFinishPreviousBase: { value: new THREE.Color(previous.color) },
    uFinishPreviousAccent: { value: new THREE.Color(previous.accent) },
    uFinishPreviousPattern: { value: pattern(previous) },
    uFinishAxisU: { value: axes.u },
    uFinishAxisV: { value: axes.v },
    uFinishOrigin: { value: new THREE.Vector3(...(transition?.reveal.point ?? [0, 0, 0] as const)) },
    uFinishRadius: { value: active ? -feather : 0 },
    uFinishFeather: { value: feather },
    uFinishProgress: { value: active ? 0 : 1 },
  };
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: appearance.roughness });
  material.customProgramCacheKey = () => 'varpet-finish-world-v1';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFinishWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFinishWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragmentDeclarations}`)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        vec3 finishTint = diffuseColor.rgb;
        vec2 finishUv = vec2(dot(vFinishWorld, uFinishAxisU), dot(vFinishWorld, uFinishAxisV));
        vec3 finishNext = finishColorAt(finishUv, uFinishBase, uFinishAccent, uFinishPattern);
        float finishBlend = 1.0;
        if (uFinishProgress < 1.0) {
          vec3 relative = vFinishWorld - uFinishOrigin;
          float distanceFromDrop = length(vec2(dot(relative, uFinishAxisU), dot(relative, uFinishAxisV)));
          float featherWidth = max(uFinishFeather, fwidth(distanceFromDrop) * 1.5);
          finishBlend = 1.0 - smoothstep(uFinishRadius - featherWidth, uFinishRadius + featherWidth, distanceFromDrop);
          vec3 finishBefore = finishColorAt(finishUv, uFinishPreviousBase, uFinishPreviousAccent, uFinishPreviousPattern);
          diffuseColor.rgb = mix(finishBefore, finishNext, finishBlend);
          float rim = 1.0 - smoothstep(0.0, featherWidth, abs(distanceFromDrop - uFinishRadius));
          diffuseColor.rgb *= 1.0 + rim * 0.025;
        } else {
          diffuseColor.rgb = finishNext;
        }
        diffuseColor.rgb *= finishTint;
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(uFinishPreviousPattern.w, uFinishPattern.w, finishBlend);');
  };
  let disposed = false;
  material.addEventListener('dispose', () => { disposed = true; });
  return {
    material,
    update(now) {
      if (disposed || !active || uniforms.uFinishProgress.value >= 1 || !transition) return false;
      const progress = THREE.MathUtils.clamp((now - transition.reveal.startedAt) / 1000, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      uniforms.uFinishProgress.value = progress;
      uniforms.uFinishRadius.value = -feather + eased * (transition.radius + feather * 2);
      return progress < 1;
    },
  };
}
