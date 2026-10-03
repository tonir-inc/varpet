import { strict as assert } from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore } from '@pascal-app/mcp/storage'

test('concurrent saves on one store do not nest transactions', async () => {
  const store = await createSceneStore({ PASCAL_DB_PATH: join(mkdtempSync(join(tmpdir(), 'store-')), 'pascal.db') })
  const bridge = new SceneBridge()
  bridge.loadDefault()
  const graph = bridge.exportJSON()
  const saved = await Promise.all(Array.from({ length: 8 }, (_, i) => store.save({ name: `Flat ${i}`, graph })))
  assert.equal(new Set(saved.map((meta) => meta.id)).size, 8)
})
