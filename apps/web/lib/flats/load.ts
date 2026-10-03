// Server side: a template's Pascal graph, loaded on demand so a route only pulls the flat it needs.
import type { PascalGraph } from './convert'

const GRAPHS: Record<string, () => Promise<{ default: unknown }>> = {
  'sunday-b12121': () => import('./templates/sunday-b12121.json'),
  'orion-t7': () => import('./templates/orion-t7.json'),
  'orion-t8': () => import('./templates/orion-t8.json'),
  'm6-12-54': () => import('./templates/m6-12-54.json'),
  'komitas-b3-t11': () => import('./templates/komitas-b3-t11.json'),
  'komitas-b3-t7': () => import('./templates/komitas-b3-t7.json'),
  'komitas-b3-t8': () => import('./templates/komitas-b3-t8.json'),
  'komitas-b3-t9': () => import('./templates/komitas-b3-t9.json'),
  'komitas-b3-t10': () => import('./templates/komitas-b3-t10.json'),
}

/** A fresh copy of the template's graph, or null for an unknown id. */
export async function loadFlatTemplateGraph(id: string): Promise<PascalGraph | null> {
  const load = Object.hasOwn(GRAPHS, id) ? GRAPHS[id] : undefined
  if (!load) return null
  return structuredClone((await load()).default) as PascalGraph
}
