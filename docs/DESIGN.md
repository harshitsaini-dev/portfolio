# Design

**Status: design system established (Phase 3).** The public portfolio runs
on it. `apps/admin` has not adopted it yet — that happens in Phase 6.

## Direction

Restrained, premium, professional. Strong typography and generous spacing
do the work; colour is used sparingly. Explicitly *not* a gaming or
"cyberpunk dashboard" aesthetic.

Rules that keep it that way:

- **One accent, used deliberately.** It appears on eyebrows, organisation
  labels, the primary action, and the focus ring — nowhere else. Metadata
  such as technology badges stays neutral so it cannot compete.
- **Shallow depth.** One hairline border plus a barely-there shadow.
  Stacked heavy shadows are what make a professional layout start to look
  like a template demo.
- **One glow, one place.** A single soft accent wash sits behind the hero
  heading, on a decorative element hidden from assistive technology and
  suppressed below the `sm` breakpoint. There is no other glow on the site.
- **No glassmorphism system.** The sticky header uses a single translucent
  background with a blur; nothing else does.
- **Sections separated by hairline rules**, not alternating background
  bands — banding at this content density reads as busy.

## Token architecture

Semantic tokens live in `packages/ui/src/tokens.css` — plain CSS custom
properties, no Tailwind or React coupling, exported as
`@portfolio/ui/tokens.css` and imported by each app's global stylesheet.

Tokens name **roles**, not colours (`--surface`, not `--gray-200`), so a
theme change repoints one layer instead of touching components.

| Group | Tokens |
| --- | --- |
| Surfaces | `--bg`, `--surface`, `--surface-muted` |
| Text | `--fg`, `--fg-muted` |
| Lines | `--border-subtle`, `--border-strong` |
| Accent | `--accent`, `--accent-fg`, `--accent-soft` |
| Interaction | `--ring`, `--selection-bg`, `--selection-fg` |
| Depth | `--shadow-sm`, `--shadow-md`, `--glow-accent` |
| Radius | `--radius-sm/md/lg/full` |
| Layout | `--page-max`, `--measure` |

`apps/web/src/app/globals.css` maps these onto Tailwind's theme, so
components write `bg-surface` / `text-fg-muted` / `border-subtle` and
**never a raw colour value**. There are no section-specific colour
constants anywhere.

## Light and dark

Light is the default; dark comes from `prefers-color-scheme`. Both were
measured in-browser (see `docs/PROJECT_STATE.md`) — every sampled text
pairing clears WCAG AA, and the focus ring clears the 3:1 non-text
minimum against both the page background and card surfaces.

`tokens.css` also carries `:root[data-theme="light"|"dark"]` blocks so
Phase 10 can layer an explicit user override on top of the system
preference without restructuring. **Nothing writes `data-theme` today** —
no toggle, no persistence, no store.

## Typography

The scale is defined once in `apps/web/src/components/ui/typography.ts` as
class-string constants rather than wrapper components, so sections keep
choosing their own semantic element and heading level from document
structure rather than inheriting it from a styling component.

| Role | Token | Size |
| --- | --- | --- |
| `display` | hero `h1` | 36 → 60px |
| `heading` | section `h2` | 24 → 30px |
| `subheading` | card `h3` | 18px |
| `minorHeading` | in-section `h3` | 14px, uppercase |
| `lead` | intro paragraph | 18 → 20px |
| `body` / `bodySm` | prose | 16px / 14px |
| `meta` | dates, counts | 14px |
| `fine` | fine print | 12px |
| `eyebrow` | section label | 12px, uppercase, accent |

Fonts are the existing Geist pairing already loaded by the app. No remote
font dependency was added.

## Layout

| Concern | Value |
| --- | --- |
| Page max width | `max-w-6xl` via `Container` |
| Gutters | 20px → 32px → 40px |
| Section rhythm | `py-20` → `py-24` |
| Reading measure | `max-w-2xl` prose, `max-w-xl` hero tagline |
| Grid gap | `gap-6` |
| Card padding | 20px → 24px |
| Radius | `sm` controls, `lg` cards, `full` badges |

Breakpoints: project cards go two-up from `md` (768px); skill cards
two-up from `sm`, three-up from `lg`.

## Motion

Anchor smooth-scroll plus 150ms hover/focus colour transitions — nothing
else. Both are disabled under `prefers-reduced-motion: reduce`, verified
in-browser. No animation library is installed.

## Rules to preserve

- Never remove the global `:focus-visible` rule without an equally visible
  replacement. It is defined once, globally, so no component can ship
  without a focus indicator.
- **Do not dim text with `opacity` to make it secondary** — use
  `--fg-muted`. Opacity composites the background too and silently breaks
  contrast (this caused a real defect in Phase 2; see `docs/LEARNING.md`).
- New raised areas go through the `Surface` component, not bespoke
  border/shadow classes.
- 3D and motion enhance this structure in later phases; they never become
  the only route to content.
