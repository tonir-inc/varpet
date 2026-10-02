// Render a stored scene or a flat template the way view_scene does, to JPEG files (a dev check of POST /api/render).
//   node --experimental-strip-types --no-warnings packages/scene-mcp/scripts/render-scene.ts \
//     (--scene <id> | --template sunday-b12121) [--zone zone_r-living] [--views 3d,top,inside] [--out dir] [--prefix name]
//     [--url http://localhost:3029/api/render]
// --scene reads PASCAL_DB_PATH. Prints one line per view: file, backend, render time.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createSceneStore } from '@pascal-app/mcp/storage'
import { httpRenderer, planView, type View } from '../src/view-scene.ts'

const ROOT = resolve(import.meta.dirname, '../../..')
const { values } = parseArgs({
  options: {
    scene: { type: 'string' },
    template: { type: 'string' },
    zone: { type: 'string' },
    views: { type: 'string', default: '3d,top,inside' },
    out: { type: 'string', default: '.' },
    prefix: { type: 'string', default: 'view' },
    url: { type: 'string', default: process.env.VARPET_RENDER_URL ?? 'http://localhost:3029/api/render' },
    width: { type: 'string', default: '1024' },
  },
})

let graph: { nodes: Record<string, never> }
if (values.scene) {
  const scene = await (await createSceneStore(process.env)).load(values.scene)
  if (!scene) throw new Error(`scene not found: ${values.scene}`)
  graph = scene.graph as typeof graph
} else if (values.template) {
  graph = JSON.parse(readFileSync(join(ROOT, 'apps/web/lib/flats/templates', `${values.template}.json`), 'utf8'))
} else throw new Error('--scene or --template is required')

const render = httpRenderer(values.url!, { token: process.env.VARPET_RENDER_TOKEN })
const width = Number(values.width)
const height = Math.round((width * 3) / 4)
mkdirSync(values.out!, { recursive: true })
for (const view of values.views!.split(',') as View[]) {
  const plan = planView(graph, { zoneId: values.zone, view, width, height })
  const started = Date.now()
  const result = await render({ ...plan.request, graph })
  const file = join(values.out!, `${values.prefix}-${view}.jpg`)
  writeFileSync(file, Buffer.from(result.image, 'base64'))
  console.log(
    `${file}  ${result.backend}  render ${result.renderMs} ms, queued ${result.queuedMs} ms, round trip ${Date.now() - started} ms` +
      `${result.cold ? ' (cold)' : ''}\n  ${plan.room}: ${plan.description}`,
  )
}
process.exit(0)
