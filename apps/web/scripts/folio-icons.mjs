// Pascal's tool and kind icons (public/pascal/icons/*.webp, lavender renders) redrawn as Folio ink line icons.
// Same file names, so Pascal's <Image src="/icons/<name>.webp"> picks them up with no code change.
// Run from apps/web after a Pascal upgrade: `node scripts/folio-icons.mjs`. New names fall back to a box and are listed.
import { readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as lucide from 'lucide-react'

const require = createRequire(import.meta.url)
// sharp ships with Next (image optimisation); resolve it from there instead of adding a dependency.
const sharp = createRequire(require.resolve('next/package.json'))('sharp')

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, '..', 'public', 'pascal', 'icons')
const INK = '#151515'
const SIZE = 64

// v1 Folio paths (apps/editor/src/ui/icons.ts) where v1 had the same idea.
const folio = {
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  top: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 12h18M13 3v9M8 12v9"/>',
  walls: '<path d="M3 20V5h18v15M3 13h8v7M15 5v8h6"/>',
  select: '<path d="m5 3 15 10-7 1-3 7Z"/>',
  rotate: '<path d="M20 10a8 8 0 1 0-1 7M20 3v7h-7"/>',
  scale: '<path d="M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  room: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 14h5M14 20v-5"/>',
  cube: '<path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10v10M3 7l9 5 9-5"/>',
  sofa: '<path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M5 18v3M19 18v3M5 12H3v6h18v-6h-2v3H5Z"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  wallLow: '<path d="M3 20v-8h18v8M3 16h18M9 12v4M15 16v4"/>',
  wallCut: '<path d="M3 20V5h18v15"/><path d="M9 20v-7h6v7" stroke-dasharray="2 2"/>',
}

/** Icon name → a v1 path key or lucide component names (first that exists wins). */
const MAP = {
  HVAC: ['AirVent'], appliance: ['Refrigerator'], bathroom: ['Bath'], blueprint: ['ScrollText'], 'box-vent': ['Fan'],
  build: ['Hammer'], building: ['Building2'], ceiling: ['PanelTop'], chimney: ['Factory'], collection: ['Library'],
  column: ['Columns3'], column1: ['Cylinder'], couch: 'sofa', cube: 'cube', cupola: ['Castle'],
  'custom-room': ['SquareDashed'], 'divide-room': ['SquareSplitHorizontal'], door: ['DoorOpen'], dormer: ['House'],
  downspout: ['ArrowDownToLine'], 'duct-fitting': ['Spline'], duct: ['Wind'], 'dwv-pipes': ['Waypoints'],
  elevator: ['ArrowUpDown'], environment: ['Trees'], 'eyebrow-vent': ['Waves'], fence: ['Fence'], floor: 'grid',
  floorplan: 'top', gutter: ['Droplets'], item: ['Package'], kitchen: ['CookingPot'], 'lean-to-extension': ['House'],
  level: 'layers', lineset: ['Cable'], measure: ['Ruler'], mesh: ['Shapes'], mezzanine: ['Rows3'], orbit: ['Orbit'],
  paint: ['Paintbrush'], pan: ['Hand'], 'polygon-room': ['Pentagon'], registers: ['Grid3x3'], resize: 'scale',
  'ridge-vent': ['Triangle'], roof: ['House'], room: 'room', rotate: 'rotate', scene: 'layers', select: 'select',
  settings: ['Settings'], shelf: ['Archive'], 'site-flag': ['Flag'], site: ['MapPin'], skylight: ['SunMedium'],
  'solar-panel': ['SolarPanel'], 'spawn-point': ['LocateFixed'], stairs: 'stairs', 'structural-grid': ['Grid3x3'],
  'terrain-flatten': ['Minus'], 'terrain-lower': ['ArrowDown'], 'terrain-raise': ['ArrowUp'], 'terrain-smooth': ['Waves'],
  topview: 'top', tree: ['TreeDeciduous'], 'turbine-vent': ['Fan'], wall: ['BrickWall'], wallcut: 'wallCut',
  walllow: 'wallLow', walls: 'walls', window: ['AppWindow'], zone: ['SquareDashed'],
}

function svgFor(name, fallbacks) {
  const spec = MAP[name] ?? (name.startsWith('pipe') || name.startsWith('duct') ? ['Spline'] : null)
  if (typeof spec === 'string') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${folio[spec]}</svg>`
  }
  const component = (spec ?? []).map((n) => lucide[n]).find(Boolean)
  if (!component) fallbacks.push(name)
  const markup = renderToStaticMarkup(createElement(component ?? lucide.Box, { size: SIZE, color: INK, strokeWidth: 1.6 }))
  return markup.includes('xmlns') ? markup : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
}

const fallbacks = []
const files = []
for (const sub of ['', 'fittings']) {
  for (const file of readdirSync(path.join(dir, sub))) if (file.endsWith('.webp')) files.push(path.join(sub, file))
}
for (const file of files) {
  const name = path.basename(file, '.webp')
  // Lucide draws in a 24 box with ~2px padding; pad a little more so the glyph sits like v1's 18px-in-24 icons.
  const svg = svgFor(name, fallbacks)
  const glyph = await sharp(Buffer.from(svg)).resize(52, 52).png().toBuffer()
  const out = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: glyph, gravity: 'center' }])
    .webp({ quality: 92, alphaQuality: 100 })
    .toBuffer()
  writeFileSync(path.join(dir, file), out)
}
// The one SVG Pascal loads directly.
writeFileSync(path.join(dir, 'spawn-point.svg'), svgFor('spawn-point', []).replace(`width="${SIZE}" height="${SIZE}" `, '') + '\n')
console.log(`${files.length} icons written${fallbacks.length ? `; no mapping, drawn as a box: ${fallbacks.join(', ')}` : ''}`)
