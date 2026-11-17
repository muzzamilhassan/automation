// Drafts Inbox approval race (2026-11-17: 5 of 20 fast approvals failed with
// GitHub 409 — each PUT carried a stale blob sha). commitDraftApproval now
// re-reads and re-applies on 409/422, bounded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitDraftApproval } from '../studio/lib/template-approvals.mjs';

const MARKER = "  // ---- REMOVED 2026-11-04 (owner-approved catalog cleanup): 'quote-cards-premium'";
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

function fakeGitHub({ conflicts = 0, failWith = null } = {}) {
  let file = `const T = {\n${MARKER}\n};\n`;
  let sha = 'sha-0';
  let puts = 0;
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push(opts.method || 'GET');
    if (!opts.method) return res(200, { content: b64(file), sha });
    puts++;
    if (failWith) return res(failWith, { message: 'boom' });
    if (puts <= conflicts) {
      // another approval landed between our read and our write
      file = file.replace(MARKER, `  'someone-else-${puts}': {},\n\n${MARKER}`);
      sha = `sha-${puts}`;
      return res(409, { message: `does not match ${sha}` });
    }
    const body = JSON.parse(opts.body);
    if (body.sha !== sha) return res(409, { message: 'stale' });
    file = Buffer.from(body.content, 'base64').toString('utf8');
    sha = `sha-ok-${puts}`;
    return res(200, { commit: { sha: `commit-${puts}` } });
  };
  return { fetchImpl, calls, file: () => file };
}

const draft = { template_id: 'night-signal-storybook', version: '1.0.0' };

test('a 409 (a parallel approval landed first) re-reads and succeeds, keeping BOTH entries', async () => {
  const gh = fakeGitHub({ conflicts: 2 });
  const r = await commitDraftApproval(draft, { fetchImpl: gh.fetchImpl, sleep: async () => {}, token: 't' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.attempts, 3);
  assert.match(gh.file(), /'someone-else-1'/);
  assert.match(gh.file(), /'someone-else-2'/);
  assert.match(gh.file(), /"template_id": "night-signal-storybook"/);
});

test('conflicts that never clear give up after 4 attempts with the error', async () => {
  const gh = fakeGitHub({ conflicts: 99 });
  const r = await commitDraftApproval(draft, { fetchImpl: gh.fetchImpl, sleep: async () => {}, token: 't' });
  assert.equal(r.ok, false);
  assert.match(r.error, /409/);
  assert.equal(gh.calls.filter((m) => m === 'PUT').length, 4);
});

test('a non-conflict failure is not retried; an already-approved id is a no-op success', async () => {
  const gh = fakeGitHub({ failWith: 403 });
  const r = await commitDraftApproval(draft, { fetchImpl: gh.fetchImpl, sleep: async () => {}, token: 't' });
  assert.equal(r.ok, false);
  assert.equal(gh.calls.filter((m) => m === 'PUT').length, 1);
  const done = fakeGitHub();
  await commitDraftApproval(draft, { fetchImpl: done.fetchImpl, sleep: async () => {}, token: 't' });
  const again = await commitDraftApproval(draft, { fetchImpl: done.fetchImpl, sleep: async () => {}, token: 't' });
  assert.equal(again.already, true);
});

test('entries are KEYED by template id (a bare {...} broke the registry on 2026-11-17)', async () => {
  const { registryEntrySource } = await import('../studio/lib/template-approvals.mjs');
  const src = registryEntrySource({ template_id: 'x-y', version: '1.0.0' });
  assert.match(src, /^  'x-y': \{\n/);
  assert.throws(() => registryEntrySource({ template_id: "bad'id" }), /invalid template_id/);
  const gh = fakeGitHub();
  await commitDraftApproval(draft, { fetchImpl: gh.fetchImpl, sleep: async () => {}, token: 't' });
  assert.match(gh.file(), /  'night-signal-storybook': \{\n/);
});

test('GUARD: the real registry file loads and every entry key equals its template_id', async () => {
  const { REGISTRY_META } = await import('../studio/lib/template-registry.data.js');
  const ids = Object.keys(REGISTRY_META);
  assert.ok(ids.length >= 30, `registry has ${ids.length} templates`);
  for (const id of ids) {
    const tid = REGISTRY_META[id] && REGISTRY_META[id].template_id;
    if (tid !== undefined) assert.equal(tid, id, `key ${id} vs template_id ${tid}`);
  }
});
