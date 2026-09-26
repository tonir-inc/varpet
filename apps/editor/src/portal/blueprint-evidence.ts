import type { EvidenceSource, SceneDocument } from '../contracts';
import { migrateScene } from '../core/renovation';

// Exact originals must fit the existing 3 MB/source and 18 MB/project encoded evidence limits.
export const BLUEPRINT_FILE_LIMIT = 2_000_000;
export const BLUEPRINT_TOTAL_LIMIT = 12_000_000;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateBlueprintFile(file: File): void {
  if (!imageTypes.has(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (!file.size || file.size > BLUEPRINT_FILE_LIMIT) throw new Error(`${file.name} must be between 1 byte and 2 MB so your original can stay with the project.`);
}

/** Normalize plans before the image-only gate, transport and retained evidence boundary. */
export async function prepareBlueprintPlan(file: File): Promise<{file: File; note: string}> {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    validateBlueprintFile(file);
    return {file, note: ''};
  }
  if (file.size > 20_000_000) throw new Error('Choose a PDF up to 20 MB.');
  const unreadable = 'This PDF could not be read. Export the plan page as an image.';
  if (!file.size) throw new Error(unreadable);
  try {
    const { renderBlueprintPdf } = await import('./blueprint-pdf');
    return await renderBlueprintPdf(file);
  } catch {
    throw new Error(unreadable);
  }
}

/** The architect stores inputs in one directory; original camera filenames can collide. */
export function blueprintTransportFiles(plan: File, photos: File[]): {plan: File; photos: File[]} {
  const copy = (file: File, name: string) => {
    validateBlueprintFile(file);
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
    return new File([file], `${name}.${extension}`, {type: file.type, lastModified: file.lastModified});
  };
  return {plan: copy(plan, 'floor-plan'), photos: photos.map((file, i) => copy(file, `room-photo-${i + 1}`))};
}

/** Retain the bytes sent to the architect; presentation never replaces the original evidence. */
export async function retainBlueprintEvidence(scene: SceneDocument, plan: File, photos: File[]): Promise<SceneDocument> {
  const files = [plan, ...photos];
  files.forEach(validateBlueprintFile);
  if (photos.length > 10) throw new Error('Add up to 10 room photos.');
  if (files.reduce((sum, file) => sum + file.size, 0) > BLUEPRINT_TOTAL_LIMIT) throw new Error('Keep the plan and photos under 12 MB in total.');
  const sources = await Promise.all(files.map(async (file, i): Promise<EvidenceSource> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let j = 0; j < bytes.length; j += 0x8000) binary += String.fromCharCode(...bytes.subarray(j, j + 0x8000));
    return {id: crypto.randomUUID(), name: file.name.slice(0, 120), kind: i === 0 ? 'plan' : 'photo',
      dataUrl: `data:${file.type};base64,${btoa(binary)}`, notes: 'Original uploaded for this reconstruction. Kept unchanged for review.'};
  }));
  const result = migrateScene(scene);
  const retained = result.project!.sources;
  for (const source of sources) if (!retained.some(existing => existing.kind === source.kind && existing.dataUrl === source.dataUrl)) retained.push(source);
  if (retained.length > 32 || retained.reduce((sum, source) => sum + (source.dataUrl?.length ?? 0), 0) > 18_000_000)
    throw new Error('The reconstructed project has too much attached evidence. Use fewer photos and try again.');
  return result;
}
