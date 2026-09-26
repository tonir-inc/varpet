/** Contact sheet of the finish materials: scanned basecolor tiles where the editor has them, else the procedural look. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { MATERIALS, type MaterialInfo } from './finishes.ts';

const materialsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../catalog/materials');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function pattern(m: MaterialInfo, x: number, y: number, s: number): string {
  const { accent, pattern: kind, color } = m.preset, parts = [`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${color}"/>`];
  if (kind === 'tile') for (let i = 1; i < 3; i++) parts.push(`<line x1="${x + i * s / 3}" y1="${y}" x2="${x + i * s / 3}" y2="${y + s}" stroke="${accent}" stroke-width="2"/><line x1="${x}" y1="${y + i * s / 3}" x2="${x + s}" y2="${y + i * s / 3}" stroke="${accent}" stroke-width="2"/>`);
  if (kind === 'wood') for (let i = 1; i < 6; i++) parts.push(`<line x1="${x}" y1="${y + i * s / 6}" x2="${x + s}" y2="${y + i * s / 6}" stroke="${accent}" stroke-width="1.5"/>`);
  if (kind === 'terrazzo') for (let i = 0; i < 40; i++) parts.push(`<circle cx="${x + ((i * 37) % 100) / 100 * s}" cy="${y + ((i * 61) % 100) / 100 * s}" r="${2 + (i % 3)}" fill="${accent}"/>`);
  return parts.join('');
}

export async function swatchSheet(outPng: string): Promise<string> {
  const size = 150, gap = 16, cols = 4, labelH = 44, cell = size + labelH;
  const rows = Math.ceil(MATERIALS.length / cols), W = cols * (size + gap) + gap, H = rows * (cell + gap) + gap;
  const tiles = await Promise.all(MATERIALS.map(async (m, i) => {
    const x = gap + (i % cols) * (size + gap), y = gap + Math.floor(i / cols) * (cell + gap);
    // The scanned basecolor maps are neutral; the editor tints them by the material colour, so multiply here too.
    const fill = m.texture
      ? `<filter id="tint${i}" x="0" y="0" width="1" height="1"><feFlood flood-color="${m.color}" result="c"/><feBlend in="SourceGraphic" in2="c" mode="multiply"/></filter>`
        + `<image x="${x}" y="${y}" width="${size}" height="${size}" filter="url(#tint${i})" href="data:image/jpeg;base64,${(await readFile(resolve(materialsDir, m.texture, 'basecolor.jpg'))).toString('base64')}"/>`
      : pattern(m, x, y, size);
    return `${fill}<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="none" stroke="#33363a"/>`
      + `<text x="${x}" y="${y + size + 16}" font-size="13" font-weight="600" fill="#1f2328">${esc(m.id)} (${m.category})</text>`
      + `<text x="${x}" y="${y + size + 32}" font-size="11" fill="#5b6570">${esc(`${m.family} ${m.color}`)}</text>`;
  }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${tiles.join('')}</svg>`;
  await writeFile(outPng, new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
  return outPng;
}
