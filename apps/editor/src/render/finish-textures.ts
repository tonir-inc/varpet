import * as THREE from 'three';
import type { FinishPreset } from '../core/finish-presets';
import oakColor from '../../../../catalog/materials/oak/basecolor.jpg?url';
import oakRoughness from '../../../../catalog/materials/oak/roughness.jpg?url';
import oakMetadata from '../../../../catalog/materials/oak/material.json';
import walnutColor from '../../../../catalog/materials/walnut/basecolor.jpg?url';
import walnutRoughness from '../../../../catalog/materials/walnut/roughness.jpg?url';
import walnutMetadata from '../../../../catalog/materials/walnut/material.json';
import travertineColor from '../../../../catalog/materials/travertine/basecolor.jpg?url';
import travertineRoughness from '../../../../catalog/materials/travertine/roughness.jpg?url';
import travertineMetadata from '../../../../catalog/materials/travertine/material.json';
import marbleColor from '../../../../catalog/materials/marble-white-alt/basecolor.jpg?url';
import marbleRoughness from '../../../../catalog/materials/marble-white-alt/roughness.jpg?url';
import marbleMetadata from '../../../../catalog/materials/marble-white-alt/material.json';

type FinishTextureId = NonNullable<FinishPreset['texture']>;
const sources = {
  oak: { color: oakColor, roughness: oakRoughness, size: oakMetadata.tile_m },
  walnut: { color: walnutColor, roughness: walnutRoughness, size: walnutMetadata.tile_m },
  travertine: { color: travertineColor, roughness: travertineRoughness, size: travertineMetadata.tile_m },
  marble: { color: marbleColor, roughness: marbleRoughness, size: marbleMetadata.tile_m },
} satisfies Record<FinishTextureId, { color: string; roughness: string; size: number }>;

export interface FinishTextureHandle {
  color: THREE.Texture;
  roughness: THREE.Texture;
  /** Both maps loaded; false leaves the procedural appearance in use. */
  ready: Promise<boolean>;
  /** Metres covered by one image repeat along the surface U and V axes. */
  repeat: [number, number];
  release(): void;
}
type ImagePair = [HTMLImageElement, HTMLImageElement];
interface TextureEntry {
  color: THREE.Texture;
  roughness: THREE.Texture;
  ready: Promise<boolean>;
  references: number;
  disposed: boolean;
}

// Only these four catalog sets can enter the decoded-image cache. GPU textures
// have a separate lifetime and are released when their final projection leaves.
const decoded = new Map<FinishTextureId, Promise<ImagePair | undefined>>();
const textures = new Map<FinishTextureId, TextureEntry>();
const listeners = new Set<() => void>();
let notificationQueued = false;

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

function loadImages(id: FinishTextureId): Promise<ImagePair | undefined> {
  const existing = decoded.get(id);
  if (existing) return existing;
  const source = sources[id];
  const pending = Promise.all([loadImage(source.color), loadImage(source.roughness)])
    .then(([color, roughness]): ImagePair | undefined => {
      if (color && roughness) return [color, roughness];
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
  map.anisotropy = 4;
  return map;
}

export function acquireFinishTexture(id: FinishTextureId): FinishTextureHandle {
  let entry = textures.get(id);
  if (!entry) {
    const created: TextureEntry = {
      color: texture(true), roughness: texture(false), references: 0, disposed: false,
      ready: Promise.resolve(false),
    };
    created.ready = loadImages(id).then(images => {
      if (!images || created.disposed) return false;
      created.color.image = images[0]; created.roughness.image = images[1];
      created.color.needsUpdate = true; created.roughness.needsUpdate = true;
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
    color: entry.color, roughness: entry.roughness, ready: entry.ready,
    repeat: [sources[id].size, sources[id].size],
    release() {
      if (released) return;
      released = true;
      if (--acquired.references > 0) return;
      acquired.disposed = true;
      acquired.color.dispose(); acquired.roughness.dispose();
      if (textures.get(id) === acquired) textures.delete(id);
    },
  };
}
