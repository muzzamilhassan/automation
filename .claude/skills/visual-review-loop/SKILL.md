---
name: visual-review-loop
description: The keystone UI verification loop — screenshot the real running app with Playwright at 1440/768/375 widths (plus RTL and both themes when supported), actually LOOK at the screenshots, list concrete differences against the brief/design, fix them, and re-shoot until intentional. Use after building ANY page, component, or screen — before UI work can be called done — and inside qa-run visual rows.
license: MIT
metadata:
  source: fullstack-agent-os (authored; loop pattern from Claude Code best practices + anthropics/webapp-testing)
  category: frontend
---

# Visual Review Loop — the agent looks at its own UI

You cannot verify UI by reading the code you just wrote. You verify it by looking at it. This loop is MANDATORY before any UI work is called done — zero loops = unfinished feature.

## The loop

1. **Run the app.** Start the dev server (background task if your tool supports it). If you cannot start it, that is finding #1 — no imaginary verification.
2. **Shoot.** Run the script shipped with this skill (same folder, `scripts/shoot.mjs`):
   ```
   node scripts/shoot.mjs http://localhost:3000/some-page shots/<surface>
   ```
   Captures full-page screenshots at 1440 / 768 / 375 into the output folder. Requires `playwright` in the project (`npm i -D playwright && npx playwright install chromium` — one time). Add `--rtl` for mirrored captures; point at a themed build for dark mode.
3. **LOOK.** Read the image files (every agent can read images — "a picture is worth 1000 tokens"). All three widths. What you are hunting:
   - layout breakage: overflow, clipping, overlap, collapsed columns
   - the AI-tells (`premium-frontend` blacklist)
   - hierarchy: can you tell in 3 seconds what this surface wants?
   - states: does loading/empty/error exist and look right (`app-states`)?
   - detail: alignment off-grid, cramped targets, contrast failures, clipped Arabic diacritics
4. **List diffs BEFORE fixing.** Concrete and located: "at 375, the sidebar overlaps the table header" — not "mobile looks off". Compare against the brief/spec/design and the blacklist.
5. **Fix** (code) → **re-shoot** → re-look. Repeat until every listed diff is gone and nothing new appeared.
6. **Save the final set** under `qa/screenshots/<surface>/` as evidence for the QA file's visual rows.

## Rules

- Screenshots come from the REAL running app — never from imagination, never from "the CSS looks correct".
- One full loop minimum per UI feature; more for complex surfaces (dashboard, forms, RTL).
- When the host supports fresh-context agents: hand the screenshots + brief to the `design-critic` agent after step 5 and process its findings the same way.
- Console errors count: capture them while shooting (the script surfaces page errors) — a visual pass with a red console is not a pass.

## What "done" means

Every diff list emptied across widths (+RTL/themes when supported), evidence saved, console clean. Then — and only then — the surface ships.
