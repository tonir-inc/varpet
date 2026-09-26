import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(here, '../..') + '/';
const GUARD = join(here, '../hooks/protect-contract.js');
const STOP = join(here, '../hooks/tests-on-stop.js');

function guard(ev) {
  const r = spawnSync('node', [GUARD], { input: JSON.stringify(ev), encoding: 'utf8' });
  const out = r.stdout ? JSON.parse(r.stdout) : {};
  return out.hookSpecificOutput?.permissionDecision === 'deny';
}
const patch = (body) => ({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n${body}\n*** End Patch` } });
const bash = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
const THIS = join(ROOT, 'tools/test/hooks.test.js');

test('contract files and dirs are denied, ordinary source is allowed', () => {
  assert.equal(guard(patch(`*** Update File: ${ROOT}tools/hooks/tests-on-stop.js\n@@\n+process.exit(0);`)), true);
  assert.equal(guard(patch(`*** Update File: ${ROOT}docs/CONSTITUTION.md\n@@\n+5. anything goes`)), true);
  assert.equal(guard({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: `${ROOT}.codex/config.toml`, content: '' } }), true);
  assert.equal(guard(bash('rm -rf fixtures')), true);
  assert.equal(guard(patch(`*** Update File: ${ROOT}packages/engine/src/index.ts\n@@\n+export const x = 1;`)), false);
});

test('a NEW test file may be added; an existing one may not be deleted, weakened or skipped', () => {
  assert.equal(guard(patch(`*** Add File: ${ROOT}packages/engine/test/brand-new.test.ts\n+import { test } from 'vitest';`)), false);
  assert.equal(guard(patch(`*** Delete File: ${THIS}`)), true);
  assert.equal(guard(patch(`*** Update File: ${THIS}\n@@\n-  assert.equal(1, 1);\n+  // gone`)), true);
  assert.equal(guard(patch(`*** Update File: ${THIS}\n@@\n+test.skip('later', () => {});`)), true);
});

test("any package's test/ folder is protected from removal, not only the ones listed by name", () => {
  assert.equal(guard(bash('rm -rf packages/designer/test')), true);
  assert.equal(guard(bash('rm -rf packages/designer/eval/scenarios')), true);
  assert.equal(guard(bash('rm -rf packages/designer/dist')), false);
});

test('the Stop check reports by default and blocks only when asked', () => {
  const empty = mkdtempSync(join(tmpdir(), 'varpet-stop-'));
  const run = (env) => spawnSync('node', [STOP], { input: '{}', encoding: 'utf8', env: { ...process.env, VARPET_ROOT: empty, ...env } });
  const report = JSON.parse(run({}).stdout);
  assert.match(report.systemMessage, /pnpm install/);
  assert.equal(report.decision, undefined);
  const blocked = JSON.parse(run({ VARPET_STOP_BLOCK: '1' }).stdout);
  assert.equal(blocked.decision, 'block');
});

test('a test file that is not committed yet (the agent\'s own draft) may be fixed; committed ones stay locked', () => {
  const draft = `${ROOT}packages/designer/test/draft-not-committed.test.ts`;
  assert.equal(guard(patch(`*** Update File: ${draft}\n@@\n-  expect(x).toBe(1);\n+  expect(x).toBe(2);`)), false);
  assert.equal(guard(patch(`*** Delete File: ${draft}`)), false);
  assert.equal(guard(patch(`*** Update File: ${THIS}\n@@\n-  assert.equal(1, 1);\n+  // gone`)), true);
});
