// Route → role matrix for the proxy (first match wins; an unlisted path is open
// to any signed-in role → null). Moved out of proxy.js so it is testable
// (tests/route-roles.test.mjs). Mutating routes still re-check roles
// server-side (lib/route-auth.js) — this is the front door, not the only lock.
//
// Admin-panel review 2026-11-15 #7: /api/channels/schedule and
// /api/channels/clip-queue are owner+staff (their routes allow staff); the
// owner-only channel rule used to swallow them.
const OWNER = ['owner'];
const OWNER_STAFF = ['owner', 'staff'];
const ALL = ['owner', 'staff', 'client'];

const STAFF_CHANNEL_ROUTES = new Set(['/api/channels/schedule', '/api/channels/clip-queue']);
const CLIENT_CHANNEL_ROUTES = new Set(['/api/channels/flow', '/api/channels/keys']);

const RULES = [
  // owner + staff channel controls (checked before the owner-only channel rule)
  { match: (p) => STAFF_CHANNEL_ROUTES.has(p), roles: OWNER_STAFF },
  // owner only — settings, wizard/channel management, connect-link minting, team,
  // sessions admin (#106: the page only — /api/sessions stays self-service and
  // re-checks owner mode server-side)
  { match: (p) => p === '/settings' || p === '/users' || p === '/sessions' || p.startsWith('/api/users') || p.startsWith('/api/team') || p === '/api/oauth/start' || (p.startsWith('/api/channels/') && !CLIENT_CHANNEL_ROUTES.has(p)), roles: OWNER },
  // owner + staff — the engine room (clients live on Topics/Analytics/Channels).
  // #106 T5: /review (the approval desk) and /warnings (the durable alert
  // record) join it — fail-closed approvals stay owner-only at the ROUTE
  // (staff read + prepare here; the routes re-check every mutation).
  { match: (p) => p === '/production' || p === '/api/action' || p === '/music' || p === '/social' || p.startsWith('/api/audit') || p === '/review' || p === '/warnings' || p.startsWith('/api/review') || p.startsWith('/api/warnings'), roles: OWNER_STAFF },
  { match: (p) => p === '/create' || p.startsWith('/api/create-video'), roles: OWNER_STAFF },
  { match: (p) => p === '/thumbs' || p.startsWith('/api/thumbs/'), roles: ALL },
  // clients join the Topic Desk for their own channels (server checks ownership)
  { match: (p) => p === '/topics' || p.startsWith('/api/topics') || CLIENT_CHANNEL_ROUTES.has(p), roles: ALL },
];

export function allowedRoles(pathname) {
  const rule = RULES.find((r) => r.match(pathname));
  return rule ? [...rule.roles] : null;
}
