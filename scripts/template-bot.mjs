// Phase B runner (docs/qa/template-bot-qa.md) — the template bot.
//   node scripts/template-bot.mjs --niche "<canonical niche>" [--count 2] [--theme X] [--dry]
//     → routeAndCall('script-gen') drafts → shape → validate → STAGE to
//       studio/lib/template-bot-drafts/<id>.json → render each draft's
//       preview (previews rows keyed draft-<id>) → print the review list.
//   node scripts/template-bot.mjs --approve <draft-file>
//     → the front door: append the staged entry to the registry data (R4).
// The registry, sync CLI, and gallery never read the drafts dir (R3).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// local runs read the root .env (CI injects env instead)
for (const lineStr of (() => { try { return fs.readFileSync(path.resolve('.env'), 'utf8').split(/\r?\n/); } catch { return []; } })()) {
  const m = lineStr.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flag = (name) => process.argv.includes(`--${name}`);
const STAGE_DIR = path.resolve('studio', 'lib', 'template-bot-drafts');
const REGISTRY_FILE = path.resolve('studio', 'lib', 'template-registry.data.js');

if (flag('approve')) {
  const draftFile = arg('approve');
  if (!draftFile || !fs.existsSync(draftFile)) { console.error('approve: draft file not found'); process.exit(1); }
  const draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'));
  const reg = fs.readFileSync(REGISTRY_FILE, 'utf8');
  if (reg.includes(`'${draft.template_id}':`)) { console.log(`already in the registry: ${draft.template_id}`); process.exit(0); }
  const marker = "  // ---- REMOVED 2026-11-04 (owner-approved catalog cleanup): 'quote-cards-premium'";
  const entrySource = '  ' + JSON.stringify(draft, null, 2).replace(/\n/g, '\n  ') + ',';
  if (!reg.includes(marker)) { console.error('registry marker missing'); process.exit(1); }
  fs.writeFileSync(REGISTRY_FILE, reg.replace(marker, entrySource + '\n\n' + marker));
  console.log(`✅ approved + appended: ${draft.template_id} — run the sync CLI + deploy, then assign from the panel`);
  process.exit(0);
}

const niche = arg('niche');
const count = Math.max(1, Math.min(5, Number(arg('count')) || 1));
const themeHint = arg('theme');
const dry = flag('dry');

// R1: canonical niche gate — BEFORE the LLM call
const { canonicalNicheOrThrow, draftPrompt, parseDrafts, shapeDraft, validateDraft } = await import('../lib/template-bot.mjs');
const { REGISTRY_META } = await import('../studio/lib/template-registry.data.js');
const canon = canonicalNicheOrThrow(niche);

// the shape model: a live registry entry (the wisdom exemplar)
const exemplar = JSON.stringify(REGISTRY_META['wisdom-storybook'] || REGISTRY_META['science-storybook'], null, 2);
const prompt = draftPrompt({ niche: canon, count, exemplar }) + (themeHint ? `\nPalette preference: "${themeHint}" (choose the closest allowed theme).` : '');
if (dry) { console.log(prompt); process.exit(0); }

// R5: the LLM is required — the drafting brain is the Python LangGraph
// sidecar (services/ai/bot: draft → self-review → repair → shape), reached
// through the brain-sidecar pattern the doc lane proves.
const BOT_URL = process.env.BOT_URL || 'http://127.0.0.1:8000';
console.log(`[bot] drafting ${count} template(s) for "${canon}" via the LangGraph sidecar…`);
let draftsRaw;
try {
  const r = await fetch(`${BOT_URL}/bot/draft`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ niche: canon, count, theme_hint: themeHint || null }),
    signal: AbortSignal.timeout(240000),
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
  draftsRaw = d.drafts;
  if (d.issues?.length) console.log(`[bot] sidecar noted issues: ${d.issues.join(' | ')}`);
  console.log(`[bot] drafts: ${draftsRaw.length} (attempts: ${d.attempts || 1})`);
} catch (e) {
  console.error(`[bot] draft failed: ${String(e.message).slice(0, 160)} — is the brain sidecar up (uvicorn app:app) with GROQ_API_KEY set?`);
  process.exit(1);
}

// shape + validate + stage (R2: the validator gate before staging)
fs.mkdirSync(STAGE_DIR, { recursive: true });
const staged = [];
for (const raw of draftsRaw) {
  const draft = shapeDraft(raw, canon);
  const v = validateDraft(draft);
  if (!v.ok) {
    console.log(`[bot] ✗ ${draft.template_id} dropped — validator: ${JSON.stringify(v.errors).slice(0, 200)}`);
    continue;
  }
  const file = path.join(STAGE_DIR, `${draft.template_id}.json`);
  fs.writeFileSync(file, JSON.stringify(draft, null, 2));
  staged.push({ file, id: draft.template_id });
  console.log(`[bot] ✓ staged ${draft.template_id} → ${file}`);
}
if (!staged.length) { console.error('[bot] no drafts survived the validator'); process.exit(1); }

// previews per staged draft (rows keyed draft-<id> — never the gallery family cards)
for (const s of staged) {
  console.log(`[bot] rendering preview for ${s.id}…`);
  const r = spawnSync('node', [path.resolve('scripts', 'render-template-preview.mjs'), '--draft', s.file], { stdio: 'inherit' });
  console.log(`[bot] preview ${s.id}: ${r.status === 0 ? 'rendered' : 'FAILED (the entry stays staged)'}`);
}
console.log(`\n[bot] done — ${staged.length} draft(s) staged + previewed. Review the samples (previews table, draft-<id> rows), then approve:\n  node scripts/template-bot.mjs --approve studio/lib/template-bot-drafts/<id>.json`);
