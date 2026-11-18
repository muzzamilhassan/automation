// #123 (OPS-12) — safe panel-password rotation.
//
// Behavioral: classifyTokenEncRow (real crypto) + the legacy→v2 re-protect
// round trip — the ONLY thing that makes rotation safe for a pre-#120 row.
// Route + page: SOURCE SCAN (house pattern — routes/page use '@/…' aliases
// plain node cannot resolve).
//
// The load-bearing physics this pins:
//   session.js HMAC key = STUDIO_PASSWORD → new value deployed = every cookie
//   dies at the edge automatically (no code needed — documented, not tested here)
//   v2 token rows = MASTER_KEY-derived → password rotation breaks nothing
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyTokenEncRow, encryptJSON, decryptJSON } from '../studio/lib/channels-registry.js';

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

test('#123: classifyTokenEncRow — v2 / legacy / unreadable / null, real crypto', () => {
  return withEnv({ MASTER_KEY: undefined, STUDIO_PASSWORD: 'old-panel-pw', YOUTUBE_CLIENT_SECRET: undefined }, () => {
    const legacyEnc = encryptJSON({ refresh_token: 'rt-1' }); // keyed by the old password
    return withEnv({ MASTER_KEY: 'rotate-test-master' }, () => {
      const v2Enc = encryptJSON({ refresh_token: 'rt-2' });
      assert.equal(classifyTokenEncRow(v2Enc), 'v2');
      assert.equal(classifyTokenEncRow(legacyEnc), 'legacy', 'password-keyed row MUST be re-protected before rotation');
      assert.equal(classifyTokenEncRow('garbage.not.a.blob'), 'unreadable');
      assert.equal(classifyTokenEncRow(null), null);
      assert.equal(classifyTokenEncRow(''), null);
      return withEnv({ MASTER_KEY: undefined }, () => {
        assert.equal(classifyTokenEncRow(v2Enc), 'unreadable', 'v2 without MASTER_KEY is unreadable — exactly why R4 refuses rotation without the key');
      });
    });
  });
});

test('#123: the re-protect round trip — legacy row becomes v2 and reads back under MASTER_KEY', () => {
  return withEnv({ MASTER_KEY: undefined, STUDIO_PASSWORD: 'old-panel-pw', YOUTUBE_CLIENT_SECRET: undefined }, () => {
    const legacyEnc = encryptJSON({ refresh_token: 'rt-SECRET' });
    return withEnv({ MASTER_KEY: 'rotate-test-master' }, () => {
      assert.equal(classifyTokenEncRow(legacyEnc), 'legacy');
      const obj = decryptJSON(legacyEnc); // dual-read works pre-rotation (old pw still live)
      assert.equal(obj.refresh_token, 'rt-SECRET');
      const newEnc = encryptJSON(obj); // MASTER_KEY set → guaranteed v2
      assert.equal(classifyTokenEncRow(newEnc), 'v2');
      assert.equal(decryptJSON(newEnc).refresh_token, 'rt-SECRET');
      assert.notEqual(newEnc.split('.')[2], legacyEnc.split('.')[2], 'ciphertext actually replaced');
    });
  });
});

// ---- route + page pins (source scans) ----

const routeSrc = fs.readFileSync('studio/app/api/settings/rotate-password/route.js', 'utf8');
const pageSrc = fs.readFileSync('studio/app/settings/page.js', 'utf8');
const registrySrc = fs.readFileSync('studio/lib/channels-registry.js', 'utf8');

test('#123 R1: owner-only + rate-limited pw-rotate 5/h', () => {
  assert.match(routeSrc, /user\.role !== 'owner'/);
  assert.match(routeSrc, /status: 401/);
  assert.match(routeSrc, /bucket: 'pw-rotate', limit: 5, windowSec: 3600/);
});

test('#123 R2+R3: current-password verify precedes everything; new-password validations', () => {
  const verifyAt = routeSrc.indexOf("currentPassword !== process.env.STUDIO_PASSWORD");
  assert.ok(verifyAt > 0, 'current password verified against the env value');
  const validations = ['length < 12', 'pw === currentPassword', "confirm !== pw"];
  for (const marker of validations) {
    const at = routeSrc.indexOf(marker);
    assert.ok(at > verifyAt, `${marker} checked AFTER the current-password gate`);
  }
  assert.match(routeSrc, /New password must be 12–128 characters/);
  assert.match(routeSrc, /must be different from the current one/);
  assert.match(routeSrc, /confirmation don/);
});

test('#123 R4: rotation refuses without MASTER_KEY (503, with the reason)', () => {
  assert.match(routeSrc, /!process\.env\.MASTER_KEY/);
  assert.match(routeSrc, /MASTER_KEY is not set on this server/);
  assert.match(routeSrc, /\{ status: 503 \}/);
});

test('#123 R5: pre-flight classifies every row and re-encrypts legacy ones to v2', () => {
  assert.match(registrySrc, /export function classifyTokenEncRow\(enc\)/);
  assert.match(routeSrc, /SELECT slug, token_enc FROM channels WHERE token_enc IS NOT NULL/);
  assert.match(routeSrc, /classifyTokenEncRow\(r\.token_enc\)/);
  assert.match(routeSrc, /UPDATE channels SET token_enc = \$\{newEnc\} WHERE slug = \$\{r\.slug\}/);
  assert.match(routeSrc, /let scanned = 0, migrated = 0, unreadable = 0;/);
  assert.match(routeSrc, /already unreadable before rotation/);
});

test('#123 R6: the audit row carries COUNTS ONLY — no password material on any audit/log/response line', () => {
  assert.match(routeSrc, /password-rotate-prepare/);
  for (const line of routeSrc.split('\n')) {
    if (line.includes('appendAudit') || line.includes('console.')) {
      assert.ok(!/currentPassword|newPassword|confirm/.test(line), `password variable near a log/audit call: ${line.trim().slice(0, 80)}`);
    }
    if (line.includes('Response.json')) {
      assert.ok(!/password:|\{ pw|password\}/.test(line), 'no password field echoed in any response');
    }
  }
  assert.match(routeSrc, /tokens scanned · \$\{migrated\} re-protected/);
});

test('#123 R7: the route NEVER sets the password — env is read-only here', () => {
  assert.doesNotMatch(routeSrc, /process\.env\.STUDIO_PASSWORD\s*=/, 'no env mutation anywhere in the route');
  const stpUses = routeSrc.match(/process\.env\.STUDIO_PASSWORD/g) || [];
  for (const _ of stpUses) { /* every use is the R2 compare — pinned above */ }
  assert.equal(stpUses.length, 1, 'STUDIO_PASSWORD appears exactly once: the current-password compare');
  assert.match(routeSrc, /environment-variables/);
  assert.match(routeSrc, /ROTATION_STEPS/);
});

test('#123 R8: the Settings Security tab card — fields, endpoint, result panel, deep link', () => {
  assert.match(pageSrc, /Change panel password/);
  assert.match(pageSrc, /\/api\/settings\/rotate-password/);
  assert.match(pageSrc, /placeholder="Current password"/);
  assert.match(pageSrc, /placeholder="New password \(at least 12 characters\)"/);
  assert.match(pageSrc, /placeholder="Repeat new password"/);
  assert.match(pageSrc, /pwResult\.dashboardUrl/);
  assert.match(pageSrc, /Verify &amp; prepare rotation/);
});

test('#123 R8b: type="password" on all three inputs (no shoulder-surfing)', () => {
  const card = pageSrc.slice(pageSrc.indexOf('Change panel password'), pageSrc.indexOf('Security — active sign-ins'));
  assert.equal((card.match(/type="password"/g) || []).length, 3);
  assert.equal(card.includes('autoComplete="new-password"'), true);
});
