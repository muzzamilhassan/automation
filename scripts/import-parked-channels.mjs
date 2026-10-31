#!/usr/bin/env node
// #106 PHASE 4.5 TIER 2 (T2) — bring the 12 PARKED channels into the Admin
// Panel so ONE source of truth exists. Parked = yt-mcp/channels/<slug>/token.json
// exists (OAuth was granted once) but the channel has no registry row and no
// GitHub secret — invisible to CI, the engine, and the Studio panel.
//
// Per channel (the SAME primitives the wizard's connect flow uses — no
// reimplementation): read the local token.json → refresh via studio/lib/
// yt-token.mjs createAccessToken (the same OAuth client that issued these
// tokens) → identify the channel via channels.list?mine=true →
//   (d) writeTokenSecret → GitHub secret YT_TOKEN_<SLUG> (CI + engine read it)
//   (e) upsertChannel → Neon row + yt-mcp/studio-channels.json sync, with
//       autopilot FALSE — the importer NEVER enables autopilot (YouTube API
//       Developer Policies: automated uploads need the owner's express
//       consent, given in the panel). Re-runs also never DISABLE it.
//   (f) the local token.json is refreshed in place (fresh access_token +
//       updated expiry; the file's own shape — `expiry` ISO vs `expiry_date`
//       epoch — and any extra keys like scope are preserved; never deleted)
//   (g) one audit line per channel.
//
// SAFETY CONTRACT (each part pinned by tests/import-parked.test.mjs):
//   - DRY IS THE DEFAULT. --dry prints the full plan and touches nothing
//     (no secret, no registry, no local file — and dry never even imports
//     the write paths; its only network is Google's read-only refresh +
//     identify). --live is required for any write.
//   - Per-channel try/catch: one channel's failure never stops the others.
//   - A dead refresh_token SKIPS the channel (reported, local file left
//     untouched); a hard failure (missing file / failed write) exits 1
//     AFTER the remaining channels were still attempted.
//   - Idempotent: existing secret/registry row → update-in-place, never a
//     duplicate; owner-set fields (consent, autopilot, niche, kit, status,
//     connectedAt) survive a re-run. A token folder that turns out to belong
//     to a channel ALREADY registered under another slug is skipped (no
//     duplicate channel identity — surfaced by the first real dry run).
//   - Token material is never logged — every output line passes a redactor.
//
// Usage: node scripts/import-parked-channels.mjs [--dry|--live] [--only=a,b,c]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from '../lib/env.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CHANNELS_LIST = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true';

// The parked set (Phase 4.5 investigation): local token present, nothing else.
export const PARKED_SLUGS = [
  'ai-observer', 'closing-table', 'corner-office', 'deep-work-os', 'escrow-estate',
  'founders-margin', 'iron-discipline', 'longevity-code', 'old-money-code',
  'policy-brief', 'sleep-architect', 'tax-shield',
];

/** 'ai-observer' -> 'YT_TOKEN_AI_OBSERVER' (same mapping data.mjs/workflows use). */
export function secretNameFor(slug) {
  return `YT_TOKEN_${String(slug).toUpperCase().replace(/-/g, '_')}`;
}

/** Replaces every collected token string (raw + URL-encoded) in an output line. */
export function redact(text, secrets) {
  let out = String(text ?? '');
  for (const s of secrets || []) {
    if (s && String(s).length >= 12) out = out.split(s).join('[REDACTED]');
  }
  return out;
}

/**
 * Fresh local token object for (f): the file's OWN shape is preserved —
 * parked files carry `expiry` (ISO), yutu-shaped ones (e.g. escrow-estate)
 * carry `expiry_date` (epoch ms) — and every other key (scope, ...) rides along.
 */
export function freshLocalToken(prevToken, refreshResponse, nowMs) {
  const ttlSec = Number(refreshResponse?.expires_in) > 0 ? Number(refreshResponse.expires_in) : 3600;
  const next = { ...prevToken, access_token: refreshResponse.access_token };
  if ('expiry_date' in next) next.expiry_date = nowMs + ttlSec * 1000;
  else next.expiry = new Date(nowMs + ttlSec * 1000).toISOString();
  return next;
}

/** argv -> { dry, slugs }. DRY IS THE DEFAULT; --live is the explicit unlock. */
export function parseArgs(argv = []) {
  let dry = true;
  let slugs = null;
  for (const arg of argv) {
    if (arg === '--dry') dry = true;
    else if (arg === '--live') dry = false;
    else if (arg.startsWith('--only=')) {
      slugs = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
      if (!slugs.length) throw new Error('--only needs at least one slug, e.g. --only=ai-observer,tax-shield');
    } else {
      throw new Error(`unknown argument: ${arg} (usage: node scripts/import-parked-channels.mjs [--dry|--live] [--only=slug,slug])`);
    }
  }
  return { dry, slugs };
}

/**
 * (e) The registry entry, mirroring the wizard connect flow's shape
 * (studio/app/api/oauth/callback/route.js). Fresh import: niche '', autopilot
 * FALSE, tokenSecretSaved true, tokenEnc for dashboard read-back. Re-run over
 * an existing row: update-in-place — the owner's consent/autopilot/niche/kit/
 * status/connectedAt survive (the importer never enables OR disables autopilot).
 */
export function buildRegistryEntry({ slug, identity, tokenEncStr, secretName, existing, nowIso }) {
  return {
    slug,
    ownerEmail: existing?.ownerEmail || '',
    label: identity.title || existing?.label || slug,
    channelId: identity.channelId,
    handle: (identity.handle || existing?.handle || '').toLowerCase(),
    subs: Number(identity.subs || existing?.subs || 0),
    accent: existing?.accent || '#38BDF8',
    niche: existing?.niche || '',
    style: existing?.style || '',
    voice: existing?.voice || '',
    slots: existing?.slots || [],
    docDay: existing?.docDay || '',
    kit: existing?.kit || {},
    ytDescription: existing?.ytDescription || '',
    ytKeywords: existing?.ytKeywords || '',
    tokenSecret: secretName,
    tokenSecretSaved: true,
    connectedAt: existing?.connectedAt || nowIso,
    status: existing?.status || 'connected · automation wiring pending',
    // autopilot: fresh = false; a re-run preserves an owner-granted true.
    autopilot: existing?.autopilot === true,
    autopilotStartedAt: existing?.autopilotStartedAt ?? null,
    consent: existing?.consent ?? null,
    consentedAt: existing?.consentedAt ?? null,
    tokenEnc: tokenEncStr,
  };
}

/** (c) Identify the channel behind a fresh access token (mine=true). */
export async function identifyChannel(fetchImpl, accessToken) {
  const res = await fetchImpl(CHANNELS_LIST, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`identify_failed — channels.list ${res.status}`);
  const data = await res.json();
  const c = data.items?.[0];
  if (!c) throw new Error('identify_failed — channels.list returned no items (token owns no channel?)');
  return {
    channelId: c.id,
    title: c.snippet?.title || '',
    handle: (c.snippet?.customUrl || '').toLowerCase(),
    subs: Number(c.statistics?.subscriberCount || 0),
  };
}

/**
 * (b) The refresh seam — REUSES studio/lib/yt-token.mjs createAccessToken (the
 * one flow every caller shares; injectable fetch keeps tests off the network).
 * createAccessToken returns only the access token, so a thin capturing wrapper
 * around the injected fetch also keeps the token-endpoint response for the
 * `expires_in` the local token.json refresh needs.
 */
export async function makeRefresh({ env, fetchImpl = fetch }) {
  const responses = [];
  let pendingToken = null;
  const capturingFetch = async (url, opts) => {
    const res = await fetchImpl(url, opts);
    if (String(url).startsWith(TOKEN_ENDPOINT)) {
      const text = await res.text();
      try { responses.push(JSON.parse(text)); } catch { }
      return { ok: res.ok, status: res.status, json: async () => JSON.parse(text) };
    }
    return res;
  };
  const { createAccessToken } = await import('../studio/lib/yt-token.mjs');
  const accessTokenFor = createAccessToken({
    fetchImpl: capturingFetch,
    env: { YOUTUBE_CLIENT_ID: env.YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET: env.YOUTUBE_CLIENT_SECRET },
    tokenRaw: async () => JSON.stringify(pendingToken),
  });
  return async function refresh(slug, token) {
    pendingToken = token;
    try {
      const accessToken = await accessTokenFor(slug);
      const resp = responses[responses.length - 1] || {};
      return { accessToken, expiresIn: Number(resp.expires_in || 0) };
    } catch (e) {
      // "no access token" alone is undiagnosable for the owner — surface
      // Google's actual verdict (invalid_grant / invalid_client / ...) so the
      // skip report says WHY (error bodies never carry token material, and
      // every line passes the redactor anyway).
      const resp = responses[responses.length - 1] || {};
      const verdict = [resp.error, resp.error_description].filter(Boolean).join(': ');
      throw new Error(verdict ? `${e.message} — Google said: ${verdict}` : e.message);
    }
  };
}

/** The summary table: channel | identified title | secret | registry | result. */
export function renderSummaryTable(results, { dry = false } = {}) {
  const pad = (s, n) => String(s ?? '-').slice(0, n).padEnd(n);
  const header = `${pad('channel', 18)}| ${pad('identified title', 26)}| ${pad('secret', 34)}| ${pad('registry', 16)}| ${pad('result / reason', 60)}`;
  const lines = ['', header, '-'.repeat(header.length)];
  for (const r of results) {
    const secretCell = r.outcome === 'error' ? '-' : `${r.secret} ·${dry ? 'planned' : 'written'}`;
    const resultCell =
      r.outcome === 'error' ? `FAILED: ${r.reason}`
        : r.outcome === 'skipped' || r.outcome === 'planned-skip'
          ? `${r.outcome === 'planned-skip' ? 'WOULD SKIP' : 'skipped'}: ${r.reason}`
          : dry ? 'planned' : 'ok';
    lines.push(`${pad(r.slug, 18)}| ${pad(r.title || '-', 26)}| ${pad(secretCell, 34)}| ${pad(r.registryAction || '-', 16)}| ${pad(resultCell, 60)}`);
  }
  return lines;
}

/**
 * The importer core. Every IO seam is injected (fail-closed on a missing seam —
 * never half-wired IO): readTokenFile, refresh, identify, writeSecret,
 * registry {read, upsert}, writeLocalToken, tokenEnc, log, now.
 */
export async function runImport(opts = {}) {
  const {
    slugs = PARKED_SLUGS,
    dry = true, // DRY IS THE DEFAULT — writes need an explicit dry:false (--live)
    readTokenFile,
    refresh,
    identify,
    writeSecret,
    registry,
    writeLocalToken,
    tokenEnc,
    log = () => { },
    now = Date.now,
  } = opts;
  for (const [name, dep] of Object.entries({ readTokenFile, refresh, identify, writeSecret, registry, writeLocalToken, tokenEnc })) {
    if (!dep) throw new Error(`import-parked: missing injected dep "${name}" (fail-closed — never half-wired IO)`);
  }

  const seen = new Set(); // token material for the redactor
  const remember = (token) => {
    for (const s of [token?.access_token, token?.refresh_token]) {
      if (typeof s === 'string' && s.length >= 12) {
        seen.add(s);
        seen.add(encodeURIComponent(s));
      }
    }
  };
  const emit = (line) => log(redact(line, seen));

  emit(`[import-parked] mode=${dry ? 'DRY (touches nothing — pass --live to write)' : 'LIVE (writes secrets, registry, local token files)'} channels=${slugs.length}`);

  // existing-state detection (read-only; tolerated to fail — the plan then
  // says "create" and the live upsert stays authoritative via ON CONFLICT)
  let regChannels = null;
  try {
    regChannels = (await registry.read())?.channels || [];
  } catch {
    regChannels = null;
  }

  const results = [];
  for (const slug of slugs) {
    const row = {
      slug,
      outcome: 'ok',
      title: '',
      channelId: '',
      secret: secretNameFor(slug),
      registryAction: '',
      reason: '',
    };
    results.push(row);
    try {
      // (a) local token file — the parked channel's proof of OAuth consent
      const file = await readTokenFile(slug);
      if (!file?.token?.refresh_token) {
        throw new Error(`token_file_missing — no readable yt-mcp/channels/${slug}/token.json (nothing to import)`);
      }
      remember(file.token);

      // (b) refresh (dead refresh_token => SKIP, local file untouched)
      let fresh;
      try {
        fresh = await refresh(slug, file.token);
      } catch (e) {
        row.outcome = dry ? 'planned-skip' : 'skipped';
        row.reason = `refresh_failed: ${String(e.message).slice(0, 80)} — dead refresh_token (channel skipped, local token file left untouched)`;
        emit(`[import-parked] ${dry ? 'would-skip' : 'skip'} slug=${slug} reason=${row.reason}`);
        continue;
      }
      remember({ access_token: fresh.accessToken });

      // (c) identify the channel behind the token
      const identity = await identify(fresh.accessToken);
      if (!identity?.channelId) throw new Error('identify_failed — no channel came back');
      row.title = identity.title;
      row.channelId = identity.channelId;

      // duplicate-identity guard (surfaced by the first real dry run): a token
      // folder can hold a SECOND grant for a channel the registry ALREADY has
      // under another slug (e.g. escrow-estate/token.json belongs to investors-
      // compass). Importing it would duplicate that channel — skip + report.
      // Handle matching covers repo-JSON rows that carry no channelId (dry).
      const duplicate = regChannels
        ? regChannels.find((c) =>
            c.slug !== slug &&
            ((c.channelId && c.channelId === identity.channelId) ||
              (c.handle && identity.handle && String(c.handle).toLowerCase() === identity.handle.toLowerCase())))
        : null;
      if (duplicate) {
        row.outcome = dry ? 'planned-skip' : 'skipped';
        row.reason = `channelId_duplicate — ${identity.channelId} is already registered as slug "${duplicate.slug}" (likely a mislabeled token folder); import skipped, local token file left untouched`;
        emit(`[import-parked] ${dry ? 'would-skip' : 'skip'} slug=${slug} reason=${row.reason}`);
        continue;
      }

      const freshToken = freshLocalToken(file.token, { access_token: fresh.accessToken, expires_in: fresh.expiresIn }, now());
      const existing = regChannels ? regChannels.find((c) => c.slug === slug) || null : null;
      row.registryAction = dry ? (existing ? 'planned-update' : 'planned-create') : (existing ? 'update' : 'create');

      // (d) GitHub secret YT_TOKEN_<SLUG>
      if (!dry) await writeSecret(row.secret, JSON.stringify(freshToken, null, 2) + '\n');

      // (e) registry row + studio-channels.json sync (inside upsertChannel)
      const entry = buildRegistryEntry({
        slug,
        identity,
        tokenEncStr: tokenEnc(freshToken),
        secretName: row.secret,
        existing,
        nowIso: new Date(now()).toISOString(),
      });
      if (!dry) await registry.upsert(entry);

      // (f) local token.json refresh — fresh access token + updated expiry,
      // the file's own shape; never deleted
      if (!dry) await writeLocalToken(slug, JSON.stringify(freshToken, null, 2) + '\n');
      row.outcome = dry ? 'planned' : 'ok';

      // (g) audit line
      emit(
        `[import-parked] ${dry ? 'planned' : 'ok'} slug=${slug} channelId=${identity.channelId} title="${identity.title}" ` +
        `handle=${identity.handle || '-'} subs=${identity.subs ?? '-'} secret=${row.secret} registry=${row.registryAction} ` +
        `local_token=${dry ? 'planned' : 'updated'} label="${entry.label}" niche='${entry.niche}' autopilot=${entry.autopilot} ` +
        `tokenSecretSaved=true tokenEnc=yes`,
      );
    } catch (e) {
      // one channel's failure never stops the others
      row.outcome = 'error';
      row.reason = String(e.message || e).slice(0, 140);
      emit(`[import-parked] FAIL slug=${slug} reason=${row.reason}`);
    }
  }

  for (const line of renderSummaryTable(results, { dry })) emit(line);
  const planned = results.filter((r) => r.outcome === 'ok' || r.outcome === 'planned').length;
  const skipped = results.filter((r) => r.outcome === 'skipped' || r.outcome === 'planned-skip').length;
  const failed = results.filter((r) => r.outcome === 'error').length;
  emit(
    `[import-parked] summary: ${results.length} channel(s) — ${dry ? 'planned' : 'imported'}=${planned}, skipped=${skipped}, failed=${failed}` +
    `${dry ? ' (dry run — nothing was written)' : ''}`,
  );
  emit('[import-parked] json ' + redact(JSON.stringify({ dry, results }), seen));
  return { dry, results, exitCode: failed > 0 ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// Main — wires the REAL primitives (studio/lib via dynamic import; the registry
// libs lock in ROOT = resolve(cwd, '..') at load time, so cwd moves to studio/
// FIRST — the analytics-nightly pattern).
// ---------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2)) {
  loadEnv(); // repo-root .env (process.env always wins — ??= semantics)
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    console.error('[import-parked] ' + e.message);
    return 2;
  }
  const slugs = parsed.slugs || PARKED_SLUGS;
  const dry = parsed.dry;
  const env = process.env;

  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    console.error('[import-parked] YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET missing — the importer refreshes each parked token with the SAME OAuth client that issued them');
    return 1;
  }

  // repo-root-relative token IO (cwd-independent paths)
  const tokenPath = (slug) => path.join(ROOT, 'yt-mcp', 'channels', slug, 'token.json');
  const readTokenFile = async (slug) => {
    try {
      const raw = fs.readFileSync(tokenPath(slug), 'utf8');
      return { raw, token: JSON.parse(raw) };
    } catch {
      return null;
    }
  };
  const writeLocalToken = async (slug, body) => {
    fs.mkdirSync(path.dirname(tokenPath(slug)), { recursive: true });
    fs.writeFileSync(tokenPath(slug), body);
  };

  let registry;
  let writeSecret;
  let tokenEnc;
  if (dry) {
    // DRY never imports the write paths: the plan's existing-state check reads
    // the repo registry JSON only (no Neon, no GitHub) — the only network in
    // dry is Google's read-only refresh + identify.
    registry = {
      read: async () => {
        try {
          return JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-mcp', 'studio-channels.json'), 'utf8'));
        } catch {
          return { channels: [] };
        }
      },
      upsert: async () => ({}),
    };
    writeSecret = async () => ({});
    tokenEnc = (t) => 'dry:' + String(t.access_token || '').length;
  } else {
    process.chdir(path.join(ROOT, 'studio')); // channels-registry/data ROOT assumption
    const cr = await import('../studio/lib/channels-registry.js');
    if (!cr.hasGithubToken()) {
      console.error('[import-parked] no GITHUB_TOKEN/GITHUB_PAT — cannot write GitHub secrets; nothing attempted (fix the env and re-run: the importer is idempotent)');
      return 1;
    }
    registry = {
      read: () => cr.readRegistry(),
      upsert: (entry) => cr.upsertChannel(entry, `import-parked: bring ${entry.slug} into the panel (#106 T2)`),
    };
    writeSecret = (name, body) => cr.writeTokenSecret(name, body);
    tokenEnc = (t) => cr.encryptJSON(t);
  }

  const refresh = await makeRefresh({ env, fetchImpl: fetch });
  const identify = (accessToken) => identifyChannel(fetch, accessToken);

  const res = await runImport({ slugs, dry, readTokenFile, refresh, identify, writeSecret, registry, writeLocalToken, tokenEnc, log: console.log, now: Date.now });
  return res.exitCode;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then(
    (code) => process.exit(code || 0),
    (e) => {
      console.error(`[import-parked] fatal: ${String(e?.stack || e).slice(0, 400)}`);
      process.exit(1);
    },
  );
}
