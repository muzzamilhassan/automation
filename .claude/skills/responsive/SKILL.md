---
name: responsive
description: Make UI genuinely responsive — mobile-first construction, breakpoint tokens plus container queries for components, fluid type/space, the one-step-down heading rule, touch target floors, and screenshot verification at 375/768/1440. Use when building any UI that must work on mobile, fixing broken mobile layouts, or setting responsive standards.
license: MIT
metadata:
  source: fullstack-agent-os (authored; references Utopia fluid scale, WCAG 2.5.8)
  category: frontend
---

# Responsive — the mobile view is not an afterthought

## Construction

- **Mobile-first:** base styles are the small-screen layout; `min-width` breakpoints ADD complexity (columns, sidebars) rather than remove it. Write the 375px layout first, in your head or in code.
- **Breakpoints** live as `--breakpoint-*` tokens; page-level layout uses them sparingly (usually 2–3 real changes, not one per device).
- **Container queries for components:** a card/dashboard-tile adapts to its container, so the same component is correct in a grid, a sidebar, and a modal.
- **Fluid type & space** (`typography`, `layout-and-spacing`): `clamp()` scales — the mobile/desktop jump is continuous, not a switch.

## Rules that survive contact with real content

- **Real content at every width.** Verify with the actual longest label, real product names, real numbers — `lorem ipsum` hides overflow bugs that "Acme Industries Quarterly Report" exposes.
- **One-step-down heading rule:** at smaller widths each heading drops ONE scale step, not "shrink everything".
- **Navigation:** mobile gets a real pattern (bottom bar, disclosure menu) — never horizontal scroll, never a desktop nav crammed to 375px.
- **Tables** either scroll in their own container, collapse to cards, or hide low-priority columns — decide per table, never let one blow out the page.
- **Touch targets:** minimum 24×24px (WCAG 2.5.8), comfortable 44×44px; spacing between adjacent targets ≥8px. Hover-only affordances need a touch equivalent.
- **The keyboard:** inputs must not be covered by the on-screen keyboard; `viewport` meta present; no `user-scalable=no` (zoom is accessibility).

## Verification (mandatory)

The surface is only "responsive" after `visual-review-loop` screenshots at **375, 768, 1440** all look intentional — not "not broken": intentional. Test BOTH themes and RTL at mobile too if supported.
