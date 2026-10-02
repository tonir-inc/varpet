// Server side: a template's Pascal graph, loaded on demand so a route only pulls the flat it needs.
import type { PascalGraph } from './convert'

const GRAPHS: Record<string, () => Promise<{ default: unknown }>> = {
  'sunday-b12121': () => import('./templates/sunday-b12121.json'),
  'orion-t7': () => import('./templates/orion-t7.json'),
  'orion-t8': () => import('./templates/orion-t8.json'),
  'm6-12-54': () => import('./templates/m6-12-54.json'),
}

/** A fresh copy of the template's graph, or null for an unknown id. */
export async function loadFlatTemplateGraph(id: string): Promise<PascalGraph | null> {
  const load = Object.hasOwn(GRAPHS, id) ? GRAPHS[id] : undefined
  if (!load) return null
  return structuredClone((await load()).default) as PascalGraph
}
