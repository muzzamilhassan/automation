// #105 Phase 3 Task 7 — the generators ask the brain (RAG wiring).
// Pins the two injected seams the generators gain, the ZERO-CONFIG GUARANTEE
// (BRAIN_ENABLED unset = byte-identical committed behavior: no brain fetch,
// no prompt marker, no dedupe call — even for finance-gated templates), and
// the FULL D6 TIERING MATRIX at the /dedupe seam:
//   brain UP   + BLOCK + finance template     -> walk consumed (retry with
//                                               vary-guidance); exhausted -> lane terminal
//   brain UP   + BLOCK + non-finance template -> downgraded to a recorded
//                                               WARN; proceed
//   brain DOWN + finance template             -> FAIL-CLOSED (lane terminal)
//   brain DOWN + non-finance template         -> fail-open (legacy + one warning)
//   WARN / PASS                                -> proceed always
// Also pins: /context before prompt assembly (labeled section +
// machine-parseable ids line), /health arming REQUIRES model_loaded +
// pgvector_reachable, the BRAIN_ENABLED flag name, templateId threading
// (yt-daily -> generateYouTubeScript -> /dedupe body), and registry thresholds
// as DATA (D8). All brain calls run against an injected brainFetch stub —
// never localhost, never the network (generator-routing.test.mjs house style).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BRAIN_ENABLED_ENV,
  brainBaseUrl,
  brainReachable,
  brainState,
  resetBrainHealth,
  brainContextSection,
  checkDup,
  registryThresholds,
  callScriptBrain,
  generateYouTubeScript,
} from '../youtube-engine.mjs';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';

// ---- fixtures (generator-routing.test.mjs style) ----

function stubResponse(body, { status = 200 } = {}) {
  const ok = status >= 200 && status < 300;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok,
    status,
    statusText: '',
    headers: undefined,
    json: async () => (typeof body === 'string' ? JSON.parse(text) : body),
    text: async () => text,
  };
}

// Brain-fetch stub answering by URL substring; records every call with its
// parsed JSON body. `reject: true` simulates a dead endpoint.
function brainFetchStub(rules) {
  const calls = [];
  const fn = async (url, init) => {
    const parsed = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body: parsed });
    const rule = rules.find((r) => String(url).includes(r.match));
    if (!rule) throw new Error(`brain stub: unexpected url ${String(url)}`);
    if (rule.reject) throw new Error(rule.message || 'connection refused');
    return stubResponse(rule.body, { status: rule.status });
  };
  fn.calls = calls;
  return fn;
}

// Provider-fetch stub scripted per call index (for escalation walks).
function scriptedProviderFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    const n = calls.push({ url: String(url), init });
    return handler(n, String(url), init);
  };
  fn.calls = calls;
  return fn;
}

function makeWriterStub() {
  const events = [];
  return {
    events,
    writer: {
      writeUsageEvent: async (e) => { events.push(e); return { ok: true }; },
      ensureUsageSchema: async () => ({ ok: true }),
    },
  };
}

const routingWith = (routes) => ({ resolveCapability: async () => routes });

// Temporarily set/clear the dispatch flag and reset the per-process health
// cache around a test — the enabled/disabled state must never leak between
// tests (the cache is process-global by design).
const withFlag = (value, fn) => async () => {
  const had = Object.prototype.hasOwnProperty.call(process.env, BRAIN_ENABLED_ENV);
  const prev = process.env[BRAIN_ENABLED_ENV];
  resetBrainHealth();
  if (value === undefined) delete process.env[BRAIN_ENABLED_ENV];
  else process.env[BRAIN_ENABLED_ENV] = value;
  try { await fn(); }
  finally {
    if (had) process.env[BRAIN_ENABLED_ENV] = prev;
    else delete process.env[BRAIN_ENABLED_ENV];
    resetBrainHealth();
  }
};

async function captureLogs(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.map(String).join(' '));
  try { return { out: await fn(), logs }; }
  finally { console.log = orig; }
}

const VALID_TITLE = (p) => p && typeof p.title === 'string' && p.title.length > 0;
const compatBody = (content) => ({ choices: [{ message: { content } }] });
const SHORTS_JSON = () => JSON.stringify({
  hook: 'Stop wasting your mornings',
  thumb_headline: 'MORNING RULES',
  points: [
    { title: 'P1', line: 'line 1' }, { title: 'P2', line: 'line 2' },
    { title: 'P3', line: 'line 3' }, { title: 'P4', line: 'line 4' },
  ],
  closing: 'Start tomorrow at 5.',
});

const GROQ_ROUTES = [{ providerId: 'groq', priority: 1, source: 'default' }];
const groqKeys = (slug, env) => { env.GROQ_API_KEY = 'gsk_x'; return ['groq']; };

const HEALTH = { match: '/health', body: { status: 'ok', model_loaded: true, pgvector_reachable: true } };
const HALF_READY = { match: '/health', body: { status: 'ok', model_loaded: false, pgvector_reachable: true } };
const PASS_VERDICT = { verdict: 'PASS', score: 0.42, top_match_id: null, neighbors: [] };

// The finance template id that arms D6 tiering (real registry data).
const FINANCE_TEMPLATE = 'finance-explainers';
const NON_FINANCE_TEMPLATE = 'documentary-frames';

// ---- config surface ----

test('brainBaseUrl: BRAIN_PORT picks the sidecar port; default 8000', () => {
  assert.equal(brainBaseUrl({ BRAIN_PORT: '9173' }), 'http://127.0.0.1:9173');
  assert.equal(brainBaseUrl({}), 'http://127.0.0.1:8000');
  assert.equal(brainBaseUrl({ BRAIN_PORT: 'garbage' }), 'http://127.0.0.1:8000');
});

test('flag name pin: BRAIN_ENABLED (singly-prefixed like the other BRAIN_* vars)', () => {
  assert.equal(BRAIN_ENABLED_ENV, 'BRAIN_ENABLED');
  const src = fs.readFileSync('youtube-engine.mjs', 'utf8');
  assert.equal(src.includes('BRAIN_BRAIN_ENABLED'), false, 'the doubled-prefix name must be gone');
  const deepdive = fs.readFileSync('yt-deepdive.mjs', 'utf8');
  assert.equal(deepdive.includes('BRAIN_BRAIN_ENABLED'), false);
});

// ---- zero config: the disabled path is provably inert ----

test('ZERO-CONFIG: disabled brain never fetches and leaves prompts byte-identical', withFlag(undefined, async () => {
  const brainFetch = brainFetchStub([]); // any brain call = failure
  const provider = scriptedProviderFetch((n, url) => {
    assert.ok(url.includes('api.groq.com'));
    return stubResponse(compatBody(SHORTS_JSON()));
  });
  const { out: script, logs } = await captureLogs(() => generateYouTubeScript(
    { id: 'p1', slug: 'zz-brain-off', name: 'Off Test' },
    'how to budget in a crisis',
    { templateId: FINANCE_TEMPLATE, injected: { realRouting: routingWith(GROQ_ROUTES), keys: groqKeys, writer: makeWriterStub().writer, fetch: provider, brainFetch, env: {} } },
  ));
  assert.equal(script.source, 'groq', 'disabled brain: generation behaves exactly as committed — even finance templates');
  assert.notEqual(script.source, 'fallback', 'zero-config must never fail-closed');
  assert.equal(brainFetch.calls.length, 0, 'zero-config -> zero brain calls');
  const prompt = JSON.parse(provider.calls[0].init.body).messages[0].content;
  assert.ok(!prompt.includes('YOUR PAST VIDEOS'), 'no context section may be injected when disabled');
  assert.equal(logs.filter((l) => l.includes('[brain')).length, 0, 'zero-config -> zero brain log lines');
}));

test('ZERO-CONFIG: dedupe descriptor + disabled brain makes no /dedupe call', withFlag(undefined, async () => {
  const brainFetch = brainFetchStub([]);
  const provider = scriptedProviderFetch(() => stubResponse(compatBody('{"title":"OK"}')));
  const res = await callScriptBrain({
    slug: 'chan-a', jobId: 'job-1', prompt: 'write a script',
    isValidJson: VALID_TITLE, maxAttempts: 2,
    injected: { realRouting: routingWith(GROQ_ROUTES), keys: groqKeys, writer: makeWriterStub().writer, fetch: provider, brainFetch, env: {} },
    dedupe: { channel: 'chan-a', kind: 'shorts', threshold: 0.85, financeGated: true, toChunks: (p) => [{ chunk_kind: 'pooled', text: p.title }] },
  });
  assert.equal(res.ok, true);
  assert.equal(brainFetch.calls.length, 0, 'disabled brain: the checkDup hook must be inert (even finance-gated)');
  assert.equal(res.walk, 1);
}));

// ---- /context before prompt assembly ----

test('context: enabled brain injects labeled exemplars and logs ids machine-parseably', withFlag('1', async () => {
  const brainFetch = brainFetchStub([
    HEALTH,
    { match: '/context', body: [{ id: 'vid-9', score: 0.81, performance: { views: 4321 }, excerpt: 'past   hook   text' }] },
    { match: '/dedupe', body: PASS_VERDICT },
  ]);
  const provider = scriptedProviderFetch(() => stubResponse(compatBody(SHORTS_JSON())));
  const { out: script, logs } = await captureLogs(() => generateYouTubeScript(
    { id: 'p1', slug: 'zz-brain-on', name: 'On Test' },
    'how to budget in a crisis',
    { injected: { realRouting: routingWith(GROQ_ROUTES), keys: groqKeys, writer: makeWriterStub().writer, fetch: provider, brainFetch, env: {} } },
  ));
  assert.equal(script.source, 'groq');
  const ctxCall = brainFetch.calls.find((c) => c.url.includes('/context'));
  assert.deepEqual(ctxCall.body, { channel: 'zz-brain-on', kind: 'shorts', topic: 'how to budget in a crisis', k: 3 });
  const prompt = JSON.parse(provider.calls[0].init.body).messages[0].content;
  assert.ok(prompt.startsWith('You write viral, high-retention'), 'context is appended, never prepended');
  assert.ok(prompt.includes('YOUR PAST VIDEOS — learn from these; vary from them'), 'the labeled injection marker');
  assert.ok(prompt.includes('past hook text'), 'excerpt text reaches the prompt (whitespace-normalized)');
  assert.ok(prompt.includes('views=4321'), 'performance rides with each exemplar');
  assert.ok(prompt.includes('[id=vid-9 | views=4321]'), 'exemplar id + performance visible in the section');
  const line = logs.find((l) => l.includes('[brain-context]'));
  assert.ok(line, 'the provenance line is logged');
  assert.match(line, /job=.+ channel=zz-brain-on kind=shorts ids=vid-9/, 'machine-parseable ids= record');
}));

test('context: empty retrieval logs the empty ids line and leaves the prompt clean', withFlag('1', async () => {
  const brainFetch = brainFetchStub([HEALTH, { match: '/context', body: [] }, { match: '/dedupe', body: PASS_VERDICT }]);
  const provider = scriptedProviderFetch(() => stubResponse(compatBody(SHORTS_JSON())));
  const { logs } = await captureLogs(() => generateYouTubeScript(
    { id: 'p1', slug: 'zz-brain-on', name: 'On Test' },
    'topic t',
    { injected: { realRouting: routingWith(GROQ_ROUTES), keys: groqKeys, writer: makeWriterStub().writer, fetch: provider, brainFetch, env: {} } },
  ));
  assert.match(logs.find((l) => l.includes('[brain-context]')), /ids=$/, 'empty corpus still records the ids line');
  const prompt = JSON.parse(provider.calls[0].init.body).messages[0].content;
  assert.ok(!prompt.includes('YOUR PAST VIDEOS'), 'no empty section injected');
}));

test('context: /context failure fails open with exactly one warning, prompt unchanged', withFlag('1', async () => {
  const brainFetch = brainFetchStub([
    HEALTH,
    { match: '/context', reject: true, message: '500' },
    { match: '/dedupe', body: PASS_VERDICT },
  ]);
  const provider = scriptedProviderFetch(() => stubResponse(compatBody(SHORTS_JSON())));
  const { logs } = await captureLogs(() => generateYouTubeScript(
    { id: 'p1', slug: 'zz-brain-on', name: 'On Test' },
    'topic t',
    { injected: { realRouting: routingWith(GROQ_ROUTES), keys: groqKeys, writer: makeWriterStub().writer, fetch: provider, brainFetch, env: {} } },
  ));
  const prompt = JSON.parse(provider.calls[0].init.body).messages[0].content;
  assert.ok(!prompt.includes('YOUR PAST VIDEOS'), 'fail-open: legacy prompt');
  assert.equal(logs.filter((l) => l.includes('[brain]')).length, 1, 'exactly one warning (D6: never dark, never noisy)');
  assert.match(logs.find((l) => l.includes('[brain]')), /context/i);
}));

test('context: dead sidecar (health fails) fails open once, then stays cached', withFlag('1', async () => {
  const brainFetch = brainFetchStub([{ match: '/health', reject: true, message: 'ECONNREFUSED' }]);
  const provider = scriptedProviderFetch(() => stubResponse(compatBody(SHORTS_JSON())));
  const run = () => generateYouTubeScript(
    { id: 'p1', slug: 'zz-brain-on', name: 'On Test' },
    'topic t',
    { injected: { realRouting: routingWith(GROQ_ROUTES), keys: groqKeys, writer: makeWriterStub().writer, fetch: provider, brainFetch, env: {} } },
  );
  const { logs } = await captureLogs(() => run().then(() => run()));
  assert.equal(brainFetch.calls.filter((c) => c.url.includes('/health')).length, 1, 'the health probe is cached per process');
  assert.equal(provider.calls.length, 2, 'generation proceeded both times');
  assert.equal(logs.filter((l) => l.includes('not ready')).length, 1, 'exactly one not-ready warning for the whole process');
}));

test('arming: /health 200 with model_loaded false is NOT armed (half-ready sidecar)', withFlag('1', async () => {
  const brainFetch = brainFetchStub([HALF_READY]);
  const provider = scriptedProviderFetch(() => stubResponse(compatBody(SHORTS_JSON())));
  const { logs } = await captureLogs(() => generateYouTubeScript(
    { id: 'p1', slug: 'zz-brain-on', name: 'On Test' },
    'topic t',
    { injected: { realRouting: routingWith(GROQ_ROUTES), keys: groqKeys, writer: makeWriterStub().writer, fetch: provider, brainFetch, env: {} } },
  ));
  assert.equal(await brainState({ brainFetch }), 'down');
  assert.equal(brainFetch.calls.length, 1, 'no /context or /dedupe may fire on a half-ready sidecar');
  assert.ok(logs.some((l) => l.includes('not ready')), 'the not-ready warning is visible');
  const prompt = JSON.parse(provider.calls[0].init.body).messages[0].content;
  assert.ok(!prompt.includes('YOUR PAST VIDEOS'));
}));

// ---- the D6 tiering matrix at the /dedupe seam ----

const dedupeCallScriptBrain = (brainFetch, provider, over = {}) => {
  const { dedupe: dedupeOver, ...rest } = over;
  return callScriptBrain({
    slug: 'chan-a', jobId: 'job-1', prompt: 'write a script',
    isValidJson: VALID_TITLE, maxAttempts: 2,
    suffix: '\nReply with the raw JSON object ONLY.',
    injected: { realRouting: routingWith(GROQ_ROUTES), keys: groqKeys, writer: makeWriterStub().writer, fetch: provider, brainFetch, env: {} },
    dedupe: {
      channel: 'chan-a', kind: 'shorts', threshold: 0.85,
      toChunks: (p) => [{ chunk_kind: 'pooled', text: p.title }],
      ...dedupeOver,
    },
    ...rest,
  });
};

test('D6 tier 3 (UP+BLOCK+finance): BLOCK consumes the walk and the next walk names the top match', withFlag('1', async () => {
  let dedupeCalls = 0;
  const brainCalls = [];
  const scriptedBrain = async (url, init) => {
    const parsed = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    brainCalls.push({ url: String(url), body: parsed });
    if (String(url).includes('/health')) return stubResponse(HEALTH.body);
    if (String(url).includes('/dedupe')) {
      dedupeCalls++;
      return stubResponse(dedupeCalls === 1
        ? { verdict: 'BLOCK', score: 0.93, top_match_id: 'vid-dup', neighbors: [] }
        : { verdict: 'PASS', score: 0.42, top_match_id: null, neighbors: [] });
    }
    throw new Error('unexpected brain url ' + url);
  };
  const provider = scriptedProviderFetch(() => stubResponse(compatBody('{"title":"GROQ WINS"}')));
  const { out: res, logs } = await captureLogs(() => dedupeCallScriptBrain(scriptedBrain, provider, {
    dedupe: { templateId: FINANCE_TEMPLATE, financeGated: true, crossThreshold: 0.9 },
  }));

  assert.equal(res.ok, true);
  assert.equal(res.walk, 2, 'the BLOCKed reply must consume exactly one escalation walk');
  const walk1 = JSON.parse(provider.calls[0].init.body).messages[0].content;
  const walk2 = JSON.parse(provider.calls[1].init.body).messages[0].content;
  assert.equal(walk1, 'write a script', 'walk 1 prompt stays clean');
  assert.ok(walk2.includes('Reply with the raw JSON object ONLY'), 'the existing escalation suffix still applies');
  assert.ok(walk2.includes("Your previous video ('vid-dup') covered this — vary the hook and examples"),
    'the retry names the top match');
  assert.ok(walk2.startsWith('write a script'), 'guidance appended, base prompt unchanged');
  const dedupeBody = brainCalls.find((c) => c.url.includes('/dedupe')).body;
  assert.deepEqual(dedupeBody, {
    channel: 'chan-a', kind: 'shorts', chunks: [{ chunk_kind: 'pooled', text: 'GROQ WINS' }],
    threshold: 0.85, job_id: 'job-1', template_id: FINANCE_TEMPLATE, cross_channel_threshold: 0.9,
  }, 'template identity + registry thresholds ride to the gate (D8 threading)');
  assert.ok(logs.some((l) => l.includes('[brain-dedupe]') && l.includes('verdict=BLOCK') && l.includes('top_match=vid-dup')),
    'the verdict is recorded machine-parseably');
}));

test('D6 tier 4 (UP+BLOCK+non-finance): BLOCK downgrades to a recorded WARN and proceeds', withFlag('1', async () => {
  const scriptedBrain = async (url) => {
    if (String(url).includes('/health')) return stubResponse(HEALTH.body);
    if (String(url).includes('/dedupe')) return stubResponse({ verdict: 'BLOCK', score: 0.93, top_match_id: 'vid-dup', neighbors: [] });
    throw new Error('unexpected brain url ' + url);
  };
  const provider = scriptedProviderFetch(() => stubResponse(compatBody('{"title":"KEPT"}')));
  const { out: res, logs } = await captureLogs(() => dedupeCallScriptBrain(scriptedBrain, provider, {
    dedupe: { templateId: NON_FINANCE_TEMPLATE, financeGated: false },
  }));
  assert.equal(res.ok, true, 'non-finance BLOCK must proceed (fewer videos is never the failure mode)');
  assert.equal(res.walk, 1, 'downgraded BLOCK consumes no walk');
  assert.ok(logs.some((l) => l.includes('[brain-dedupe]') && l.includes('verdict=WARN') && l.includes('D6 tier 4')),
    'the downgrade is recorded as WARN, machine-parseably');
  assert.equal(logs.filter((l) => l.includes('verdict=BLOCK')).length, 0,
    'no raw BLOCK line may leak for the downgraded lane');
}));

test('D6 tier 3 exhausted (UP+BLOCK+finance every walk): ok:false, ceiling respected', withFlag('1', async () => {
  const scriptedBrain = async (url) => {
    if (String(url).includes('/health')) return stubResponse(HEALTH.body);
    if (String(url).includes('/dedupe')) return stubResponse({ verdict: 'BLOCK', score: 0.95, top_match_id: 'vid-dup', neighbors: [] });
    throw new Error('unexpected brain url ' + url);
  };
  const provider = scriptedProviderFetch(() => stubResponse(compatBody('{"title":"STILL A DUP"}')));
  const { out: res } = await captureLogs(() => dedupeCallScriptBrain(scriptedBrain, provider, {
    dedupe: { templateId: FINANCE_TEMPLATE, financeGated: true },
  }));
  assert.equal(res.ok, false, 'exhausted walks -> ok:false (engine maps this to the fallback terminal)');
  assert.equal(provider.calls.length, 2, 'maxAttempts is the ceiling; BLOCK cannot extend it');
  const walk2 = JSON.parse(provider.calls[1].init.body).messages[0].content;
  assert.ok(walk2.includes("('vid-dup')"), 'the final walk still carried the vary guidance');
}));

test('D6 tier 1 (DOWN+finance): unreachable gate fails closed into the lane terminal', withFlag('1', async () => {
  const scriptedBrain = async (url) => {
    if (String(url).includes('/health')) throw new Error('ECONNREFUSED');
    throw new Error('unexpected brain url ' + url);
  };
  const provider = scriptedProviderFetch(() => stubResponse(compatBody(SHORTS_JSON())));
  const { out: script, logs } = await captureLogs(() => generateYouTubeScript(
    { id: 'p1', slug: 'zz-finance-chan', name: 'Finance Chan' },
    'topic t',
    { templateId: FINANCE_TEMPLATE, injected: { realRouting: routingWith(GROQ_ROUTES), keys: groqKeys, writer: makeWriterStub().writer, fetch: provider, brainFetch: scriptedBrain, env: {} } },
  ));
  assert.equal(script.source, 'fallback', 'finance + brain down -> the lane terminal (never publish un-gated)');
  assert.ok(logs.some((l) => l.includes('D6 tier 1 fail-closed')), 'the fail-closed reason is ntfy-visible in the log');
}));

test('D6 tier 2 (DOWN+non-finance): gate failure skips fail-open, no walk consumed', withFlag('1', async () => {
  const scriptedBrain = async (url) => {
    if (String(url).includes('/health')) return stubResponse(HEALTH.body);
    if (String(url).includes('/dedupe')) throw new Error('500');
    throw new Error('unexpected brain url ' + url);
  };
  const provider = scriptedProviderFetch(() => stubResponse(compatBody('{"title":"OK"}')));
  const { out: res, logs } = await captureLogs(() => dedupeCallScriptBrain(scriptedBrain, provider, {
    dedupe: { templateId: NON_FINANCE_TEMPLATE, financeGated: false },
  }));
  assert.equal(res.ok, true);
  assert.equal(res.walk, 1, 'a dead gate must not eat walks');
  assert.equal(logs.filter((l) => l.includes('[brain]')).length, 1, 'one warning for the dead gate');
  assert.match(logs.find((l) => l.includes('[brain]')), /dedupe/i);
}));

test('D6 tier 1 via failed /dedupe call (not just health): finance fail-closed holds', withFlag('1', async () => {
  const scriptedBrain = async (url) => {
    if (String(url).includes('/health')) return stubResponse(HEALTH.body);
    if (String(url).includes('/dedupe')) throw new Error('500');
    throw new Error('unexpected brain url ' + url);
  };
  const provider = scriptedProviderFetch(() => stubResponse(compatBody('{"title":"UNGATED?"}')));
  const { out: res, logs } = await captureLogs(() => dedupeCallScriptBrain(scriptedBrain, provider, {
    dedupe: { templateId: FINANCE_TEMPLATE, financeGated: true },
  }));
  assert.equal(res.ok, false, 'finance + gate error = same fail-closed terminal');
  assert.ok(logs.some((l) => l.includes('D6 tier 1 fail-closed')));
}));

test('D6 tier 5: WARN and PASS proceed for BOTH finance and non-finance, no walk consumed', withFlag('1', async () => {
  for (const financeGated of [false, true]) {
    for (const verdict of ['WARN', 'PASS']) {
      resetBrainHealth();
      const scriptedBrain = async (url) => {
        if (String(url).includes('/health')) return stubResponse(HEALTH.body);
        if (String(url).includes('/dedupe')) return stubResponse({ verdict, score: 0.91, top_match_id: 'vid-x', neighbors: [] });
        throw new Error('unexpected brain url ' + url);
      };
      const provider = scriptedProviderFetch(() => stubResponse(compatBody('{"title":"OK"}')));
      const { out: res, logs } = await captureLogs(() => dedupeCallScriptBrain(scriptedBrain, provider, {
        dedupe: { templateId: financeGated ? FINANCE_TEMPLATE : NON_FINANCE_TEMPLATE, financeGated },
      }));
      assert.equal(res.ok, true, `${verdict}/finance=${financeGated} must proceed`);
      assert.equal(res.walk, 1, `${verdict}/finance=${financeGated} must not consume a walk`);
      assert.ok(logs.some((l) => l.includes(`verdict=${verdict}`)), `${verdict}/finance=${financeGated} recorded`);
    }
  }
}));

test('engine D6 tier 3 end-to-end: BLOCK-exhausted finance short lands on the template fallback', withFlag('1', async () => {
  const scriptedBrain = async (url) => {
    if (String(url).includes('/health')) return stubResponse(HEALTH.body);
    if (String(url).includes('/dedupe')) return stubResponse({ verdict: 'BLOCK', score: 0.95, top_match_id: 'vid-dup', neighbors: [] });
    throw new Error('unexpected brain url ' + url);
  };
  const provider = scriptedProviderFetch(() => stubResponse(compatBody(SHORTS_JSON())));
  const { out: script } = await captureLogs(() => generateYouTubeScript(
    { id: 'p1', slug: 'zz-brain-on', name: 'On Test' },
    'topic t',
    { templateId: FINANCE_TEMPLATE, injected: { realRouting: routingWith(GROQ_ROUTES), keys: groqKeys, writer: makeWriterStub().writer, fetch: provider, brainFetch: scriptedBrain, env: {} } },
  ));
  assert.equal(script.source, 'fallback', "source:'fallback' terminal unchanged (yt-daily gate intact)");
  assert.ok(script.hook && Array.isArray(script.points), 'fallback template stays well-formed');
}));

// ---- templateId threading (D8: slug -> assignment -> registry meta -> gate) ----

test('threading: engine sends template_id + registry thresholds in the /dedupe body', withFlag('1', async () => {
  const brainCalls = [];
  const scriptedBrain = async (url, init) => {
    const parsed = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    brainCalls.push({ url: String(url), body: parsed });
    if (String(url).includes('/health')) return stubResponse(HEALTH.body);
    if (String(url).includes('/dedupe')) return stubResponse(PASS_VERDICT);
    throw new Error('unexpected brain url ' + url);
  };
  const provider = scriptedProviderFetch(() => stubResponse(compatBody(SHORTS_JSON())));
  await captureLogs(() => generateYouTubeScript(
    { id: 'p1', slug: 'zz-threaded', name: 'Threaded' },
    'topic t',
    { templateId: FINANCE_TEMPLATE, injected: { realRouting: routingWith(GROQ_ROUTES), keys: groqKeys, writer: makeWriterStub().writer, fetch: provider, brainFetch: scriptedBrain, env: {} } },
  ));
  const body = brainCalls.find((c) => c.url.includes('/dedupe')).body;
  assert.equal(body.template_id, FINANCE_TEMPLATE);
  assert.equal(body.threshold, 0.85);
  assert.equal(body.cross_channel_threshold, 0.9, 'the registry cross-channel band is transported, not just server-derived');
}));

test('threading: yt-daily resolves the channel assignment and passes it to both call sites', () => {
  const src = fs.readFileSync('yt-daily.mjs', 'utf8');
  assert.ok(src.includes('resolveTemplateId'), 'yt-daily must resolve the active assignment');
  const calls = src.match(/generateYouTubeScript\(/g) || [];
  assert.ok(calls.length >= 2, 'both call sites are threaded');
  assert.equal((src.match(/\{ templateId: brainTemplateId \}/g) || []).length, 2,
    'every generateYouTubeScript call passes the threaded templateId');
});

test('registryThresholds: returns the D8 data AND the D6 finance signal from the REAL registry', () => {
  assert.deepEqual(registryThresholds(FINANCE_TEMPLATE), {
    variation: 0.85,
    crossChannel: 0.90,
    reviewRequired: ['finance'],
    financeGated: true,
  });
  assert.deepEqual(registryThresholds(null), {
    variation: 0.85,
    crossChannel: 0.90,
    reviewRequired: [],
    financeGated: false,
  }, 'template-less lanes: documented defaults, NOT finance-gated');
  assert.deepEqual(registryThresholds(NON_FINANCE_TEMPLATE).financeGated, false);
  assert.deepEqual(registryThresholds('not-a-template').financeGated, false);
});

test('registry data: only finance-explainers declares the brain thresholds; defaults documented', () => {
  assert.ok(
    Object.entries(REGISTRY_META).every(([id, meta]) => id === FINANCE_TEMPLATE ||
      (meta.variation_threshold === undefined && meta.cross_channel_threshold === undefined)),
    'other templates must inherit the documented defaults (per-template data when needed)',
  );
  const src = fs.readFileSync('studio/lib/template-registry.data.js', 'utf8');
  assert.match(src, /0\.85[\s\S]{0,200}0\.90/, 'the file documents the default thresholds');
});

// ---- pure helpers ----

test('brainContextSection: labeled header, numbered items, ids + performance', () => {
  const section = brainContextSection([
    { id: 'vid-1', score: 0.9, performance: { views: 1000 }, excerpt: 'a  b\n c' },
    { id: null, score: 0.5, performance: {}, excerpt: '' },
  ]);
  assert.ok(section.includes('YOUR PAST VIDEOS — learn from these; vary from them'));
  assert.ok(section.includes('1. [id=vid-1 | views=1000] a b c'));
  assert.ok(section.includes('2. [id=unknown]'), 'missing ids render as unknown, never crash');
});

test('brainState: missing flag is a silent off (zero-config stays byte-identical)', withFlag(undefined, async () => {
  const brainFetch = brainFetchStub([]);
  const { logs } = await captureLogs(async () => {
    assert.equal(await brainState({ brainFetch }), 'off');
    assert.equal(await brainReachable({ brainFetch }), false);
  });
  assert.equal(brainFetch.calls.length, 0, 'no health probe when the flag is absent');
  assert.equal(logs.length, 0, 'disabled is silent');
}));

test('checkDup: guard rails — no channel/kind/chunks means no call', withFlag('1', async () => {
  const brainFetch = brainFetchStub([]);
  assert.equal(await checkDup({ channel: null, kind: 'shorts', chunks: [{ text: 'x' }], injected: { brainFetch } }), null);
  assert.equal(await checkDup({ channel: 'c', kind: 'shorts', chunks: [], injected: { brainFetch } }), null);
  assert.equal(brainFetch.calls.length, 0);
}));

// ---- the deepdive lane (source pins — yt-deepdive.mjs executes top-level code) ----

test('yt-deepdive: doc lane wires /context + checkDup with kind doc and keeps its throw', () => {
  const src = fs.readFileSync('yt-deepdive.mjs', 'utf8');
  assert.ok(src.includes('fetchBrainContext'), 'doc lane must fetch /context before prompt assembly');
  assert.ok(src.includes('brainContextSection'), 'doc lane must inject the labeled exemplar section');
  assert.ok(/kind:\s*'doc'/.test(src), 'doc lane dedupe kind is doc (matches the backfill corpus)');
  assert.ok(src.includes('crossThreshold'), 'the registry cross-channel band is transported');
  assert.ok(src.includes('financeGated'), 'the D6 tiering signal is explicit on the doc descriptor');
  assert.ok(src.includes('docDedupeChunks'), 'the episode rides to /dedupe as pooled chunks');
  assert.ok(src.includes('llmScript(LONG_PROMPT(b, theme, docPlan), longSeed?.title || theme, docTemplateId)'), 'the call site passes the prompt (and topic) + the resolved template id through the brain seam (P5-T2e)');
  assert.ok(src.includes("throw new Error('all script providers failed')"), 'exhausted walks still throw (episode retried next doc day)');
  assert.ok(src.includes('maxAttempts: 3'), 'the 3-walk escalation ceiling stays');
});
