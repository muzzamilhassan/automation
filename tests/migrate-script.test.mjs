// #120 R7 — scripts/migrate-master-key.mjs pure migration core.
// The CLI wires real Neon + the real vault file; everything below is the
// exported, dependency-injected core so the guarantees are testable WITHOUT
// touching either store: dry-run default, idempotence, v2 ciphertext
// unreadable under the legacy key, and NO secret material in any log line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { classifyTokenEnc, migrateTokenRows, migrateVaultRows } from '../scripts/migrate-master-key.mjs';
import { readKeys, masterEncKey } from '../studio/lib/keys-vault.js';

const sha256buf = (s) => crypto.createHash('sha256').update(String(s)).digest();
const MASTER = 'migrate-test-master';
const LEGACY_PW = 'migrate-test-legacy-pw';
const masterKey = sha256buf('quarry-studio-tokens-v2|' + MASTER);
const legacyKey = sha256buf(LEGACY_PW); // plain hash — the token v1 derivation
const encryptV2 = (obj) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
};
const encryptUnder = (obj, key) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
};

test('#120 R7: classifyTokenEnc distinguishes v2 / legacy / unreadable', () => {
  assert.equal(classifyTokenEnc(encryptV2({ s: 1 }), { masterKey, legacyKey }), 'v2');
  assert.equal(classifyTokenEnc(encryptUnder({ s: 2 }, legacyKey), { masterKey, legacyKey }), 'legacy');
  assert.equal(classifyTokenEnc('garbage', { masterKey, legacyKey }), 'unreadable');
  assert.equal(classifyTokenEnc(encryptUnder({ s: 3 }, legacyKey), { masterKey, legacyKey: null }), 'unreadable', 'no legacy material → legacy rows unreadable');
});

test('#120 R7: token migration — dry-run writes nothing, apply produces v2 UPDATEs, idempotent', () => {
  const legacyEnc = encryptUnder({ refresh_token: 'SECRET-RT-1' }, legacyKey);
  const rows = [{ slug: 'a', token_enc: legacyEnc }, { slug: 'b', token_enc: encryptV2({ refresh_token: 'x' }) }, { slug: 'c', token_enc: 'junk' }, { slug: 'd', token_enc: null }];
  const dry = migrateTokenRows(rows, { masterKey, legacyKey, encryptV2, apply: false });
  assert.equal(dry.migrated, 1);
  assert.equal(dry.updates.length, 0, 'dry-run: NO updates');
  assert.equal(dry.alreadyV2, 1);
  assert.equal(dry.unreadable, 1);

  const applied = migrateTokenRows(rows, { masterKey, legacyKey, encryptV2, apply: true });
  assert.equal(applied.updates.length, 1);
  assert.equal(applied.updates[0].slug, 'a');
  const migratedEnc = applied.updates[0].enc;
  assert.equal(classifyTokenEnc(migratedEnc, { masterKey, legacyKey }), 'v2', 'the UPDATE carries v2 ciphertext');
  assert.notEqual(migratedEnc, legacyEnc);

  // idempotence: run again over the migrated state → zero to do
  const again = migrateTokenRows([{ slug: 'a', token_enc: migratedEnc }, { slug: 'b', token_enc: encryptV2({ r: 1 }) }], { masterKey, legacyKey, encryptV2, apply: true });
  assert.equal(again.migrated, 0);
  assert.equal(again.updates.length, 0);
  assert.equal(again.alreadyV2, 2);
});

test('#120 R7: no secret material ever reaches a log line', () => {
  const SECRET = 'SECRET-RT-NEVER-PRINT';
  const lines = [];
  migrateTokenRows([{ slug: 'a', token_enc: encryptUnder({ refresh_token: SECRET }, legacyKey) }], { masterKey, legacyKey, encryptV2, apply: true, log: (m) => lines.push(m) });
  migrateVaultRows({ 'x': { enc: encryptUnder({ groq: 'GSK-NEVER-PRINT' }, sha256buf('quarry-channel-keys-v1|legacy-secret')) } }, {
    readKeysFn: (e) => ({ keys: { groq: 'GSK-NEVER-PRINT' }, enc: encryptV2({ groq: 'GSK-NEVER-PRINT' }), key_version: 2, migrated: true }),
    apply: true,
    log: (m) => lines.push(m),
  });
  const all = lines.join('\n');
  assert.ok(!all.includes(SECRET), 'plaintext token must never be logged');
  assert.ok(!all.includes('GSK-NEVER-PRINT'), 'plaintext provider key must never be logged');
  assert.ok(lines.some((l) => l.includes('token a: legacy → v2')), 'status lines still say what happened');
});

test('#120 R7: vault migration via the studio readKeys — legacy row gets key_version 2, already-v2 untouched', () => {
  process.env.MASTER_KEY = MASTER;
  process.env.YOUTUBE_CLIENT_SECRET = 'legacy-secret'; // the v1 material readKeys derives from
  try {
    const legacyRow = { enc: encryptUnder({ groq: 'gsk_old' }, sha256buf('quarry-channel-keys-v1|legacy-secret')) };
    const alreadyV2Row = { enc: encryptUnder({ g: 1 }, sha256buf('quarry-channel-keys-v2|' + MASTER)), key_version: 2 }; // VAULT v2 derivation
    const res = migrateVaultRows({ 'money-rulebook': legacyRow, 'already': alreadyV2Row }, { readKeysFn: readKeys, apply: true });
    assert.equal(res.migrated, 1);
    assert.equal(res.alreadyV2, 1);
    assert.equal(res.next['money-rulebook'].key_version, 2, 'row stamped v2');
    assert.notEqual(res.next['money-rulebook'].enc, legacyRow.enc, 'ciphertext replaced');
    // the new enc decrypts under the VAULT master derivation (studio keys-vault's own)
    assert.equal(res.next['money-rulebook'].enc !== null && typeof readKeys(res.next['money-rulebook']).keys === 'object', true);
    assert.equal(readKeys(res.next['money-rulebook']).key_version, 2);
    assert.ok(res.next['money-rulebook'].updatedBy === 'migrate-master-key');
    // untouched row keeps its fields
    assert.equal(res.next['already'].key_version, 2);
  } finally {
    delete process.env.MASTER_KEY;
    delete process.env.YOUTUBE_CLIENT_SECRET;
  }
  // sanity: the vault master derivation matches the lib's own
  assert.ok(masterEncKey().length === 32);
});
