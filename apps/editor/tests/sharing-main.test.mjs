import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const start = source.indexOf('  async revokeLink() {', source.indexOf('const sharingUI = mountSharing'));
const callback = source.slice(start, source.indexOf('  async createLink(access)', start));
function setup({ account = false, revokeFails = false, cleanupFails = false } = {}) {
  const state = { accountSaving: false, savedRevision: 4, refreshed: 0, requests: [],
    location: { hash: '#share=old', pathname: '/', search: '?apartment=flat' },
    shareSession: { async revoke() { if (revokeFails) throw new Error('revoke failed'); } },
    editorSession: account ? { apartment: { id: 'flat', version: 2, sharing: { id: 'old' } }, sharingError: 'old error' } : null,
  };
  if (account) state.editorSession.sharingSession = state.shareSession;
  state.history = { replaceState(_, __, url) { state.url = url; state.location.hash = ''; } };
  state.refresh = () => state.refreshed++;
  state.fetch = async (_, options) => {
    state.requests.push(JSON.parse(options.body));
    return { ok: !cleanupFails, json: async () => cleanupFails ? { error: 'cleanup failed' } : { apartment: { id: 'flat', version: 3, sharing: null } } };
  };
  const revoke = new Function('state', `with (state) { return ({${callback}}).revokeLink; }`)(state);
  return { state, revoke };
}

test('main revoke clears account association, sessions and fragment and refreshes', async () => {
  const { state, revoke } = setup({ account: true });
  await revoke();
  assert.deepEqual(state.requests, [{ version: 2, reference: null }]);
  assert.equal(state.editorSession.apartment.sharing, null);
  assert.equal(state.editorSession.sharingSession, null);
  assert.equal(state.editorSession.sharingError, undefined);
  assert.equal(state.shareSession, null);
  assert.equal(state.url, '/?apartment=flat');
  assert.equal(state.savedRevision, 4);
  assert.equal(state.accountSaving, false);
  assert.equal(state.refreshed, 1);
});

test('main revoke marks a standalone scene unsaved locally', async () => {
  const { state, revoke } = setup();
  await revoke();
  assert.equal(state.savedRevision, -1);
  assert.equal(state.shareSession, null);
  assert.equal(state.location.hash, '');
});

test('failed revocation preserves the working link and account association', async () => {
  const { state, revoke } = setup({ account: true, revokeFails: true });
  await assert.rejects(revoke(), /revoke failed/);
  assert.ok(state.shareSession);
  assert.ok(state.editorSession.apartment.sharing);
  assert.equal(state.location.hash, '#share=old');
  assert.equal(state.requests.length, 0);
  assert.equal(state.accountSaving, false);
});

test('failed account cleanup drops the dead session and can be retried', async () => {
  const { state, revoke } = setup({ account: true, cleanupFails: true });
  await assert.rejects(revoke(), /cleanup failed/);
  assert.equal(state.shareSession, null);
  assert.equal(state.editorSession.sharingSession, null);
  assert.ok(state.editorSession.apartment.sharing);
  assert.equal(state.location.hash, '');
  state.fetch = async () => ({ ok: true, json: async () => ({ apartment: { id: 'flat', version: 3, sharing: null } }) });
  await revoke();
  assert.equal(state.editorSession.apartment.sharing, null);
});
