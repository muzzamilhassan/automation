// Live fix wave A1 — T1-01 open redirect. After a correct password the login
// page follows ?next=. It used to accept anything starting with '/', so
// `//example.com/x` (protocol-relative) and `/\example.com` (browsers turn
// '\' into '/') sent the user off-site. safeNextPath() is the ONE check:
// a same-origin app path or '/'. QA: docs/qa/live-fix-wave-a1-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeNextPath, isBarePath, signedOutLoginUrl } from '../studio/lib/safe-next.mjs';

test('EARS-1: WHEN next is a plain app path THEN it is kept as-is', () => {
  for (const p of ['/', '/channels', '/channels?x=1', '/channels/money-rulebook', '/videos#top', '/runs?tab=failed&page=2', '/a%20b']) {
    assert.equal(safeNextPath(p), p, p);
  }
});

test('EARS-2: WHEN next points off-site (protocol-relative, backslash, scheme) THEN it falls back to /', () => {
  const evil = [
    '//evil.example', '//evil.example/x', '///evil.example',
    '/\\evil.example', '\\\\evil.example', '/\\/evil.example', '\\/evil.example',
    'https://evil.example', 'http://evil.example/channels', 'HTTPS://evil.example',
    'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,hi', 'evil.example', 'channels',
  ];
  for (const p of evil) assert.equal(safeNextPath(p), '/', JSON.stringify(p));
});

test('EARS-2: encoded tricks are seen through (%2F%2F, %5C, double-encoding)', () => {
  for (const p of ['%2F%2Fevil.example', '/%2Fevil.example', '%2f%2fevil.example', '/%5Cevil.example', '%252F%252Fevil.example', '/%252Fevil.example']) {
    assert.equal(safeNextPath(p), '/', p);
  }
});

test('EARS-2: control characters the URL parser strips (tab/newline) cannot smuggle a second slash', () => {
  for (const p of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/%09/evil.example', '/\u0000/evil.example']) {
    assert.equal(safeNextPath(p), '/', JSON.stringify(p));
  }
});

test('EARS-3: WHEN next is empty, missing, not a string or malformed THEN it is /', () => {
  for (const p of ['', null, undefined, 42, {}, ['/x'], '/%E0%A4%A', ' /channels']) {
    assert.equal(safeNextPath(p), '/', JSON.stringify(p));
  }
  assert.equal(safeNextPath('/' + 'a'.repeat(5000)), '/', 'absurdly long values are refused');
});

test('isBarePath: only the pages that render without the app frame', () => {
  for (const p of ['/login', '/proof', '/client']) assert.equal(isBarePath(p), true, p);
  for (const p of ['/', '/channels', '/login/x', '/clients', '/proofs', '', null]) assert.equal(isBarePath(p), false, String(p));
});

test('EARS-4 (T1-10): signedOutLoginUrl sends a revoked device to /login with a safe next and a known error code', () => {
  assert.equal(signedOutLoginUrl('/channels?x=1'), '/login?next=%2Fchannels%3Fx%3D1&error=signed_out');
  assert.equal(signedOutLoginUrl('/'), '/login?error=signed_out', 'home needs no next');
  assert.equal(signedOutLoginUrl('//evil.example'), '/login?error=signed_out', 'an unsafe path is never carried');
  assert.equal(signedOutLoginUrl(''), '/login?error=signed_out');
  // the next it carries round-trips through the same check
  const back = new URL(signedOutLoginUrl('/videos?tab=all'), 'https://studio.invalid').searchParams.get('next');
  assert.equal(safeNextPath(back), '/videos?tab=all');
});

test('safe-next.mjs is pure: no @/ imports (plain node can load it)', () => {
  const src = fs.readFileSync('studio/lib/safe-next.mjs', 'utf8');
  assert.doesNotMatch(src, /from '@\//);
});
