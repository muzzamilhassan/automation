// market-files P2 runner (docs/qa/market-files-p2-qa.md) — the script bot.
//   node scripts/market-bot.mjs --topic "<episode question>" --facts <facts.txt> [--min 12] [--dry]
//     → POST {topic, facts, target_min} to the script brain sidecar
//       (/bot/script — draft → review → repair → shape) → validate with the
//       Node gate (lib/market-script.mjs R3) → STAGE to
//       content/market-scripts/<id>.json (status draft, R8) → print the
//       beats table for review.
// P4 will turn a staged script into the rendered episode (beats → timing →
// voices → DocV2); P2's job ends at a validated, reviewable script.
import fs from 'node:fs';
import path from 'node:path';

for (const lineStr of (() => { try { return fs.readFileSync(path.resolve('.env'), 'utf8').split(/\r?\n/); } catch { return []; } })()) {
  const m = lineStr.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (name) => process.argv.includes(`--${name}`);

const topic = arg('topic');
const factsPath = arg('facts');
const eventDate = arg('event'); // YYYY-MM-DD — the trading day the episode is about
const symbols = (arg('symbols') || '^GSPC,^DJI,^IXIC').split(',').map((s) => s.trim()).filter(Boolean);
const ctxDays = Math.max(10, Math.min(Number(arg('ctx-days')) || 35, 120));
const targetMin = Math.max(5, Math.min(Number(arg('min')) || 12, 25));
const BOT_URL = arg('bot-url') || process.env.BOT_URL || 'http://127.0.0.1:8000';
const STAGE_DIR = path.resolve('content', 'market-scripts');

if (!topic) { console.error('usage: node scripts/market-bot.mjs --topic "<episode question>" (--facts <facts file> | --event YYYY-MM-DD [--symbols "^GSPC,^DJI,^IXIC,NVDA"]) [--min 12] [--dry]'); process.exit(1); }

// P3 auto-facts: --event + --symbols fetches the REAL market data and
// composes the fact sheet — no hand-writing. R1: any fetch failure is a
// loud exit (a partial fact sheet is worse than none).
let facts = '';
let dataFile = null;
if (!factsPath && eventDate) {
  const { fetchChart, extractFacts, factSheet, seriesOf } = await import('../lib/market-data.mjs');
  const from = new Date(Date.parse(`${eventDate}T00:00:00Z`) - ctxDays * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.parse(`${eventDate}T00:00:00Z`) + 3 * 86400000).toISOString().slice(0, 10);
  console.log(`[data] fetching ${symbols.length} symbol(s), ${from} → ${to} (daily + event-day 30m)…`);
  const charts = {};
  const intraday = {};
  try {
    for (const sym of symbols) {
      charts[sym] = await fetchChart(sym, from, to, '1d');
      intraday[sym] = await fetchChart(sym, eventDate, to, '30m');
    }
  } catch (e) {
    console.error(`[data] ✗ ${e.message} — refusing to stage a fact sheet from partial data`);
    process.exit(1);
  }
  const factsRows = extractFacts(charts, eventDate, { intraday });
  if (!factsRows.length) { console.error('[data] ✗ no event-day bars found — check the date/symbols'); process.exit(1); }
  const series = Object.values(charts).map(seriesOf);
  facts = factSheet({ topic, event: eventDate, facts: factsRows });
  fs.mkdirSync(STAGE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STAGE_DIR, `facts-${eventDate}.txt`), facts);
  dataFile = path.join(STAGE_DIR, `market-data-${eventDate}.json`);
  fs.writeFileSync(dataFile, JSON.stringify({ event: eventDate, facts: factsRows, series }, null, 2));
  console.log(`[data] ✓ facts-${eventDate}.txt + market-data-${eventDate}.json (${factsRows.length} symbol rows)`);
} else if (factsPath) {
  facts = fs.readFileSync(path.resolve(factsPath), 'utf8');
}

if (flag('dry')) {
  console.log(JSON.stringify({ topic, facts: facts.slice(0, 400) + (facts.length > 400 ? '…' : ''), target_min: targetMin }, null, 2));
  console.log('\n^ POSTs to /bot/script; the style prompt lives in services/ai/bot/script_graph.py');
  process.exit(0);
}

console.log(`[script-bot] writing "${topic}" (${targetMin} min, ${facts.length} chars of facts) via the LangGraph sidecar…`);
let script;
try {
  const r = await fetch(`${BOT_URL}/bot/script`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, facts, target_min: targetMin }),
    signal: AbortSignal.timeout(600000),
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
  script = d.script;
  if (d.issues?.length) console.log(`[script-bot] sidecar noted issues: ${d.issues.join(' | ')}`);
  console.log(`[script-bot] script: ${script.beats?.length || 0} beats (attempts: ${d.attempts || 1})`);
} catch (e) {
  console.error(`[script-bot] draft failed: ${String(e.message).slice(0, 160)} — is the brain sidecar up (uvicorn app:app) with GROQ_API_KEY set?`);
  process.exit(1);
}

// R3 — the Node gate before anything stages
const { validateMarketScript, buildMarketBeats, voiceGroups, scriptSummary } = await import('../lib/market-script.mjs');
const v = validateMarketScript(script);
if (!v.ok) {
  console.error(`[script-bot] ✗ dropped — validator: ${v.errors.slice(0, 8).join(' | ')}`);
  process.exit(1);
}

fs.mkdirSync(STAGE_DIR, { recursive: true });
const file = path.join(STAGE_DIR, `${script.script_id}.json`);
fs.writeFileSync(file, JSON.stringify({ ...script, status: 'draft', staged_at: new Date().toISOString(), data_file: dataFile || null }, null, 2));

const beats = buildMarketBeats(script);
const groups = voiceGroups(beats);
const words = beats.reduce((n, b) => n + String(b.text || '').split(/\s+/).filter(Boolean).length, 0);
console.log(`[script-bot] ✓ staged ${script.script_id} → ${file}`);
console.log(`[script-bot] ${beats.length} beats, ~${words} spoken words (~${Math.round(words / 150)} min at 150wpm), voices: ${Object.entries(groups).map(([vo, idx]) => `${vo}×${idx.length}`).join(', ')}`);
console.log('');
console.log(scriptSummary(script));
console.log(`\nreview the script, then P4 renders it: the beats table above IS the episode plan.`);
