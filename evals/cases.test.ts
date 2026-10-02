import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { loadCases, parseCases, selectCases } from './cases.ts'

const ok = { id: 'a', role: 'designer', templateId: 'orion-t7', room: 'Bedroom 1', skill: 'furnish-room', turns: ['x'], expect: 'y' }

test('the shipped cases load, cover every skill, every template and both roles', () => {
  const cases = loadCases()
  assert.ok(cases.length >= 12)
  const skills = new Set(cases.map((c) => c.skill))
  for (const s of ['furnish-room', 'restyle', 'budget-and-quote', 'fit-and-swap', 'explain-layout', 'plan-to-shell']) assert.ok(skills.has(s), s)
  for (const t of ['sunday-b12121', 'orion-t7', 'orion-t8', 'm6-12-54']) assert.ok(cases.some((c) => c.templateId === t), t)
  assert.ok(cases.some((c) => c.role === 'architect' && c.images?.length))
})

test('bad cases fail before anything runs', () => {
  assert.throws(() => parseCases([{ ...ok, id: 'Bad Id' }]), /kebab-case/)
  assert.throws(() => parseCases([ok, ok]), /duplicate/)
  assert.throws(() => parseCases([{ ...ok, role: 'builder' }]), /role/)
  assert.throws(() => parseCases([{ ...ok, templateId: 'nowhere' }]), /templateId/)
  assert.throws(() => parseCases([{ ...ok, turns: [] }]), /turns/)
  assert.throws(() => parseCases([{ ...ok, images: ['fixtures/missing.png'] }]), /image not found/)
  assert.deepEqual(parseCases([{ ...ok, templateId: null }])[0]!.templateId, null)
})

test('a single case can be selected by id, unknown ids throw', () => {
  const cases = loadCases()
  assert.deepEqual(selectCases(cases, ['fit-sofa-m6']).map((c) => c.id), ['fit-sofa-m6'])
  assert.equal(selectCases(cases, null).length, cases.length)
  assert.throws(() => selectCases(cases, ['nope']), /unknown case/)
})
