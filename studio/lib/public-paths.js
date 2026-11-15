// Paths the proxy lets through without a session. Kept in one dependency-free
// module so the list is testable on its own (tests/thumbs-auth.test.mjs).
//
// Among /api/thumbs/* only `demo` is public: it renders fixed sample text for
// the template-picker cards — no server-side fetch, no channel data. Every
// other thumbs route needs a session (audit 2026-11-13 #1: e9ef6d2 had opened
// preview/videos/templates/registry/photos to the internet).
export function isPublicPath(pathname) {
  return (
    pathname === '/login' ||
    pathname === '/api/login' ||
    pathname === '/api/logout' ||
    pathname === '/api/oauth/callback' || // self-authenticating (signed link / session)
    pathname.startsWith('/api/auth/google/') ||
    pathname === '/api/thumbs/demo' ||
    pathname.startsWith('/api/template-previews/') ||
    pathname.startsWith('/api/templates/preview') ||
    pathname === '/proof' || // public sales page (stats only, no revenue data)
    pathname === '/api/proof' ||
    pathname === '/client' // DFY client workspace (page gate itself; APIs still auth)
  );
}
