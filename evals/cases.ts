// Eval cases. Two sets: `real` (evals/real/cases.json), real apartment projects with a published plan and photos of
// the finished interior: the shell is traced from the plan, the designer furnishes it from the project's brief,
// the critic compares the result with the project's photos. `synthetic` (cases.json): buyer asks on our flat
// templates, one per skill branch, judged against matched real-room photos (evals/references).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Role = 'designer' | 'architect'

export interface EvalCase {
  id: string
  role: Role
  /** A flat template (apps/web/lib/flats/templates), or null for Pascal's empty default site (plan reads). */
  templateId: string | null
  /** The room the ask is about, for the critic. */
  room: string
  /** The skill the ask should make the agent load. */
  skill: string
  /** Buyer messages, one turn each, in one conversation. */
  turns: string[]
  /** Images sent with the first turn, relative to evals/. */
  images?: string[]
  /** What a good answer does, for the critic. */
  expect: string
  /** A traced shell (v1 flat spec, evals/real/shell.ts), relative to evals/; used instead of a template. */
  shell?: string
  /** The real project (evals/real/manifest.json) whose photos the critic compares the result with. */
  project?: string
  /** The rooms to judge (zone names): their facts and eye-level shots. Default: every room with furniture. */
  rooms?: string[]
  /** Real-room photos from evals/references the critic compares with (synthetic cases), relative to evals/. */
  references?: string[]
}

export type CaseSet = 'synthetic' | 'real'
export const CASE_FILES: Record<CaseSet, string> = { synthetic: 'cases.json', real: 'real/cases.json' }

export const EVALS_DIR = import.meta.dirname
export const TEMPLATE_IDS = ['sunday-b12121', 'orion-t7', 'orion-t8', 'm6-12-54']

/** Parse and check cases; throws on the first bad one so a typo fails before any turn is spent. */
export function parseCases(raw: unknown, baseDir = EVALS_DIR): EvalCase[] {
  if (!Array.isArray(raw)) throw new Error('cases must be an array')
  const seen = new Set<string>()
  return raw.map((c: Partial<EvalCase>, i) => {
    const where = `case ${i} (${c?.id ?? '?'})`
    if (!c || typeof c.id !== 'string' || !/^[a-z0-9-]+$/.test(c.id)) throw new Error(`${where}: id must be kebab-case`)
    if (seen.has(c.id)) throw new Error(`${where}: duplicate id`)
    seen.add(c.id)
    if (c.role !== 'designer' && c.role !== 'architect') throw new Error(`${where}: role must be designer or architect`)
    if (c.templateId !== null && !TEMPLATE_IDS.includes(c.templateId as string)) throw new Error(`${where}: unknown templateId`)
    if (!Array.isArray(c.turns) || !c.turns.length || c.turns.some((t) => typeof t !== 'string' || !t.trim())) {
      throw new Error(`${where}: turns must be non-empty strings`)
    }
    for (const key of ['room', 'skill', 'expect'] as const) {
      if (typeof c[key] !== 'string' || !c[key]) throw new Error(`${where}: ${key} is required`)
    }
    for (const image of [...(c.images ?? []), ...(c.references ?? [])]) {
      if (!existsSync(join(baseDir, image))) throw new Error(`${where}: image not found: ${image}`)
    }
    if (c.shell !== undefined) {
      if (c.templateId !== null) throw new Error(`${where}: a shell case has templateId null`)
      if (!existsSync(join(baseDir, c.shell))) throw new Error(`${where}: shell not found: ${c.shell}`)
    }
    return c as EvalCase
  })
}

export function loadCases(file = join(EVALS_DIR, CASE_FILES.synthetic)): EvalCase[] {
  return parseCases(JSON.parse(readFileSync(file, 'utf8')))
}

/** The cases to run: all, or the given ids in the given order (unknown ids throw). */
export function selectCases(cases: EvalCase[], ids: string[] | null): EvalCase[] {
  if (!ids?.length) return cases
  return ids.map((id) => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`unknown case: ${id} (known: ${cases.map((c) => c.id).join(', ')})`)
    return found
  })
}
