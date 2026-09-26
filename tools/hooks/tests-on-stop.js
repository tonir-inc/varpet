#!/usr/bin/env node
// Stop hook, same JSON contract for Claude Code and Codex: when a turn ends, run the workspace tests and
// check that the enforcers (tools/hooks, .codex, .claude) have no uncommitted changes.
//
// REPORT mode by default: the result is shown, the turn still ends. Several agents share one working tree
// here, so a blocking hook would let one agent's half-done work (a red test in its lane) stop every other
// agent's turn. VARPET_STOP_BLOCK=1 makes it BLOCK instead (fail closed: a turn cannot end red); a person
// releases one blocked turn with VARPET_STOP_OVERRIDE="<name>: <reason>".
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.VARPET_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const blockMode = process.env.VARPET_STOP_BLOCK === '1';

// pnpm lives next to the node that runs this hook when node comes from nvm; fall back to PATH
const nextToNode = join(dirname(process.execPath), 'pnpm');
const pnpm = existsSync(nextToNode) ? nextToNode : 'pnpm';

let raw = '';
process.stdin.on('data', (d) => (raw += d)).on('end', () => {
  let ev = {};
  try { ev = JSON.parse(raw || '{}'); } catch { ev = {}; }
  const done = (msg) => { if (msg) process.stdout.write(JSON.stringify({ systemMessage: msg })); process.exit(0); };
  const fail = (msg) => {
    if (!blockMode) done(`Stop check (report only): ${msg}`);
    if (process.env.VARPET_STOP_OVERRIDE) { process.stderr.write(`Stop hook released by a person: ${process.env.VARPET_STOP_OVERRIDE}\n`); done(`Released unverified: ${msg}`); }
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `${msg}${ev.stop_hook_active ? ' (blocked again; a person can interrupt or set VARPET_STOP_OVERRIDE)' : ''}` }));
    process.exit(0);
  };

  const problems = [];
  if (!existsSync(join(root, 'node_modules'))) problems.push('node_modules missing: run `pnpm install` at the repository root; the tests could not run.');
  else {
    const r = spawnSync(pnpm, ['-r', '--if-present', 'test'], { cwd: root, encoding: 'utf8', timeout: 180000 });
    if (r.error) problems.push(`could not run pnpm (${r.error.code || r.error.message}); the tests are not proven.`);
    else if (r.status !== 0) {
      const out = `${r.stdout || ''}\n${r.stderr || ''}`;
      const lines = out.split('\n').filter((l) => /FAIL|✗|×|failed|Error/.test(l)).slice(0, 8).join('\n');
      problems.push(`pnpm test failed (exit ${r.status}):\n${lines}`);
    }
  }
  const g = spawnSync('git', ['-C', root, 'status', '--porcelain', '--', 'tools/hooks', '.codex', '.claude'], { encoding: 'utf8', timeout: 20000 });
  if (g.status === 0 && g.stdout.trim()) problems.push(`the hooks or agent config changed and are not committed:\n${g.stdout.trim()}\nA person reviews and commits enforcer changes.`);

  if (problems.length) fail(problems.join('\n'));
  done();
});
