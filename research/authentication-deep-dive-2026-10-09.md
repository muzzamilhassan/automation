# Research — The Authentication System: Best Scalable Way (Deep Dive)

**Date:** 2026-10-09 · **Type:** READ-ONLY research + design (plan awaits "go")
**Ask:** "How will we move on the authentication system — deep dive, best scalable way."

---

## 1. What we have today (built Oct 8, all working)

- Google sign-in (basic profile, our own OAuth code) + owner password backup
- Invite list (`access.json` → now also seeded in Neon `users` table) with roles: owner / staff / client
- Session = **HMAC-signed stateless cookie**, 30 days — the server can't revoke it
- Route→role matrix in the proxy + server-side re-checks, audit trail in Neon
- Login throttle: per-server-instance only (a known weak spot)

**The honest gaps:** (1) a stolen cookie stays valid up to 30 days — no revocation, no session list; (2) the throttle isn't shared across servers; (3) the session HMAC key and the channel-key encryption key both derive from `STUDIO_PASSWORD` (key hygiene); (4) no 2FA.

## 2. What the industry considers best practice (2026)

The consensus moved to a **hybrid**: short-lived access sessions + **opaque, DB-backed refresh tokens** — because opaque DB sessions give **instant revocation** (delete the row = user out everywhere), which pure stateless cookies can never do. For an admin dashboard with customer data (ours), instant revocation is the safer default, not a luxury.
Sources: [Deepak Gupta — JWT vs Opaque Tokens 2026](https://guptadeepak.com/jwt-vs-opaque-tokens-api-authentication-2026) · [Nordic APIs](https://nordicapis.com/jwt-vs-opaque-tokens-choosing-the-right-token-for-api-security) · [dev.to — sessions vs JWT 2026](https://dev.to/sietrixtechnologies/authentication-systems-explained-jwt-vs-sessions-what-you-should-actually-use-in-2026-imk)

## 3. The four doors, scored for us

| Door | Free tier | Maintenance | Fits our stack | Verdict |
|---|---|---|---|---|
| **Better Auth on our Neon DB** | open-source, $0 | low-medium (library maintained for us) | ✅✅ same database, Google social login built-in, sessions with **instant revocation**, roles/admin plugin, actively developed (the successor to Auth.js) | ⭐ **The pick** |
| **Neon Managed Better Auth** (new 2026) | included in Neon | ✅ Neon runs it for you | ✅✅ same DB — but the service is brand-new; maturity risk | Good A2+ option once proven |
| **Clerk** | free to ~50k users | ✅ none (hosted) | ⚠️ user data locked in Clerk's US DB; another vendor; our roles/ownership still live in Neon | Only if we want turnkey polish at scale |
| **Supabase Auth** | free ~50k users | low | ⚠️ pairs with the Supabase stack — we chose Neon; using only their auth = second vendor for one feature | Skip |

Sources: [Neon — Managed Better Auth](https://neon.com/docs/auth/overview) · [Better Auth — database + Postgres adapter](https://better-auth.com/docs/concepts/database) · [Better Auth — session management](https://better-auth.com/docs/concepts/session-management) · [Turbostarter — auth comparison May 2026](https://www.turbostarter.dev) · 2026 session-hybrid sources above.

## 4. The recommendation — two steps, both low-risk

### Step A1 — Session hardening on what we have (~1 session, $0)
Even before any library: fix the weak spots with a `sessions` table in our existing Neon DB.
- Login (Google or password) creates a row: random opaque token (only its SHA-256 hash stored), email, role, created, last-used, revoked, device
- Cookie holds the opaque token; every request does one indexed DB lookup → **instant revocation, "sign out everywhere", active-device list in Settings**
- Login throttle moves to a DB table → shared across all servers (fixes the per-instance weakness)
- Encryption key for channel keys moves to a dedicated `QUARRY_ENCRYPTION_KEY` (no longer tied to the login password)
- Roles stay exactly as they are (owner/staff/client + ownership)

### Step A2 — Adopt Better Auth on Neon (when we want less self-maintenance)
Replace the hand-rolled session code with **Better Auth** (self-hosted in our Next app, Google social provider, Postgres/Neon adapter, admin plugin for roles, built-in rate limiting/session controls). Our route matrix, ownership model, and audit trail stay — only the identity plumbing swaps. Later upgrade path: flip to **Neon Managed Better Auth** when it matures. 2FA comes free via plugins when customers ask.

## 5. Why not jump straight to Clerk/Supabase Auth
- Our needs are narrow: Google login + 3 roles + ownership. We built 80% of it in one session and verified it.
- Vendors add lock-in + per-feature costs at scale and split our data across two homes.
- The migration later is small either way — identities are one table.

## 6. Risks
- Custom = we own security fixes (mitigated by A1's standard patterns + A2's escape hatch)
- Better Auth is young-ish (but is THE actively-developed successor and the 2026 ecosystem standard)
- Neon Managed Better Auth is brand new — watch, don't lead
