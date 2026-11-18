#!/usr/bin/env node
// #120 (SEC-8 + SEC-10) — ONE-TIME MASTER_KEY migration for both ciphertext
// stores. DRY-RUN by default; --apply writes. Never prints plaintext or
// ciphertext — per-row status only. Idempotent (re-run reports zeros).
//
// RUNBOOK (wave-2 design, docs/superpowers/specs/2026-11-18-wave2-master-key-design.md):
//   0. The CODE for this issue must already be deployed (dual-read everywhere).
//   1. Shell env needs:  MASTER_KEY (the new 256-bit key — same value as the
//      Vercel + Actions secrets), DATABASE_URL (Neon), and the legacy material
//      (STUDIO_PASSWORD or YOUTUBE_CLIENT_SECRET) so v1 rows still decrypt.
//   2. Dry-run:      node scripts/migrate-master-key.mjs
//   3. Apply:        node scripts/migrate-master-key.mjs --apply
//   4. The vault file rewrite lands in your working tree — commit it.
//   5. Verify: wizard-channel server-side YouTube calls still work
//      (ytTokenRaw), next money-rulebook CI run shows keys applied.
//
// Derivations (keep in sync with studio/lib/channels-registry.js and
// studio/lib/keys-vault.js — this tool derives independently so it can tell
// a v2 row from a legacy row, which the dual-read libs cannot):
//   tokens  v2: sha256('quarry-studio-tokens-v2|'  + MASTER_KEY)
//   tokens  v1: sha256(STUDIO_PASSWORD || YOUTUBE_CLIENT_SECRET)
//   vault   v2: sha256('quarry-channel-keys-v2|' + MASTER_KEY)   (via keys-vault.js)
//   vault   v1: sha256('quarry-channel-keys-v1|' + YOUTUBE_CLIENT_SECRET)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const VAULT_PATH = path.join('yt-mcp', 'channel-keys.json');

// ---------- shared crypto (format: iv.tag.ct, base64 — same as both libs) ----------

function decryptUnder(enc, key) {
  if (!key) return null;
  try {
    const [iv, tag, ct] = String(enc).split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

const sha256buf = (s) => crypto.createHash('sha256').update(String(s)).digest();

// ---------- tokens (exported, dependency-injected for tests) ----------

// 'v2' | 'legacy' | 'unreadable' — which derivation decrypts this tokenEnc.
export function classifyTokenEnc(enc, { masterKey, legacyKey }) {
  if (decryptUnder(enc, masterKey)) return 'v2';
  if (decryptUnder(enc, legacyKey)) return 'legacy';
  return 'unreadable';
}

// rows: [{ slug, token_enc }]; encryptV2(obj) → v2 ciphertext string.
// Returns counts + (when apply) the UPDATE list. Rows with no token_enc are
// skipped silently (nothing stored, nothing to migrate).
export function migrateTokenRows(rows, { masterKey, legacyKey, encryptV2, apply = false, log = console.log }) {
  const out = { alreadyV2: 0, migrated: 0, unreadable: 0, scanned: 0, updates: [] };
  for (const r of rows || []) {
    if (!r?.token_enc) continue;
    out.scanned++;
    const state = classifyTokenEnc(r.token_enc, { masterKey, legacyKey });
    if (state === 'v2') {
      out.alreadyV2++;
      log(`token ${r.slug}: already v2`);
      continue;
    }
    if (state === 'legacy') {
      const obj = decryptUnder(r.token_enc, legacyKey);
      if (!obj) {
        out.unreadable++;
        log(`token ${r.slug}: UNREADABLE — skipped`);
        continue;
      }
      out.migrated++;
      if (apply) {
        out.updates.push({ slug: r.slug, enc: encryptV2(obj) });
        log(`token ${r.slug}: legacy → v2 (updated)`);
      } else {
        log(`token ${r.slug}: legacy → v2 (WOULD migrate — run with --apply)`);
      }
      continue;
    }
    out.unreadable++;
    log(`token ${r.slug}: UNREADABLE under any known key — the original key material is missing`);
  }
  return out;
}

// ---------- vault (exported; reuses the studio lib's own migration logic) ----------

// data: parsed yt-mcp/channel-keys.json. readKeysFn = studio keys-vault
// readKeys (with MASTER_KEY set it decrypts legacy rows AND returns v2 enc).
export function migrateVaultRows(data, { readKeysFn, apply = false, now = new Date().toISOString(), log = console.log }) {
  const out = { alreadyV2: 0, migrated: 0, unreadable: 0, next: null };
  const rows = data && typeof data === 'object' ? data : {};
  const next = { ...rows };
  for (const [slug, entry] of Object.entries(rows)) {
    if (!entry?.enc) continue;
    const r = readKeysFn(entry);
    if (!r?.keys) {
      out.unreadable++;
      log(`vault ${slug}: UNREADABLE — skipped`);
      continue;
    }
    if (r.migrated) {
      out.migrated++;
      if (apply) {
        next[slug] = { ...entry, enc: r.enc, key_version: 2, updated: now, updatedBy: 'migrate-master-key' };
        log(`vault ${slug}: legacy → v2 (written)`);
      } else {
        log(`vault ${slug}: legacy → v2 (WOULD write — run with --apply)`);
      }
    } else {
      out.alreadyV2++;
      log(`vault ${slug}: already v2`);
    }
  }
  if (apply) out.next = next;
  return out;
}

// ---------- CLI ----------

async function main() {
  const apply = process.argv.includes('--apply');
  const skipTokens = process.argv.includes('--skip-tokens');
  const skipVault = process.argv.includes('--skip-vault');
  const MASTER = process.env.MASTER_KEY;
  const legacyMaterial = process.env.STUDIO_PASSWORD || process.env.YOUTUBE_CLIENT_SECRET || '';

  if (!MASTER) {
    console.error('MASTER_KEY is not set — refusing. Set it (same value as the Vercel + Actions secrets) and re-run.');
    process.exit(1);
  }
  console.log(`mode: ${apply ? 'APPLY' : 'DRY-RUN'}  |  MASTER_KEY: set  |  legacy material: ${legacyMaterial ? 'set' : 'MISSING (v1 rows will report unreadable)'}`);

  // tokens
  if (!skipTokens) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.log('DATABASE_URL not set — token migration SKIPPED (use --skip-tokens to silence).');
    } else {
      const { default: postgres } = await import('postgres');
      const sql = postgres(url, { max: 1, idle_timeout: 5 });
      try {
        const rows = await sql`SELECT slug, token_enc FROM channels WHERE token_enc IS NOT NULL`;
        const masterKey = sha256buf('quarry-studio-tokens-v2|' + MASTER);
        const legacyKey = legacyMaterial ? sha256buf(legacyMaterial) : null;
        const encryptV2 = (obj) => {
          const iv = crypto.randomBytes(12);
          const c = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
          const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
          return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
        };
        const res = migrateTokenRows(rows, { masterKey, legacyKey, encryptV2, apply });
        for (const u of res.updates) {
          await sql`UPDATE channels SET token_enc = ${u.enc} WHERE slug = ${u.slug}`;
        }
        console.log(`tokens: ${res.scanned} scanned, ${res.alreadyV2} already v2, ${res.migrated} ${apply ? 'migrated' : 'would migrate'}, ${res.unreadable} unreadable`);
      } finally {
        await sql.end();
      }
    }
  }

  // vault
  if (!skipVault) {
    const { readKeys } = await import('../studio/lib/keys-vault.js');
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
    } catch (e) {
      console.log(`vault: cannot read ${VAULT_PATH} (${String(e.message).slice(0, 60)}) — vault migration SKIPPED`);
      data = null;
    }
    if (data) {
      const res = migrateVaultRows(data, { readKeysFn: readKeys, apply });
      if (apply && res.next) {
        fs.writeFileSync(VAULT_PATH, JSON.stringify(res.next, null, 2) + '\n');
        console.log(`vault: rewritten — COMMIT ${VAULT_PATH}`);
      }
      console.log(`vault: ${res.alreadyV2} already v2, ${res.migrated} ${apply ? 'written' : 'would write'}, ${res.unreadable} unreadable`);
    }
  }

  console.log(apply ? 'done — re-run without --apply to verify idempotence.' : 'dry-run only — nothing written. Re-run with --apply to migrate.');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error('migration failed:', String(e.message || e).slice(0, 200));
    process.exit(1);
  });
}