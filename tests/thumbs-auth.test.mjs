// Audit 2026-11-13 improvement #1 (security-01 / studio-arch-01 / security-10).
// e9ef6d2 made five /api/thumbs/* paths public and dropped the sign-in checks
// in preview/templates/videos — an open server-side fetch + private titles.
// Spec + QA: docs/qa/thumbs-auth-qa.md.
//
// Pure logic (public-path list, photo-host allowlist) is imported and tested
// directly; route wiring is pinned by source scan — the house pattern for
// studio route files ('@/lib' aliases are unresolvable under node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isPublicPath } from '../studio/lib/public-paths.js';
import { isAllowedPhotoUrl } from '../studio/lib/photo-url.js';

const read = (p) => fs.readFileSync(p, 'utf8');

test('R1: only /api/thumbs/demo is public among thumbs API paths', () => {
  assert.equal(isPublicPath('/api/thumbs/demo'), true);
  for (const p of ['templates', 'registry', 'preview', 'videos', 'photos', 'branding', 'bulk', 'attach', 'ai-bg']) {
    assert.equal(isPublicPath(`/api/thumbs/${p}`), false, `/api/thumbs/${p} must require a session`);
  }
});

test('R1: the pre-existing public paths stay public (no lock-out regression)', () => {
  for (const p of ['/login', '/api/login', '/api/logout', '/api/oauth/callback', '/api/auth/google/start',
    '/api/template-previews/media', '/api/templates/preview', '/proof', '/api/proof', '/client']) {
    assert.equal(isPublicPath(p), true, `${p} must stay public`);
  }
  for (const p of ['/', '/thumbs', '/settings', '/api/action', '/api/review/approve']) {
    assert.equal(isPublicPath(p), false, `${p} must not be public`);
  }
});

test('R1: proxy.js delegates to isPublicPath and carries no inline thumbs public paths', () => {
  const src = read('studio/proxy.js');
  assert.match(src, /isPublicPath\(pathname\)/);
  assert.doesNotMatch(src, /pathname === '\/api\/thumbs\//, 'thumbs public paths must live only in lib/public-paths.js');
});

test('R2: preview route rejects anonymous callers before reading the body or fetching', () => {
  const src = read('studio/app/api/thumbs/preview/route.js');
  const auth = src.indexOf('await getUser(req)');
  const deny = src.search(/if \(!user\) return Response\.json\([^)]*\{ status: 401 \}\)/);
  assert.ok(auth > 0, 'preview must call getUser');
  assert.ok(deny > auth, 'preview must 401 when there is no user');
  assert.ok(deny < src.indexOf('req.json()'), '401 must come before the body is read');
  assert.ok(deny < src.indexOf('fetch('), '401 must come before any server-side fetch');
});

test('R3: isAllowedPhotoUrl accepts only https Pexels image URLs', () => {
  assert.equal(isAllowedPhotoUrl('https://images.pexels.com/photos/123/pexels-photo-123.jpeg?auto=compress&w=1200'), true);
  const bad = [
    'http://images.pexels.com/photos/1.jpeg', // not https
    'https://evil.example.com/x.jpg',
    'https://images.pexels.com.evil.com/x.jpg', // suffix look-alike
    'https://evilimages.pexels.com/x.jpg', // prefix look-alike
    'https://images.pexels.com@evil.com/x.jpg', // userinfo trick
    'https://169.254.169.254/latest/meta-data/',
    'https://127.0.0.1/x.jpg',
    'https://images.pexels.com:8443/x.jpg', // non-default port
    'file:///etc/passwd',
    'not a url',
    '',
    null,
    undefined,
  ];
  for (const u of bad) assert.equal(isAllowedPhotoUrl(u), false, `must reject ${u}`);
});

test('R3: preview fetch is gated by the allowlist and refuses redirects', () => {
  const src = read('studio/app/api/thumbs/preview/route.js');
  assert.match(src, /isAllowedPhotoUrl\(photoUrl\)/);
  assert.match(src, /redirect: 'error'/);
  assert.doesNotMatch(src, /\/\^https:\\\/\\\/\/\.test\(photoUrl\)/, 'the bare ^https:// check must be gone');
});

test('R4: videos route returns 401/403 before any state-derived fallback', () => {
  const src = read('studio/app/api/thumbs/videos/route.js');
  const handler = src.slice(src.indexOf('export async function GET'));
  const deny401 = handler.search(/if \(!user\) return Response\.json\([^)]*\{ status: 401 \}\)/);
  const deny403 = handler.search(/canAccessChannelSlug\(user, slug\)\)\) return Response\.json\([^)]*\{ status: 403 \}\)/);
  const fb = handler.indexOf('fallbackVideos(');
  assert.ok(deny401 > 0, 'videos must 401 with no user');
  assert.ok(deny403 > 0, 'videos must 403 when the user cannot access the slug');
  assert.ok(fb > deny401 && fb > deny403, 'fallbackVideos must only run after both checks');
});

test('R5: templates route requires a signed-in user', () => {
  const src = read('studio/app/api/thumbs/templates/route.js');
  assert.match(src, /const user = await getUser\(req\);\s*\n\s*if \(!user\) return Response\.json\([^)]*\{ status: 401 \}\)/);
});
