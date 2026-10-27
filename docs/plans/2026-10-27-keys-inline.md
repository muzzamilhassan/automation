# Plan: keys-inline (#103)

Spec: `docs/superpowers/specs/2026-10-27-keys-inline-channels-spec.md` · QA file: `docs/qa/keys-inline-channels-qa.md` (written before code, per build-feature order)

## Tasks (each ≤ a few minutes, one commit each unless noted)

1. **ChannelKeysPanel component** — new `studio/components/ChannelKeysPanel.js`.
   Props: `{ slug }`. Behavior lifted from the retired `/keys` page body:
   provider cards from the registry (GET `/api/channels/keys?slug=`), Save & test
   (POST, live-validate-before-save), remove (DELETE), masked status,
   "get a key" links, last-change meta line, explainer footnotes (moved from the
   page). Fetch on mount — the parent only mounts it when open (AC-3).
2. **Channels page wiring** — `studio/app/channels/page.js`:
   - import panel + `KeyRound`; `keysOpen` state (same pattern as `schedOpen`);
   - key icon button in each active card header (tooltip per AC-1);
   - render `<ChannelKeysPanel slug={c.slug} />` under the card (AC-2);
   - parked tiles become buttons; clicking opens a full-width
     `<ChannelKeysPanel>` for that brand below the parked grid, one at a time (AC-8).
3. **Retire `/keys`** — delete `studio/app/keys/page.js`; add `redirects()`
   (308 → `/channels`) in `studio/next.config.mjs` (AC-9). Mechanism verified
   against the bundled Next.js docs (01-app/02-guides/redirecting.md).
4. **Nav** — `studio/components/shell/nav.js`: remove API Keys item + unused
   `KeyRound` import (AC-10).
5. **Proxy rule** — `studio/proxy.js`: remove the now-dead `/keys` page rule
   (line 59). `/api/channels/keys` rules untouched (AC-12 enforcement lives in
   the API's slug-access check; unchanged).
6. **Fix-message** — `studio/components/TemplateAssignPanel.js` missing-capability
   message points at the channel's inline key panel (AC-11).
7. **Verify** — run existing test suite (`node --test tests/`); vault tests are
   the regression guard (no new unit tests per spec's Testing Decisions).
8. **QA** — code-review (two axes) → qa-run rows with evidence (local dev where
   possible; credential-bound rows stay manual for the owner) → close #103 with
   evidence → deploy `cd studio && vercel --prod` per repo convention.

## Deviations from the default loop (noted up front)

- `premium-frontend`/`visual-review-loop` skipped: this relocates existing,
  already-designed UI into the channels page's established panel pattern — no
  new design surface. Visual evidence comes from qa-run screenshots.
- No RED-GREEN unit loop: no component-test infra in this repo; the spec's
  Testing Decisions fix the seams as (a) existing vault unit tests and
  (b) deployed-Studio QA rows.
- `product/` layout files (PRD/STANDARDS/TASKS/FEATURES) don't exist in this
  repo — tracker is GitHub issues; close-out updates #103, not TASKS.md.
