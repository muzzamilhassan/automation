// Server-side store for wizard channels — PHASE R2: Neon Postgres is the
// source of truth (channels table). The repo file yt-mcp/studio-channels.json
// is kept in sync as the ENGINE's feed (autopilot discovery reads it from the
// repo). The OAuth refresh token is stored TWICE: as the YT_TOKEN_<SLUG>
// GitHub secret (CI) and encrypted (AES-256-GCM, STUDIO_PASSWORD key) as
// token_enc in the DB / registry (dashboard read-back). Repo must stay PRIVATE.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ENV } from './data.mjs';
import { db, dbReady } from './db.mjs';

const REG_PATH = 'yt-mcp/studio-channels.json';
const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';
const ROOT = path.resolve(process.cwd(), '..');
const CLOUD = ENV.FORCE_GITHUB === '1' || !fs.existsSync(path.resolve(ROOT, 'yt-mcp'));

export const REGISTRY_MODE = dbReady ? 'db' : CLOUD ? 'cloud' : 'local';

const ghHeaders = (extra = {}) => ({
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'quarry-studio',
  'X-GitHub-Api-Version': '2022-11-28',
  ...extra,
});

export function hasGithubToken() {
  return Boolean(TOKEN);
}

// ---------- encrypted token at rest (dashboard read-back for wizard channels) ----------

// #120 (SEC-8, wave-2 design): the token key no longer hangs off the login
// password. Two domain-separated derivations, mirroring keys-vault.js (#104):
//   v2 (preferred) : sha256('quarry-studio-tokens-v2|' + MASTER_KEY)
//   v1 (legacy)    : sha256(STUDIO_PASSWORD || YOUTUBE_CLIENT_SECRET)
// The old literal 'quarry-connect' fallback is DELETED — with no key material
// at all, encrypt/decrypt refuse instead of silently using a public string.
// No format change: the version is discovered by trying derivations (v2 first).
export function masterEncKey() {
  return crypto.createHash('sha256').update('quarry-studio-tokens-v2|' + String(process.env.MASTER_KEY || '')).digest();
}

export function legacyEncKey() {
  const material = String(process.env.STUDIO_PASSWORD || ENV.YOUTUBE_CLIENT_SECRET || '');
  if (!material) return null;
  return crypto.createHash('sha256').update(material).digest();
}

let legacyWarned = false;

function tokenEncKey() {
  if (process.env.MASTER_KEY) return masterEncKey();
  const legacy = legacyEncKey();
  if (!legacy) return null;
  if (!legacyWarned) {
    legacyWarned = true;
    console.warn('[registry] DEPRECATED: MASTER_KEY is not set — tokenEnc uses the legacy login-password derivation. Set MASTER_KEY, then run scripts/migrate-master-key.mjs (#120).');
  }
  return legacy;
}

export function encryptJSON(obj) {
  const key = tokenEncKey();
  if (!key) throw new Error('no key material for token encryption (set MASTER_KEY, or STUDIO_PASSWORD for the legacy derivation)');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function decryptJSON(s) {
  try {
    const [iv, tag, ct] = String(s).split('.').map((p) => Buffer.from(p, 'base64'));
    const attempts = process.env.MASTER_KEY
      ? [masterEncKey(), legacyEncKey()].filter(Boolean)
      : [legacyEncKey()].filter(Boolean);
    for (const key of attempts) {
      try {
        const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
        d.setAuthTag(tag);
        return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
      } catch { /* wrong derivation — try the next */ }
    }
    return null;
  } catch {
    return null;
  }
}

// decrypt under ONE specific derivation — the classifier's primitive.
function decryptUnder(s, key) {
  try {
    if (!key) return null;
    const [iv, tag, ct] = String(s).split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

// #123 (OPS-12): which key protects this tokenEnc blob? 'v2' = MASTER_KEY
// derivation (password-independent — rotation-safe), 'legacy' = keyed by the
// login password (STUDIO_PASSWORD || YOUTUBE_CLIENT_SECRET — MUST be
// re-encrypted to v2 BEFORE a password rotation, or it becomes unreadable),
// 'unreadable' = already broken under both, null = nothing to classify.
export function classifyTokenEncRow(enc) {
  if (!enc) return null;
  if (process.env.MASTER_KEY && decryptUnder(enc, masterEncKey()) !== null) return 'v2';
  if (decryptUnder(enc, legacyEncKey()) !== null) return 'legacy';
  return 'unreadable';
}

// #122 (SEC-9): API projection — strips exactly the fields that carry token
// material. No page ever reads them (grep-verified across studio/app); the
// browser must never receive ciphertext even though it is encrypted — one
// XSS in a logged-in session would otherwise read every channel's token blob
// in a single request. Deliberately KEPT: tokenSecret (the GitHub secret
// NAME — not a value; the wizard's repair instructions display it) and
// tokenSecretSaved (the boolean the "key saved / secret missing" chip reads).
// Strip-list on purpose (not the providers route's whitelist): these screens
// consume many fields, and a whitelist breaks the wizard the day a new field
// is added and missed.
export function stripTokenMaterial(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const { tokenEnc: _dropped, tokenEncError: _dropped2, ...rest } = entry;
  return rest;
}

// ---------- row <-> entry mapping ----------

function rowToEntry(r) {
  return {
    slug: r.slug,
    ownerEmail: r.owner_email || '',
    // T4b fix round 1 (#106): the identity mirror in the kit JSONB wins over
    // the columns. syncRegistryRepo rewrites the engine's feed from these
    // projections, so a drifted label/handle COLUMN would revert the repo
    // file's repaired identity (money-rulebook) on the very next
    // connect/profile-save/import. upsertChannel keeps the mirror fresh on
    // every write (same durability shape as T4a's kit.gateCron).
    label: r.kit?.label || r.label || r.slug,
    handle: r.kit?.handle || r.handle || '',
    channelId: r.channel_id || '',
    niche: r.niche || '',
    style: r.style || '',
    voice: r.voice || '',
    accent: r.accent || '#38BDF8',
    slots: r.slots || [],
    docDay: r.doc_day || '',
    autopilot: r.autopilot !== false,
    kit: r.kit || {},
    // T4d (#106): destinations have no dedicated column yet — they ride in the
    // kit JSONB (seeded for the legacy 4) or arrive on repo-file entries.
    // Hoisted to entry.destinations, the schema the engine's lib/registry.mjs
    // already reads (destinations.fbPageId / .threadsHandle).
    destinations: r.kit?.destinations || r.destinations || null,
    ytDescription: r.yt_description || '',
    ytKeywords: r.yt_keywords || '',
    tokenEnc: r.token_enc || null,
    tokenSecret: r.token_secret || '',
    tokenSecretSaved: Boolean(r.token_secret),
    subs: Number(r.subs || 0),
    connectedAt: r.connected_at ? new Date(r.connected_at).toISOString() : null,
    consentedAt: r.consented_at ? new Date(r.consented_at).toISOString() : null,
    consent: r.consent || null,
    autopilotStartedAt: r.autopilot_started_at ? new Date(r.autopilot_started_at).toISOString() : null,
    status: r.status || '',
    active: r.status !== 'parked' && r.status !== 'paused' && Boolean(r.token_secret || r.token_enc),
    fromRegistry: true,
  };
}

// ---------- generic repo JSON (topics queues, state files, team mirror) ----------

export async function readRepoJSON(repoPath) {
  if (!CLOUD) {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, repoPath), 'utf8'));
    } catch {
      return null;
    }
  }
  if (!TOKEN) throw new Error('no GITHUB_TOKEN on the server');
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=main`, {
    headers: ghHeaders({ Accept: 'application/vnd.github.raw' }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`github ${res.status} reading ${repoPath}`);
  return JSON.parse(await res.text());
}

// Step C1a (Neon single source of truth, shadow week): every write of the
// engine feed is mirrored into channels.feed_entry so the nightly/per-run
// comparison (scripts/export-registry.mjs --check) stays exact while the repo
// file is still the truth. Best-effort — never blocks a Studio save.
export async function mirrorFeedBestEffort(channels) {
  if (!dbReady || !db || !Array.isArray(channels)) return;
  try {
    const { mirrorFeedToNeon } = await import('./registry-feed.mjs');
    await mirrorFeedToNeon((t, p) => db.unsafe(t, p), channels);
  } catch (e) {
    console.error('[registry] neon feed mirror failed:', String(e.message).slice(0, 100));
  }
}

export async function writeRepoJSON(repoPath, data, message) {
  const body = JSON.stringify(data, null, 2) + '\n';
  if (!CLOUD) {
    fs.mkdirSync(path.dirname(path.join(ROOT, repoPath)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, repoPath), body);
    return { ok: true, mode: 'local' };
  }
  const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=main`, {
    headers: ghHeaders(),
  });
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}`, {
    method: 'PUT',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      content: Buffer.from(body, 'utf8').toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`github ${res.status} committing ${repoPath}: ${(await res.text()).slice(0, 120)}`);
  return { ok: true, mode: 'cloud' };
}

// ---------- registry (DB first, repo JSON fallback + repo sync for the engine) ----------

async function readRegistryRepo() {
  if (!CLOUD) {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-mcp', 'studio-channels.json'), 'utf8'));
    } catch {
      return { channels: [] };
    }
  }
  if (!TOKEN) throw new Error('no GITHUB_TOKEN on the server');
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${REG_PATH}?ref=main`, {
    headers: ghHeaders({ Accept: 'application/vnd.github.raw' }),
  });
  if (res.status === 404) return { channels: [] };
  if (!res.ok) throw new Error(`github ${res.status} reading registry`);
  return JSON.parse(await res.text());
}

// The DB derives `active` / `tokenSecretSaved` from token columns, but the
// legacy channels keep their keys as GitHub secrets (YT_TOKEN_<SLUG>) that
// Neon never sees — so from the DB alone they read as INACTIVE + 'secret
// missing'. Consequences (2026-11-19, owner report "pause works, resume
// doesn't"): state() skipped their per-channel state files (stale Oct-23
// lastRun, an invisible pause → no Resume button), /api/action called them
// 'unknown channel', and the wizard showed 'secret missing'. The repo
// registry (yt-mcp/studio-channels.json — the file the engine itself runs
// on) is the truth for these two flags; a DB park/pause still wins.
export function overlayRepoFlags(dbEntries = [], repoChannels = []) {
  const bySlug = new Map((repoChannels || []).map((c) => [c.slug, c]));
  return dbEntries.map((e) => {
    const r = bySlug.get(e.slug);
    if (!r) return e;
    const parkedInDb = e.status === 'parked' || e.status === 'paused';
    // Feedback r1 (F): DB rows never carry the engine's top-level `cron`, so
    // the slot timeline saw no start times in production (every hour "free").
    // A schedule save writes kit.gateCron to the DB first (freshest); else the
    // repo feed's cron is what the engine actually runs on.
    const cron = e.kit?.gateCron || r.cron || e.cron;
    return {
      ...e,
      ...(cron ? { cron } : {}),
      active: parkedInDb ? false : r.active !== false,
      tokenSecretSaved: e.tokenSecretSaved || r.tokenSecretSaved === true,
      tokenSecret: e.tokenSecret || r.tokenSecret || '',
    };
  });
}

let repoFlagsMemo = { at: 0, val: null };
async function repoChannelsForOverlay() {
  if (repoFlagsMemo.val && Date.now() - repoFlagsMemo.at < 60_000) return repoFlagsMemo.val;
  const val = ((await readRegistryRepo().catch(() => null)) || {}).channels || null;
  if (val) repoFlagsMemo = { at: Date.now(), val };
  return val || [];
}

export async function readRegistry() {
  if (dbReady) {
    try {
      const rows = await db`SELECT * FROM channels ORDER BY slug`;
      return { channels: overlayRepoFlags(rows.map(rowToEntry), await repoChannelsForOverlay()) };
    } catch (e) {
      console.error('[registry] db read failed — repo fallback:', String(e.message).slice(0, 80));
    }
  }
  return readRegistryRepo();
}

// Audit 2026-11-13 #8 — pure guard for the DB → repo sync. The engine feed
// (yt-mcp/studio-channels.json) used to be rewritten from rowToEntry
// projections of EVERY Neon row: no top-level cron, `active` recomputed from
// token columns that live Neon does not carry (all 13 rows → false),
// tokenSecretSaved false, tokenEnc projected into git — one connect/profile
// save would have switched off all four live channels. Now a write for
// channel X changes only X's entry:
//   - other repo entries are left byte-identical; no other Neon rows are added
//   - an existing entry keeps the repo's cron (else kit.gateCron), active and
//     tokenSecretSaved; the DB can still PARK (status parked/paused) but a
//     sync never un-parks
//   - tokenEnc is never written to the repo
export function mergeRegistrySync(repoChannels, dbEntry) {
  const channels = Array.isArray(repoChannels) ? repoChannels : [];
  if (!dbEntry?.slug) return channels;
  const { tokenEnc: _dropped, ...fromDb } = dbEntry;
  const existing = channels.find((c) => c.slug === dbEntry.slug);
  const parkedInDb = dbEntry.status === 'parked' || dbEntry.status === 'paused';
  const cron = existing?.cron || dbEntry.kit?.gateCron || undefined;
  const merged = existing
    ? {
      ...existing,
      ...fromDb,
      ...(cron ? { cron } : {}),
      active: parkedInDb ? false : existing.active !== false,
      tokenSecretSaved: Boolean(existing.tokenSecretSaved || dbEntry.tokenSecretSaved),
    }
    : { ...fromDb, ...(cron ? { cron } : {}) };
  const out = channels.filter((c) => c.slug !== dbEntry.slug);
  out.push(merged);
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

// keeps the engine's discovery file in sync with the DB truth — for ONE slug
async function syncRegistryRepo(slug, dbEntry, message) {
  if (CLOUD || dbReady) {
    try {
      if (!dbEntry) return;
      const repo = await readRegistryRepo();
      const channels = mergeRegistrySync(repo?.channels || [], dbEntry);
      await writeRepoJSON(REG_PATH, { channels }, message || `registry sync (db → repo): ${slug}`);
      await mirrorFeedBestEffort(channels);
    } catch (e) {
      console.error('[registry] repo sync failed:', String(e.message).slice(0, 100));
    }
  }
}

export async function registryChannels() {
  const reg = await readRegistry();
  return (reg.channels || []).filter((c) => c.active !== false);
}

export async function upsertChannel(entry, message) {
  // T5f audit: this write is ONE INSERT..ON CONFLICT statement — atomic by
  // itself, so unlike the script store's multi-row save (T5f) it needs NO
  // transaction. Do NOT wrap registry writes in manual BEGIN/COMMIT: db.mjs's
  // client is a pooled postgres.js (max: 5), which refuses transaction
  // commands through the positional path with UNSAFE_TRANSACTION. A
  // multi-statement registry save would need sql.begin first (see
  // script-store.mjs adaptPostgresTransact).
  // T4b fix round 1 (#106): every write mirrors the incoming identity into the
  // kit JSONB (rowToEntry projects kit.label/kit.handle first), so the label/
  // handle columns can drift or be wiped without the engine feed reverting.
  // Callers that send neither (OAuth re-connect) keep the existing mirror.
  const kit = {
    ...(entry.kit || {}),
    label: entry.label ?? entry.kit?.label,
    handle: entry.handle ?? entry.kit?.handle,
  };
  if (dbReady) {
    try {
      await db`
        INSERT INTO channels (slug, owner_email, label, handle, channel_id, niche, style, voice, accent, slots, doc_day, autopilot, kit, yt_description, yt_keywords, token_enc, token_secret, subs, connected_at, status, consented_at, consent, autopilot_started_at)
        VALUES (${entry.slug}, ${entry.ownerEmail || ''}, ${entry.label || entry.slug}, ${entry.handle || ''}, ${entry.channelId || ''}, ${entry.niche || ''}, ${entry.style || ''}, ${entry.voice || ''}, ${entry.accent || '#38BDF8'}, ${entry.slots || []}, ${entry.docDay || ''}, ${entry.autopilot !== false}, ${db.json(kit)}, ${entry.ytDescription || ''}, ${entry.ytKeywords || ''}, ${entry.tokenEnc || null}, ${entry.tokenSecret || ''}, ${Number(entry.subs || 0)}, ${entry.connectedAt ? new Date(entry.connectedAt) : new Date()}, ${entry.status || ''}, ${entry.consentedAt ? new Date(entry.consentedAt) : null}, ${entry.consent ? db.json(entry.consent) : null}, ${entry.autopilotStartedAt ? new Date(entry.autopilotStartedAt) : null})
        ON CONFLICT (slug) DO UPDATE SET
          owner_email = EXCLUDED.owner_email, label = EXCLUDED.label, handle = EXCLUDED.handle,
          channel_id = EXCLUDED.channel_id, niche = EXCLUDED.niche, style = EXCLUDED.style,
          voice = EXCLUDED.voice, accent = EXCLUDED.accent, slots = EXCLUDED.slots,
          doc_day = EXCLUDED.doc_day, autopilot = EXCLUDED.autopilot,
          -- T4d round 1 (#106): field-level kit merge — a caller that omits or
          -- rebuilds a partial kit (the OAuth re-connect sends none; the wizard
          -- form doesn't know every key) must not wipe what other flows stored
          -- there: destinations (FB/Threads), gateCron (T4a), generated niches.
          -- Fields the caller DOES send win; absent fields keep their values.
          kit = COALESCE(channels.kit, '{}'::jsonb) || COALESCE(EXCLUDED.kit, '{}'::jsonb),
          yt_description = EXCLUDED.yt_description, yt_keywords = EXCLUDED.yt_keywords,
          token_enc = COALESCE(EXCLUDED.token_enc, channels.token_enc),
          token_secret = EXCLUDED.token_secret, subs = EXCLUDED.subs,
          connected_at = EXCLUDED.connected_at, status = EXCLUDED.status,
          consented_at = COALESCE(EXCLUDED.consented_at, channels.consented_at),
          consent = COALESCE(EXCLUDED.consent, channels.consent),
          autopilot_started_at = COALESCE(EXCLUDED.autopilot_started_at, channels.autopilot_started_at)`;
      const reg = await readRegistry();
      await syncRegistryRepo(entry.slug, (reg.channels || []).find((c) => c.slug === entry.slug), message || `studio: connect channel ${entry.slug}`);
      return { ok: true, mode: 'db' };
    } catch (e) {
      console.error('[registry] db upsert failed — repo fallback:', String(e.message).slice(0, 100));
    }
  }
  // repo fallback (original logic). #120 R4: this path used to push the full
  // entry — tokenEnc included — into the committed registry file when the DB
  // was down (the sync path was fixed in the 2026-11-13 audit #8; this
  // fallback was missed). tokenEnc never reaches the repo.
  const { tokenEnc: _dropped, ...repoEntry } = entry;
  const reg = await readRegistryRepo();
  const channels = (reg.channels || []).filter((c) => c.slug !== entry.slug);
  channels.push({ ...repoEntry, kit });
  channels.sort((a, b) => a.slug.localeCompare(b.slug));
  return writeRegistry({ channels }, message || `studio: connect channel ${entry.slug}`);
}

// Admin-panel review #5: the repo feed is what the ENGINE reads, so a failed
// repo write THROWS (the caller returns an error) — it used to be swallowed
// and reported ok. A failed DB mirror write is returned as a warning.
export async function removeChannel(slug, message) {
  const warnings = [];
  if (dbReady) {
    try {
      await db`DELETE FROM channels WHERE slug = ${slug}`;
    } catch (e) {
      warnings.push(`db delete failed: ${String(e.message).slice(0, 100)}`);
    }
  }
  const reg = await readRegistryRepo();
  const channels = (reg.channels || []).filter((c) => c.slug !== slug);
  if (CLOUD || dbReady) {
    await writeRepoJSON(REG_PATH, { channels }, message || `registry: removed ${slug}`);
    await mirrorFeedBestEffort(channels);
  }
  return { ok: true, warnings };
}

// 10-08 FLOW CONTROL — flip the engine-facing autopilot flag (DB + repo sync)
export async function setChannelAutopilot(slug, on, message) {
  const warnings = [];
  if (dbReady) {
    try {
      await db`UPDATE channels SET autopilot = ${on} WHERE slug = ${slug}`;
    } catch (e) {
      warnings.push(`db autopilot update failed: ${String(e.message).slice(0, 100)}`);
    }
  }
  const reg = await readRegistryRepo();
  const channels = (reg.channels || []).map((c) => (c.slug === slug ? { ...c, autopilot: on } : c));
  if (CLOUD || dbReady) {
    await writeRepoJSON(REG_PATH, { channels }, message || `flow: autopilot ${on ? 'ON' : 'OFF'} for ${slug}`);
    await mirrorFeedBestEffort(channels);
  }
  return { ok: true, warnings };
}

// T4a round 1 (#106 Phase 4.5): pure repo-feed mapper for the gate cron. The
// TARGET slug gets both the engine-facing top-level `cron` and the durable
// kit.gateCron mirror; every OTHER entry that already carries a plain daily
// `cron` but no kit.gateCron yet gets backfilled — a later DB->repo sync
// (connect / profile save / importer: upsertChannel -> syncRegistryRepo)
// rewrites the feed from rowToEntry projections that carry kit but NOT cron,
// so without the mirror every channel would silently fall back to 02:33.
const DAILY_CRON_RE = /^\d{1,2} \d{1,2} \* \* \*$/;
export function applyGateCronToChannels(channels, slug, cron) {
  let found = false;
  const next = (channels || []).map((c) => {
    if (c.slug === slug) {
      found = true;
      return { ...c, cron, kit: { ...(c.kit || {}), gateCron: cron } };
    }
    if (c.cron && DAILY_CRON_RE.test(String(c.cron).trim()) && !c.kit?.gateCron) {
      return { ...c, kit: { ...(c.kit || {}), gateCron: c.cron } };
    }
    return c;
  });
  return { channels: next, found };
}

// T4a (#106 Phase 4.5): write a channel's cron gate time. Round 1: the gate
// cron is DURABLE in kit.gateCron — the Neon row's kit JSONB (rowToEntry
// projects kit, never cron) AND the repo feed (the engine's discovery file,
// where the top-level `cron` mirror also stays). Studio's schedule route
// re-derives the cron from the channel's slot times on every save and lands
// it here. Returns ok:false (no write) when the slug is not in the repo
// registry yet.
export async function setChannelCron(slug, cron, message) {
  if (dbReady) {
    try {
      const rows = await db`SELECT kit FROM channels WHERE slug = ${slug}`;
      const kit = { ...(rows?.[0]?.kit || {}), gateCron: cron };
      await db`UPDATE channels SET kit = ${db.json(kit)} WHERE slug = ${slug}`;
    } catch (e) {
      console.error('[registry] db gateCron update failed:', String(e.message).slice(0, 100));
    }
  }
  const reg = await readRegistryRepo();
  const { channels, found } = applyGateCronToChannels(reg.channels, slug, cron);
  if (!found) return { ok: false, reason: 'not-in-repo-registry' };
  await writeRepoJSON(REG_PATH, { channels }, message || `schedule: gate cron ${cron} for ${slug}`);
  await mirrorFeedBestEffort(channels);
  return { ok: true };
}

export async function writeRegistry(registry, message) {
  // #120 R4 (belt and suspenders): whatever the caller sends, tokenEnc never
  // lands in git — stripped here unconditionally, on every entry.
  const clean = { ...registry, channels: (registry?.channels || []).map(({ tokenEnc: _never, ...c }) => c) };
  const body = JSON.stringify(clean, null, 2) + '\n';
  if (!CLOUD) {
    fs.writeFileSync(path.join(ROOT, 'yt-mcp', 'studio-channels.json'), body);
    await mirrorFeedBestEffort(clean.channels);
    return { ok: true, mode: 'local' };
  }
  const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/${REG_PATH}?ref=main`, {
    headers: ghHeaders(),
  });
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${REG_PATH}`, {
    method: 'PUT',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      content: Buffer.from(body, 'utf8').toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`github ${res.status} committing registry: ${(await res.text()).slice(0, 120)}`);
  await mirrorFeedBestEffort(clean.channels);
  return { ok: true, mode: 'cloud' };
}

// Encrypts with the repo's Actions secret public key (libsodium sealed box) —
// the same mechanism `gh secret set` uses.
export async function writeTokenSecret(secretName, tokenJson) {
  if (!TOKEN) throw new Error('no GITHUB_TOKEN on the server');
  const mod = await import('libsodium-wrappers');
  const sodium = mod.default ?? mod;
  await sodium.ready;
  const pkRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
    headers: ghHeaders(),
  });
  if (!pkRes.ok) throw new Error(`github ${pkRes.status} reading secrets public key`);
  const pk = await pkRes.json();
  const sealed = sodium.crypto_box_seal(Buffer.from(tokenJson, 'utf8'), Buffer.from(pk.key, 'base64'));
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/${secretName}`, {
    method: 'PUT',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ encrypted_value: Buffer.from(sealed).toString('base64'), key_id: pk.key_id }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`github ${res.status} writing ${secretName}: ${(await res.text()).slice(0, 120)}`);
  }
  return { ok: true };
}

// Local mode only — mirror of what oauth-reauth.mjs writes (gitignored folder).
export function writeLocalTokenFile(slug, tokenJson) {
  if (CLOUD) return { ok: false };
  const dir = path.join(ROOT, 'yt-mcp', 'channels', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'token.json'), tokenJson);
  return { ok: true };
}
