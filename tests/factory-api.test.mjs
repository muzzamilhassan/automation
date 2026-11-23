// "Ask the factory" (2026-11-23) — /api/factory/plan + /api/factory/start.
// SOURCE-SCAN pins (house pattern for studio routes, see
// tests/studio-action-route.test.mjs: '@/lib' aliases and live db/audit
// imports keep plain node --test from importing the route).
// EARS: owner only (proxy AND in-route, fail-closed); rate-limited; text
// capped; plan = no side effects; start re-validates server-side (real
// channel, 7/7 ready, lane would do something, no run already waiting) and
// dispatches ONLY {channel, topic, lane} built by the planner module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allowedRoles } from '../studio/lib/route-roles.js';
import { dispatchResumeRun } from '../studio/lib/review-actions.mjs';
import { withDispatchInputs, dispatchInputs } from '../studio/lib/factory-plan.mjs';

const plan = fs.readFileSync('studio/app/api/factory/plan/route.js', 'utf8');
const start = fs.readFileSync('studio/app/api/factory/start/route.js', 'utf8');
const setup = fs.readFileSync('studio/app/api/factory/factory-setup.js', 'utf8');

test('EARS: the proxy maps both factory routes to the owner only', () => {
  assert.deepEqual(allowedRoles('/api/factory/plan'), ['owner']);
  assert.deepEqual(allowedRoles('/api/factory/start'), ['owner']);
});

test('EARS: both routes re-check owner in-route, fail-closed (no user = 401, any other role = 403)', () => {
  for (const src of [plan, start]) {
    assert.match(src, /const user = await getUser\(req\);\n\s+if \(!user\) return Response\.json\(\{ error: 'not signed in' \}, \{ status: 401 \}\);\n\s+if \(user\.role !== 'owner'\) return Response\.json\(\{ error: [^}]+\}, \{ status: 403 \}\);/);
    assert.match(src, /export const dynamic = 'force-dynamic';/);
    assert.doesNotMatch(src, /export async function GET/, 'POST only');
  }
});

test('EARS: both routes are rate-limited by the Neon limiter right after auth', () => {
  assert.match(plan, /enforceLimits\(user, \[\s*\{ bucket: 'factory-plan', limit: \d+, windowSec: 3600 \},\s*\{ bucket: 'factory-plan', limit: \d+, windowSec: 86400 \},?\s*\]\)/);
  // start = a billable Actions run: the SAME 'dispatch' bucket as /api/action
  assert.match(start, /enforceLimits\(user, \[\s*\{ bucket: 'dispatch', limit: 10, windowSec: 3600 \},\s*\{ bucket: 'dispatch', limit: 30, windowSec: 86400 \},?\s*\]\)/);
  for (const src of [plan, start]) assert.ok(src.indexOf('enforceLimits(') < src.indexOf('loadFactorySetup('), 'limit before the expensive work');
});

test('EARS: the plan route caps the text and has no side effects (no dispatch, no writes)', () => {
  assert.match(plan, /text\.length > FACTORY_TEXT_MAX/);
  assert.doesNotMatch(plan, /dispatches|dispatchResumeRun|writeRepoJSON|upsertChannel|method: 'POST'/);
  // the AI reply goes through the strict parser; the plan is built by code
  assert.match(plan, /parseFactoryReply\(raw, channels\)/);
  assert.match(plan, /buildPlan\(pick, channels/);
  assert.match(plan, /ruleParse\(text, channels\)/, 'deterministic fallback when Groq is unavailable');
});

test('EARS: start re-validates the plan server-side against the real channel list', () => {
  assert.match(start, /revalidatePlan\(body\.plan, channels\)/);
  assert.match(setup, /readRepoJSON\('yt-mcp\/studio-channels\.json'\)/);
  assert.match(setup, /factoryChannels\(registry, cadence, REGISTRY_META\)/);
});

test('EARS: start refuses a channel that is not 7/7 ready, with a plain reason', () => {
  assert.match(start, /readinessFor\(\{ registry, cadence, slug \}\)/);
  assert.match(start, /if \(!readiness\.ready\)[\s\S]{0,300}missingLabels\(readiness\)[\s\S]{0,400}status: 409/);
  assert.ok(start.indexOf('readiness.ready') < start.indexOf('dispatchResumeRun('), 'ready gate before dispatch');
});

test('EARS: start refuses a run that would do nothing or cancel a waiting run', () => {
  assert.match(start, /laneBlocker\(\{ lane: p\.lane, label: p\.channelLabel, state \}\)/);
  assert.match(start, /channelRunBusy\(\{ slug, token: TOKEN, repo: REPO \}\)/);
  for (const k of ['laneBlocker(', 'channelRunBusy(']) assert.ok(start.indexOf(k) < start.indexOf('dispatchResumeRun('), `${k} before dispatch`);
});

test('EARS: start dispatches ONLY the planner-built {channel, topic, lane} — nothing free-form from the request', () => {
  assert.match(start, /const inputs = dispatchInputs\(p\);/);
  assert.match(start, /dispatchResumeRun\(\{ slug, token: TOKEN, repo: REPO, fetchImpl: withDispatchInputs\(inputs\) \}\)/);
  assert.doesNotMatch(start, /body\.plan\.(topic|channel|lane)/, 'raw request fields never reach the dispatch');
  assert.doesNotMatch(start, /body\.(text|topic|inputs|lane|channel)\b/);
  assert.match(start, /appendAudit\(user\.email, 'factory-start'/);
  assert.match(start, /runUrl: '\/runs'/);
});

test('EARS: the dispatched request is the shared dispatcher request shape plus ONLY topic + lane', async () => {
  const calls = [];
  const fake = async (url, opts) => { calls.push({ url, opts }); return { status: 204, text: async () => '' }; };
  const inputs = dispatchInputs({ channel: 'money-rulebook', topic: 'credit-card float', lane: 'doc', steps: [], warnings: ['x'] });
  const r = await dispatchResumeRun({ slug: 'money-rulebook', token: 't', repo: 'o/r', fetchImpl: withDispatchInputs(inputs, fake) });
  assert.deepEqual(r, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/o/r/actions/workflows/channel-autopilot.yml/dispatches');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer t');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { ref: 'main', inputs: { channel: 'money-rulebook', topic: 'credit-card float', lane: 'doc' } });
});

test('EARS: the Create page shows the factory box to the owner — plan first, Start confirmed, house text scale only', () => {
  const page = fs.readFileSync('studio/app/studio/page.js', 'utf8');
  const box = fs.readFileSync('studio/components/FactoryBox.js', 'utf8');
  assert.match(page, /\{me\?\.role === 'owner' \? <FactoryBox \/> : null\}/);
  assert.match(box, /placeholder="e\.g\. Make a Money Rulebook video about credit-card float"/);
  assert.match(box, /postJSON\('\/api\/factory\/plan', \{ text: text\.trim\(\) \}\)/);
  // Start sends only the three fields back, after a confirm
  assert.match(box, /const ok = await confirm\(\{[\s\S]{0,400}if \(!ok\) return;[\s\S]{0,200}postJSON\('\/api\/factory\/start', \{ plan: \{ channel: plan\.channel, lane: plan\.lane, topic: plan\.topic \} \}\)/);
  for (const label of ['Plan it', 'Start', 'Change', 'Cancel', 'Watch it on Runs', 'Publishes at the channel’s next slot']) assert.ok(box.includes(label), label);
  assert.doesNotMatch(box, /text-\[\d+px\]|text-(xs|sm|base|lg|xl)\b/, 'only the .t-10…t-16 scale');
  for (const m of box.matchAll(/\bt-(\d+)\b/g)) assert.ok([10, 11, 12, 13, 14, 16].includes(Number(m[1])), `t-${m[1]}`);
});

test('EARS: start refuses when today’s slot already holds a script (waiting / approved / rejected) — the topic would be silently dropped', () => {
  assert.match(start, /import \{ getScriptStore \} from '@\/lib\/script-store\.mjs';/);
  // checked unless the channel is known to be ungated (the gate never reads the slot then)
  assert.match(start, /if \(p\.reviewGate !== false\) \{/);
  assert.match(start, /store\.scriptsForSlot\(slug, today\)/);
  assert.match(start, /slotScriptBlocker\(\{ scripts, label: p\.channelLabel \}\)/);
  assert.ok(start.indexOf('slotScriptBlocker(') < start.indexOf('dispatchResumeRun('), 'slot check before dispatch');
});
