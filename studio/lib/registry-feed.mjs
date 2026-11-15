// Step C1 — the engine feed (yt-mcp/studio-channels.json) and cadence
// (yt-mcp/cadence.json) as Neon data: channels.feed_entry (jsonb, exactly the
// object the engine reads for that channel; NULL = not in the feed) and
// channels.cadence (jsonb). Pure helpers + small SQL helpers that take a
// postgres-style client `sql(text, params)` (tests pass a fake).
// Design: docs/superpowers/specs/2026-11-16-neon-single-source-of-truth-design.md.

// Stable JSON: object keys sorted recursively (jsonb does not keep key order,
// and the engine reads parsed data, so order never matters).
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

const asObj = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

export function buildFeed(rows = []) {
  const channels = rows
    .filter((r) => r && r.feed_entry)
    .map((r) => asObj(r.feed_entry))
    .sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  return { channels };
}

export function buildCadence(rows = []) {
  const out = {};
  for (const r of [...rows].sort((a, b) => String(a.slug).localeCompare(String(b.slug)))) {
    if (r && r.cadence) out[r.slug] = asObj(r.cadence);
  }
  return out;
}

function fieldDiffs(label, a = {}, b = {}) {
  const out = [];
  for (const k of [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].sort()) {
    if (canonicalJson(a?.[k]) !== canonicalJson(b?.[k])) out.push(`${label}: ${k}`);
  }
  return out;
}

// committed (the files production reads today) vs built-from-Neon
export function diffFeeds(committed = { channels: [] }, fromNeon = { channels: [] }) {
  const c = new Map((committed.channels || []).map((e) => [e.slug, e]));
  const n = new Map((fromNeon.channels || []).map((e) => [e.slug, e]));
  const out = [];
  for (const [slug, e] of c) {
    if (!n.has(slug)) out.push(`${slug} missing from neon`);
    else out.push(...fieldDiffs(slug, e, n.get(slug)));
  }
  for (const slug of n.keys()) if (!c.has(slug)) out.push(`${slug} only in neon`);
  return out;
}

export function diffCadence(committed = {}, fromNeon = {}) {
  const out = [];
  for (const slug of [...new Set([...Object.keys(committed), ...Object.keys(fromNeon)])].sort()) {
    if (!(slug in fromNeon)) out.push(`${slug} cadence missing from neon`);
    else if (!(slug in committed)) out.push(`${slug} cadence only in neon`);
    else out.push(...fieldDiffs(slug, committed[slug], fromNeon[slug]));
  }
  return out;
}

// Seed: the committed files win (owner decision 2026-11-16 — they are what
// production uses today). Every existing channels row is set: feed slugs get
// their exact entry, other rows are cleared from the feed. A feed slug with no
// channels row is REPORTED, never invented (the Studio connect flow owns rows).
export function seedPlan(feedFile = { channels: [] }, cadenceFile = {}, dbSlugs = []) {
  const feed = new Map((feedFile.channels || []).map((e) => [e.slug, e]));
  const updates = dbSlugs.map((slug) => ({
    slug,
    feed_entry: feed.get(slug) || null,
    cadence: cadenceFile[slug] || null,
  }));
  const missingRows = [...feed.keys()].filter((s) => !dbSlugs.includes(s));
  return { updates, missingRows };
}

export async function ensureFeedColumns(sql) {
  await sql('ALTER TABLE channels ADD COLUMN IF NOT EXISTS feed_entry jsonb, ADD COLUMN IF NOT EXISTS cadence jsonb', []);
}

export async function applySeed(sql, plan) {
  await ensureFeedColumns(sql);
  for (const u of plan.updates) {
    await sql(
      'UPDATE channels SET feed_entry = $1::jsonb, cadence = $2::jsonb WHERE slug = $3',
      [u.feed_entry ? JSON.stringify(u.feed_entry) : null, u.cadence ? JSON.stringify(u.cadence) : null, u.slug],
    );
  }
}

export async function readFeedRows(sql) {
  await ensureFeedColumns(sql);
  return sql('SELECT slug, feed_entry, cadence FROM channels ORDER BY slug', []);
}

export async function recordShadowCheck(sql, { ok, diff = [], runId = null }) {
  await sql(`CREATE TABLE IF NOT EXISTS registry_shadow_checks (
    id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
    run_id text, ok boolean NOT NULL, diff text)`, []);
  await sql('INSERT INTO registry_shadow_checks (run_id, ok, diff) VALUES ($1, $2, $3)', [runId, ok, diff.join('\n').slice(0, 4000)]);
}

// Shadow-week dual write (C1a): after the Studio writes the repo feed or
// cadence file, mirror the SAME content into Neon so owner edits never break
// the comparison. Best-effort: the repo file is still the truth until C1b.
export async function mirrorFeedToNeon(sql, feedChannels = []) {
  await ensureFeedColumns(sql);
  const slugs = feedChannels.map((e) => e.slug);
  for (const e of feedChannels) {
    await sql('UPDATE channels SET feed_entry = $1::jsonb WHERE slug = $2', [JSON.stringify(e), e.slug]);
  }
  await sql('UPDATE channels SET feed_entry = NULL WHERE feed_entry IS NOT NULL AND NOT (slug = ANY($1))', [slugs]);
}

export async function mirrorCadenceToNeon(sql, cadenceFile = {}) {
  await ensureFeedColumns(sql);
  for (const [slug, cad] of Object.entries(cadenceFile)) {
    await sql('UPDATE channels SET cadence = $1::jsonb WHERE slug = $2', [JSON.stringify(cad), slug]);
  }
}
