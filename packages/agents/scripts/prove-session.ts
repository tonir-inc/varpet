// Proof of the long-lived session: two short read-only designer turns in one conversation (spends Felix's
// subscription). Prints per turn: time to the first event after session (system/init), to the first words, total,
// the claude pid, and the result's usage. The second turn should reuse the pid and read from the prompt cache.
// Run: VARPET_DATA_DIR=.data/prove-session node packages/agents/scripts/seed-bedroom.ts   (prints the scene URL)
//      VARPET_DATA_DIR=.data/prove-session node packages/agents/scripts/prove-session.ts <sceneId>
import { appendFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { closeAgentSessions, liveAgentSessions, runTurn } from '../src/index.ts'

const root = resolve(import.meta.dirname, '../../..')
const sceneId = process.argv[2]
if (!sceneId) throw new Error('usage: prove-session.ts <sceneId>')
const dataDir = resolve(process.env.VARPET_DATA_DIR ?? join(root, '.data/prove-session'))
const env = { ...process.env, VARPET_DATA_DIR: dataDir, PASCAL_DB_PATH: process.env.PASCAL_DB_PATH ?? join(dataDir, 'pascal.db') }
const rawPath = join(dataDir, `session-${sceneId}.ndjson`)
writeFileSync(rawPath, '')

const messages = [
  'In one sentence: how big is the bedroom? Read the scene only; do not change anything.',
  'In one sentence: which wall has the door? Do not change anything.',
]
let conversationId: string | undefined
for (const [i, message] of messages.entries()) {
  const t0 = Date.now()
  const at: Record<string, number> = {}
  let usage: unknown = null
  let last: unknown = null
  const onRawLine = (line: string) => {
    appendFileSync(rawPath, `${line}\n`)
    const parsed = JSON.parse(line)
    if (parsed.type === 'result') usage = parsed.usage
  }
  for await (const event of runTurn('designer', { sceneId, message, ...(conversationId ? { conversationId } : {}) }, { root, env, onRawLine })) {
    if (event.type === 'session') conversationId = event.conversationId
    if (event.type !== 'session') at.firstEvent ??= Date.now() - t0
    if (event.type === 'message_delta') at.firstWords ??= Date.now() - t0
    if (event.type === 'tool' && event.status === 'running') console.log(`  tool ${event.name}`)
    last = event
  }
  const pid = liveAgentSessions().find((p) => p.conversationId === conversationId)?.pid
  console.log(JSON.stringify({ turn: i + 1, pid, firstEventMs: at.firstEvent, firstWordsMs: at.firstWords, totalMs: Date.now() - t0, last, usage }))
}
console.log(`# raw stream-json: ${rawPath}`)
await closeAgentSessions()
