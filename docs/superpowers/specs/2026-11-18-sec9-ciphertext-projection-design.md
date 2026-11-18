# SEC-9 design — stop shipping ciphertext to the browser

*2026-11-18 · Design only — no code written yet. Owner approval required before the issue is created.*

## The problem, in plain words

Two panel routes return full registry rows — including `tokenEnc`, the **encrypted YouTube login token** — to the browser, even though no page ever displays or uses it:

- `/api/channels/registry` GET (owner-only) → every channel's full row, ciphertext included.
- `/api/channels/profile` GET → the full entry, ciphertext included. This one is open to **clients**, and has **no per-slug ownership check** — a client can ask for any slug, so today any client can pull *any channel's* tokenEnc.
- `/api/channels/profile` POST → echoes the saved entry back, ciphertext included (owner-only).

Encrypted ≠ safe to hand out. One XSS in a logged-in session = all channels' ciphertext in one request. The audit's verdict: the browser should never receive token material at all; the server is the only place that ever decrypts.

## The fix

### 1. One shared projection helper (in `studio/lib/channels-registry.js`)

```js
export function stripTokenMaterial(entry) // shallow copy minus tokenEnc + tokenEncError, input never mutated
```

**Strip-list, not whitelist** (deliberate deviation from the providers route's style): the registry/profile screens consume *many* fields (`kit`, `destinations`, `slots`, `docDay`, `tokenSecret`, `tokenSecretSaved`, …), and a whitelist would break the wizard the day a new field is added and missed. Removing exactly the two fields that carry token material achieves the audit's goal — **ciphertext never leaves the server** — with zero UI risk.

Deliberately **kept**: `tokenSecret` (the *name* of the GitHub secret — not a secret value; the wizard's repair instructions display it) and `tokenSecretSaved` (the boolean the "key saved / secret missing" chip reads). `tokenEncError` is stripped too — it's internal error detail with no UI consumer.

### 2. Three one-line wirings

| Route | Change |
|---|---|
| `registry` GET | `channels: (reg.channels \|\| []).map(stripTokenMaterial)` |
| `profile` GET | `channel: stripTokenMaterial(entry)` |
| `profile` POST | `entry: stripTokenMaterial(entry)` |

### 3. Rider: close the client slug hole on `profile` GET (small, same issue)

While wiring the projection it became visible that `profile` GET lets a client read **any** slug's profile (brand config — not secret, but not theirs). Mirror the thumbs/videos pattern: client + not-owner-of-slug → 403. Owner/staff unchanged. (POST is already owner-only.)

## EARS acceptance criteria

- **R1**: `stripTokenMaterial` SHALL remove `tokenEnc` and `tokenEncError`, change no other field, and not mutate its input.
- **R2**: registry GET SHALL return every channel through the projection.
- **R3**: profile GET SHALL return the projected entry.
- **R4**: profile POST SHALL return the projected entry.
- **R5**: `tokenSecret` (name) and `tokenSecretSaved` (boolean) SHALL survive the projection (the wizard's repair flow and status chip keep working, with zero UI changes).
- **R6**: WHEN a client requests a slug they don't own, profile GET SHALL answer 403 (owner/staff unchanged).
- **R7**: no route in `studio/app/api` SHALL place `tokenEnc` in a response body (source scans pin the three wirings and the old verbatim shapes are asserted gone).
- **R8**: full test suite stays green (modulo the known pre-existing T4b).

## Test plan

`tests/sec9-ciphertext-projection.test.mjs`: behavioral tests for the helper (strips exactly those two fields, keeps `tokenSecret`/`tokenSecretSaved`, doesn't mutate input) + source scans per route (projection present at all three response sites, old verbatim shapes gone, client ownership check present). Full regression after.

## Out of scope

- Moving ciphertext out of git (day-19 rotation covers it; #120 already stripped repo-write paths).
- Any UI change — none is needed.

## Risks

- A page secretly reads `tokenEnc` → grep across all pages found zero uses; if one ever did, it would break visibly and shouldn't have had it anyway.
- The rider tightens client access → clients only ever see their own channel's profile, same rule as every other client-facing route.
