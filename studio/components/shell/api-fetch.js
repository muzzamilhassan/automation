'use client';
// P4/S6 (#106, review round 1 / AC-P4-29) — the ONE fetch wrapper Studio pages
// should use for data calls. A 401 means the Neon session row behind the
// cookie was revoked (owner kick or sign-out-everywhere) or expired — that is
// INSTANT (userByToken checks the row on every request) — so the device goes
// straight to /login instead of sitting on a shell whose every fetch fails.
// Opt-in: /client and /settings keep their bespoke 401 flows and must not be
// retrofitted (no double-fire). Guarded against redirect loops and re-fires.
let redirecting = false;

export default function apiFetch(input, init) {
  return fetch(input, init).then((r) => {
    if (r.status === 401 && !redirecting && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      redirecting = true;
      window.location.href = '/login';
    }
    return r;
  });
}
