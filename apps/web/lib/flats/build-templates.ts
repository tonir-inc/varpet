// Rebuilds the flat templates from the v1 sources: templates/<id>.json (Pascal graphs) and templates/manifest.json.
// Run from the repo root: node apps/web/lib/flats/build-templates.ts
// Thumbnails (public/flats/<id>.png) are the v1 apartments' source.png, downscaled once with `sips -Z 640`.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { convertV1Scene, type V1Scene } from './convert.ts'

/** Order is the picker's order; the first is the default for new apartments. */
export const SOURCES: Array<{ id: string; name: string; note: string }> = [
  { id: 'sunday-b12121', name: 'Sunday Towers · B12121', note: 'Three bedrooms, four bathrooms, three balconies' },
  { id: 'orion-t7', name: 'Orion · Type 7', note: 'Three bedrooms, open living and kitchen' },
  { id: 'orion-t8', name: 'Orion · Type 8', note: 'Two bedrooms and a reading room' },
  { id: 'm6-12-54', name: 'M6-12-54', note: 'Two bedrooms, two balconies' },
]

export function buildTemplate(dir: string, id: string) {
  const scene = JSON.parse(readFileSync(join(dir, 'sources', `${id}.json`), 'utf8')) as V1Scene
  return convertV1Scene(scene)
}

if (import.meta.main) {
  const dir = import.meta.dirname
  const manifest = SOURCES.map(({ id, name, note }) => {
    const flat = buildTemplate(dir, id)
    writeFileSync(join(dir, 'templates', `${id}.json`), `${JSON.stringify(flat.graph)}\n`)
    return {
      id, name, note,
      area: flat.area,
      rooms: flat.rooms.length,
      bedrooms: flat.rooms.filter((room) => /bedroom/i.test(room.name)).length,
      thumbnail: `/flats/${id}.png`,
    }
  })
  writeFileSync(join(dir, 'templates', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(manifest.map((m) => `${m.id}: ${m.rooms} rooms, ${m.area} m²`).join('\n'))
}
