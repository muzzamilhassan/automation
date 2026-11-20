// live fix wave B2 (P9 / T4-04) — "Draft with AI" always failed in production
// with "AI draft failed (groq 400)". Root cause: the request asked the
// reasoning model openai/gpt-oss-120b for JSON mode with max_tokens 900 and
// default reasoning effort. Its hidden reasoning eats that budget, the JSON is
// cut off, and Groq's JSON-mode check answers 400 (json_validate_failed).
// The error body was thrown away, so nobody could see why.
// We cannot call Groq from tests (the key lives only in Vercel), so these
// tests pin the EXACT request body with a mocked fetch. EARS:
//   WHEN the kit draft calls Groq, the system SHALL send a current model id,
//     reasoning_effort "low" for gpt-oss models, a token budget large enough
//     for reasoning + JSON, JSON mode, and the word "json" in the messages.
//   The system SHALL NOT send parameters the model does not support.
//   IF Groq answers non-OK, THEN the thrown error SHALL carry the status, the
//     Groq error code and error.message, and SHALL NOT contain the API key.
//   IF Groq answers 400/404 with a model error or json_validate_failed, THEN
//     the system SHALL retry once with the fallback model.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  groqChat, llmKitDraft, kitModels,
  LLM_MODEL_DEFAULT, LLM_MODEL_FALLBACK, LLM_MAX_TOKENS,
} from '../studio/lib/llm-kit.js';

const KEY = 'gsk_test_secret_key_do_not_log_123456';
let saved;
beforeEach(() => {
  saved = { k: process.env.GROQ_API_KEY, m: process.env.GROQ_MODEL, km: process.env.GROQ_KIT_MODEL, fb: process.env.GROQ_KIT_FALLBACK_MODEL };
  process.env.GROQ_API_KEY = KEY;
  delete process.env.GROQ_MODEL;
  delete process.env.GROQ_KIT_MODEL;
  delete process.env.GROQ_KIT_FALLBACK_MODEL;
});
afterEach(() => {
  for (const [name, v] of [['GROQ_API_KEY', saved.k], ['GROQ_MODEL', saved.m], ['GROQ_KIT_MODEL', saved.km], ['GROQ_KIT_FALLBACK_MODEL', saved.fb]]) {
    if (v === undefined) delete process.env[name]; else process.env[name] = v;
  }
});

const okReply = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }), text: async () => '' });
const errReply = (status, error) => ({ ok: false, status, json: async () => ({ error }), text: async () => JSON.stringify({ error }) });

function recorder(replies) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return typeof r === 'function' ? r() : r;
  };
  return { f, calls };
}

const DRAFT = { eyebrow: 'STOIC RULES', tagline: 'Calm wins.', description: 'd', tags: ['stoic quotes'], subNiches: ['stoic habits'], voice: 'am_michael', style: 'doc' };

test('P9: the request body is exactly the supported shape (model, effort, budget, JSON mode, messages)', async () => {
  const { f, calls } = recorder([okReply(DRAFT)]);
  await llmKitDraft({ niche: 'stoicism', label: 'Stoic Lab', slug: 'stoic-lab' }, { fetchImpl: f });
  assert.equal(calls.length, 1);
  const { url, init, body } = calls[0];
  assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(init.method, 'POST');
  assert.equal(body.model, 'openai/gpt-oss-120b');
  assert.equal(body.model, LLM_MODEL_DEFAULT);
  assert.equal(body.reasoning_effort, 'low', 'gpt-oss reasoning must be kept low so the JSON fits');
  assert.ok(body.max_tokens >= 4000, `max_tokens ${body.max_tokens} leaves room for reasoning + JSON`);
  assert.equal(body.max_tokens, LLM_MAX_TOKENS);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'reasoning_effort', 'response_format', 'temperature'].sort(), 'no extra or unsupported params');
  assert.ok(body.temperature >= 0 && body.temperature <= 2);
  assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
  assert.ok(body.messages.some((m) => m.content.includes('json')), 'JSON mode needs the lowercase word "json" in the messages');
});

test('P9: the key goes only in the Authorization header, never in the body', async () => {
  const { f, calls } = recorder([okReply(DRAFT)]);
  await llmKitDraft({ niche: 'stoicism', label: 'Stoic Lab' }, { fetchImpl: f });
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.ok(!calls[0].init.body.includes(KEY));
});

test('P9: a non-gpt-oss model gets no reasoning_effort (unsupported there)', async () => {
  const { f, calls } = recorder([okReply(DRAFT)]);
  await groqChat({ system: 'Reply in json.', user: 'x' }, { model: 'qwen/qwen3.8-27b', fetchImpl: f });
  assert.equal(calls[0].body.model, 'qwen/qwen3.8-27b');
  assert.ok(!('reasoning_effort' in calls[0].body));
});

test('P9: the model is data — GROQ_KIT_MODEL / GROQ_MODEL env override the default', () => {
  assert.deepEqual(kitModels(), [LLM_MODEL_DEFAULT, LLM_MODEL_FALLBACK]);
  process.env.GROQ_MODEL = 'openai/gpt-oss-20b';
  assert.equal(kitModels()[0], 'openai/gpt-oss-20b');
  process.env.GROQ_KIT_MODEL = 'qwen/qwen3.8-27b';
  process.env.GROQ_KIT_FALLBACK_MODEL = 'openai/gpt-oss-120b';
  assert.deepEqual(kitModels(), ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b']);
  process.env.GROQ_KIT_FALLBACK_MODEL = 'qwen/qwen3.8-27b';
  assert.deepEqual(kitModels(), ['qwen/qwen3.8-27b'], 'a fallback equal to the primary is not tried twice');
});

test('P9: a Groq 400 error carries status, code and error.message — and never the key', async () => {
  const { f } = recorder([errReply(400, { message: `Failed to generate JSON. Please adjust your prompt. key ${KEY}`, type: 'invalid_request_error', code: 'json_validate_failed' })]);
  await assert.rejects(
    groqChat({ system: 'json', user: 'x' }, { fetchImpl: f, fallback: false }),
    (e) => {
      assert.match(e.message, /^groq 400 json_validate_failed: Failed to generate JSON/);
      assert.ok(!e.message.includes(KEY), 'the API key is redacted');
      assert.ok(!e.message.includes('gsk_'), 'no key prefix either');
      assert.equal(e.status, 400);
      assert.equal(e.code, 'json_validate_failed');
      return true;
    },
  );
});

test('P9: a non-JSON error body still gives a readable message', async () => {
  const f = async () => ({ ok: false, status: 503, json: async () => { throw new Error('nope'); }, text: async () => '<html>Service Unavailable</html>' });
  await assert.rejects(groqChat({ system: 'json', user: 'x' }, { fetchImpl: f }), { message: /^groq 503: <html>Service Unavailable/ });
});

test('P9: model_decommissioned on the primary retries ONCE with the fallback model', async () => {
  const { f, calls } = recorder([
    errReply(400, { message: 'The model `openai/gpt-oss-120b` has been decommissioned', code: 'model_decommissioned' }),
    okReply(DRAFT),
  ]);
  const d = await llmKitDraft({ niche: 'stoicism', label: 'Stoic Lab' }, { fetchImpl: f });
  assert.equal(d.eyebrow, 'STOIC RULES');
  assert.deepEqual(calls.map((c) => c.body.model), [LLM_MODEL_DEFAULT, LLM_MODEL_FALLBACK]);
});

test('P9: 404 model_not_found and json_validate_failed also fall back; 401/429 do not', async () => {
  for (const [status, code, expectRetry] of [[404, 'model_not_found', true], [400, 'json_validate_failed', true], [401, 'invalid_api_key', false], [429, 'rate_limit_exceeded', false]]) {
    const { f, calls } = recorder([errReply(status, { message: 'm', code }), okReply(DRAFT)]);
    const run = llmKitDraft({ niche: 'stoicism', label: 'L' }, { fetchImpl: f });
    if (expectRetry) {
      await run;
      assert.equal(calls.length, 2, `${status} ${code} retries`);
    } else {
      await assert.rejects(run, { message: new RegExp(`^groq ${status} ${code}`) });
      assert.equal(calls.length, 1, `${status} ${code} does not retry`);
    }
  }
});

test('P9: when both models fail, the error names both attempts', async () => {
  const { f, calls } = recorder([errReply(400, { message: 'gone', code: 'model_decommissioned' }), errReply(400, { message: 'also gone', code: 'model_decommissioned' })]);
  await assert.rejects(llmKitDraft({ niche: 'stoicism', label: 'L' }, { fetchImpl: f }), (e) => {
    assert.match(e.message, /groq 400 model_decommissioned: also gone/);
    assert.match(e.message, new RegExp(LLM_MODEL_FALLBACK.replace(/[/.]/g, '\\$&')));
    return true;
  });
  assert.equal(calls.length, 2);
});

test('P9: the fallback model is a current Groq model, not a retired Llama id', () => {
  assert.equal(LLM_MODEL_FALLBACK, 'openai/gpt-oss-20b');
  assert.doesNotMatch(LLM_MODEL_DEFAULT + LLM_MODEL_FALLBACK, /llama|mixtral|gemma/i);
});
