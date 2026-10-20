---
name: new-project
description: Run the full greenfield delivery pipeline for a brand-new product, starting from a one-line idea — research, PRD, EARS feature specs, task graph, feature-by-feature build with plain-English QA files, convergence check, and deploy plan. Use when the user says they are starting or building a new project, has a product idea, or asks to plan and build an app/site/product from scratch.
license: MIT
metadata:
  source: fullstack-agent-os (authored)
  category: pipeline
---

# New Project — 8-Phase Delivery Pipeline

Turn one line ("I am building X") into a shipped project, one feature at a time. Every phase writes a file to disk first and reports second — files are the state, so any agent or fresh session can continue.

**Input:** `$ARGUMENTS` = the idea in the user's own words (may be one line or a paragraph).
**Mode:** if the user said "autopilot" (or says it mid-run), approval gates become logged decisions — note them in the phase file under `## Autopilot decisions` and keep going. Everything else is unchanged.

## Global rules (read AGENTS.md first — it applies to every phase)

- **Phase completion & hard stops:** a phase is DONE only when (1) its artifacts are written, (2) its phase report is written — `docs/phase-reports/PHASE-N-done.md`, in plain English: what was done, how it was done, with a concrete example and a mermaid diagram (use the PHASE-REPORT template) — and (3) the gate is presented. Then **STOP and wait for the user**. Never roll into the next phase without the user's explicit go, even if the next step feels obvious. "autopilot" mode replaces stops with logged decisions but phase reports are still written for every phase.
- **Question timeout (every phase):** when a gate or decision asks the user a question, wait about 5 minutes; if there is no response, proceed with the RECOMMENDED option and record it in that phase's report under `## Auto-decided (no response)`.
- **Tech explanations live on chat:** whenever the pipeline introduces or locks a tool, framework, or service, explain ON CHAT in plain English: why it was chosen, its free alternative(s), and why it fits this user. Never create a file for this explanation.
- **Gates:** at every ✋ gate, STOP, present the artifact, and wait for the user. One question at a time when asking for decisions.
- **One feature at a time** in Phase 5. Never start feature N+1 before N passes its QA.
- **Evidence only.** No "done" without output: test results, build output, screenshots.
- **Research discipline:** every claim in RESEARCH.md cites a URL. Mark unverified items `UNVERIFIED`.
- **Plain English.** Every artifact must be readable by a non-programmer.
- **Non-Claude agents:** you may not be able to spawn subagents or use worktrees. Where this file says "spawn", do the work inline instead, in the same order. Skip worktree steps if git worktrees are unavailable. Everything else is identical.

## Phase 0 — Research ✋

Goal: know the market and pick a defensible stack BEFORE writing anything.

1. Create the project folder layout from AGENTS.md (`product/`, `specs/`, `tasks/`, `qa/`, `deploy/`, `docs/`).
2. Fill `templates` knowledge into `product/RESEARCH.md` using the RESEARCH template structure:
   - Competitors: real named products, what they do, pricing, gaps (aim 3–6).
   - Feature analysis: must-haves, differentiators, anti-features (what NOT to build).
   - Tech stack: 2–3 real options with trade-offs, then ONE recommendation with reasons.
   - Risks, open questions, numbered sources.
3. Research method:
   - **If you can spawn subagents:** launch 3 researchers in parallel — (a) competitors, (b) feature patterns incl. adjacent domains, (c) tech-stack comparison. Give each the idea text + researcher discipline (primary sources, URLs for every claim). Merge their outputs; remove duplicates.
   - **Otherwise:** run 3–4 WebSearch rounds yourself in the same order.
4. ✋ Gate: present a one-page summary (top competitors, top 3 risks, recommended stack). Ask: approve stack + scope direction?

## Phase 1 — Standards ✋

Goal: this project's rules, so every later session behaves identically.

1. Ask the user only what research could not answer (hosting preference, language, framework pick if genuinely open).
2. Write `product/STANDARDS.md`: language + framework + versions; project structure; error-handling pattern; testing pattern (runner, what needs a test); naming; git conventions (branch names, commit style); "never do" list.
3. Write the project root `AGENTS.md` for the codebase: short — points to `product/STANDARDS.md`, lists the document layout, and carries the same non-negotiables (verify before done, one feature at a time, EARS before code).
4. ✋ Gate: present STANDARDS.md summary.

## Phase 2 — PRD ✋

Goal: the end state in plain English (the PRD describes WHAT the product is, not how you build it).

1. Use the `to-prd` approach on the idea + RESEARCH.md.
2. Write `product/PRD.md`: mission (1–2 sentences), users/personas, in-scope / out-of-scope (be strict), feature table with IDs (`F-01`…) and priorities (P0 = launch-blocking, P1 = fast-follow, P2 = later), success metrics, risks.
3. ✋ Gate: user approves the feature list and priorities. Expect changes — this is the cheapest moment to change direction.

## Phase 3 — Feature specs ✋

Goal: every feature gets plain-English acceptance criteria BEFORE any code.

1. Order features by dependency (data model first, then core flows, then UI polish).
2. For each feature, write `specs/<id>-<slug>.md` (e.g. `specs/F-01-user-accounts.md`) using the FEATURE-SPEC structure:
   - User story (As a…, I want…, so that…)
   - Plain-English description of the end state
   - Acceptance criteria in **EARS** form — at minimum: one WHEN happy path per major behavior, IF error paths, WHILE state rules, and CONTINUE TO pins for any behavior that already exists
   - Out of scope (what this feature deliberately does NOT do)
3. Clarify pass: re-read all specs together; fix contradictions, gaps (any user journey with no criterion), and vague words ("fast", "user-friendly" — replace with measurable behavior). Ask the user the resulting A/B questions in one batch.
4. ✋ Gate: user approves all specs. Each spec is a contract — Phase 5 review will check code against it.

## Phase 4 — Task graph (auto)

1. Write `tasks/TASKS.md`: per feature, bite-sized tasks (2–5 minutes of agent work each) with exact file paths, dependency order, and status checkboxes.
2. Mark which features are independent (potential parallel waves) — but default to sequential; the user opts into waves explicitly.
3. Create `docs/FEATURES.md` (FEATURES-INDEX template): EVERY feature from the PRD listed with status (🔜/📋), plain-English one-liner, and links to its guide + manual-QA IDs — so the user can always see what exists and what's next. Start `qa/QA-REPORT.md` with the Setup + Regression sections. Both files are then updated automatically by `build-feature` (Step 7) after every feature.
4. Scaffold tasks (M0) must follow the **`project-scaffold` skill**: standard folder structure + naming + quality toolchain (ESLint, Prettier, jscpd, husky) installed from day one — bad code, style drift, and duplicates are caught at commit/build time, with auto-fix.
5. No gate — the task file is an input to Phase 5, reviewed alongside each feature.

## Phase 5 — Build loop ✋ per feature

For each feature in dependency order, **one at a time**:

1. Run the **`build-feature`** skill for `<id>-<slug>` (it handles: plan → worktree → QA file → TDD implement → two-axis review → execute QA with evidence).
2. After each feature: report criteria passed/failed, files touched, test evidence. ✋ Gate: user signs off (or says "autopilot" to continue through remaining features, logging sign-offs).
3. If QA found bugs: fix inside the same feature run — never carry a failing feature forward.
4. New ideas discovered mid-build: do NOT build them. Add a note to `tasks/TASKS.md` backlog section and continue.

## Phase 6 — Convergence (auto, loop until clean)

Run the **`converge-check`** skill: fresh full-suite run, per-feature traceability (`spec-traceability`), every gap appended to `tasks/TASKS.md` and executed, table rebuilt — repeat until **Converged**. Report the final table from `qa/CONVERGENCE.md`.

## Phase 7 — Deploy plan ✋

Run the **`deploy-planner`** skill: it produces `deploy/DEPLOY.md` — one-time setup, manual zero-to-running steps, the agent automated-deploy policy (allow/deny list), post-deploy verification, rehearsed rollback, and the per-release checklist.
✋ Gate: walk the user through their first deploy (manual path) or run the automated path if they approved it.

## Phase 8 — Retrospective (auto)

Write `docs/retro.md`: what the pipeline got right, what to improve, standards changes discovered the hard way. Feed the next project.

## Completing

Final report: what was built (features × criteria passed), where everything lives, how to run it, how to deploy it, and the backlog of P1/P2 ideas captured along the way.
