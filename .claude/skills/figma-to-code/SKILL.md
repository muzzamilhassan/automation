---
name: figma-to-code
description: Consume designs from Figma via the Figma MCP — get_design_context for code, get_metadata for large selections, get_variable_defs mapped to design tokens, get_motion_context for animation, with the design-system-rules setup run once per repo. Use when the user provides a Figma link/file, asks to implement a design from Figma, or wants design-system rules generated from Figma variables.
license: MIT
metadata:
  source: fullstack-agent-os (authored; references Figma MCP tools-and-prompts docs)
  category: frontend
---

# Figma to Code — the design is the target, tokens are the vocabulary

## One-time setup (per repo)

Run Figma MCP's `create_design_system_rules` prompt once — it writes a rules file (save it to the project rules location) so generated code fits the codebase's stack and component conventions. Requires a Figma seat with Dev access; remote server `https://mcp.figma.com/mcp`.

## Reading a design (in this order)

1. `get_design_context` — the main tool: returns the selection as framework code (React + Tailwind default; other stacks on request).
2. `get_metadata` FIRST for large frames — a cheap XML outline so you target the right sub-selections instead of pulling a whole page.
3. `get_variable_defs` — the design's color/spacing/typography variables. **Map them to the project's semantic tokens** (`design-tokens`) — do not paste raw values into components.
4. `get_motion_context` — keyframe tracks/easings when the design specifies animation (then through `motion`).
5. `get_screenshot` — keep enabled; the rendered truth for the visual comparison later.

## Rules

- The Figma output is a TARGET, not a paste: rebuild it with the project's components (`component-library`) and tokens; copy patterns, not markup.
- Code Connect: if the org maps components in Figma, reuse the mapped real components instead of generating new ones.
- After implementation: `visual-review-loop` — screenshot your build and compare against `get_screenshot`/the design; list concrete diffs; fix; re-shoot. Figma-to-code without the loop ships drifted UI.
- Deviations (tokens that don't exist, impossible spacing, missing states): surface them as questions EARLY — designs are also wrong sometimes; the agent is the last reader before users.
