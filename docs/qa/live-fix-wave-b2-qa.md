# QA — Live fix wave B2 (AI kit draft, voice demo, thumbnails studio)

*Built 2026-11-20 from the live test report (research/live-e2e-test-2026-11-20.md). Plain-English QA. The "Evidence" column is filled by tests run here; the live rows are for the lead to check after deploy.*

## What changed, in one line each

- **P9 / T4-04** — "Draft with AI" asked Groq's reasoning model for JSON with only 900 tokens. Its hidden reasoning used up the budget, the JSON came back cut off, and Groq answered 400. It now sends `reasoning_effort: "low"` and 4000 tokens, says "json" in the prompt, and tries a fallback model once if the model is gone or the JSON is invalid. Failures now show Groq's own error code and message in the server log and the audit note. The key is never shown.
- **T4-06** — The kit draft only fills **empty** fields. Fields you already wrote keep your text. The draft shows next to them with a **Use this** button, and **Apply all** is still there. Using the pillar suggestion **adds** to your pillars, so your own pillars are never dropped.
- **T4-07** — Tags are cleaned in one place: split on commas, trimmed, lowercased, de-duplicated, 1-letter bits dropped, at most 15 tags and 500 characters. The draft and the SEO-tags box (when you leave it) both use it.
- **T4-12** — Playing voice 2 while voice 1 is still loading keeps voice 2's **Stop** button.
- **P14 / T5-01** — The Thumbnails editor no longer starts every channel with Money Rulebook words (RULES / MONEY HABITS / Killing). Chip and eyebrow come from that channel's saved defaults, then its own kit eyebrow, else they stay empty with a hint.
- **T5-14** — Switching channel clears the headline and the other per-channel fields.
- **T5-02** — The Thumbnails page fits a 360–390px phone (one column, the preview row wraps).
- **T5-16** — One headline rule everywhere: **7 words or fewer**.

## EARS rules

| ID | Rule |
|---|---|
| B2-1 | WHEN the kit draft calls Groq, the system SHALL send model `openai/gpt-oss-120b` (or `GROQ_KIT_MODEL` / `GROQ_MODEL`), `reasoning_effort: "low"` for gpt-oss models only, `max_tokens: 4000`, `temperature: 0.7`, `response_format: {type: "json_object"}`, and a message containing the word "json". It SHALL send no other parameters. |
| B2-2 | IF Groq answers 404, or 400 with `model_decommissioned`, `model_not_found` or `json_validate_failed`, THEN the system SHALL retry once with `openai/gpt-oss-20b` (or `GROQ_KIT_FALLBACK_MODEL`). It SHALL NOT retry on 401 or 429. |
| B2-3 | IF Groq answers non-OK, THEN the error SHALL read `groq <status> <code>: <message>`, go to the server log and the audit note (300 chars), and SHALL NOT contain the API key. |
| B2-4 | WHEN a draft arrives, the system SHALL fill only empty form fields. For fields the owner already filled it SHALL keep the owner's text and show the draft with "Use this". |
| B2-5 | Voice and style from a draft SHALL always be suggestions, never applied without a click. |
| B2-6 | WHEN the owner uses the pillar suggestion, the system SHALL merge it with the existing pillars, never drop one. |
| B2-7 | The system SHALL normalise tags (split on commas, trim, lowercase, de-dupe, drop pieces under 2 characters, at most 15 tags and 500 YouTube-counted characters) in ONE helper, used by the kit route, the draft merge and the SEO-tags input. |
| B2-8 | WHEN a newer voice demo starts, a rejected `play()` from an older demo SHALL NOT clear the newer demo's playing state. |
| B2-9 | The Thumbnails editor SHALL NOT start with hard-coded brand text. Chip and eyebrow SHALL come from the selected channel's saved branding, then its own kit eyebrow, else stay empty. |
| B2-10 | WHEN the channel changes, the editor SHALL reset the headline, accent word, chip, eyebrow, photo, preview and variants before loading the new channel. |
| B2-11 | At widths of 360–390px the Thumbnails page SHALL NOT scroll sideways. |
| B2-12 | The headline guidance and the checklist SHALL use the same limit (7 words). |

## QA rows

| # | What to do | What should happen | Evidence |
|---|---|---|---|
| 1 | `node --test tests/kit-llm-request.test.mjs` | Exact Groq request body, error text, fallback rules | PASS — 10/10 |
| 2 | `node --test tests/tag-normalize.test.mjs` | Tag cleaning and limits | PASS — 7/7 |
| 3 | `node --test tests/wave-b2.test.mjs` | Draft merge logic + source pins for wizard, voice and thumbs | PASS — 17/17 |
| 4 | `node --test tests/wizard-llm-kit.test.mjs tests/rate-limit.test.mjs` | Old #113 and rate-limit pins still pass | PASS — 6/6, 17/17 |
| 5 | Live: Add channel → Identity → pick a niche → **Draft with AI** | The draft says **AI draft**, not "Template draft". If it still falls back, the yellow note shows Groq's code and message (send it to the lead). | Lead, after deploy |
| 6 | Live: Settings › Audit, filter `kit-llm-draft` | The newest row is `ok`, or a `failed:` row with `groq 400 <code>: <message>` — never just "groq 400", never a key | Lead, after deploy |
| 7 | Live: Identity → add the pillar "my custom pillar", type a description, then **Draft with AI** | Your pillar and description stay. Empty fields (tags, eyebrow, tagline) fill and say **Filled**. Pillars and Description show **Use this**. | Lead, after deploy |
| 8 | Live: press **Use this** on Content pillars | "my custom pillar" is still there, plus the drafted pillars | Lead, after deploy |
| 9 | Live: niche "Timeless wisdom, self-mastery & human psychology", draft, then open Review | SEO tags count is 12 or fewer, no tag appears twice | Lead, after deploy |
| 10 | Live: type `Money, money, a, quiet luxury` in SEO tags and click away | The box becomes `money, quiet luxury` | Lead, after deploy |
| 11 | Live: Look & sound → play voice 1, then at once play voice 2 | Voice 2 shows the **Stop** square; voice 1 shows Play | Lead, after deploy |
| 12 | Live: /thumbs, pick Quote Quarry | Chip is empty or QQ's own; eyebrow is QQ's kit eyebrow or empty. Never RULES / MONEY HABITS. | Lead, after deploy |
| 13 | Live: /thumbs, switch QQ → a channel with no videos | Headline is empty; preview says "Pick a video and type a headline" | Lead, after deploy |
| 14 | Live: /thumbs and /studio?tab=thumbs at 390px | `document.documentElement.scrollWidth` is 390 | Lead, after deploy |
| 15 | Live: /thumbs headline label and checklist | Both say 7 words | Lead, after deploy |

Never press Attach, A/B start or Bulk redesign on a real channel while testing: they change live YouTube thumbnails.
