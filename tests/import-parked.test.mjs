import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARKED_SLUGS,
  secretNameFor,
  freshLocalToken,
  parseArgs,
  runImport,
  makeRefresh,
  identifyChannel,
  buildRegistryEntry,
  renderSummaryTable,
} from '../scripts/import-parked-channels.mjs';

// ---------------------------------------------------------------------------
// #106 Phase 4.5 Tier 2 T2 — bulk importer that brings the 12 PARKED channels
// (local token.json only — no registry row, no GitHub secret) into the Admin
// Panel's management: refresh -> identify -> YT_TOKEN_<SLUG> secret ->
// registry upsert (autopilot FALSE — the importer NEVER enables autopilot) ->
// local token.json refresh. Safety contract under test:
//   - dry is the DEFAULT and touches nothing (--live required for writes)
//   - one channel's failure never stops the others (report + continue)
//   - a dead refresh_token SKIPS the channel (local file left untouched)
//   - re-run is idempotent (update-in-place, no duplicate rows)
//   - token material never appears in any log/output line (redacted)
// All seams injected — no live Google/GitHub/Neon in unit CI.
// ---------------------------------------------------------------------------

const NOW_MS = 1761926400000; // fixed clock
const NOW_ISO = new Date(NOW_MS).toISOString();
const THREE = ['ai-observer', 'closing-table', 'corner-office'];
const TITLES = {
  'ai-observer': 'AI Observer',
  'closing-table': 'The Closing Table',
  'corner-office': 'Corner Office',
};

// ---- fakes ----------------------------------------------------------------

function fakeRegistry(initial = []) {
  const channels = initial.map((c) => ({ ...c }));
  const upserts = [];
  return {
    channels,
    upserts,
    async read() {
      return { channels: channels.map((c) => ({ ...c })) };
    },
    async upsert(entry) {
      upserts.push({ ...entry });
      const i = channels.findIndex((c) => c.slug === entry.slug);
      if (i >= 0) channels[i] = { ...entry };
      else channels.push({ ...entry });
      return { ok: true };
    },
  };
}

function harness({ slugs = THREE, dry, initialRegistry = [], skipRefresh = new Set(), failRefresh = new Set(), missingFiles = new Set(), yutuShape = new Set(), secretFails = new Set(), identify } = {}) {
  const lines = [];
  const secretCalls = [];
  const localWrites = [];
  const registry = fakeRegistry(initialRegistry);
  const tokens = {};
  for (const slug of slugs) {
    if (missingFiles.has(slug)) continue;
    tokens[slug] = yutuShape.has(slug)
      ? { access_token: 'at-old-' + slug, refresh_token: 'rt-' + slug, scope: 'youtube.force-ssl', token_type: 'Bearer', expiry_date: 1700000000000 }
      : { access_token: 'at-old-' + slug, token_type: 'Bearer', refresh_token: 'rt-' + slug, expiry: '2026-09-05T07:44:47.421Z' };
  }
  const opts = {
    slugs,
    ...(dry === undefined ? {} : { dry }),
    async readTokenFile(slug) {
      return tokens[slug] ? { raw: JSON.stringify(tokens[slug]), token: tokens[slug] } : null;
    },
    async refresh(slug, token) {
      if (skipRefresh.has(slug)) throw new Error('invalid_grant ' + token.refresh_token);
      if (failRefresh.has(slug)) throw new Error('explode ' + slug);
      return { accessToken: 'at-new-' + slug, expiresIn: 3500 };
    },
    async identify(accessToken) {
      if (identify) return identify(accessToken);
      const slug = String(accessToken).replace('at-new-', '');
      return { channelId: 'UC-' + slug, title: TITLES[slug] || slug, handle: '@' + slug, subs: 11 };
    },
    async writeSecret(name, body) {
      if (secretFails.has(name)) throw new Error('github 403 writing ' + name);
      secretCalls.push({ name, body });
    },
    registry,
    async writeLocalToken(slug, body) {
      localWrites.push({ slug, body });
    },
    tokenEnc: (t) => 'enc:' + String(t.access_token).length,
    log: (line) => lines.push(String(line)),
    now: () => NOW_MS,
  };
  return { opts, lines, secretCalls, localWrites, registry };
}

// ---------------------------------------------------------------------------
// A. pure helpers
// ---------------------------------------------------------------------------

describe('import-parked T2 — defaults & helpers', () => {
  test('default set is exactly the 12 parked channels', () => {
    assert.deepEqual(PARKED_SLUGS, [
      'ai-observer', 'closing-table', 'corner-office', 'deep-work-os', 'escrow-estate',
      'founders-margin', 'iron-discipline', 'longevity-code', 'old-money-code',
      'policy-brief', 'sleep-architect', 'tax-shield',
    ]);
  });

  test('secret name maps dashes to underscores, uppercase (YT_TOKEN_<SLUG> convention)', () => {
    assert.equal(secretNameFor('ai-observer'), 'YT_TOKEN_AI_OBSERVER');
    assert.equal(secretNameFor('deep-work-os'), 'YT_TOKEN_DEEP_WORK_OS');
  });

  test('freshLocalToken updates the ISO `expiry` (parked shape) and preserves all other keys', () => {
    const prev = { access_token: 'at-old', token_type: 'Bearer', refresh_token: 'rt-keep', expiry: '2026-09-05T07:44:47.421Z' };
    const next = freshLocalToken(prev, { access_token: 'at-new', expires_in: 3500 }, NOW_MS);
    assert.equal(next.access_token, 'at-new');
    assert.equal(next.refresh_token, 'rt-keep');
    assert.equal(next.token_type, 'Bearer');
    assert.equal(next.expiry, new Date(NOW_MS + 3500 * 1000).toISOString());
  });

  test('freshLocalToken updates `expiry_date` epoch ms (yutu shape) and keeps scope', () => {
    const prev = { access_token: 'at-old', refresh_token: 'rt-keep', scope: 'youtube.force-ssl', token_type: 'Bearer', expiry_date: 1700000000000 };
    const next = freshLocalToken(prev, { access_token: 'at-new', expires_in: 3500 }, NOW_MS);
    assert.equal(next.access_token, 'at-new');
    assert.equal(next.scope, 'youtube.force-ssl');
    assert.equal(next.expiry_date, NOW_MS + 3500 * 1000);
    assert.equal(next.expiry, undefined, 'must not add a second expiry field');
  });

  test('freshLocalToken falls back to the 3600s Google default when expires_in is missing', () => {
    const next = freshLocalToken({ access_token: 'a', refresh_token: 'r', expiry: 'x' }, { access_token: 'at-new' }, NOW_MS);
    assert.equal(next.expiry, new Date(NOW_MS + 3600 * 1000).toISOString());
  });

  test('parseArgs: dry is the DEFAULT; --live flips it; --only parses a comma list; unknown args rejected', () => {
    assert.equal(parseArgs([]).dry, true, 'no flags must mean DRY');
    assert.equal(parseArgs(['--dry']).dry, true);
    assert.equal(parseArgs(['--live']).dry, false);
    assert.deepEqual(parseArgs(['--only=a,b,c']).slugs, ['a', 'b', 'c']);
    assert.deepEqual(parseArgs(['--live', '--only=tax-shield']).slugs, ['tax-shield']);
    assert.throws(() => parseArgs(['--bogus']), /unknown argument/);
  });
});

// ---------------------------------------------------------------------------
// B. the refresh seam REUSES studio/lib/yt-token.mjs createAccessToken
// ---------------------------------------------------------------------------

describe('import-parked T2 — token refresh reuses createAccessToken', () => {
  test('makeRefresh POSTs the OAuth refresh with the env client creds + channel refresh_token and captures expires_in', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, opts });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'at-brand-new', expires_in: 3599 }),
        json: async () => ({ access_token: 'at-brand-new', expires_in: 3599 }),
      };
    };
    const refresh = await makeRefresh({ env: { YOUTUBE_CLIENT_ID: 'cid-123', YOUTUBE_CLIENT_SECRET: 'csec-456' }, fetchImpl });
    const out = await refresh('ai-observer', { refresh_token: 'rt-abc' });
    assert.equal(out.accessToken, 'at-brand-new');
    assert.equal(out.expiresIn, 3599);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
    assert.equal(calls[0].opts.method, 'POST');
    assert.equal(calls[0].opts.body.get('client_id'), 'cid-123');
    assert.equal(calls[0].opts.body.get('client_secret'), 'csec-456');
    assert.equal(calls[0].opts.body.get('refresh_token'), 'rt-abc');
    assert.equal(calls[0].opts.body.get('grant_type'), 'refresh_token');
  });

  test('makeRefresh surfaces refresh failures (dead refresh_token) as throwables for the skip path', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 400,
      text: async () => JSON.stringify({ error: 'invalid_grant' }),
      json: async () => ({ error: 'invalid_grant' }),
    });
    const refresh = await makeRefresh({ env: { YOUTUBE_CLIENT_ID: 'cid', YOUTUBE_CLIENT_SECRET: 'csec' }, fetchImpl });
    await assert.rejects(() => refresh('tax-shield', { refresh_token: 'rt-dead' }), /no access token/);
  });

  test('makeRefresh enriches refresh failures with Google\'s error verdict (clear skip report)', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 400,
      text: async () => JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
      json: async () => ({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
    });
    const refresh = await makeRefresh({ env: { YOUTUBE_CLIENT_ID: 'cid', YOUTUBE_CLIENT_SECRET: 'csec' }, fetchImpl });
    await assert.rejects(
      () => refresh('tax-shield', { refresh_token: 'rt-dead' }),
      /invalid_grant.*expired or revoked/,
      'the skip report must carry Google\'s actual verdict, not a bare "no access token"',
    );
  });
});

// ---------------------------------------------------------------------------
// C. identification via channels.list?mine=true
// ---------------------------------------------------------------------------

describe('import-parked T2 — identify the channel behind the token', () => {
  test('identifyChannel calls channels.list mine=true with the Bearer token and parses title/handle/channelId/subs', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, opts });
      return {
        ok: true,
        json: async () => ({
          items: [{ id: 'UC123', snippet: { title: 'Closing Table', customUrl: '@ClosingTable' }, statistics: { subscriberCount: '42' } }],
        }),
      };
    };
    const id = await identifyChannel(fetchImpl, 'at-1');
    assert.deepEqual(id, { channelId: 'UC123', title: 'Closing Table', handle: '@closingtable', subs: 42 });
    assert.match(calls[0].url, /^https:\/\/www\.googleapis\.com\/youtube\/v3\/channels\?part=snippet,statistics&mine=true$/);
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer at-1');
  });

  test('identifyChannel throws when the token owns no channel (skip/fail — never a silent import)', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ items: [] }) });
    await assert.rejects(() => identifyChannel(fetchImpl, 'at-1'), /no items/);
  });
});

// ---------------------------------------------------------------------------
// D. registry entry contract (the panel-facing shape)
// ---------------------------------------------------------------------------

describe('import-parked T2 — registry entry contract', () => {
  test('fresh entry: label=title, niche empty, autopilot FALSE (importer NEVER enables), tokenSecretSaved, tokenEnc', () => {
    const e = buildRegistryEntry({
      slug: 'ai-observer',
      identity: { channelId: 'UC-1', title: 'AI Observer', handle: '@aiobserver', subs: 12 },
      tokenEncStr: 'enc:9',
      secretName: 'YT_TOKEN_AI_OBSERVER',
      existing: null,
      nowIso: NOW_ISO,
    });
    assert.equal(e.slug, 'ai-observer');
    assert.equal(e.label, 'AI Observer');
    assert.equal(e.channelId, 'UC-1');
    assert.equal(e.handle, '@aiobserver');
    assert.equal(e.subs, 12);
    assert.equal(e.niche, '');
    assert.equal(e.autopilot, false, 'fresh import must NEVER enable autopilot');
    assert.equal(e.autopilotStartedAt, null);
    assert.equal(e.consent, null);
    assert.equal(e.consentedAt, null);
    assert.equal(e.tokenSecret, 'YT_TOKEN_AI_OBSERVER');
    assert.equal(e.tokenSecretSaved, true);
    assert.equal(e.tokenEnc, 'enc:9');
    assert.equal(e.connectedAt, NOW_ISO);
    assert.ok(e.status.length > 0);
    assert.equal(e.accent, '#38BDF8');
  });

  test('re-run over an existing row: update-in-place — consent fields + owner-set niche/kit survive, autopilot true is preserved (never disabled)', () => {
    const existing = {
      slug: 'ai-observer', label: 'Old Label', channelId: 'UC-old', handle: '@old', subs: 3,
      niche: 'owner niche', kit: { niches: ['x'] }, accent: '#FF0000', slots: ['14:00'],
      autopilot: true, autopilotStartedAt: '2026-02-02T00:00:00.000Z', connectedAt: '2026-01-01T00:00:00.000Z',
      consent: { at: 'yes' }, consentedAt: '2026-02-02T00:00:00.000Z', status: 'autopilot on', ownerEmail: 'owner@test',
    };
    const e = buildRegistryEntry({
      slug: 'ai-observer',
      identity: { channelId: 'UC-new', title: 'AI Observer', handle: '@aiobserver', subs: 12 },
      tokenEncStr: 'enc:9',
      secretName: 'YT_TOKEN_AI_OBSERVER',
      existing,
      nowIso: NOW_ISO,
    });
    assert.equal(e.autopilot, true, 're-run must never flip the owner consent off');
    assert.equal(e.autopilotStartedAt, '2026-02-02T00:00:00.000Z');
    assert.equal(e.consentedAt, '2026-02-02T00:00:00.000Z');
    assert.deepEqual(e.consent, { at: 'yes' });
    assert.equal(e.connectedAt, '2026-01-01T00:00:00.000Z', 'first connect date survives a re-run');
    assert.equal(e.niche, 'owner niche');
    assert.deepEqual(e.kit, { niches: ['x'] });
    assert.equal(e.accent, '#FF0000');
    assert.deepEqual(e.slots, ['14:00']);
    assert.equal(e.ownerEmail, 'owner@test');
    assert.equal(e.status, 'autopilot on', 'owner-facing status survives');
    assert.equal(e.channelId, 'UC-new', 'identity fields refresh');
    assert.equal(e.label, 'AI Observer', 'label follows the identified YouTube title');
    assert.equal(e.subs, 12);
  });
});

// ---------------------------------------------------------------------------
// E. runImport — the dry/live safety contract
// ---------------------------------------------------------------------------

describe('import-parked T2 — DRY is the default and touches nothing', () => {
  test('no flags at all -> dry: zero secret/registry/local writes, plan printed per channel, exit 0', async () => {
    const h = harness({}); // dry not passed — the default must protect
    const res = await runImport(h.opts);
    assert.equal(h.secretCalls.length, 0, 'dry must not write any GitHub secret');
    assert.equal(h.registry.upserts.length, 0, 'dry must not write the registry');
    assert.equal(h.localWrites.length, 0, 'dry must not touch local token files');
    assert.equal(res.exitCode, 0);
    assert.equal(res.results.length, 3);
    assert.ok(res.results.every((r) => r.outcome === 'planned'));
    const all = h.lines.join('\n');
    assert.match(all, /DRY/);
    for (const slug of THREE) assert.match(all, new RegExp(slug));
    assert.match(all, /AI Observer/);
    assert.match(all, /YT_TOKEN_AI_OBSERVER/);
    assert.match(all, /autopilot=false/);
  });

  test('dry plan reports a dead refresh_token as would-skip and still writes nothing', async () => {
    const h = harness({ slugs: ['ai-observer', 'tax-shield'], skipRefresh: new Set(['tax-shield']) });
    const res = await runImport(h.opts);
    assert.equal(h.secretCalls.length + h.registry.upserts.length + h.localWrites.length, 0);
    assert.equal(res.exitCode, 0, 'a would-skip in dry is not a hard failure');
    const skip = res.results.find((r) => r.slug === 'tax-shield');
    assert.equal(skip.outcome, 'planned-skip');
    assert.match(skip.reason, /refresh_failed/);
    assert.match(h.lines.join('\n'), /refresh_failed/);
  });
});

describe('import-parked T2 — LIVE: the full bring-into-panel flow', () => {
  test('live writes secret + registry + local token per channel with the full entry contract, exit 0', async () => {
    const h = harness({ dry: false, slugs: THREE, yutuShape: new Set(['corner-office']) });
    const res = await runImport(h.opts);
    assert.equal(res.exitCode, 0);
    assert.ok(res.results.every((r) => r.outcome === 'ok'));

    // (d) GitHub secret YT_TOKEN_<SLUG> carries the FRESH token JSON
    assert.equal(h.secretCalls.length, 3);
    for (const call of h.secretCalls) {
      const slug = call.name.replace('YT_TOKEN_', '').toLowerCase().replace(/_/g, '-');
      assert.equal(call.name, secretNameFor(slug));
      const body = JSON.parse(call.body);
      assert.equal(body.access_token, 'at-new-' + slug, 'secret must carry the fresh access token');
      assert.equal(body.refresh_token, 'rt-' + slug, 'secret must carry the refresh token CI refreshes with');
    }

    // (e) registry: one upsert per slug, no duplicates, panel contract
    assert.equal(h.registry.upserts.length, 3);
    assert.equal(h.registry.channels.length, 3);
    const entry = h.registry.upserts.find((e) => e.slug === 'ai-observer');
    assert.equal(entry.label, 'AI Observer');
    assert.equal(entry.channelId, 'UC-ai-observer');
    assert.equal(entry.handle, '@ai-observer');
    assert.equal(entry.subs, 11);
    assert.equal(entry.niche, '');
    assert.equal(entry.autopilot, false);
    assert.equal(entry.tokenSecret, 'YT_TOKEN_AI_OBSERVER');
    assert.equal(entry.tokenSecretSaved, true);
    assert.ok(entry.tokenEnc, 'dashboard read-back needs the encrypted token');
    assert.equal(entry.connectedAt, NOW_ISO);

    // (f) local token.json refreshed in place — fresh access token + updated expiry, shape preserved
    assert.equal(h.localWrites.length, 3);
    const isoWrite = h.localWrites.find((w) => w.slug === 'ai-observer');
    const isoBody = JSON.parse(isoWrite.body);
    assert.equal(isoBody.access_token, 'at-new-ai-observer');
    assert.equal(isoBody.refresh_token, 'rt-ai-observer');
    assert.equal(isoBody.expiry, new Date(NOW_MS + 3500 * 1000).toISOString());
    const yutuWrite = h.localWrites.find((w) => w.slug === 'corner-office');
    const yutuBody = JSON.parse(yutuWrite.body);
    assert.equal(yutuBody.expiry_date, NOW_MS + 3500 * 1000, 'yutu-shape file keeps its own expiry field');
    assert.equal(yutuBody.scope, 'youtube.force-ssl');

    // (g) audit lines
    const all = h.lines.join('\n');
    assert.match(all, /\[import-parked\] ok slug=ai-observer /);
    assert.match(all, /channelId=UC-ai-observer/);
    assert.match(all, /registry=create/);
  });

  test('redaction: no token material (access or refresh, old or fresh) appears in ANY emitted line', async () => {
    const h = harness({ dry: false, slugs: THREE, skipRefresh: new Set(['closing-table']) });
    await runImport(h.opts);
    const all = h.lines.join('\n');
    for (const token of ['rt-ai-observer', 'rt-closing-table', 'rt-corner-office', 'at-new-ai-observer', 'at-old-closing-table']) {
      assert.ok(!all.includes(token), 'token material leaked into output: ' + token);
    }
    assert.match(all, /\[REDACTED\]/, 'the skip reason must show the redaction happened');
  });

  test('idempotent re-run: existing row is updated in place — still exactly one row for the slug', async () => {
    const existing = {
      slug: 'ai-observer', label: 'Old Label', channelId: 'UC-old', subs: 3,
      niche: 'pre-set', autopilot: true, connectedAt: '2026-01-01T00:00:00.000Z',
      consentedAt: '2026-02-02T00:00:00.000Z', consent: { at: 'yes' }, status: 'autopilot on',
    };
    const h = harness({ dry: false, slugs: ['ai-observer', 'closing-table'], initialRegistry: [existing] });
    const res = await runImport(h.opts);
    assert.equal(res.exitCode, 0);
    assert.equal(h.registry.upserts.length, 2, 'one upsert per channel, not one per run');
    const rows = h.registry.channels.filter((c) => c.slug === 'ai-observer');
    assert.equal(rows.length, 1, 'no duplicate rows on re-run');
    assert.equal(rows[0].autopilot, true, 're-run must not flip owner consent off');
    assert.equal(rows[0].connectedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(rows[0].niche, 'pre-set');
    assert.equal(rows[0].channelId, 'UC-ai-observer', 'identity refreshed');
    const live = res.results.find((r) => r.slug === 'ai-observer');
    assert.equal(live.registryAction, 'update');
  });

  test('per-channel isolation: a hard failure on one channel never stops the others (exit 1)', async () => {
    const h = harness({ dry: false, slugs: THREE, secretFails: new Set(['YT_TOKEN_CLOSING_TABLE']) });
    const res = await runImport(h.opts);
    assert.equal(res.exitCode, 1, 'any hard failure exits 1');
    assert.equal(res.results.find((r) => r.slug === 'closing-table').outcome, 'error');
    assert.ok(res.results.find((r) => r.slug === 'ai-observer').outcome === 'ok', 'channel before the failure still imported');
    assert.ok(res.results.find((r) => r.slug === 'corner-office').outcome === 'ok', 'channel after the failure still imported');
    // the failed channel got NO registry/local writes (secret is step 1 of the write chain)
    assert.equal(h.registry.upserts.filter((e) => e.slug === 'closing-table').length, 0);
    assert.equal(h.localWrites.filter((w) => w.slug === 'closing-table').length, 0);
  });

  test('dead refresh_token -> SKIPPED (not failed): no writes for that channel, local file untouched, others continue, exit 0', async () => {
    const h = harness({ dry: false, slugs: THREE, skipRefresh: new Set(['closing-table']) });
    const res = await runImport(h.opts);
    assert.equal(res.exitCode, 0, 'skips are not hard failures');
    const skip = res.results.find((r) => r.slug === 'closing-table');
    assert.equal(skip.outcome, 'skipped');
    assert.match(skip.reason, /refresh_failed/);
    assert.equal(h.secretCalls.filter((c) => c.name === 'YT_TOKEN_CLOSING_TABLE').length, 0);
    assert.equal(h.registry.upserts.filter((e) => e.slug === 'closing-table').length, 0);
    assert.equal(h.localWrites.filter((w) => w.slug === 'closing-table').length, 0, 'dead channel keeps its local token file byte-for-byte');
    assert.equal(h.secretCalls.length, 2);
    assert.match(h.lines.join('\n'), /slug=closing-table .*skip/);
  });

  test('missing local token file is a hard failure (nothing to import), exit 1', async () => {
    const h = harness({ dry: false, slugs: ['ghost-channel'] , missingFiles: new Set(['ghost-channel']) });
    const res = await runImport(h.opts);
    assert.equal(res.exitCode, 1);
    const r = res.results[0];
    assert.equal(r.outcome, 'error');
    assert.match(r.reason, /token_file_missing/);
    assert.equal(h.secretCalls.length + h.registry.upserts.length + h.localWrites.length, 0);
  });

  test('a channel whose channelId is already registered under ANOTHER slug is skipped — no duplicate channel identity', async () => {
    // the escrow-estate dry-run finding: its token belongs to investors-compass
    const existing = { slug: 'investors-compass', label: "Investor's Compass", channelId: 'UC-escrow-estate', autopilot: true };
    const h = harness({ dry: false, slugs: ['escrow-estate', 'ai-observer'], initialRegistry: [existing] });
    const res = await runImport(h.opts);
    assert.equal(res.exitCode, 0, 'a duplicate-identity skip is not a hard failure');
    const dup = res.results.find((r) => r.slug === 'escrow-estate');
    assert.equal(dup.outcome, 'skipped');
    assert.match(dup.reason, /already registered as slug "investors-compass"/);
    assert.equal(h.secretCalls.filter((c) => c.name === 'YT_TOKEN_ESCROW_ESTATE').length, 0, 'no duplicate secret for an existing channel');
    assert.equal(h.registry.upserts.filter((e) => e.slug === 'escrow-estate').length, 0, 'no duplicate registry row');
    assert.equal(h.localWrites.filter((w) => w.slug === 'escrow-estate').length, 0, 'mislabeled token file left untouched');
    assert.ok(res.results.find((r) => r.slug === 'ai-observer').outcome === 'ok', 'the real parked channel still imports');
    assert.equal(h.registry.channels.filter((c) => c.slug === 'investors-compass').length, 1, 'the existing row is untouched');
  });

  test('duplicate identity is also caught by HANDLE when the existing row lacks channelId (repo-JSON rows)', async () => {
    // dry reads the repo registry JSON — legacy rows there carry handle but no channelId
    const existing = { slug: 'investors-compass', label: "Investor's Compass", handle: '@investorscompasshq', autopilot: true };
    const h = harness({
      slugs: ['escrow-estate'], initialRegistry: [existing], // dry default
      identify: async () => ({ channelId: 'UC2LLA-REAL', title: "Investor's Compass", handle: '@investorscompasshq', subs: 9 }),
    });
    const res = await runImport(h.opts);
    const dup = res.results.find((r) => r.slug === 'escrow-estate');
    assert.equal(dup.outcome, 'planned-skip');
    assert.match(dup.reason, /already registered as slug "investors-compass"/);
    assert.equal(h.secretCalls.length + h.registry.upserts.length + h.localWrites.length, 0);
  });

  test('same-slug re-run is NOT treated as a duplicate (update-in-place wins over the collision guard)', async () => {
    const existing = { slug: 'ai-observer', label: 'Old', channelId: 'UC-old', autopilot: true };
    const h = harness({ dry: false, slugs: ['ai-observer'], initialRegistry: [existing] });
    const res = await runImport(h.opts);
    assert.equal(res.results[0].outcome, 'ok');
    assert.equal(res.results[0].registryAction, 'update');
  });

  test('summary table renders slug, identified title, secret, registry action and skip reasons', async () => {
    const h = harness({ slugs: THREE, skipRefresh: new Set(['closing-table']) });
    const res = await runImport(h.opts);
    const table = renderSummaryTable(res.results, { dry: true });
    const text = table.join('\n');
    assert.match(text, /ai-observer/);
    assert.match(text, /AI Observer/);
    assert.match(text, /YT_TOKEN_AI_OBSERVER/);
    assert.match(text, /refresh_failed/);
  });
});
