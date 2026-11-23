// Settings › Accounts (owner-approved 2026-11-23): per connected account —
// is it healthy, which channel uses it, what can it do, does it ask the owner
// first, and the ONE fix button. Real checks only: anything that can't be
// checked reads "Can't check", never a guess. Tokens never leave the server.
//
// EARS criteria proven here:
//   E1 WHEN a YouTube key is saved AND the live read works AND no token_revoked
//      warning is open, the account SHALL read connected.
//   E2 WHEN a token_revoked warning is open OR Google refuses the saved sign-in,
//      the account SHALL read needs_relogin with a plain problem + Reconnect (oauth).
//   E3 WHEN no YouTube key is saved, the account SHALL read not_connected + Connect.
//   E4 IF a check is impossible, times out or errors, THEN the account SHALL read
//      unknown ("Can't check …") — never connected.
//   E5 The output SHALL never contain tokens, secrets or raw error bodies.
//   E6 asksFirst SHALL be the channel's review gate (true/false), null when unknown.
//   E7 Facebook / Instagram / Threads rows follow the same four statuses from
//      their own non-swallowing checks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  STATUS_WORDS,
  classifyYtError,
  ytStatusFromChannels,
  gatesFromState,
  withTimeout,
  checkFacebook,
  checkThreads,
  threadsTokenFrom,
  buildAccounts,
  accountsSummary,
  accountLine,
} from '../studio/lib/accounts-health.mjs';

const NOW = new Date('2026-11-23T10:00:00Z');
const ready = (ok) => ({ ready: false, done: ok ? 1 : 0, total: 7, items: [{ key: 'youtube', ok }] });
const CH = [{ slug: 'money-rulebook', name: 'Money Rulebook' }];

function yt(over = {}) {
  return buildAccounts({
    channels: CH,
    readiness: { 'money-rulebook': ready(true) },
    ytStatus: { 'money-rulebook': { ok: true, title: 'Money Rulebook', handle: '@moneyrulebook' } },
    openWarnings: [],
    fbCheck: null,
    threadsCheck: null,
    gates: { 'money-rulebook': true },
    now: NOW,
    ...over,
  }).find((a) => a.kind === 'youtube');
}

// a fetch stub: answers with { status, body } or throws
const fakeFetch = (answers) => {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const a = typeof answers === 'function' ? answers(url) : answers.shift();
    if (a instanceof Error) throw a;
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
  };
  fn.calls = calls;
  return fn;
};

describe('YouTube status rules', () => {
  test('E1: key saved + live read OK + no open token_revoked → connected, can upload + read analytics', () => {
    const a = yt();
    assert.equal(a.status, 'connected');
    assert.equal(a.channel.slug, 'money-rulebook');
    assert.equal(a.channel.name, 'Money Rulebook');
    assert.equal(a.handle, '@moneyrulebook');
    assert.deepEqual(a.canDo, ['upload', 'analytics']);
    assert.equal(a.fix, undefined, 'a healthy account offers no fix button');
    assert.equal(a.problem, undefined);
    assert.equal(a.checkedAt, NOW.toISOString());
  });

  test('E2: an open token_revoked warning → needs_relogin + Reconnect (oauth), even when the live read works', () => {
    const a = yt({ openWarnings: [{ channel_id: 'money-rulebook', code: 'token_revoked' }] });
    assert.equal(a.status, 'needs_relogin');
    assert.match(a.problem, /revoked/i);
    assert.deepEqual(a.fix, { label: 'Reconnect', action: 'oauth' });
    assert.deepEqual(a.canDo, []);
  });

  test('E2: another channel\'s token_revoked warning does not touch this one', () => {
    assert.equal(yt({ openWarnings: [{ channel_id: 'quotequarry', code: 'token_revoked' }] }).status, 'connected');
  });

  test('E2: Google refusing the saved sign-in (live auth error) → needs_relogin + Reconnect', () => {
    const a = yt({ ytStatus: { 'money-rulebook': { error: 'auth' } } });
    assert.equal(a.status, 'needs_relogin');
    assert.ok(a.problem && a.problem.length < 80, 'one plain line');
    assert.deepEqual(a.fix, { label: 'Reconnect', action: 'oauth' });
  });

  test('E3: no key saved → not_connected + Connect (the add-channel wizard)', () => {
    const a = yt({ readiness: { 'money-rulebook': ready(false) }, ytStatus: {} });
    assert.equal(a.status, 'not_connected');
    assert.deepEqual(a.fix, { label: 'Connect', action: 'link', href: '/channels/add' });
    assert.ok(a.problem);
  });

  test('E4: YouTube live read timed out / failed (ytStatus null) → unknown "Can\'t check right now"', () => {
    const a = yt({ ytStatus: null });
    assert.equal(a.status, 'unknown');
    assert.match(a.problem, /Can't check right now/);
    assert.equal(a.fix, undefined);
  });

  test('E4: a non-auth live error (network) → unknown, never needs_relogin', () => {
    assert.equal(yt({ ytStatus: { 'money-rulebook': { error: 'unknown' } } }).status, 'unknown');
  });

  test('E4: the panel holds no copy of the key (engine has it) → unknown "Can\'t check from the panel"', () => {
    const a = yt({ ytStatus: { 'money-rulebook': { error: 'missing' } } });
    assert.equal(a.status, 'unknown');
    assert.match(a.problem, /from the panel/);
  });

  test('E4: setup (readiness) unreadable → unknown even if the live read works', () => {
    assert.equal(yt({ readiness: null }).status, 'unknown');
  });

  test('E4: a channel missing from the live read → unknown', () => {
    assert.equal(yt({ ytStatus: {} }).status, 'unknown');
  });
});

describe('classifying live YouTube errors', () => {
  test('Google refusing the refresh token is an auth error', () => {
    assert.equal(classifyYtError('no yt token'), 'auth');
    assert.equal(classifyYtError('invalid_grant'), 'auth');
  });
  test('no key on the panel side is "missing"', () => {
    assert.equal(classifyYtError('no token on the server'), 'missing');
    assert.equal(classifyYtError('no encrypted token — re-connect once in Studio to upgrade'), 'missing');
  });
  test('anything else is unknown', () => {
    assert.equal(classifyYtError('fetch failed'), 'unknown');
    assert.equal(classifyYtError(''), 'unknown');
  });
  test('ytStatusFromChannels keeps only a classification (never the raw error) and maps null → null', () => {
    assert.equal(ytStatusFromChannels(null), null);
    const s = ytStatusFromChannels([
      { slug: 'a', ytTitle: 'A', ytCustomUrl: '@a', subs: 1 },
      { slug: 'b', error: 'no yt token ya29.SECRET' },
    ]);
    assert.deepEqual(s.a, { ok: true, title: 'A', handle: '@a' });
    assert.deepEqual(s.b, { error: 'auth' });
    assert.doesNotMatch(JSON.stringify(s), /ya29|SECRET/);
  });
});

describe('asks you first (review gate)', () => {
  test('E6: gate on → asksFirst true; off → false; unknown → null', () => {
    assert.equal(yt({ gates: { 'money-rulebook': true } }).asksFirst, true);
    assert.equal(yt({ gates: { 'money-rulebook': false } }).asksFirst, false);
    assert.equal(yt({ gates: {} }).asksFirst, null);
    assert.equal(yt({ gates: null }).asksFirst, null);
  });
  test('gatesFromState reads the engine\'s reviewGate cache; unreadable state → null', () => {
    const st = { a: { reviewGate: { assigned: true, gated: true } }, b: { reviewGate: { gated: false } }, c: {} };
    assert.deepEqual(gatesFromState(st, ['a', 'b', 'c', 'd']), { a: true, b: false, c: null, d: null });
    assert.equal(gatesFromState(null, ['a']), null);
    assert.equal(gatesFromState({}, ['a']), null, 'an empty state read = nothing answered');
  });
});

describe('E5: secret-free output', () => {
  test('no token, secret or raw error body reaches the rows', () => {
    const SECRET = 'EAAG-SECRET-TOKEN-123';
    const rows = buildAccounts({
      channels: [{ slug: 'qq', name: 'QQ', fbPageId: '1', threadsHandle: 'qq8' }],
      readiness: { qq: ready(true) },
      ytStatus: ytStatusFromChannels([{ slug: 'qq', error: `invalid_grant ${SECRET}` }]),
      openWarnings: [{ channel_id: 'qq', code: 'token_revoked', evidence: SECRET, explanation: SECRET }],
      fbCheck: { state: 'ok', pages: [{ id: '1', name: 'QQ Page', ig: { id: '9', username: 'qq.ig' } }], token: SECRET },
      threadsCheck: { state: 'ok', username: 'qq8', token: SECRET },
      gates: { qq: true },
      now: NOW,
    });
    assert.ok(rows.length >= 4);
    assert.doesNotMatch(JSON.stringify(rows), new RegExp(SECRET));
    for (const r of rows) {
      assert.deepEqual(
        Object.keys(r).filter((k) => !['id', 'kind', 'label', 'channel', 'handle', 'status', 'canDo', 'asksFirst', 'problem', 'fix', 'checkedAt'].includes(k)),
        [],
        'only the documented fields',
      );
    }
  });

  test('checkFacebook never echoes the token or the Graph error message', async () => {
    const SECRET = 'EAAG-SECRET';
    const f = fakeFetch([{ status: 400, body: { error: { code: 190, message: `Bad token ${SECRET}` } } }]);
    const r = await checkFacebook({ token: SECRET, fetchImpl: f });
    assert.deepEqual(r, { state: 'auth' });
    assert.doesNotMatch(JSON.stringify(r), /SECRET/);
  });

  test('threadsTokenFrom keeps the token server-side only and prefers env JSON → env token → file', () => {
    const file = JSON.stringify({ access_token: 'FILE', expires_at: 5, username: 'f' });
    assert.deepEqual(threadsTokenFrom({ fileText: file }), { token: 'FILE', expiresAt: 5, username: 'f' });
    assert.equal(threadsTokenFrom({ envToken: 'ENV', fileText: file }).token, 'ENV');
    assert.equal(threadsTokenFrom({ envJson: JSON.stringify({ access_token: 'J' }), envToken: 'ENV' }).token, 'J');
    assert.equal(threadsTokenFrom({}), null);
    assert.equal(threadsTokenFrom({ fileText: 'not json' }), null);
  });
});

describe('E4: timeouts', () => {
  test('withTimeout resolves ok with the value in time', async () => {
    assert.deepEqual(await withTimeout(async () => 7, 200), { ok: true, value: 7 });
  });
  test('withTimeout gives { ok:false, reason:"timeout" } when the check hangs', async () => {
    const r = await withTimeout(() => new Promise(() => {}), 20);
    assert.deepEqual(r, { ok: false, reason: 'timeout' });
  });
  test('withTimeout turns a throw into { ok:false, reason:"error" } (never a 500)', async () => {
    assert.deepEqual(await withTimeout(async () => { throw new Error('x'); }, 200), { ok: false, reason: 'error' });
  });
  test('checkFacebook: network failure / abort → unknown', async () => {
    const r = await checkFacebook({ token: 't', fetchImpl: fakeFetch([new Error('The operation was aborted due to timeout')]) });
    assert.deepEqual(r, { state: 'unknown' });
  });
  test('checkFacebook passes a timeout signal to fetch', async () => {
    const f = fakeFetch([{ status: 200, body: { data: [] } }]);
    await checkFacebook({ token: 't', fetchImpl: f, timeoutMs: 1234 });
    assert.ok(f.calls[0].opts.signal, 'AbortSignal on every live call');
  });
  test('checkThreads: network failure → unknown', async () => {
    assert.deepEqual(await checkThreads({ token: 't', fetchImpl: fakeFetch([new Error('boom')]) }), { state: 'unknown' });
  });
});

describe('E7: Facebook / Instagram / Threads', () => {
  const base = {
    channels: [{ slug: 'qq', name: 'QuoteQuarry', fbPageId: '11', threadsHandle: 'quotequarry8' }],
    readiness: { qq: ready(true) },
    ytStatus: { qq: { ok: true, title: 'QQ', handle: '@qq' } },
    openWarnings: [],
    gates: { qq: false },
    now: NOW,
  };
  const others = (over) => buildAccounts({ ...base, ...over }).filter((a) => a.kind !== 'youtube');

  test('checkFacebook: me/accounts lists pages (+ linked Instagram) → ok', async () => {
    const f = fakeFetch([{ status: 200, body: { data: [{ id: '11', name: 'QQ Page', instagram_business_account: { id: '99', username: 'qq.ig' } }] } }]);
    const r = await checkFacebook({ token: 't', fetchImpl: f });
    assert.deepEqual(r, { state: 'ok', pages: [{ id: '11', name: 'QQ Page', ig: { id: '99', username: 'qq.ig' } }] });
  });

  test('checkFacebook: a Page token (me is the Page) still reads ok', async () => {
    const f = fakeFetch([
      { status: 400, body: { error: { code: 100 } } },
      { status: 200, body: { id: '11', name: 'QQ Page' } },
    ]);
    assert.deepEqual(await checkFacebook({ token: 't', fetchImpl: f }), { state: 'ok', pages: [{ id: '11', name: 'QQ Page', ig: null }] });
  });

  test('checkFacebook: no token on the panel → unreadable; other Graph errors → unknown', async () => {
    assert.deepEqual(await checkFacebook({ token: '' }), { state: 'unreadable' });
    assert.deepEqual(await checkFacebook({ token: 't', fetchImpl: fakeFetch([{ status: 500, body: { error: { code: 2 } } }]) }), { state: 'unknown' });
  });

  test('Facebook ok + page reachable → connected Facebook + Instagram rows, can cross-post', () => {
    const rows = others({ fbCheck: { state: 'ok', pages: [{ id: '11', name: 'QQ Page', ig: { id: '99', username: 'qq.ig' } }] }, threadsCheck: null });
    const fb = rows.find((r) => r.kind === 'facebook');
    const ig = rows.find((r) => r.kind === 'instagram');
    assert.equal(fb.status, 'connected');
    assert.equal(fb.handle, 'QQ Page');
    assert.deepEqual(fb.canDo, ['cross-post']);
    assert.equal(fb.asksFirst, null, 'no per-platform approval setting the panel can read');
    assert.equal(ig.status, 'connected');
    assert.equal(ig.handle, '@qq.ig');
    assert.equal(ig.channel.slug, 'qq');
  });

  test('Facebook token rejected → needs_relogin with a Reconnect link', () => {
    const fb = others({ fbCheck: { state: 'auth' } }).find((r) => r.kind === 'facebook');
    assert.equal(fb.status, 'needs_relogin');
    assert.equal(fb.fix.label, 'Reconnect');
    assert.equal(fb.fix.action, 'link');
    assert.match(fb.fix.href, /^https:\/\/developers\.facebook\.com\//);
  });

  test('Facebook login works but cannot reach this Page → not_connected', () => {
    const fb = others({ fbCheck: { state: 'ok', pages: [{ id: '22', name: 'Other', ig: null }] } }).find((r) => r.kind === 'facebook');
    assert.equal(fb.status, 'not_connected');
    assert.equal(fb.fix.label, 'Connect');
  });

  test('Facebook not checkable from the panel / timed out → unknown', () => {
    assert.match(others({ fbCheck: { state: 'unreadable' } }).find((r) => r.kind === 'facebook').problem, /from the panel/);
    assert.match(others({ fbCheck: null }).find((r) => r.kind === 'facebook').problem, /right now/);
    assert.equal(others({ fbCheck: { state: 'unknown' } }).find((r) => r.kind === 'facebook').status, 'unknown');
  });

  test('no Instagram row is invented when Facebook could not be read', () => {
    assert.equal(others({ fbCheck: { state: 'unknown' } }).filter((r) => r.kind === 'instagram').length, 0);
  });

  test('a channel without a Facebook Page gets no Facebook row', () => {
    const rows = buildAccounts({ ...base, channels: [{ slug: 'qq', name: 'QQ' }], fbCheck: { state: 'auth' }, threadsCheck: { state: 'auth' } });
    assert.deepEqual(rows.map((r) => r.kind), ['youtube']);
  });

  test('Threads: ok + matching handle → connected; expired → needs_relogin; unreadable → unknown', () => {
    const t = (threadsCheck) => others({ fbCheck: null, threadsCheck }).find((r) => r.kind === 'threads');
    assert.equal(t({ state: 'ok', username: 'QuoteQuarry8' }).status, 'connected');
    assert.equal(t({ state: 'ok', username: 'quotequarry8' }).handle, '@quotequarry8');
    assert.equal(t({ state: 'ok', username: 'someone-else' }).status, 'not_connected');
    const exp = t({ state: 'auth' });
    assert.equal(exp.status, 'needs_relogin');
    assert.ok(exp.problem);
    assert.match(t({ state: 'unreadable' }).problem, /from the panel/);
    assert.equal(t(null).status, 'unknown');
  });

  test('checkThreads: expiry in the past → auth without a network call; live 190 → auth; ok → username', async () => {
    const f = fakeFetch([]);
    assert.deepEqual(await checkThreads({ token: 't', expiresAt: NOW.getTime() - 1, now: NOW.getTime(), fetchImpl: f }), { state: 'auth' });
    assert.equal(f.calls.length, 0);
    assert.deepEqual(await checkThreads({ token: 't', fetchImpl: fakeFetch([{ status: 400, body: { error: { code: 190 } } }]) }), { state: 'auth' });
    assert.deepEqual(await checkThreads({ token: 't', fetchImpl: fakeFetch([{ status: 200, body: { id: '1', username: 'qq8' } }]) }), { state: 'ok', username: 'qq8' });
    assert.deepEqual(await checkThreads({ token: '' }), { state: 'unreadable' });
  });

  test('YouTube rows come first, then Facebook, Instagram, Threads', () => {
    const rows = buildAccounts({ ...base, fbCheck: { state: 'ok', pages: [{ id: '11', name: 'P', ig: { id: '9', username: 'i' } }] }, threadsCheck: { state: 'ok', username: 'quotequarry8' } });
    assert.deepEqual(rows.map((r) => r.kind), ['youtube', 'facebook', 'instagram', 'threads']);
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'ids are unique');
  });
});

describe('UI helpers', () => {
  test('status words are fixed', () => {
    assert.deepEqual(STATUS_WORDS, { connected: 'Connected', needs_relogin: 'Needs re-login', not_connected: 'Not connected', unknown: "Can't check" });
  });
  test('summary: "4 connected · 1 needs you"', () => {
    const s = accountsSummary([
      { status: 'connected' }, { status: 'connected' }, { status: 'connected' }, { status: 'connected' },
      { status: 'needs_relogin' },
    ]);
    assert.equal(s.text, '4 connected · 1 needs you');
    const s2 = accountsSummary([{ status: 'connected' }, { status: 'not_connected' }, { status: 'unknown' }]);
    assert.equal(s2.text, "1 connected · 1 needs you · 1 can't check");
    assert.equal(accountsSummary([]).text, 'No accounts yet');
  });
  test('row line: "Can upload · read analytics · asks you first"', () => {
    assert.equal(accountLine({ status: 'connected', canDo: ['upload', 'analytics'], asksFirst: true }), 'Can upload · read analytics · asks you first');
    assert.equal(accountLine({ status: 'connected', canDo: ['upload', 'analytics'], asksFirst: false }), 'Can upload · read analytics · posts without asking');
    assert.equal(accountLine({ status: 'connected', canDo: ['cross-post'], asksFirst: null }), 'Can cross-post');
    assert.equal(accountLine({ status: 'needs_relogin', canDo: [], asksFirst: true, problem: 'Google sign-in was revoked' }), 'Google sign-in was revoked');
  });
});
