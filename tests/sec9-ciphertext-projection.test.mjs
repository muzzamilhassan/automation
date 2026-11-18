// #122 (SEC-9) — ciphertext never reaches the browser.
//
// R1  stripTokenMaterial removes exactly tokenEnc + tokenEncError, mutates nothing
// R5  tokenSecret (NAME) and tokenSecretSaved (boolean) survive — wizard repair
//     flow + "key saved" chip keep working with zero UI changes
// R2-R4,R6 route wirings + client slug ownership: SOURCE SCAN (house pattern —
//     routes resolve '@/…' aliases plain node cannot)
// R7  global pin: no route line ever puts tokenEnc inside a Response.json body
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTokenMaterial } from '../studio/lib/channels-registry.js';

const entry = {
  slug: 'money-rulebook',
  label: 'Money Rulebook',
  handle: '@moneyrulebook',
  niche: 'personal finance',
  style: 'cinematic',
  voice: 'am_michael',
  accent: '#E8C15A',
  slots: ['22:35'],
  docDay: 'Tue',
  kit: { tagline: 'Play the long game.', tags: ['money'] },
  destinations: { fbPageId: '114550268199751' },
  autopilot: true,
  tokenSecret: 'YT_TOKEN_MONEY_RULEBOOK',
  tokenSecretSaved: true,
  tokenEnc: 'AAAA.BBBB.CCCC',
  tokenEncError: 'encrypt failed: internal detail',
};

test('#122 R1: strips exactly tokenEnc + tokenEncError — every other field byte-identical', () => {
  const out = stripTokenMaterial(entry);
  assert.equal('tokenEnc' in out, false);
  assert.equal('tokenEncError' in out, false);
  const { tokenEnc: _e, tokenEncError: _ee, ...expectedRest } = entry;
  assert.deepEqual(out, expectedRest);
});

test('#122 R1: the input object is never mutated', () => {
  const before = JSON.stringify(entry);
  stripTokenMaterial(entry);
  assert.equal(JSON.stringify(entry), before);
});

test('#122 R5: tokenSecret NAME and tokenSecretSaved survive the projection', () => {
  const out = stripTokenMaterial(entry);
  assert.equal(out.tokenSecret, 'YT_TOKEN_MONEY_RULEBOOK', 'the wizard repair flow displays this name');
  assert.equal(out.tokenSecretSaved, true, 'the "key saved / secret missing" chip reads this boolean');
});

test('#122 R1: non-objects pass through untouched', () => {
  assert.equal(stripTokenMaterial(null), null);
  assert.equal(stripTokenMaterial(undefined), undefined);
  assert.equal(stripTokenMaterial('x'), 'x');
});

// ---- route wirings (source scans) ----

const registrySrc = fs.readFileSync('studio/app/api/channels/registry/route.js', 'utf8');
const profileSrc = fs.readFileSync('studio/app/api/channels/profile/route.js', 'utf8');

test('#122 R2: registry GET projects every channel row; the verbatim shape is gone', () => {
  assert.match(registrySrc, /channels: \(reg\.channels \|\| \[\]\)\.map\(stripTokenMaterial\)/);
  assert.doesNotMatch(registrySrc, /channels: reg\.channels \|\| \[\]/, 'old verbatim response shape must not return');
});

test('#122 R3+R4: profile GET and POST both return projected shapes; verbatim entry/channel gone', () => {
  assert.match(profileSrc, /channel: stripTokenMaterial\(entry\)/);
  assert.match(profileSrc, /entry: stripTokenMaterial\(entry\)/);
  assert.doesNotMatch(profileSrc, /\{ ok: true, channel: entry \}/);
  assert.doesNotMatch(profileSrc, /Response\.json\(\{ ok: true, entry \}\)/);
});

test('#122 R6: profile GET — client slug ownership check present, old role-list requireRole gone', () => {
  assert.match(profileSrc, /user\.role === 'client' && !\(await canAccessChannelSlug\(user, slug\)\)/);
  assert.match(profileSrc, /this channel is not linked to your account' \}, \{ status: 403 \}/);
  assert.doesNotMatch(profileSrc, /requireRole\(req, \['owner', 'staff', 'client'\]\)/, 'GET resolves the user object now (needs role + slug scope)');
  assert.match(profileSrc, /requireRole\(req, \['owner'\]\)/, 'POST stays owner-only');
});

test('#122 R7: no route anywhere places tokenEnc inside a Response.json body', () => {
  const apiDir = 'studio/app/api';
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name === 'route.js') {
        const bad = fs.readFileSync(p, 'utf8')
          .split('\n')
          .some((line) => line.includes('tokenEnc') && line.includes('Response.json'));
        if (bad) offenders.push(p);
      }
    }
  };
  walk(apiDir);
  assert.deepEqual(offenders, [], 'token material must never share a line with a response body');
});
