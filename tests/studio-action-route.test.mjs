// #106 Phase 4.5 T1a — the Studio Run buttons (/api/action) vs the DELETED
// per-channel workflows. The legacy-4 fast path kept yt-daily/deepdive
// dispatching channel-<slug>.yml, but those four workflows were deleted in
// a1ebac4 (#77 consolidated everything into channel-autopilot.yml) — every
// legacy run button was a guaranteed GitHub 404 that could never work.
// tiktok-post.yml is gone from .github/workflows/ too.
//
// SOURCE-SCAN + fs pins — the house pattern for studio route files
// (tests/schedule-quota-route.test.mjs): the route imports through the '@/lib'
// alias plain node --test cannot resolve, and a live import would pull the
// real db/audit stores. The integrity scan is the regression that would have
// caught the deleted-workflow bug: every workflow file the route references
// must exist in .github/workflows/ on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('studio/app/api/action/route.js', 'utf8');

// The slug universe the MAP's dynamic refs must survive: the legacy 4 (the
// historical dispatch targets) plus every channel in the engine registry.
const LEGACY_4 = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];
const registrySlugs = (() => {
  try {
    return JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8')).channels.map((c) => c.slug);
  } catch {
    return [];
  }
})();
const SLUG_UNIVERSE = [...new Set([...LEGACY_4, ...registrySlugs])];

// Every workflow reference in the route: single-quoted MAP values, backtick
// templates (expanded over the slug universe), and `workflow = '...'` assigns.
function workflowRefs(source) {
  const refs = [];
  for (const m of source.matchAll(/workflow:\s*'([^']+\.yml)'/g)) refs.push(m[1]);
  for (const m of source.matchAll(/workflow\s*=\s*'([^']+\.yml)'/g)) refs.push(m[1]);
  for (const m of source.matchAll(/workflow:\s*`([^`]+)`/g)) {
    for (const slug of SLUG_UNIVERSE) refs.push(m[1].replace(/\$\{[^}]+\}/g, slug));
  }
  return [...new Set(refs)];
}

test('T1a integrity: every workflow file referenced by the action route exists in .github/workflows/ (would have caught the deleted legacy-4 workflows)', () => {
  const refs = workflowRefs(src);
  assert.ok(refs.length >= 3, `the scan must find real references (found ${refs.length}) — regex rot must not silently pass`);
  const missing = refs.filter((f) => !fs.existsSync(`.github/workflows/${f}`));
  assert.deepEqual(missing, [], `dead workflow references (GitHub 404 on dispatch): ${missing.join(', ')}`);
});

test('T1a fix: yt-daily and deepdive dispatch channel-autopilot.yml with the channel input for EVERY channel — no per-channel workflow reference remains', () => {
  assert.equal(
    /channel-\$\{[^}]+\}\.yml/.test(src),
    false,
    'the per-channel workflow template must be gone (those files were deleted in a1ebac4)',
  );
  for (const action of ['yt-daily', 'deepdive']) {
    const line = src.split('\n').find((l) => l.includes(`'${action}':`));
    assert.ok(line, `the MAP must keep a '${action}' entry`);
    assert.ok(line.includes('channel-autopilot.yml'), `'${action}' must dispatch channel-autopilot.yml — the one workflow every channel runs`);
    assert.ok(/channel:\s*slug/.test(line), `'${action}' must pass the channel input to channel-autopilot.yml`);
  }
  assert.equal(/const SLUGS/.test(src), false, 'the legacy-4 fast path must die — no hardcoded slug list may divert dispatch away from the generic workflow');
});

test('T1a: unknown slugs still 400 through the registry check — now enforced for every channel, not only non-legacy ones', () => {
  assert.ok(/registryChannels\(\)/.test(src), 'the registry membership check must stay');
  assert.ok(/'unknown channel'/.test(src), 'unknown slugs must be rejected as unknown channel');
  assert.ok(!/SLUGS\.includes/.test(src), 'the registry check must not be gated on a legacy slug list — that gating is what kept the legacy 4 on the dead workflow');
});

test('T1a: tiktok maps to a clean 400 — workflow retired (the route must stop referencing the deleted workflow)', () => {
  assert.equal(src.includes('tiktok-post.yml'), false, 'the route must not reference the deleted tiktok workflow');
  assert.ok(/workflow retired/.test(src), "the retired action must answer 400 'workflow retired', not a GitHub 404");
  assert.match(src, /status: 400/);
});

test('T1a: body.topup (positive integer) on the channel-run actions forwards String(N) as the autopilot topup input', () => {
  assert.ok(/Number\.isInteger\(body\.topup\)/.test(src), 'topup must be pinned to integers (the coercion to the workflow string input happens route-side)');
  assert.ok(/topup\s*=\s*String\(|topup:\s*String\(/.test(src), 'the workflow input is a string — topup must cross as String(N)');
  assert.ok(/channelRun/.test(src), 'topup rides the channel-run actions only (yt-daily/deepdive)');
  assert.match(src, /topup must be a positive integer/, 'bad topup values must fail loudly, not silently run a normal day');
});
