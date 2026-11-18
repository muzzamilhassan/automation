// #120 R1–R4 — token crypto hardening in studio/lib/channels-registry.js.
//
// R1  no MASTER_KEY → legacy behavior byte-identical (round-trip works)
// R2  MASTER_KEY set → new writes are v2; legacy rows STILL decrypt
//     (v2-then-legacy try order); wrong/missing key → null, never garbage
// R3  the 'quarry-connect' literal fallback is gone; no key material → refuse
// R4  no code path writes tokenEnc into a repo file (source scans)
//
// Behavioral tests use REAL AES-GCM via the real lib; route/lib wiring that
// touches the network or the repo file gets SOURCE SCAN (house pattern).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { encryptJSON, decryptJSON, masterEncKey, legacyEncKey } from '../studio/lib/channels-registry.js';

// save/restore the three env fields each test may touch — tests in a file run
// sequentially, so mutation inside try/finally is safe.
function withEnv(mut, fn) {
  const saved = {};
  for (const k of ['MASTER_KEY', 'STUDIO_PASSWORD', 'YOUTUBE_CLIENT_SECRET']) {
    saved[k] = process.env[k];
    if (k in mut) {
      if (mut[k] === undefined) delete process.env[k];
      else process.env[k] = mut[k];
    }
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });
}

test('#120 R3: with no key material at all, encrypt refuses and decrypt returns null', () => {
  return withEnv({ MASTER_KEY: undefined, STUDIO_PASSWORD: undefined, YOUTUBE_CLIENT_SECRET: undefined }, () => {
    assert.throws(() => encryptJSON({ a: 1 }), /no key material/);
    assert.equal(decryptJSON('AAAA.BBBB.CCCC'), null, 'no derivation available → null, never garbage');
    assert.equal(legacyEncKey(), null, 'legacy derivation refuses without material');
  });
});

test('#120 R1: legacy round-trip without MASTER_KEY — byte-identical behavior to pre-#120', () => {
  return withEnv({ MASTER_KEY: undefined, STUDIO_PASSWORD: 'legacy-pw-test', YOUTUBE_CLIENT_SECRET: undefined }, () => {
    const enc = encryptJSON({ refresh_token: 'rt-123' });
    assert.equal(decryptJSON(enc)?.refresh_token, 'rt-123');
    // the legacy derivation is the PLAIN hash of the material (no domain prefix)
    const k = crypto.createHash('sha256').update('legacy-pw-test').digest();
    const [iv, tag, ct] = enc.split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
    d.setAuthTag(tag);
    assert.equal(JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8')).refresh_token, 'rt-123');
  });
});

test('#120 R2: MASTER_KEY set → new encrypts are v2; legacy rows still decrypt', () => {
  return withEnv({ MASTER_KEY: undefined, STUDIO_PASSWORD: 'legacy-pw-test', YOUTUBE_CLIENT_SECRET: undefined }, () => {
    const legacyEnc = encryptJSON({ refresh_token: 'rt-OLD' }); // minted pre-migration
    return withEnv({ MASTER_KEY: 'master-key-test-value' }, () => {
      const v2Enc = encryptJSON({ refresh_token: 'rt-NEW' });
      assert.notEqual(v2Enc.split('.')[2], legacyEnc.split('.')[2]);
      // v2 row decrypts under the v2 derivation (domain-prefixed)
      const k = crypto.createHash('sha256').update('quarry-studio-tokens-v2|master-key-test-value').digest();
      const [iv, tag, ct] = v2Enc.split('.').map((p) => Buffer.from(p, 'base64'));
      const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
      d.setAuthTag(tag);
      assert.equal(JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8')).refresh_token, 'rt-NEW');
      // dual-read: the OLD legacy row still decrypts while MASTER_KEY is set
      assert.equal(decryptJSON(legacyEnc)?.refresh_token, 'rt-OLD');
      // fail-closed: garbage and WRONG master key → null, never garbage
      assert.equal(decryptJSON('not-even-a-format'), null);
      return withEnv({ MASTER_KEY: 'a-different-wrong-key' }, () => {
        assert.equal(decryptJSON(v2Enc), null, 'wrong MASTER_KEY → null (GCM auth tag rejects)');
      });
    });
  });
});

test('#120: derivation exports are 32-byte, deterministic, and domain-separated', () => {
  return withEnv({ MASTER_KEY: 'k1', STUDIO_PASSWORD: 'pw', YOUTUBE_CLIENT_SECRET: undefined }, () => {
    assert.equal(masterEncKey().length, 32);
    assert.equal(legacyEncKey().length, 32);
    assert.equal(masterEncKey().equals(crypto.createHash('sha256').update('quarry-studio-tokens-v2|k1').digest()), true);
    assert.equal(legacyEncKey().equals(crypto.createHash('sha256').update('pw').digest()), true);
    return withEnv({ MASTER_KEY: 'k2' }, () => {
      assert.equal(masterEncKey().equals(crypto.createHash('sha256').update('quarry-studio-tokens-v2|k1').digest()), false, 'different key → different derivation');
    });
  });
});

// ---- R4: repo-write paths (source scans — the real writers touch git) ----

const src = fs.readFileSync('studio/lib/channels-registry.js', 'utf8');

test('#120 R3+R4 source: literal fallback gone, both strip sites present', () => {
  assert.doesNotMatch(src, /\|\| ['"`]quarry-connect['"`]/, "the literal fallback is deleted from the code (comments may still name it as history)");
  // upsertChannel's DB-down fallback drops tokenEnc before the repo write
  const fallback = src.slice(src.indexOf('// repo fallback (original logic)'), src.indexOf('// Admin-panel review #5'));
  assert.match(fallback, /const \{ tokenEnc: _dropped, \.\.\.repoEntry \} = entry;/);
  assert.match(fallback, /channels\.push\(\{ \.\.\.repoEntry, kit \}\);/, 'the pushed entry is the STRIPPED one');
  assert.doesNotMatch(fallback, /channels\.push\(\{ \.\.\.entry, kit \}\);/, 'the old full-entry push is gone');
  // writeRegistry strips unconditionally on every entry, belt-and-suspenders
  const wr = src.slice(src.indexOf('export async function writeRegistry'));
  assert.match(wr, /channels: \(registry\?\.channels \|\| \[\]\)\.map\(\(\{ tokenEnc: _never, \.\.\.c \}\) => c\)/);
  assert.equal((wr.match(/mirrorFeedBestEffort\(clean\.channels\)/g) || []).length, 2, 'both feed mirrors see the cleaned channels (file and mirror agree)');
  assert.doesNotMatch(wr, /mirrorFeedBestEffort\(registry\?\.channels\)/);
});
