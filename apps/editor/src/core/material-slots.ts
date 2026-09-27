import type { CatalogAsset, ObjectPatch, SceneObject } from '../contracts';

const COLOR = /^#[0-9a-f]{6}$/i;
const COPY_SUFFIX = /\.\d{3}$/;

/** The slot role a glTF material belongs to: its exact name, or the name less a Blender `.001`-style copy suffix. */
export function materialSlotRole(slots: CatalogAsset['materialSlots'], materialName: string): string | undefined {
  if (!slots || !materialName) return undefined;
  const base = materialName.replace(COPY_SUFFIX, '');
  for (const [role, names] of Object.entries(slots)) if (names.includes(materialName) || names.includes(base)) return role;
  return undefined;
}

/** Per-role merge: a string sets the role, null removes it; returns undefined when no role is left. */
export function mergeMaterials(current: SceneObject['materials'], patch: Record<string, string | null>): SceneObject['materials'] {
  const next: Record<string, string> = { ...(current ?? {}) };
  for (const [role, value] of Object.entries(patch)) {
    if (value === null) delete next[role];
    else next[role] = value;
  }
  return Object.keys(next).length ? next : undefined;
}

/** An object with a patch applied: plain fields replace, `materials` merges per role. */
export function patchObject(object: SceneObject, patch: ObjectPatch): SceneObject {
  const { materials, ...rest } = patch;
  const next: SceneObject = { ...object, ...rest };
  if (materials) {
    const merged = mergeMaterials(object.materials, materials);
    if (merged) next.materials = merged; else delete next.materials;
  }
  return next;
}

/** Shape check for an update patch's `materials` (roles and colours are checked against the asset in the scene validation). */
export function materialPatchError(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Material patch must map roles to "#rrggbb" colours or null.';
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 32) return 'Material patch needs 1–32 roles.';
  for (const [role, colour] of entries) {
    if (!role.trim() || role.length > 60 || ['__proto__', 'prototype', 'constructor'].includes(role)) return `Material role “${role}” is not a valid name.`;
    if (colour !== null && (typeof colour !== 'string' || !COLOR.test(colour))) return `Material “${role}” needs a "#rrggbb" colour or null, not ${JSON.stringify(colour)}.`;
  }
  return undefined;
}

/** Catalog check: role -> non-empty list of glTF material names. */
export function materialSlotsValid(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.length <= 32 && entries.every(([role, names]) => role.trim().length > 0 && role.length <= 60
    && Array.isArray(names) && names.length > 0 && names.length <= 64 && names.every(name => typeof name === 'string' && name.length > 0 && name.length <= 200));
}

/** Scene check for one object's `materials` against its asset; returns an error message or undefined. */
export function objectMaterialsError(name: string, materials: unknown, asset: CatalogAsset | undefined): string | undefined {
  if (materials === undefined) return undefined;
  if (!materials || typeof materials !== 'object' || Array.isArray(materials)) return `“${name}” has invalid materials; use role -> "#rrggbb".`;
  const slots = asset?.materialSlots;
  for (const [role, colour] of Object.entries(materials)) {
    if (!slots || !Object.hasOwn(slots, role)) {
      const known = slots ? Object.keys(slots).join(', ') : '';
      return `“${name}” has no material slot “${role}”.${known ? ` Its slots: ${known}.` : ' Its model has no restylable slots.'}`;
    }
    if (typeof colour !== 'string' || !COLOR.test(colour)) return `“${name}” material “${role}” needs a "#rrggbb" colour.`;
  }
  return undefined;
}
