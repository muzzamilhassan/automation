# QA — Wizard LLM-backed brand-kit autofill (#113, flavor B)

*Built 2026-11-17. Plain-English QA. Every row was executed for real before the issue was closed — the evidence column says what actually happened.*

## The rule for this feature

"Auto-fill brand kit from niche" now asks an AI (Groq, owner's key as a server-side secret) to draft the kit's identity and SEO fields. Every drafted field shows up as a reviewable suggestion with its own Apply button — **nothing touches the form until you press Apply**. If the AI is unavailable or fails, the old template generator fills the form exactly as before and the page says which path produced the draft. Every AI attempt is written to the audit log.

## QA rows

| # | What to do | What should happen | Evidence / result |
|---|---|---|---|
| 1 | Run the new pin-tests | Prompt shape, clamping, list caps, dedupe, allow-lists, garbage refusal all pass | PASS — `node --test tests/wizard-llm-kit.test.mjs` → **6/6 pass** |
| 2 | Regression: all wizard suites stay green | llm-kit (6) + audience (5) + voice (5) + niche-styles (8) + template-previews (8) + registry (69) | PASS — combined run → **101/101 pass, 0 fail** |
| 3 | Lint the changed files | ESLint clean on page.js, kit route, llm-kit lib | PASS — `pnpm exec eslint app/channels/add/page.js app/api/channels/kit/route.js lib/llm-kit.js` → **exit 0** |
| 4 | Provider picked by owner; key is a secret | Groq chosen by the owner (gsk_… key). Key exists ONLY as a Vercel production env var — never in the repo, never in a commit | PASS — `vercel env add GROQ_API_KEY production` exit 0; `git grep gsk_` in staged tree finds nothing |
| 5 | Real AI call through the shipping code path | llmKitDraft returns a validated draft from Groq | PASS — live run for niche "stoic discipline": 2.5s, eyebrow "STOIC DISCIPLINE FOR MODERN LIVES", 10 tags, voice am_michael + style doc (both allow-listed), description clamped ≤900 |
| 6 | Per-call cost is capped | max_tokens fixed in the provider lib (900 — gpt-oss reasoning tokens included), never model-chosen | PASS — LLM_MAX_TOKENS = 900 in studio/lib/llm-kit.js; smoke run used 624 total tokens |
| 7 | AI drafts NEVER fill the form silently | Response with source 'llm' opens a review panel; each field has its own Apply button; "Apply all" and "Discard" are explicit clicks | PASS — autoFillKit branches on d.source === 'llm' → setKitDraft only; applyDraftField writes to the form only inside onClick |
| 8 | Every field is reviewable with its current value visible | Panel lists eyebrow, tagline, description, tags, sub-niches (+ voice/style suggestions when the model provides valid ones) | PASS — panel rows render from kitDraft.kit / kitDraft.suggestion; invalid voice/style ids are dropped server-side (pin-tested) |
| 9 | Applied rows show state and can't re-apply | Row flips to "Applied ✓" after its Apply click | PASS — kitDraft.applied[key] gates the button |
| 10 | AI unavailable → fallback to templates, stated | No key / AI failure → deterministic template fill as before + amber note naming the fallback and reason | PASS — route returns source 'template' + note; page shows "AI unavailable (…) — drafted by the template generator." |
| 11 | Template fallback fills exactly like before | Same five form fields, same shapes as the pre-#113 behavior | PASS — the template branch of autoFillKit is the original setForm block, unchanged |
| 12 | AI attempts are audited | appendAudit rows: ok / failed / skipped with niche, actor = signed-in owner email | PASS — kit route calls appendAudit('kit-llm-draft', …) on all three outcomes, following the existing lib/audit.js pattern |
| 13 | Applied drafts save through the existing kit path | Apply writes the same form fields the save button posts; saveProfile() untouched | PASS — save payload built from form.* as before (#113 changed nothing in saveProfile) |
| 14 | Starting a new channel clears stale drafts | The wizard reset clears kitDraft + kitNote + kitMood | PASS — reset handler calls all three setters |
| 15 | Drafts honor sane caps | eyebrow ≤60, tagline ≤80, description ≤900, tags ≤12, sub-niches ≤6 — enforced server-side regardless of what the model returns | PASS — pin-tests clamp 200/2000-char inputs and 30-item lists down to the caps |
| 16 | Production build + deploy with the key present | Vercel build green; env var bound to the deployment | PASS — env added BEFORE the deploy; deployment READY/production (see issue close comment for the URL) |

## Files in this change

- [studio/lib/llm-kit.js](../../studio/lib/llm-kit.js) — new: Groq provider seam (prompt builder + strict parser + injectable fetch), allow-lists from the same data the wizard renders
- [studio/app/api/channels/kit/route.js](../../app/api/channels/kit/route.js) — AI attempt → deterministic fallback, `source` in the response, audit rows
- [studio/app/channels/add/page.js](../../app/channels/add/page.js) — review panel with per-field Apply / Apply all / Discard, fallback note, reset clearing
- [tests/wizard-llm-kit.test.mjs](../../tests/wizard-llm-kit.test.mjs) — new pin-tests (6)
- QA file: this one

## Known limits (honest)

- gpt-oss spends some of the token cap on internal reasoning; with max_tokens 900 the JSON always completed in testing, but a pathological reply could truncate — it fails the strict parse and falls back to templates (by design).
- The AI drafts identity/SEO fields only; script rules, keyword, theme, and music mood still come from the deterministic generator (they're structural, not creative).
- Sub-niches occasionally come back empty from the model — the merge then keeps the curated NICHE_MAP pillars, and the review panel shows them anyway.
- The owner's key was pasted into a chat; if that conversation ever leaves this machine, rotate the key at console.groq.com and `vercel env rm/rm-add GROQ_API_KEY`.
