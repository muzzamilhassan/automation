// Live fix wave A1 (T1-01, T1-10) — where may the app send you after sign-in?
// Pure, dependency-free (no '@/' imports) so plain `node --test` loads it.
//
// safeNextPath(next): the ONE check for ?next=. Only a same-origin app path
// passes — a single leading '/', never '//' (protocol-relative) or '/\'
// (browsers read '\' as '/'), no scheme, no control characters (the URL
// parser strips tab/newline, which could join two slashes). Encoded forms
// (%2F%2F, %5C, double-encoding) are decoded before checking. Anything else,
// including empty or malformed input, becomes '/'.

const ORIGIN = 'https://studio.invalid';
const MAX_LEN = 2048;
// control chars (U+0000–U+001F, U+007F) and the backslash
const BAD_CHARS = /[\u0000-\u001f\u007f\\]/;

function looksSafe(s) {
  return s.startsWith('/') && !s.startsWith('//') && !BAD_CHARS.test(s);
}

export function safeNextPath(next) {
  if (typeof next !== 'string' || !next || next.length > MAX_LEN) return '/';
  if (!looksSafe(next)) return '/';
  // see through up to 3 layers of percent-encoding
  let probe = next;
  for (let i = 0; i < 3; i++) {
    let decoded;
    try {
      decoded = decodeURIComponent(probe);
    } catch {
      return '/';
    }
    if (decoded === probe) break;
    if (!looksSafe(decoded)) return '/';
    probe = decoded;
  }
  // final word: the browser's own parser must keep it on our origin
  try {
    if (new URL(next, ORIGIN).origin !== ORIGIN) return '/';
  } catch {
    return '/';
  }
  return next;
}

// Pages that render WITHOUT the app frame (no shell data, no session guard):
// the login screen, the public /proof page and the DFY /client workspace.
const BARE_PATHS = new Set(['/login', '/proof', '/client']);

export function isBarePath(pathname) {
  return typeof pathname === 'string' && BARE_PATHS.has(pathname);
}

// T1-10: where a device with a revoked/expired session goes — back to the
// login screen, remembering the page (only if safe), with the known
// `signed_out` code so the login page can say why.
export function signedOutLoginUrl(currentPath) {
  const next = safeNextPath(currentPath);
  const q = new URLSearchParams();
  if (next !== '/') q.set('next', next);
  q.set('error', 'signed_out');
  return `/login?${q}`;
}
