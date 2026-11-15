# Spec + QA — brand-resolve: no invented defaults over legacy kits (2026-11-15)

Source: research/deep-audit-2026-11-13.md, improvement #5 (content-growth-02
= scale-config-01). `registryToKit` fabricated `voice 'am_michael'`,
`slots ['22:35']`, a generic `script`, `bg`/`ink`, `musicFeels`, `cpmTier`
and empty `description`/`tagline`; `resolveBrand` spread the registry entry
over the legacy kit, so every invented value won. All four live channels
spoke with one voice at one slot — a templated-sameness signal under the
YPP "inauthentic content" policy, and a silent override of the owner's
hand-made kits. Same rule as #101 / P5-T6 C1 (the accent clobber):
registryToKit never fabricates; defaults belong to genuinely new channels.

## Decisions

- Registry `kit.slots` counts as a declared slot (the Studio writes slots
  under `kit`); top-level `slots` still wins over it.
- Niche-derived text (eyebrow, keyword, kwShort, theme, authority) is NOT
  changed here — `tests/brand-resolve.test.mjs` pins the niche-derived
  authority deliberately (#101). Flagged to the owner as a separate call.

## Requirements (EARS)

- R1: `registryToKit` SHALL return `undefined` for voice, slots, script,
  bg, ink, musicFeels, musicPool, description, tagline, hashtags, cpmTier
  and shortsSource unless the registry row declares them.
- R2: WHEN a legacy kit exists, THE MERGE SHALL never let an undeclared
  registry field replace a legacy value (undefined values are stripped
  before the spread).
- R3: WHEN no legacy kit exists, THE MERGE SHALL fill every engine field from
  `REGISTRY_DEFAULTS` (am_michael, ['22:35'], generic script, #38BDF8, ...),
  with declared values still winning.
- R4: money-rulebook (pilot) SHALL resolve voice `bm_daniel`, slots
  `['00:05']`.
- R5: The four live channels SHALL NOT collapse onto one voice.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | bare row → every listed field undefined | automated | `node --test tests/brand-resolve.test.mjs` |
| 2 | R1 | `kit.slots` honoured; top-level `slots` wins | automated | same |
| 3 | R2 | `mergeBrand(legacy, bare)` keeps legacy voice/slots/bg/tagline | automated | same |
| 4 | R2 | live mirror: each of the 4 channels resolves legacy values for every undeclared field | automated | same |
| 5 | R3 | `mergeBrand(null, …)` yields full defaults; declared values beat them | automated | same |
| 6 | R4/R5 | MR = bm_daniel @ 00:05; 4 channels → >1 distinct voice | automated | same |
| 7 | — | consumers tolerate undefined script/description/musicPool (QuoteQuarry's legacy kit has none by design: `brand.script \|\| null`) | automated | code read + full suite |
| 8 | R4 | next money-rulebook upload is narrated by bm_daniel and scheduled for 00:05 | manual | autopilot run log + YouTube Studio |

## Before → after (resolved, live mirror)

- money-rulebook: voice am_michael→bm_daniel, slots 22:35→00:05, own
  bg/ink/musicFeels/tagline/description/script restored
- investors-compass: am_michael→bm_george, 22:35→23:35, kit restored
- debt-free-doctrine: am_michael→am_fenrir, 22:35→21:20 (registry kit.slots), kit restored
- quotequarry: voice unchanged (already registry-declared default), own
  bg/ink/musicFeels/tagline restored; script back to none (its original format)

## Regression

- Full root suite green (1140/1140).
