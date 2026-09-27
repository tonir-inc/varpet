import type { EvidenceSource, SceneDocument } from '../contracts';
import { migrateScene } from '../core/renovation';

// Metadata-free images must fit the existing 3 MB/source and 18 MB/project encoded evidence limits.
export const BLUEPRINT_FILE_LIMIT = 2_000_000;
export const BLUEPRINT_TOTAL_LIMIT = 12_000_000;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateBlueprintFile(file: File): void {
  if (!imageTypes.has(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (!file.size || file.size > BLUEPRINT_FILE_LIMIT) throw new Error(`${file.name} must be between 1 byte and 2 MB so the image can stay with the project.`);
}

/** Apply camera orientation and export pixels only, before transport or evidence retention. */
export async function prepareBlueprintImage(file: File): Promise<File> {
  validateBlueprintFile(file);
  const bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
  const canvas = document.createElement('canvas');
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    for (let attempt = 0, scale = 1; attempt < 12; attempt++, scale *= .75) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image encoding failed')),
          file.type, file.type === 'image/png' ? undefined : .92);
      });
      if (blob.type !== file.type) throw new Error('This browser cannot encode this image format. Try a JPG or PNG.');
      if (blob.size > 0 && blob.size <= BLUEPRINT_FILE_LIMIT)
        return new File([blob], file.name, {type: blob.type});
    }
    throw new Error('This image is too large after resizing. Try a smaller image.');
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}

/** Normalize plans before the image-only gate, transport and retained evidence boundary. */
export async function prepareBlueprintPlan(file: File): Promise<{file: File; note: string}> {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    return {file: await prepareBlueprintImage(file), note: ''};
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

/** Prepared images only. The architect stores inputs in one directory; camera filenames can collide. */
export function blueprintTransportFiles(plan: File, photos: File[]): {plan: File; photos: File[]} {
  const copy = (file: File, name: string) => {
    validateBlueprintFile(file);
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
    return new File([file], `${name}.${extension}`, {type: file.type, lastModified: file.lastModified});
  };
  return {plan: copy(plan, 'floor-plan'), photos: photos.map((file, i) => copy(file, `room-photo-${i + 1}`))};
}

/** Retain the prepared, metadata-free bytes sent to the architect, before presentation tracing. */
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
      dataUrl: `data:${file.type};base64,${btoa(binary)}`, notes: 'Uploaded for this reconstruction. Image metadata removed; retained for review.'};
  }));
  const result = migrateScene(scene);
  const retained = result.project!.sources;
  for (const source of sources) if (!retained.some(existing => existing.kind === source.kind && existing.dataUrl === source.dataUrl)) retained.push(source);
  if (retained.length > 32 || retained.reduce((sum, source) => sum + (source.dataUrl?.length ?? 0), 0) > 18_000_000)
    throw new Error('The reconstructed project has too much attached evidence. Use fewer photos and try again.');
  return result;
}
