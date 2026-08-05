# Design

**Status: structural minimum only.** There is still no design system —
that is Phase 3. Phase 2 introduced the smallest set of tokens needed to
give the static portfolio a neutral, accessible, professional foundation.

## Phase 2 tokens (interim, expected to be superseded)

Defined in `apps/web/src/app/globals.css`, each with a
`prefers-color-scheme: dark` variant:

| Token | Purpose |
| --- | --- |
| `--background` / `--foreground` | Page base (pre-existing) |
| `--surface` | Card and tag backgrounds |
| `--border` | Dividers, card and control borders |
| `--muted` | Secondary text |
| `--accent` / `--accent-contrast` | Primary action and focus ring |

Decisions made in Phase 2 that should carry forward into the design
system:

- **One accent, used sparingly** — the primary action and the focus ring
  share it, so the focus indicator is part of the palette rather than a
  browser default bolted on.
- **A single global `:focus-visible` rule** rather than per-component
  focus styling, so no component can quietly ship without a focus
  indicator.
- **Muted text is a token, not an opacity.** Dimming with `opacity`
  composites the background too and silently breaks contrast (this
  produced a real 3.58:1 defect during Phase 2 — see `docs/LEARNING.md`).
  Contrast-checked colour values are safer than transparency.
- Light-mode text measured 6.88:1–17.93:1 in the browser. Dark-mode values
  were calculated, not measured.

These are interim. When `packages/ui` gains the real token system, both
apps should consume it rather than each defining its own.

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
