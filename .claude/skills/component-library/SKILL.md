---
name: component-library
description: Build UI from the sanctioned component system — shadcn/ui registry installs (shadcn MCP or CLI), accessible primitives (Base UI / Radix) underneath, variant/size/state conventions via CVA, and the rule that agents compose and theme rather than invent custom controls. Use when building any button, input, dialog, table, form, or when hand-rolled controls start appearing.
license: MIT
metadata:
  source: fullstack-agent-os (authored; references shadcn MCP, Base UI, Radix, Cursor-for-designers rule)
  category: frontend
---

# Component Library — compose, don't invent

## The core rule

The system already has a button. If you catch yourself hand-rolling a button, input, dialog, dropdown, tooltip, or tabs — STOP: install/compose the sanctioned one and theme it with tokens. Custom controls are where accessibility, keyboard handling, and consistency die.

## Getting components

- **shadcn/ui registry** (default): `npx shadcn@latest add <component>` or the shadcn MCP (`browse`/`search`/`install`) — components are copied INTO the project, themed by the `design-tokens` semantic set, and owned by the project.
- **Primitives underneath:** Base UI (WCAG 2.2-compliant component behavior, actively maintained) or Radix. If shadcn isn't in the stack, build thin wrappers over these primitives — never over raw `<div>`s.

## Icons — library only, never hand-drawn

- Every icon comes from the project's installed icon package (default **lucide-react**; one family per project per STANDARDS). **Never invent inline SVG paths** — agent-drawn icons look off-brand, lack consistency, and drift.
- System: single stroke width, sizes 16/20/24 from the token scale, `aria-hidden` for decorative, accessible name when the icon is the whole control.
- If a needed icon doesn't exist in the library: choose the closest existing one — do not draw it.

## Conventions inside the project's components

- **Variants/sizes via one mechanism** (CVA or equivalent): `variant` (primary/secondary/ghost/destructive), `size` (sm/md/lg), consumed as props — no one-off className soup at call sites.
- **Every interactive component has all states styled:** default, hover, focus-visible (the token ring), active, disabled, loading (if it triggers async), and RTL-mirrored (`rtl-arabic`).
- **Semantic tokens only** (`color-and-contrast`, `design-tokens`).
- **Forms:** label + description + error message wired to the primitive (`aria-describedby`, `aria-invalid`), errors specific (`app-states`), `autocomplete` attributes set (`accessibility-engineering`).

## When a genuinely new component is needed

1. Search the registry first (a `data-table`, `command-palette`, `date-picker` already exists).
2. If building: primitive underneath + tokens + all states + `visual-review-loop` screenshots before done.
3. Register it in the project's component conventions (STANDARDS.md) so the next session composes instead of duplicating.
