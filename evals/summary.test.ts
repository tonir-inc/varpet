import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { summarize } from './summary.ts'

const room = { id: 'a', role: 'designer' as const, templateId: 'orion-t7', room: 'Bedroom 1', skill: 'furnish-room', turns: ['x'], expect: 'y' }
const zone = { type: 'zone', name: 'Bedroom 1', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] }
const wall = { type: 'wall', name: 'w1', slots: { interior: 'library:preset-softwhite' } }

test('summarize lists added products in their room, finishes changed, skills used and the total', () => {
  const base = { nodes: { z: zone, w: wall } }
  const proposal = {
    nodes: {
      z: zone,
      w: { ...wall, slots: { interior: 'library:varpet-paint-emerald' } },
      i: { type: 'item', asset: { name: 'Bed', dimensions: [1.6, 1, 2.1] }, position: [2, 0, 1.5], rotation: [0, Math.PI, 0], metadata: { productId: 'p1', priceAmd: 300000 } },
    },
  }
  const raw = [
    { type: 'system', subtype: 'init', skills: ['designer:furnish-room', 'design'] },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'designer:furnish-room' } }] } },
  ]
  const events = [
    { type: 'tool', id: 't1', name: 'place_product', input: {}, status: 'running' },
    { type: 'tool', id: 't1', name: 'place_product', input: null, status: 'error', summary: 'version mismatch' },
    { type: 'message_delta', text: 'Done.' },
  ] as never
  const s = summarize(room, [{ message: 'x', events, raw }], base, proposal, 1)
  assert.deepEqual(s.added.map((i) => [i.name, i.room, i.rotationDeg]), [['Bed', 'Bedroom 1', 180]])
  assert.deepEqual(s.finishes, [{ target: 'wall w1 interior', ref: 'library:varpet-paint-emerald' }])
  assert.deepEqual(s.skillsLoaded, ['designer:furnish-room'])
  assert.deepEqual(s.skillsUsed, ['designer:furnish-room'])
  assert.equal(s.totalAmd, 300000)
  assert.equal(s.toolErrors, 1)
  assert.equal(s.answers[0], 'Done.')
  assert.equal(s.room?.area, 12)
})
