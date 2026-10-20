---
name: motion
description: Design UI motion — one orchestrated moment per page (staggered page-load sequence), duration/easing tokens, data-state transitions via utility classes, accordion/collapsible height animation, and the hard prefers-reduced-motion rule. Use when adding animation to a UI, fixing scattered/chaotic motion, or setting up animation tokens.
license: MIT
metadata:
  source: fullstack-agent-os (authored; references Anthropic design guidance, tw-animate-css, Material 3 easing/duration naming)
  category: frontend
---

# Motion — one orchestrated moment

**The rule that prevents 90% of bad UI motion:** one orchestrated moment per page — a single page-load sequence or one reveal — lands better than scattered effects. Fade-and-slide-up applied to EVERY section reads as AI-generated. Pick the moment (hero load, data arrival, success confirmation), orchestrate it with staggered `animation-delay`, and let everything else be quick state transitions.

## Durations & easing (token them: `--ease-*`, `--animate-*` in `@theme`)

| Use | Duration | Easing |
|-----|----------|--------|
| Hover/press micro-feedback | 100–150ms | ease-out |
| Enter/exit transitions, popovers | 150–300ms | ease-out (enter) / ease-in (exit) |
| The orchestrated moment | 300–700ms, staggered 50–80ms per item | one named curve, reused |

- Reuse ONE signature easing per project; a zoo of curves feels chaotic.
- Enter animations ease OUT (fast start, gentle landing); exits should be FASTER than enters.

## Implementation

- Utility vocabulary (tw-animate-css or equivalent): `animate-in fade-in slide-in-from-top-2`, `data-[state=open]:animate-in` — driven by Radix/shadcn `data-state`, so motion follows component state, not timers.
- Accordions/collapsibles animate to the primitive's measured height variable (`--radix-accordion-content-height`) — never hard-coded max-heights.
- Keyframes declared inside `@theme` (emitted only when used).

## The hard rule

`prefers-reduced-motion: reduce` → all non-essential motion OFF (opacity-only fades at most, no transforms). Ship it with the first animation, not as a cleanup ticket. Also: nothing essential may exist ONLY as motion — content must be readable with animations disabled.
