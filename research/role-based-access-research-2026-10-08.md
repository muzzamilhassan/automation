# Research — Role-Based Access for Quarry Studio (Who Can Do What)

**Date:** 2026-10-08 · **Type:** READ-ONLY research + design (plan awaits "go")
**Ask:** "Role based — deep research, how we can go with it, and how we can improve our system."

---

## 1. The problem today (honest)

The entire dashboard is protected by **one shared password** (`STUDIO_PASSWORD`). Whoever has it:
- sees ALL channels and analytics,
- can press every production button,
- can open the wizard and connect channels,
- can read the OAuth connect links.

There are no user identities at all — the cookie is just a hash of the one password. That blocks three things: hiring an assistant (they'd own everything), selling to customers (they'd see your other channels), and auditing (no idea WHO pressed a run button).

## 2. The roles this system actually needs

| Role | Sees / does | Blocked from |
|---|---|---|
| **owner** (you) | everything (today's powers) | nothing |
| **staff** (a future VA/editor) | Overview, Channels (read), Production run buttons, Topic Desk, Videos, Logs, Analytics | Settings, secrets, channel connect keys, billing |
| **client** (product customers) | ONLY their own channels: their Topics (approve), their Analytics, their Videos, their channel setup | every other channel, engine internals, run buttons, settings, other users |

**Best-practice rule from research (Next.js official + WorkOS 2026):** enforcement must live in **middleware (first gate) AND again server-side in every API route** — never only in hidden UI. Centralize the route→role matrix in one file.

## 3. Auth options for our stack (Next 16.3.4 + React 19 on Vercel, no database today)

| Option | Free tier | Fits us now? | Notes |
|---|---|---|---|
| **Google login + email allowlist (build small, no vendor)** | $0 forever | ✅ **Recommended now** | "Sign in with Google" (basic profile only — non-sensitive scopes, works on our unverified app, warning screen only). Roles from one committed file `access.json` (email → role). Signed session cookie (HMAC — the pattern already exists in `lib/auth-token.js`). Zero new infrastructure. |
| **Clerk** | free to 50k users (2026) | Later / optional | Polished pre-built login; hosted; your user data lives in Clerk's US DB; another vendor to attach. |
| **Supabase Auth + Postgres** | ~50k users free | **Phase R2** (multi-tenant scale) | The blueprint's Phase-3 foundation: real DB for users + workspaces + channel ownership. Right step when real customers exist, not before. |
| **Auth.js (NextAuth)** | free self-host | Skip | No longer actively developed; successor is Better Auth. If we ever want OSS auth lib, Better Auth is the pick — but our Option A needs no library at all. |

Sources: [Turbostarter — Better Auth vs Clerk vs NextAuth vs Supabase (May 2026)](https://www.turbostarter.dev) · [Whipp — Clerk vs Supabase vs Auth.js](https://whipp.studio) · [Designkey — SaaS auth 2026 pricing](https://www.designkey.studio) · [Next.js official auth guide (Sep 2026)](https://nextjs.org) · [WorkOS — auth in App Router (Feb 2026)](https://workos.com) · [Clerk RBAC tutorial](https://clerk.com)

## 4. Design — Option A detailed (recommended Phase R1)

**Login:** the current password box is replaced (or joined) by **"Sign in with Google"**. Google returns only email + name (basic profile scopes — no verification needed, warning screen at worst). Server checks the email against `access.json`:
- email known → session cookie issued: signed HMAC token containing `{email, role, expiry}` (30 days),
- email unknown → "This email is not invited."

**Files touched:**
- NEW `studio/lib/access.json` — `[{ "email": "you@gmail.com", "role": "owner" }, { "email": "va@gmail.com", "role": "staff" }]` (committed; edit = add a teammate).
- `lib/auth-token.js` — session sign/verify helpers (HMAC pattern exists).
- `proxy.js` — route→role matrix (centralized): e.g. `/settings`, `/api/channels/*`, `/api/oauth/*` = owner; `/production`, `/api/action` = owner+staff; `/topics`, `/api/topics` = owner+staff (+client filtered); `/analytics`, `/videos`, `/logs` = all signed-in (client sees own channels only).
- `lib/route-auth.js` — becomes `requireRole(req, ['owner','staff'])` (server-side re-check in every mutating route, per the double-check rule).
- `app/login` — Google sign-in button (+ keep the password as owner backup).
- Keep `STUDIO_PASSWORD` **as the encryption key for tokenEnc** forever (renaming would orphan encrypted tokens — or migrate to a dedicated `QUARRY_ENCRYPTION_KEY` with a one-time re-encrypt; only 1 entry exists today, trivial).

**Hardening bonus (fixes a real hole):** today there is **no limit on password guesses**. The new login adds attempt throttling (e.g., 5 tries → 10-minute lock per IP).

**Client ownership (Phase R1b, when the first real customer arrives):** registry entries gain `ownerEmail`; every data route filters by it — a client literally cannot fetch another channel's data because the server only returns their slugs. This is the true first step of multi-tenancy from the blueprint, without a database yet.

**Audit trail (system improvement):** the Logs page gains an "actor" column (email of whoever pressed a run button / approved a topic) — trivial once identity exists.

## 5. Phases

- **R1a — owner + staff roles, Google login, role matrix, throttling** (~1 session). You get named logins; a VA can be added by adding one line to access.json.
- **R1b — client role + channel ownership filter** (~1 session, when the first pilot customer is real). Customers see only their own empire.
- **R2 — Supabase Auth + Postgres** (multi-tenant at scale, per blueprint) — replaces allowlist with a real DB when the product has real customers. Skip until then.

## 6. Risks / notes
- Google warning screen on customer login ("unverified app") — cosmetic, clickable; disappears after the verification ladder (already planned for uploads).
- access.json in the repo = committed. Emails are not secrets; roles are not secrets. Fine.
- tokenEnc encryption key coupling — handled above (keep STUDIO_PASSWORD as key or migrate once).
- The engine (GitHub side) stays solo-owner — roles are a dashboard concern only.
