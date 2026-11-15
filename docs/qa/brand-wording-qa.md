# Spec + QA — Hand-written brand wording wins (2026-11-15)

Owner decision 2026-11-15 ("yes" to letting hand-written wording win),
following audit #5. `registryToKit` derived `authority` (`<niche> Wisdom`),
`eyebrow`, `keyword`, `kwShort` and `theme` from the registry niche and the
merge let them beat every hand-written kit. Live effect: doc titles are
`"<title> | <authority>"`, so today's investors-compass documentary
(iGZCplBBDtA) was titled "… | Investing psychology & market wisdom Wisdom",
and an October title reads "… | everyday wisdom Wisdom". This supersedes
the d72c495-era test pin that kept the derived authority.

## Requirements (EARS)

- R1: `registryToKit` SHALL return niche-derived wording (authority,
  eyebrow, keyword, kwShort, theme) only when the registry kit declares it.
- R2: WHEN a legacy kit exists, its hand-written authority/keyword/kwShort/
  theme SHALL win over anything derived.
- R3: THE EYEBROW SHALL be the declared one, else the hand-written phrase
  plus the CURRENT channel label (debt-free-doctrine's kit predates its
  rename and says OLD MONEY CODE).
- R4: WHEN no legacy kit exists, mergeBrand SHALL derive the wording from a
  real niche, never producing "… wisdom Wisdom"; a skeleton row keeps the old
  "everyday wisdom" fallback text and no authority.

## Before → after (resolved, live mirror)

| channel | authority | eyebrow | kwShort |
|---|---|---|---|
| money-rulebook | Personal finance rules & money habits Wisdom → **Money Rules** | PERSONAL FINANCE RULES & … → **MONEY RULES // THE MONEY RULEBOOK** | personal finance → **money rules** |
| quotequarry | Timeless wisdom, self-mastery … Wisdom → **Timeless Wisdom** | → **DAILY WISDOM // QUOTE QUARRY** | "timeless wisdom," → **daily wisdom** |
| investors-compass | Investing psychology & market wisdom Wisdom → **Market Wisdom** | → **MARKET WISDOM // INVESTOR'S COMPASS** | investing psychology → **investing wisdom** |
| debt-free-doctrine | Old money habits & quiet wealth Wisdom → **Old Money Philosophy** | → **QUIET WEALTH // DEBT-FREE DOCTRINE** | old money |

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | registryToKit leaves the five fields undefined | automated | `node --test tests/brand-resolve.test.mjs` |
| 2 | R2 | the 4 live channels resolve their hand-written authority/kwShort/theme; none contains "wisdom Wisdom" | automated | same |
| 3 | R3 | eyebrow = hand-written phrase + current label (DFD relabelled) | automated | same |
| 4 | R4 | new channel derives from niche; "Market wisdom" niche → no doubled word; skeleton → no authority; declared kit value still wins | automated | same |
| 5 | R2 | next investors-compass doc title ends "| Market Wisdom" | manual | next IC doc upload |

## Regression

- Full root suite green (1183/1183).
