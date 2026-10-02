import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { CASE_FILES, EVALS_DIR, loadCases } from './cases.ts'
import { CRITERIA, CRITIC_SCHEMA, agentShots, criticInput, realImages, scoreOf } from './critic.ts'
import { cachedImages, loadProjects } from './real/fetch.ts'
import type { CaseSummary } from './summary.ts'

const summary = { turnsDone: 1, answers: ['done'], errors: [], skillsLoaded: [], skillsUsed: [], toolCount: 0, toolErrors: 0, room: null, added: [], removed: [], finishes: [], totalAmd: 0, structure: null, trace: [[]] } as CaseSummary

test('the schema asks for every rubric criterion with a reason, plus overall and issues', () => {
  assert.deepEqual(CRITIC_SCHEMA.required, [...CRITERIA, 'overall', 'issues'])
  assert.equal(scoreOf({ layering: { score: 2, reason: 'bare walls' } }, 'layering'), 2)
  assert.equal(scoreOf({ fills: 4 }, 'fills'), 4)
  assert.equal(scoreOf({ light: { score: null, reason: 'n/a' } }, 'light'), null)
})

test('synthetic cases carry matched real-room photos that exist', () => {
  const cases = loadCases()
  const furnishing = cases.filter((c) => ['furnish-room', 'restyle', 'budget-and-quote'].includes(c.skill))
  for (const c of furnishing) assert.ok((c.references?.length ?? 0) >= 2, c.id)
  for (const c of cases) for (const file of c.references ?? []) assert.ok(existsSync(join(EVALS_DIR, file)), file)
})

test('the critic sees references, then the agent renders in order, and the room facts', () => {
  const c = loadCases().find((x) => x.id === 'furnish-living-sunday')!
  const dir = mkdtempSync(join(tmpdir(), 'critic-'))
  for (const f of ['shot-3d.png', 'shot-top.png', 'shot-eye-living-room.jpg']) writeFileSync(join(dir, f), '')
  const input = criticInput(c, summary, [{ room: 'Living room' } as never], dir)
  assert.equal(input.images.length, c.references!.length + 3)
  assert.match(input.images[0]!.label, /real room/)
  assert.deepEqual(agentShots(dir).map((s) => s.label.replace(/.*, /, '')), ['top view of the whole flat', '3/4 view of the whole flat', 'eye-level view of living room'])
  assert.match(input.text, /Room facts/)
  assert.match(input.text, /"room":"Living room"/)
})

test('real cases name a manifest project and its traced shell; cached photos reach the critic', () => {
  const projects = loadProjects()
  for (const c of loadCases(join(EVALS_DIR, CASE_FILES.real))) {
    const project = projects.find((p) => p.id === c.project)
    assert.ok(project, `${c.id}: project ${c.project}`)
    assert.ok(project!.photos.length >= 4 && project!.plan.url, c.id)
    if (!cachedImages(project!).photos.length) continue // not fetched here (evals/real/fetch.ts)
    const { images, text } = realImages(c)
    assert.match(images[0]!.label, /plan/)
    assert.match(text, new RegExp(project!.designer.split(' ')[0]!))
  }
})
