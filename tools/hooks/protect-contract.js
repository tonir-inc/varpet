#!/usr/bin/env node
// PreToolUse hook, same JSON contract for Claude Code and Codex.
// Denies edits that change the CONTRACT to make a task pass: the schema, the fixtures, the
// constitution, AGENTS.md, the checks' source, the hooks themselves and their config, and the removal
// or weakening of existing tests. Adding tests and extending checks is allowed.
//
// WHAT THIS IS AND IS NOT (four independent review rounds, 19-20 Sept 2026): a hook that reads command
// TEXT is a speed bump, not a boundary. It catches the plain forms, the canonical-path tricks, quoting,
// variables it can see, `bash -c`/`eval`/`xargs`, symlinks it can see and git rewrites; a determined
// agent can still reach the filesystem some other way. The rest of the setup is GUARDRAILS A PERSON
// SUPERVISES, not a boundary either: `tools/lock-contract.sh` sets the OS immutable flag on the contract
// files (the agent runs as the file owner, so it could clear it; this hook denies the plain form and the
// act would be visible), and the Stop hook refuses to end a turn while the hooks differ from the committed
// version or a suite fails. The record that cannot be argued with is git: every enforcer change shows up.
//
// Measured 2026-09-19 (codex-cli 0.154): Codex sends tool_name "Bash" with tool_input.command, and
// tool_name "apply_patch" with tool_input.command holding the WHOLE patch (absolute paths, no file_path).
// Claude Code sends Edit/Write/MultiEdit with file_path. Both shapes are handled below.
// stdin: { tool_name, tool_input, ... }   deny: hookSpecificOutput.permissionDecision = "deny"
import { posix, dirname, resolve } from 'node:path';
import { statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// varpet (26 Sept): add the scene schema's file here once it is decided (packages/engine).
const CONTRACT_FILES = ['docs/CONSTITUTION.md', 'AGENTS.md', 'CLAUDE.md'];
const CONTRACT_DIRS = ['fixtures', 'tools/hooks', '.codex', '.claude'];
const TEST_DIRS = ['packages/engine/test', 'packages/agent-tools/test', 'apps/editor/test', 'tools/test'];
const CHECKS_FILE = ''; // varpet: the engine's checks source once it exists; removing a check from it is denied
const exists = (c) => existsSync(resolve(REPO, c));
const TEST_HOMES = []; // directories that HOLD test files among sources: the files count individually, the directory as a whole is protected from removal
const SKIP_MARK = /\.(skip|only)\(|\bxit\(|\bxtest\(/;
const TAUTOLOGY = /assert(?:\.ok)?\(\s*(?:true|1|-?\d+|'[^']*'|"[^"]*")\s*[,)]|assert\.(?:equal|strictEqual|deepEqual|deepStrictEqual|notEqual)\(\s*([^,()]+?)\s*,\s*\1\s*[,)]|expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/;
const WRITE_API = /writeFile|writeFileSync|unlink|unlinkSync|rmSync|\brm\(|renameSync|rename\(|appendFile|truncate|open\([^)]*['"][wa]|shutil\.|os\.remove|os\.rename|\.write_text\(|\.unlink\(|copyFile|symlink/;
const DATA_VERBS = /^(echo|printf|grep|rg|awk|cat|less|more|head|tail|wc|sort|uniq|cut|tr|diff|file|stat|ls|find|test|\[|true|false|node|python3?)$/; // their quoted arguments are data, not commands (node/python only when not -e/-c, handled below)
const SHELL_VERBS = /^(bash|sh|zsh|dash|eval|source|\.|xargs|exec|command|nohup|time|caffeinate|env|sudo|timeout|gtimeout|watch)$/;

/** A path token as it stands in the repository: quotes off, ./ and ../ resolved, the repo root stripped. */
function canon(p, cwd = '') {
  let s = String(p || '').replace(/['"`]/g, '');
  if (!s) return '';
  if (!s.startsWith('/') && !s.startsWith('~') && cwd) s = posix.join(cwd, s);
  s = posix.normalize(s);
  if (s.startsWith(REPO + '/')) s = s.slice(REPO.length + 1);
  else if (s === REPO) s = '.';
  else if (s.startsWith('/') || s.startsWith('~')) return `/outside${s}`; // another root: not our contract (review round 4: a temp copy's schema.md was denied)
  return s.replace(/^\.\//, '').replace(/\/$/, '');
}
const under = (c, d) => c === d || c.startsWith(`${d}/`);
const isTestFile = (c) => /\.(test|spec)\.(js|mjs|ts|tsx)$/.test(c);
const isTestDir = (c) => TEST_DIRS.some((d) => under(c, d)) || /^(packages|apps)\/[^/]+\/(test|eval)(\/|$)/.test(c); // every package's test/ and eval/
const ancestorOf = (c, target) => c === '' || c === '.' || c === target || target.startsWith(`${c}/`);
/** What a path is, if it is protected. `mutation` = the whole path is removed, moved or overwritten (rm, mv, redirect). */
function classify(p, cwd = '', mutation = false) {
  const c = canon(p, cwd);
  if (c.startsWith('/outside')) return null;
  if (!c && !mutation) return null;
  if (CONTRACT_FILES.includes(c)) return c;
  const d = CONTRACT_DIRS.find((x) => under(c, x)); if (d) return `${d}/`;
  if (isTestFile(c)) return `a test file (${c})`;
  if (isTestDir(c)) return `a test directory (${c})`;
  if (mutation) {
    const all = [...CONTRACT_FILES, ...CONTRACT_DIRS, ...TEST_DIRS, ...TEST_HOMES];
    const inside = all.find((t) => ancestorOf(c, t)); if (inside) return `a directory containing ${inside}`;
    if (TEST_HOMES.some((h) => under(c, h)) && /test/.test(c)) return `test files under ${c}`;
  }
  if (/[*?[]/.test(c)) { const dir = canon(posix.dirname(c)); if (isTestDir(dir) || CONTRACT_DIRS.some((x) => under(dir, x))) return `a pattern under ${dir}`; if (TEST_HOMES.includes(dir) && /test/.test(c)) return `test files under ${dir}`; }
  return null;
}
/** Split a segment into shell words, keeping quoted strings whole (quotes retained for later inspection). */
function tokenize(seg) {
  const out = []; let cur = ''; let q = null;
  for (const ch of seg) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (/\s/.test(ch)) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function isDir(c) { try { return statSync(resolve(REPO, c)).isDirectory(); } catch { return false; } }
/** Split a command on ; && || | and newlines that are not inside single or double quotes. */
function splitOutsideQuotes(text) {
  const out = []; let cur = ''; let q = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === ';' || ch === '\n' || ch === '|' || (ch === '&' && text[i + 1] === '&')) { if (ch === '&') i++; if (text[i + 1] === '|') i++; if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const count = (s, re) => (String(s || '').match(re) || []).length;
const TEST_CALL = /\btest\(/g, CHECK_FN = /export function check[A-Z]\w*/g;

let raw = '';
process.stdin.on('data', (d) => (raw += d)).on('end', () => {
  let ev = {};
  try { ev = JSON.parse(raw || '{}'); } catch { ev = {}; }
  const tool = String(ev.tool_name || '');
  const input = ev.tool_input || {};
  const deny = (why) => {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${why} If the contract itself is wrong, say so and stop; do not change it to make a task pass. (varpet protect-contract hook)` } }));
    process.exit(0);
  };
  /** A change to a test file or the checks file: existing assertions are a person's to change (rule 3); adding is free. */
  const judgeText = (label, file, removed, added) => {
    const c = canon(file);
    if (isTestFile(c)) {
      if (count(added, TEST_CALL) < count(removed, TEST_CALL)) deny(`${label} removes a test from "${c}".`);
      if (/\bassert\b/.test(String(removed || ''))) deny(`${label} changes or removes an existing assertion in "${c}"; existing tests are the contract, a person changes them in a reviewed commit. Add a new test instead.`);
      if (TAUTOLOGY.test(added)) deny(`${label} adds an assertion that cannot fail to "${c}".`);
      if (SKIP_MARK.test(added)) deny(`${label} adds a skip/only marker to "${c}".`);
    }
    if (CHECKS_FILE && c === CHECKS_FILE && count(added, CHECK_FN) < count(removed, CHECK_FN)) deny(`${label} removes a check from "${c}".`);
  };

  // ---- Claude Code style edits: file_path + content / old_string / new_string / edits[] ----
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/i.test(tool)) {
    const file = String(input.file_path || input.path || '');
    const hit = classify(file);
    if (hit && !/^a test/.test(hit)) deny(`"${hit}" is part of the contract (schema, fixtures, constitution, AGENTS.md, the checks, the hooks and their config).`);
    if (isTestFile(canon(file))) {
      const edits = Array.isArray(input.edits) ? input.edits : [{ old_string: input.old_string, new_string: input.new_string }];
      for (const e of edits) judgeText('This edit', file, e.old_string, e.new_string);
      if (input.content !== undefined) { if (SKIP_MARK.test(String(input.content))) deny(`This write adds a skip/only marker to "${canon(file)}".`); if (TAUTOLOGY.test(String(input.content))) deny(`This write adds an assertion that cannot fail to "${canon(file)}".`); if (/^Write$/i.test(tool) && exists(canon(file))) deny(`This write replaces the whole test file "${canon(file)}"; add tests with an edit, or let a person review the rewrite.`); }
    }
    process.exit(0);
  }

  // ---- Codex apply_patch: the patch text is in tool_input.command (or input/patch) ----
  if (/^apply_patch$/i.test(tool)) {
    const patch = String(input.command || input.patch || input.input || JSON.stringify(input));
    const files = [...patch.matchAll(/^\*\*\* (Add|Update|Delete|Move to) ?File: (.+)$/gm)].map((m) => ({ verb: m[1], path: m[2].trim(), index: m.index }));
    for (let k = 0; k < files.length; k++) {
      const f = files[k]; const c = canon(f.path); const hit = classify(f.path, '', f.verb !== 'Update');
      if (hit && !/^a test/.test(hit)) deny(`"${hit}" is part of the contract (schema, fixtures, constitution, AGENTS.md, the checks, the hooks and their config); the patch touches ${c}.`);
      // a NEW test file may be added (varpet starts with no tests); deleting, moving or re-adding an existing one is denied
      if (isTestFile(c) && (f.verb === 'Delete' || f.verb === 'Move to' || (f.verb === 'Add' && exists(c)))) deny(`This patch ${f.verb.toLowerCase()}s the test file "${c}".`);
      if (f.verb === 'Update' && (isTestFile(c) || (CHECKS_FILE && c === CHECKS_FILE))) {
        const hunk = patch.slice(f.index, k + 1 < files.length ? files[k + 1].index : undefined);
        const removed = hunk.split('\n').filter((l) => l.startsWith('-')).join('\n');
        const added = hunk.split('\n').filter((l) => l.startsWith('+')).join('\n');
        judgeText('This patch', f.path, removed, added);
      }
    }
    if (!files.length) { const m = /(CONSTITUTION\.md|AGENTS\.md|CLAUDE\.md|tools\/hooks|\.codex\/|\.claude\/|fixtures\/)/.exec(patch); if (m) deny(`This patch mentions "${m[1]}", which is part of the contract, and names no file the hook can check.`); }
    process.exit(0);
  }

  // ---- shell commands (Codex and Claude Code both send "Bash") ----
  if (/^(Bash|shell|exec_command)$/i.test(tool)) {
    const cmd = String(input.command || input.cmd || '');
    if (!cmd) process.exit(0);
    const vars = new Map();
    const expand = (t) => t.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (m, n) => (vars.has(n) ? vars.get(n) : m));
    const analyse = (text, cwd) => {
      const segments = splitOutsideQuotes(text);
      for (const seg of segments) {
        const rawTokens = tokenize(seg);
        const tokens = rawTokens.map((t) => expand(t.replace(/['"`]/g, '')));
        if (!tokens.length) continue;
        let i = 0;
        // leading wrappers and assignments
        while (i < tokens.length && /^(sudo|env|command|nohup|time|caffeinate|timeout|gtimeout)$/.test(tokens[i])) i++;
        while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) { const [n, ...v] = tokens[i].split('='); vars.set(n, canon(v.join('='), cwd)); i++; }
        const verb = tokens[i] || ''; const args = tokens.slice(i + 1);
        if (!verb) continue;
        if (verb === 'cd') { cwd = args[0] ? canon(args[0], cwd) : ''; continue; }
        const argHit = (list, mutation = false) => { for (const a of list) { if (a.startsWith('-')) continue; const h = classify(a, cwd, mutation); if (h) return { a, h }; } return null; };
        // a shell running inline text, or xargs feeding a verb: judge the inner command
        if (/^(bash|sh|zsh|dash)$/.test(verb) && args.some((a) => a === '-c')) { analyse(args.slice(args.indexOf('-c') + 1).join(' '), cwd); continue; }
        if (verb === 'eval' || verb === 'source' || verb === '.') { analyse(args.join(' '), cwd); continue; }
        if (verb === 'xargs') { const inner = args.filter((a) => !a.startsWith('-')); if (inner.length && /^(rm|mv|cp|unlink|shred|truncate|chmod|sed|perl|git|tee|ln)$/.test(inner[0])) { const t = argHit(text.split(/[\s'"`;|&()]+/), true); if (t) deny(`This command feeds ${t.h} to "xargs ${inner[0]}".`); } continue; }
        // redirects: judged by the TARGET token that follows > or >> outside quotes (a quoted 'cat > x' inside printf is data)
        for (let k = 0; k < rawTokens.length; k++) {
          const t = rawTokens[k]; if (t.startsWith("'") || t.startsWith('"')) continue;
          let target = null;
          if (/^\d?>>?$/.test(t)) target = rawTokens[k + 1]; else { const m = /^\d?>>?(.+)$/.exec(t); if (m) target = m[1]; }
          if (!target) continue;
          const h = classify(expand(target.replace(/['"`]/g, '')), cwd, true); if (h) deny(`This shell command redirects output into ${h}.`);
        }
        if (verb === 'tee') { const t = argHit(args, true); if (t) deny(`This shell command writes through tee into ${t.h}.`); }
        // destructive or in-place verbs: their TARGETS
        if (/^(rm|unlink|rmdir|shred|truncate|chmod|chattr|chflags)$/.test(verb)) { const t = argHit(args, true); if (t) deny(`This shell command ("${verb}") writes to or deletes ${t.h}.`); }
        if (verb === 'mv') { const t = argHit(args, true); if (t) deny(`This shell command (mv) moves ${t.h}.`); }
        if (/^(cp|install|rsync)$/.test(verb)) {
          const files = args.filter((a) => !a.startsWith('-')); const dest = files[files.length - 1] || ''; const sources = files.slice(0, -1);
          const destIsDir = dest === '.' || dest === '..' || dest.endsWith('/') || isDir(canon(dest, cwd));
          const targets = destIsDir ? sources.map((src) => posix.join(dest, posix.basename(src))) : [dest];
          const t = argHit(targets, true); if (t) deny(`This shell command (${verb}) writes over ${t.h}.`);
        }
        // the lock is a person's: the agent never clears the immutable flag
        if (/lock-contract\.sh$/.test(verb) && args.includes('unlock')) deny('Only a person unlocks the contract files (tools/lock-contract.sh unlock).');
        if (/(^|\/)chflags$/.test(verb) && args.some((a) => /nouchg|noschg|nouappnd/.test(a))) deny('Only a person clears the immutable flag on the contract files.');
        if (verb === 'ln') { const t = argHit(args, true); if (t) deny(`This shell command (ln) links to or over ${t.h}; a link is a second door to a protected file.`); }
        if (verb === 'git' && /^(rm|clean|checkout|restore|reset|stash|apply|am|revert|mv|update-index|filter-branch|filter-repo)$/.test(args[0] || '')) { const t = argHit(args.slice(1), true); if (t) deny(`This shell command (git ${args[0]}) rewrites ${t.h}; a person does that in a reviewed commit.`); }
        if (verb === 'sed' && args.some((a) => /^-[a-zA-Z]*i/.test(a))) { const t = argHit(args); if (t) deny(`This shell command (sed -i) edits ${t.h} in place.`); }
        if (verb === 'perl' && args.some((a) => /^-[a-zA-Z]*i/.test(a))) { const t = argHit(args); if (t) deny(`This shell command (perl -i) edits ${t.h} in place.`); }
        if (verb === 'find' && /-delete|-exec\s+(rm|unlink|mv|chmod)/.test(seg)) { const t = argHit(args, true); if (t) deny(`This shell command (find ... -delete) removes files under ${t.h}.`); }
        // interpreters running inline code with a write API and a protected path in the same segment
        if (/^(node|python3?|ruby|perl|deno|bun|osascript)$/.test(verb) && args.some((a) => /^(-e|--eval|-c|-E)$/.test(a)) && WRITE_API.test(seg)) {
          const t = argHit(seg.split(/[\s()'"`,;]+/).map(expand), true); if (t) deny(`This inline script can write to or delete ${t.h}.`);
        }
      }
    };
    analyse(cmd, '');
    process.exit(0);
  }
  process.exit(0);
});
