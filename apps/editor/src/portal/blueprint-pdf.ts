import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { BLUEPRINT_FILE_LIMIT } from './blueprint-evidence';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Loaded only for PDF intake; the rest of the flow sees an ordinary image. */
export async function renderBlueprintPdf(file: File): Promise<{file: File; note: string}> {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), password: '' });
  const canvas = document.createElement('canvas');
  try {
    const pdf = await task.promise;
    if (pdf.numPages < 1) throw new Error('Empty PDF');
    const page = await pdf.getPage(1);
    const original = page.getViewport({ scale: 1 });
    let scale = 2400 / Math.max(original.width, original.height);
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid page size');
    const encode = (type: string, quality?: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image encoding failed')), type, quality);
    });
    for (let attempt = 0; attempt < 12; attempt++, scale *= 0.75) {
      const viewport = page.getViewport({ scale });
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;
      let blob = await encode('image/png');
      if (blob.size > BLUEPRINT_FILE_LIMIT) blob = await encode('image/jpeg', 0.85);
      if (blob.size > 0 && blob.size <= BLUEPRINT_FILE_LIMIT) {
        return {file: new File([blob], blob.type === 'image/jpeg' ? 'floor-plan.jpg' : 'floor-plan.png', {type: blob.type}),
          note: pdf.numPages > 1 ? `Used page 1 of ${pdf.numPages}` : ''};
      }
    }
    throw new Error('Image exceeds upload limit');
  } finally {
    canvas.width = canvas.height = 0;
    await task.destroy();
  }
}
