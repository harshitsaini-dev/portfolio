# Design

**Status: minimal placeholder only.** Phase 1A has no design system, no
component library beyond an empty `packages/ui` skeleton, and no real
visual identity decisions.

## Current state

- Styling: Tailwind CSS v4 (as installed by `create-next-app`) in both
  `apps/web` and `apps/admin`.
- No shadcn/ui or other component library is installed.
- No color palette, typography scale, or spacing system has been decided
  beyond Tailwind's defaults plus the CSS variables `create-next-app`
  generated (`--background` / `--foreground`, with a `prefers-color-scheme`
  dark variant).
- Placeholder pages use plain semantic HTML (`<main>`, `<h1>`, `<p>`) with
  minimal Tailwind utility classes — no illustrative imagery, no marketing
  copy.

## Principles for future design work

- 3D enhances the portfolio; it never replaces accessible, semantic HTML
  navigation or content (see `.claude/skills/accessibility-review`).
- Any animation must respect `prefers-reduced-motion`.
- Contrast must meet WCAG AA in both light and dark presentation.
- Design tokens/components should live in `packages/ui` once defined, so
  both apps share a consistent look rather than diverging.

No further design decisions have been made as of Phase 1A.
