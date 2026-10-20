---
name: auth-product
description: Build authentication and authorization as product concerns — session/JWT decision, password and reset flows, OAuth linking, permission checks enforced at the data layer, multi-tenant isolation, secrets handling, rate limiting, and the attack tests every ID-bearing endpoint needs. Use when adding login/signup/permissions, wiring OAuth, implementing multi-tenancy, or reviewing any auth-adjacent change.
license: MIT
metadata:
  source: fullstack-agent-os (authored; OWASP-grade practice, security-and-hardening companion)
  category: backend
---

# Auth as a Product — check the door AND the room

Authentication (who are you) and authorization (what may you do) are separate systems that fail separately. Design both, test both.

## Session vs token — decide once, on purpose

| Choose | When |
|--------|------|
| Server sessions + httpOnly Secure cookie (default for web apps) | classic web product; revocation is trivial |
| Short-lived JWT + refresh-token rotation | native/mobile clients, API-to-API, multiple services |

Never tokens in localStorage (XSS reads it). Cookie-based: `httpOnly`, `Secure`, `SameSite` set deliberately. JWT: short expiry, rotation, revocation story (denylist or key rotation) — "stateless JWT" still needs state the day a token must die early.

## Flows that must exist before "auth" is called done

- **Passwords:** argon2/bcrypt (never invent), minimum rules without silly rituals; email verification; password reset = single-use, expiring token, NO user-enumeration signal (same response whether the email exists or not).
- **OAuth:** `state` param (CSRF), account-linking policy (what happens when the email matches an existing account — ask the user, write it in the spec), minimal scopes.
- **Rate limiting** on login/signup/reset (per-account AND per-IP); lockout must not become a denial-of-service on a victim's email.
- **Audit log** for auth events (login, reset, permission change) — you will need it exactly once, and that once is not optional.

## Authorization — at every layer

1. Route/middleware check (the door).
2. **Data-layer scoping** (the room): owner_id/tenant filters in the query or row-level security. A middleware-only check fails the moment one endpoint forgets it — the data layer cannot forget.
3. Multi-tenant: cross-tenant access tests are BLOCKER-severity and exist in the suite from day one (`database-design` RLS/scoping).

## The attack tests (write these as actual tests)

- IDOR: every endpoint taking an ID — access it as a different user/tenant; expect 404-grade denial.
- Privilege escalation: regular user hits admin routes/payloads (`role` in the request body must be ignored).
- Auth bypass: every "obviously protected" endpoint actually is — the forgot-one is always the report/report-export endpoint.
- Reset/link token reuse and expiry.

## Secrets

Never in code or repo (`.env` gitignored, `pre-commit` guard); secret manager or host env in production; rotation story written down (`deploy/DEPLOY.md` §1). See `security-and-hardening` for the wider OWASP pass; `cicd-platforms` for secrets in CI.
