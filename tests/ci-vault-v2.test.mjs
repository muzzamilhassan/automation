// #120 R5–R6 + workflow pins — the CI-side vault loader (lib/channel-keys.mjs)
// after the v2 port.
//
// R5  CROSS-BOUNDARY: the studio vault (#104) writes MASTER_KEY-derived rows;
//     the CI loader must read them. Both libs imported into ONE test —
//     studio encrypts, CI decrypts, identical keys. This is the exact
//     handoff that used to break silently (the "vault v2 landmine").
// R6  unreadable row → ONE ntfy alert (injectable notify spy), shared-keys
//     fallback, run continues even if the notify impl itself throws.
// Pin the 12 workflows: wherever YOUTUBE_CLIENT_SECRET flows, MASTER_KEY
// must flow identically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encryptKeys } from '../studio/lib/keys-vault.js';
import { applyChannelKeys, resetSharedKeyStash } from '../lib/channel-keys.mjs';

function withEnv(mut, fn) {
  const saved = {};
  for (const k of ['MASTER_KEY', 'YOUTUBE_CLIENT_SECRET']) {
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

// applyChannelKeys reads yt-mcp/channel-keys.json RELATIVE TO CWD — point cwd
// at a throwaway dir with a fixture vault, restore in finally.
function withTmpVault(vaultData, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-vault-'));
  fs.mkdirSync(path.join(tmp, 'yt-mcp'));
  fs.writeFileSync(path.join(tmp, 'yt-mcp', 'channel-keys.json'), JSON.stringify(vaultData));
  const prev = process.cwd();
  process.chdir(tmp);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      process.chdir(prev);
      fs.rmSync(tmp, { recursive: true, force: true });
      resetSharedKeyStash();
    });
}

test('#120 R5 cross-boundary: studio-encrypted v2 vault row decrypts in the CI loader', () => {
  return withEnv({ MASTER_KEY: 'wave2-master-key', YOUTUBE_CLIENT_SECRET: 'legacy-secret-test' }, () => {
    const keys = { groq: 'gsk_test_groq', gemini: 'AIza_test_gemini' };
    const enc = encryptKeys(keys); // studio side: MASTER_KEY set → v2 derivation
    return withTmpVault({ 'test-channel': { enc, updated: '2026-11-18T00:00:00Z' } }, async () => {
      const env = { GROQ_API_KEY: 'shared-groq', GEMINI_API_KEY: 'shared-gemini' };
      const applied = applyChannelKeys('test-channel', env);
      assert.deepEqual(applied, ['groq', 'gemini'], 'CI loader applies the UI-saved keys');
      assert.equal(env.GROQ_API_KEY, 'gsk_test_groq', 'channel key replaces the shared key');
      assert.equal(env.GEMINI_API_KEY, 'AIza_test_gemini');
      // #39 restore semantics: dropping puts the shared value back
      const { dropChannelKeys } = await import('../lib/channel-keys.mjs');
      dropChannelKeys(['groq', 'gemini'], env);
      assert.equal(env.GROQ_API_KEY, 'shared-groq');
      assert.equal(env.GEMINI_API_KEY, 'shared-gemini');
    });
  });
});

test('#120 R1 mirror: legacy vault rows still decrypt in CI (with and without MASTER_KEY)', () => {
  return withEnv({ MASTER_KEY: undefined, YOUTUBE_CLIENT_SECRET: 'legacy-secret-test' }, () => {
    const enc = encryptKeys({ pixabay: 'px_legacy' }); // studio without MASTER_KEY → v1
    return withEnv({ MASTER_KEY: 'wave2-master-key' }, () => {
      return withTmpVault({ 'legacy-channel': { enc } }, () => {
        const env = { PIXABAY_API_KEY: 'shared-px' };
        assert.deepEqual(applyChannelKeys('legacy-channel', env), ['pixabay'], 'pre-migration row keeps working under the new key');
        assert.equal(env.PIXABAY_API_KEY, 'px_legacy');
      });
    });
  });
});

test('#120 R6: v2 row + CI without MASTER_KEY → null, ONE notify, env untouched, never throws', () => {
  return withEnv({ MASTER_KEY: 'wave2-master-key', YOUTUBE_CLIENT_SECRET: 'legacy-secret-test' }, () => {
    const enc = encryptKeys({ groq: 'gsk_v2_only' }); // v2 row
    return withEnv({ MASTER_KEY: undefined }, () => {
      return withTmpVault({ 'v2-channel': { enc, key_version: 2 } }, () => {
        const alerts = [];
        const env = { GROQ_API_KEY: 'shared-groq' };
        const applied = applyChannelKeys('v2-channel', env, null, async (a) => {
          alerts.push(a);
          return { ok: true };
        });
        assert.equal(applied, null, 'unreadable → shared keys');
        assert.equal(env.GROQ_API_KEY, 'shared-groq', 'shared value untouched');
        assert.equal(alerts.length, 1, 'exactly one alert');
        assert.match(String(alerts[0]?.text), /v2-channel/, 'the alert names the slug');
        assert.match(String(alerts[0]?.text), /NOT applied/, 'the alert says what the blast radius is');
        // a THROWING notify impl must not break the run either
        const threw = applyChannelKeys('v2-channel', env, null, () => { throw new Error('notify exploded'); });
        assert.equal(threw, null);
        assert.equal(env.GROQ_API_KEY, 'shared-groq');
      });
    });
  });
});

test('#120 B5 pin: every workflow carrying YOUTUBE_CLIENT_SECRET also carries MASTER_KEY', () => {
  const dir = '.github/workflows';
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml'));
  const carriers = files.filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('YOUTUBE_CLIENT_SECRET: ${{ secrets.YOUTUBE_CLIENT_SECRET }}'));
  assert.equal(carriers.length, 12, `expected the 12 known carrier workflows, found ${carriers.length}`);
  for (const f of carriers) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.match(src, /MASTER_KEY: \$\{\{ secrets\.MASTER_KEY \}\}/, `${f} must pass MASTER_KEY wherever it passes YOUTUBE_CLIENT_SECRET`);
  }
});
