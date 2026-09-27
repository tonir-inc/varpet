import * as THREE from 'three';
import type { FinishPreset } from '../core/finish-presets';
import oakColor from '../../../../catalog/materials/oak/basecolor.jpg?url';
import oakRoughness from '../../../../catalog/materials/oak/roughness.jpg?url';
import oakNormal from '../../../../catalog/materials/oak/normal.jpg?url';
import oakMetadata from '../../../../catalog/materials/oak/material.json';
import walnutColor from '../../../../catalog/materials/walnut/basecolor.jpg?url';
import walnutRoughness from '../../../../catalog/materials/walnut/roughness.jpg?url';
import walnutNormal from '../../../../catalog/materials/walnut/normal.jpg?url';
import walnutMetadata from '../../../../catalog/materials/walnut/material.json';
import ashColor from '../../../../catalog/materials/ash-light/basecolor.jpg?url';
import ashRoughness from '../../../../catalog/materials/ash-light/roughness.jpg?url';
import ashNormal from '../../../../catalog/materials/ash-light/normal.jpg?url';
import ashMetadata from '../../../../catalog/materials/ash-light/material.json';
import travertineColor from '../../../../catalog/materials/travertine/basecolor.jpg?url';
import travertineRoughness from '../../../../catalog/materials/travertine/roughness.jpg?url';
import travertineNormal from '../../../../catalog/materials/travertine/normal.jpg?url';
import travertineMetadata from '../../../../catalog/materials/travertine/material.json';
import marbleColor from '../../../../catalog/materials/marble-white-alt/basecolor.jpg?url';
import marbleRoughness from '../../../../catalog/materials/marble-white-alt/roughness.jpg?url';
import marbleNormal from '../../../../catalog/materials/marble-white-alt/normal.jpg?url';
import marbleMetadata from '../../../../catalog/materials/marble-white-alt/material.json';

type FinishTextureId = NonNullable<FinishPreset['texture']>;
const sources = {
  oak: { color: oakColor, roughness: oakRoughness, normal: oakNormal, size: oakMetadata.tile_m },
  walnut: { color: walnutColor, roughness: walnutRoughness, normal: walnutNormal, size: walnutMetadata.tile_m },
  ash: { color: ashColor, roughness: ashRoughness, normal: ashNormal, size: ashMetadata.tile_m },
  travertine: { color: travertineColor, roughness: travertineRoughness, normal: travertineNormal, size: travertineMetadata.tile_m },
  marble: { color: marbleColor, roughness: marbleRoughness, normal: marbleNormal, size: marbleMetadata.tile_m },
} satisfies Record<FinishTextureId, { color: string; roughness: string; normal: string; size: number }>;

export interface FinishTextureHandle {
  color: THREE.Texture;
  roughness: THREE.Texture;
  /** OpenGL tangent-space relief; bound only when `hasNormal()` after `ready`. */
  normal: THREE.Texture;
  /** Color and roughness loaded; false leaves the procedural appearance in use. The optional
   * normal map settles before this does but never decides it. */
  ready: Promise<boolean>;
  /** The normal map decoded too; stable once `ready` has settled. */
  hasNormal(): boolean;
  /** Metres covered by one image repeat along the surface U and V axes. */
  repeat: [number, number];
  release(): void;
}
type ImageSet = [HTMLImageElement, HTMLImageElement, HTMLImageElement | undefined];
interface TextureEntry {
  color: THREE.Texture;
  roughness: THREE.Texture;
  normal: THREE.Texture;
  normalLoaded: boolean;
  ready: Promise<boolean>;
  references: number;
  disposed: boolean;
}

// Only these catalog sets can enter the decoded-image cache. GPU textures
// have a separate lifetime and are released when their final projection leaves.
const decoded = new Map<FinishTextureId, Promise<ImageSet | undefined>>();
const textures = new Map<FinishTextureId, TextureEntry>();
const listeners = new Set<() => void>();
let notificationQueued = false;
// three clamps to the GPU limit at upload; 8 is a safe default until the renderer reports its maximum.
let anisotropy = 8;

/** Sets anisotropic filtering for every live and future finish texture, e.g. to
 * `renderer.capabilities.getMaxAnisotropy()`. */
export function setFinishTextureAnisotropy(value: number): void {
  const next = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
  if (next === anisotropy) return;
  anisotropy = next;
  for (const entry of textures.values()) {
    for (const map of [entry.color, entry.roughness, entry.normal]) {
      map.anisotropy = next;
      // Sampler state is applied on upload; textures without an image upload later anyway.
      if (map.image) map.needsUpdate = true;
    }
  }
}

export function subscribeFinishTextures(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifyReady(): void {
  if (notificationQueued) return;
  notificationQueued = true;
  // Material readiness handlers bind their uniforms before a demand-rendered
  // viewport is invalidated. Many wall segments still request just one frame.
  queueMicrotask(() => {
    notificationQueued = false;
    for (const listener of listeners) listener();
  });
}

function loadImage(url: string): Promise<HTMLImageElement | undefined> {
  if (typeof Image === 'undefined') return Promise.resolve(undefined);
  return new Promise(resolve => {
    try {
      const image = new Image();
      image.decoding = 'async';
      const settle = (result: HTMLImageElement | undefined) => {
        image.onload = null; image.onerror = null;
        resolve(result);
      };
      image.onload = () => settle(image);
      image.onerror = () => settle(undefined);
      image.src = url;
    } catch { resolve(undefined); }
  });
}

function loadImages(id: FinishTextureId): Promise<ImageSet | undefined> {
  const existing = decoded.get(id);
  if (existing) return existing;
  const source = sources[id];
  const pending = Promise.all([loadImage(source.color), loadImage(source.roughness), loadImage(source.normal)])
    .then(([color, roughness, normal]): ImageSet | undefined => {
      // A missing normal map only flattens the relief; it never withholds the finish.
      if (color && roughness) return [color, roughness, normal];
      if (decoded.get(id) === pending) decoded.delete(id);
      return undefined;
    });
  decoded.set(id, pending);
  return pending;
}

function texture(color: boolean): THREE.Texture {
  const map = new THREE.Texture();
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = anisotropy;
  return map;
}

export function acquireFinishTexture(id: FinishTextureId): FinishTextureHandle {
  let entry = textures.get(id);
  if (!entry) {
    const created: TextureEntry = {
      color: texture(true), roughness: texture(false), normal: texture(false), normalLoaded: false,
      references: 0, disposed: false, ready: Promise.resolve(false),
    };
    created.ready = loadImages(id).then(images => {
      if (!images || created.disposed) return false;
      created.color.image = images[0]; created.roughness.image = images[1];
      created.color.needsUpdate = true; created.roughness.needsUpdate = true;
      if (images[2]) {
        created.normal.image = images[2]; created.normal.needsUpdate = true;
        created.normalLoaded = true;
      }
      return true;
    });
    void created.ready.then(success => { if (success) notifyReady(); });
    textures.set(id, created);
    entry = created;
  }
  entry.references++;
  const acquired = entry;
  let released = false;
  return {
    color: entry.color, roughness: entry.roughness, normal: entry.normal, ready: entry.ready,
    hasNormal: () => acquired.normalLoaded && !acquired.disposed,
    repeat: [sources[id].size, sources[id].size],
    release() {
      if (released) return;
      released = true;
      if (--acquired.references > 0) return;
      acquired.disposed = true;
      acquired.color.dispose(); acquired.roughness.dispose(); acquired.normal.dispose();
      if (textures.get(id) === acquired) textures.delete(id);
    },
  };
}
