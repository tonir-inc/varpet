import { strict as assert } from 'node:assert'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore } from '@pascal-app/mcp/storage'
import type { AgentEvent } from '../../contracts/src/index.ts'
import { agentPluginDirs, closeAgentSessions, runTurn, withSkills } from './index.ts'

const root = resolve(import.meta.dirname, '../../..')
after(() => closeAgentSessions(500))

test('each role loads its own plugin from the repo by default', () => {
  assert.deepEqual(agentPluginDirs('designer', root, {}), [join(root, 'agent-plugins', 'designer')])
  assert.deepEqual(agentPluginDirs('architect', root, {}), [join(root, 'agent-plugins', 'architect')])
  for (const role of ['designer', 'architect'] as const) {
    assert.ok(existsSync(join(root, 'agent-plugins', role, '.claude-plugin', 'plugin.json')))
  }
})

test('VARPET_AGENT_PLUGIN_DIR picks another folder, and off or empty turns skills off', () => {
  assert.deepEqual(agentPluginDirs('designer', root, { VARPET_AGENT_PLUGIN_DIR: 'off' }), [])
  assert.deepEqual(agentPluginDirs('designer', root, { VARPET_AGENT_PLUGIN_DIR: '' }), [])
  assert.deepEqual(agentPluginDirs('designer', root, { VARPET_AGENT_PLUGIN_DIR: tmpdir() }), [])
  assert.deepEqual(agentPluginDirs('designer', '/nowhere', { VARPET_AGENT_PLUGIN_DIR: join(root, 'agent-plugins') }), [
    join(root, 'agent-plugins', 'designer'),
  ])
})

test('withSkills adds the Skill tool and the plugin, turns slash commands on and bundled skills off', () => {
  const base = ['-p', '--tools', 'A,B', '--allowedTools', 'mcp__scene', '--disable-slash-commands', '--system-prompt', 'x']
  assert.deepEqual(withSkills(base, []), base)
  const args = withSkills(base, ['/p/designer'])
  const at = (flag: string) => args[args.indexOf(flag) + 1]
  assert.equal(at('--tools'), 'A,B,Skill')
  assert.equal(at('--allowedTools'), 'mcp__scene,Skill')
  assert.ok(!args.includes('--disable-slash-commands'))
  assert.deepEqual(JSON.parse(at('--settings')!), { disableBundledSkills: true })
  assert.equal(at('--plugin-dir'), '/p/designer')
  assert.equal(at('--system-prompt'), 'x')
  assert.equal(withSkills(['--tools', ''], ['/p'])[1], 'Skill')
})

test('a turn with skills off starts claude with the old flags', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'agents-skills-'))
  const dbPath = join(dataDir, 'pascal.db')
  const store = await createSceneStore({ PASCAL_DB_PATH: dbPath })
  const bridge = new SceneBridge()
  bridge.loadDefault()
  const { id: sceneId } = await store.save({ name: 'Flat', graph: bridge.exportJSON() })
  const env = {
    ...process.env,
    VARPET_DATA_DIR: dataDir,
    PASCAL_DB_PATH: dbPath,
    VARPET_CLAUDE_BIN: join(import.meta.dirname, 'testdata/fake-claude.mjs'),
    VARPET_AGENT_PLUGIN_DIR: 'off',
  }
  const events: AgentEvent[] = []
  for await (const event of runTurn('designer', { sceneId, message: 'a bed' }, { root, env })) events.push(event)
  const session = events[0] as Extract<AgentEvent, { type: 'session' }>
  const argv = JSON.parse(readFileSync(join(dataDir, 'agents', session.conversationId, 'argv.json'), 'utf8')) as string[]
  assert.ok(argv.includes('--disable-slash-commands'))
  assert.ok(!argv.includes('--plugin-dir'))
  assert.ok(!argv[argv.indexOf('--tools') + 1]!.includes('Skill'))
})
