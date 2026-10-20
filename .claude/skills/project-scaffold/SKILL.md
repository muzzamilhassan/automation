---
name: project-scaffold
description: Standard scalable folder structure, naming rules, and code-quality toolchain (ESLint auto-fix, Prettier, jscpd duplicate detection, husky pre-commit) for TypeScript monorepo projects — used when scaffolding a new project (M0) or when the user asks for structure/lint/format/duplicate cleanup. Follow this on every scaffold so every project looks the same.
license: MIT
metadata:
  source: fullstack-agent-os (authored)
  category: meta
---

# Project Scaffold — structure, naming, quality gates

One standard, applied to every TypeScript monorepo this library creates. Structure is decided ONCE here — features never invent new top-level folders without updating this rule.

## Monorepo layout

```
<project>/
├── apps/web/            Next.js PWA (frontend)
├── apps/api/            NestJS (backend)
├── packages/shared/     zod schemas + pure logic shared by both
├── supabase/migrations/ SQL migrations (append-only)
├── docs/                phase-reports/, feature-reports/, plans/, adr/
├── product/             RESEARCH.md, PRD.md, STANDARDS.md
├── specs/  tasks/  qa/  EARS specs, TASKS.md, QA files + QA-REPORT.md
└── install/ (library repos only)
```

## Frontend structure (apps/web/src)

```
app/                     ROUTES ONLY — layout, pages, route handlers. No logic beyond rendering.
  [locale]/<route>/page.tsx
components/
  ui/                    design-system primitives (button, input… — wrapped Base UI/shadcn)
  layout/                header, footer, shells
  features/<domain>/     composed components belonging to ONE feature domain
lib/                     pure logic + helpers — NO React imports, unit-testable (each with .test.ts)
i18n/                    routing, request config, navigation, message merge
hooks/                   client hooks ("use client" logic extracted from components)
messages/<locale>.json   ALL user-facing strings
```

Rules: `app/` files import from `components/` + `lib/` — never the reverse. Components stay thin; logic goes to `lib/` or `hooks/`. One component per file, named for what it renders.

## Backend structure (apps/api/src)

```
main.ts, app.module.ts
config/        env parsing + constants (zod-validated at boot)
common/        cross-cutting: pipes, filters, guards, interceptors, decorators
infra/<tool>/  external clients (supabase, sms, storage adapters) — swappable seams
modules/<domain>/   ONE folder per domain: <domain>.module.ts, <domain>.controller.ts,
                    <domain>.service.ts, <domain>.dto.ts (zod), + <domain>.spec.ts
```

Rules: controllers thin (validate → call service → return); services hold workflow logic; domain folders never import each other's internals — only via the module's exported service. New domain = new folder in `modules/`.

## Naming

- Files `kebab-case.ts` (web components `PascalCase.tsx`) · DB `snake_case` singular · TS `camelCase`/`PascalCase` · env `SCREAMING_SNAKE`.
- Test files: `<name>.test.ts` next to the source (lib/config) or `<name>.spec.ts` (api modules).
- Booleans read as predicates: `isMinor`, `hasConsent`, `canEdit`.

## Icons — from a library, never hand-drawn

- Icons come from an **installed icon package** — never from agent-invented inline SVG paths. Default: **lucide-react** for React projects (alternatives: heroicons, phosphor, tabler, or Iconify as the aggregator) — ONE choice per project, recorded in STANDARDS.
- Consistent system: same stroke width everywhere, one size scale (16/20/24), icons aligned to the text they accompany.
- Decorative icons: `aria-hidden="true"`. An icon that IS the control must have an accessible name (text or `sr-only`).
- Never mix icon families on one surface; never approximate a known brand/known icon with custom SVG paths.

## Quality toolchain (install at scaffold, wire into commits AND builds)

Dependencies (root dev): `eslint`, `typescript-eslint`, `eslint-config-prettier`, `eslint-plugin-react-hooks`, `globals`, `prettier`, `jscpd`, `husky`, `lint-staged`.

| Tool | Job | Script |
|------|-----|--------|
| `tsc` (strict) | type errors | `pnpm typecheck` |
| **ESLint** (typescript-eslint + react-hooks) | bad code: unused vars, `any`, hook misuse, `prefer-const` — `--fix` auto-repairs | `pnpm lint` / `pnpm lint:fix` |
| **Prettier** | formatting (style debates end here) | `pnpm format` / `pnpm format:check` |
| **jscpd** | duplicated code blocks (min-tokens ≈ 60) — the DRY police | `pnpm dupcheck` |
| **husky + lint-staged** | auto-fix staged files on every commit | automatic on `git commit` |
| vitest | unit tests | `pnpm test` |

Root scripts: `verify` = `typecheck && lint && test && dupcheck` — run before every feature commit; the API `build` also runs `typecheck` first (build-time gate). ESLint flat config at repo root: typescript-eslint recommended + `no-explicit-any: error` + `no-unused-vars (argsIgnorePattern ^_)` + react-hooks for `apps/web/**` + `eslint-config-prettier` last. jscpd ignores `*.test.ts`. lint-staged: `*.{ts,tsx}` → `eslint --fix` + `prettier --write`; `*.{json,css,md}` → `prettier --write`.

## When to deviate

New top-level folder = stop and update this skill first (the standard is the product). Project-specific needs (a `workers/` dir, an extra app) get an ADR and an amendment here.
