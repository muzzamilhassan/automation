// 10-08 PHASE R2 — one-shot Neon setup: creates the 4 tables and seeds them
// from the current JSON sources (access.json users + studio-channels registry).
// Idempotent — safe to re-run. Run from the studio/ folder: node db-setup.mjs
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const HERE = process.cwd();
const envRaw = fs.readFileSync(path.resolve(HERE, '..', '.env'), 'utf8');
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();
const url = process.env.DATABASE_URL || '';
if (!url) { console.error('no DATABASE_URL'); process.exit(1); }
const sql = postgres(url, { ssl: 'require', max: 1, prepare: false });

console.log('1. creating tables…');
await sql`
  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('owner','staff','client')),
    name TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
await sql`
  CREATE TABLE IF NOT EXISTS channels (
    slug TEXT PRIMARY KEY,
    owner_email TEXT DEFAULT '',
    label TEXT NOT NULL DEFAULT '',
    handle TEXT DEFAULT '',
    channel_id TEXT DEFAULT '',
    niche TEXT DEFAULT '',
    style TEXT DEFAULT '',
    voice TEXT DEFAULT '',
    accent TEXT DEFAULT '#38BDF8',
    slots TEXT[] DEFAULT '{}',
    doc_day TEXT DEFAULT '',
    autopilot BOOLEAN NOT NULL DEFAULT TRUE,
    kit JSONB DEFAULT '{}'::jsonb,
    yt_description TEXT DEFAULT '',
    yt_keywords TEXT DEFAULT '',
    token_enc TEXT,
    token_secret TEXT DEFAULT '',
    subs INTEGER DEFAULT 0,
    connected_at TIMESTAMPTZ,
    status TEXT DEFAULT ''
  )`;
await sql`
  CREATE TABLE IF NOT EXISTS topics_queue (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'custom',
    text TEXT NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
await sql`
  CREATE TABLE IF NOT EXISTS audit_log (
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT DEFAULT ''
  )`;
await sql`CREATE INDEX IF NOT EXISTS topics_slug_idx ON topics_queue (slug, added_at DESC)`;
await sql`CREATE INDEX IF NOT EXISTS audit_at_idx ON audit_log (at DESC)`;
console.log('   tables ready: users, channels, topics_queue, audit_log');

console.log('2. seeding users from access.json…');
const access = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'yt-mcp', 'access.json'), 'utf8'));
for (const u of access.users || []) {
  await sql`
    INSERT INTO users (email, role, name) VALUES (${u.email}, ${u.role}, ${u.name || ''})
    ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, name = EXCLUDED.name`;
  console.log('   user:', u.email, '→', u.role);
}

console.log('3. seeding channels from studio-channels registry…');
const reg = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'yt-mcp', 'studio-channels.json'), 'utf8'));
for (const c of reg.channels || []) {
  await sql`
    INSERT INTO channels (slug, owner_email, label, handle, channel_id, niche, style, voice, accent, slots, doc_day, autopilot, kit, yt_description, yt_keywords, token_enc, token_secret, subs, connected_at, status)
    VALUES (${c.slug}, ${c.ownerEmail || ''}, ${c.label || c.slug}, ${c.handle || ''}, ${c.channelId || ''}, ${c.niche || ''}, ${c.style || ''}, ${c.voice || ''}, ${c.accent || '#38BDF8'},
            ${c.slots || []}, ${c.docDay || ''}, ${c.autopilot !== false}, ${sql.json(c.kit || {})}, ${c.ytDescription || ''}, ${c.ytKeywords || ''},
            ${c.tokenEnc || null}, ${c.tokenSecret || ''}, ${Number(c.subs || 0)}, ${c.connectedAt ? new Date(c.connectedAt) : null}, ${c.status || ''})
    ON CONFLICT (slug) DO UPDATE SET
      label = EXCLUDED.label, owner_email = EXCLUDED.owner_email, niche = EXCLUDED.niche, style = EXCLUDED.style,
      voice = EXCLUDED.voice, accent = EXCLUDED.accent, slots = EXCLUDED.slots, doc_day = EXCLUDED.doc_day,
      autopilot = EXCLUDED.autopilot, kit = EXCLUDED.kit, yt_description = EXCLUDED.yt_description,
      yt_keywords = EXCLUDED.yt_keywords, token_enc = COALESCE(EXCLUDED.token_enc, channels.token_enc),
      token_secret = EXCLUDED.token_secret, subs = EXCLUDED.subs, status = EXCLUDED.status`;
  console.log('   channel:', c.slug, '| tokenEnc:', c.tokenEnc ? 'migrated' : 'none');
}

const counts = await sql`SELECT
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM channels) AS channels,
  (SELECT count(*) FROM topics_queue) AS topics,
  (SELECT count(*) FROM audit_log) AS audit`;
console.log('4. Neon now holds:', counts[0]);
await sql.end();
console.log('DONE');
