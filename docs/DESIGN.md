# Design

**Status: design system established (Phase 3), adopted by both apps
(Phase 6).** `apps/web` and `apps/admin` now import the same
`@portfolio/ui/tokens.css`, which closes the Phase 3 limitation that the
admin app had not adopted the shared tokens.

## The ordered collection form (Phase 8 — education)

Education needed **no new design work**: the same sectioned layout, the same
field primitives, the same error summary and focus behaviour, the same
two-step delete. It is worth recording precisely because nothing was added —
the ordered collection form is now a settled pattern that certifications,
tools, socials, and sections can reuse.

Its two ordered-entity controls, both matching timeline:

- **Position** — an explicit labelled numeric input with `min={0}` and a
  hint that lower numbers appear first. No drag-and-drop, and no implicit
  ranking.
- **Visible** — a labelled checkbox whose hint states the consequence
  ("Uncheck to hide this entry from the public site. It stays listed
  here."). Hidden rows remain in the admin list with a **Hidden** badge:
  the admin view is the editorial view, and hiding a record from the person
  managing it would be the wrong kind of honesty.

## Editing owned child rows (Phase 8 — timeline highlights)

The first CMS screen where the user edits a list of child records inline.
The pattern, for the entities that follow:

- **Children live on the parent's screen**, not their own route. They are
  saved with the parent in one write, so splitting them across screens would
  imply a save boundary that does not exist.
- **Reordering is move-up / move-down buttons**, not drag-and-drop — the
  design system has no accessible drag implementation, and the accessible
  control should be the only control rather than a fallback. Each button
  names the row it moves ("Move highlight 2 up"), so the list is operable
  without seeing it.
- **Structural changes are announced.** Reorder, add, and remove update a
  polite `role="status"` region ("Highlight moved to position 2 of 3"),
  because they are visual changes a screen-reader user would otherwise have
  to rediscover by re-reading the list.
- **Errors are per row.** A child validation failure marks only the offending
  row `aria-invalid` with its own message, while the summary at the top of
  the form takes focus.
- Reorder and remove controls keep the 44px minimum.

### Populated list tables must scroll inside themselves

Found while testing timeline at 375px, and true of every admin list: a table
with a `min-w-*` will drag the whole page sideways unless two things hold —
the shell's `main` carries `min-w-0` (a flex item's automatic minimum size
is otherwise its content), and the `overflow-x-auto` wrapper is `relative`
(so absolutely-positioned `sr-only` labels resolve inside it rather than
against the viewport).

**Both halves are now in place on every admin list**, and the foundation
suite asserts them: any protected page with an `overflow-x-auto` wrapper
must also make it `relative`, and the shell's `main` must carry `min-w-0`.

Why `relative` matters: Tailwind's `sr-only` is `position: absolute`, and an
absolutely positioned element is laid out against its nearest **positioned**
ancestor — a non-positioned scroll container does not contain it. Without it,
the table scrolls correctly while its `sr-only` action labels resolve against
the viewport and widen the document.

Fix overflow by **containing** the positioned descendant, never by hiding
it. Do not reach for global `overflow-x-hidden`, drop `sr-only` text, shrink
tables past legibility, or hide columns on mobile without product
justification — each trades accessible content or usability for a symptom.

The check that matters is whether the *page* can be scrolled sideways
(`window.scrollTo(500, 0)` then reading `scrollX`), not whether an element
reports a wide bounding box — inside a working scroll container it will,
correctly.

## Singleton editing (Phase 8 — profile)

A singleton needs one thing the collection forms do not: the screen must
say whether the record exists yet, without becoming two different screens.

- **Unconfigured** — a dashed-border explanatory panel above the form
  ("No profile has been created… there is only ever one profile, so this
  same screen edits it afterwards"), and the submit button reads **"Create
  profile"**.
- **Configured** — a summary line with the last-updated date, and the
  button reads **"Save changes"**.

The form itself is identical in both states. Only the wording changes, so
there is nothing to learn twice and no mode to get stuck in.

Saving stays on the page. Confirmation is a `role="status"`
`aria-live="polite"` message — announced, but it does not move focus, since
a successful save is not something the user needs taking to. That is the
deliberate counterpart to the error summary, which *does* take focus
because a failure does need attention.

No internal identifier is ever rendered.

## Admin forms — reuse check (Phase 8)

The technologies CMS was built entirely from the Phase 7 vocabulary below
with **no new primitives**: same `TextField`, same labelling and ARIA
wiring, same error summary taking focus, same slug auto-suggest, same
two-step destructive confirmation, same 44px minimum on buttons and
actions. That the second entity needed nothing new is the useful signal
about the Phase 7 primitives.

One pattern was added, for referenced entities: when a record cannot be
deleted because something still references it, the destructive control is
**replaced by a plain explanation of what to do** ("used by 2 projects —
remove it from those projects first") rather than rendered disabled or left
to fail. Disabled controls give no reason; a failing control wastes the
action.

## Admin forms (Phase 7)

The Projects CMS introduced the form vocabulary the rest of the admin will
reuse. No form library — React 19's `useActionState` plus a small amount
of `useState` covers it, and a dependency would have to earn its place.

- **Field primitives** (`src/components/form/field.tsx`) — every control
  has a real `<label for>`; placeholders are never used as labels.
  Messages and hints are wired with `aria-describedby`, and invalid
  fields get `aria-invalid="true"`.
- **Error summary** — validation failures render a `role="alert"` summary
  at the top of the form and **move focus to it**, so the failure is
  announced rather than silently painted below the fold.
- **Progressive slug** — the slug is suggested from the title until the
  user edits it, then never overwritten.
- **Sections** — Basics / Publishing / Links / Technologies / Media, so a
  long form stays scannable.
- **Destructive actions** use `--danger` / `--danger-fg` (added to all
  three token blocks in Phase 7) and a **two-step in-page confirmation**
  rather than `window.confirm`, which cannot be styled, is not reliably
  announced, and is suppressible. Focus moves to the confirm button, and
  Cancel restores the initial state.
- **Touch targets** stay at the 44px minimum (`min-h-11`), and every
  Projects view was checked for horizontal overflow at 1280, 768, and 375.

## Admin surface (Phase 6)

The admin app uses the same tokens, type scale, focus ring, and
reduced-motion handling as the public site, tuned for work rather than
spectacle:

- **No decorative glow.** The hero's accent wash is a public-site device;
  the admin surface has none.
- **Accent reserved for two things**: the active navigation item and the
  focus ring. Nothing else competes.
- **Denser layout** — a 16px header bar, a 64px sidebar rail of grouped
  links, and cards at `p-5` rather than the public site's roomier rhythm.
- **Unavailable sections are visibly inert**, with the delivering phase
  shown as text rather than a tooltip, so the information is not
  hover-only.
- **No emoji in navigation.** The only two glyphs are the menu and close
  affordances, both `aria-hidden` with real text labels alongside.

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
- **Two glows, and they do different jobs.** *Revised — the original rule was
  "one glow, one place: there is no other glow on the site", and the owner
  asked for a hover glow. Recorded here rather than quietly contradicted.*

  1. **Ambient.** A single soft accent wash behind the hero heading, on a
     decorative element hidden from assistive technology and suppressed below
     the `sm` breakpoint. Still the only glow that is *always on*, and still
     the only one anywhere else on the page.
  2. **Interaction.** A short accent glow that exists **only while something
     is hovered or focused**, on `--glow-hover`.

  The distinction is what keeps the original rule's intent. Ambient glow is
  decoration and more of it reads as a template; interaction glow is feedback,
  it is absent at rest, and it appears on exactly the thing under the pointer.
  A page at rest looks the same as it did before this rule changed.

  It is bounded: one token, one utility class, driven by hover **and**
  `focus-visible`, so a keyboard reaches the same affordance a mouse does.
- **Glass, on surfaces that sit over something.** *Revised — the original rule
  was "no glassmorphism system: the sticky header uses a single translucent
  background with a blur, nothing else does", and the owner asked for glass
  and blur. Recorded here rather than quietly contradicted.*

  Panels that sit over moving or decorative content — cards, the contact
  panel, the header — use a translucent fill with a backdrop blur. Panels over
  flat background do not need it and do not get it.

  **Legibility is the constraint, not taste.** The 3D figure passes *behind*
  the page, and this project has already had one report of text becoming hard
  to read where it showed through a semi-transparent surface. So the fill
  stays high-opacity (around 85%) rather than the 40–60% that reads as
  "glassy" in a screenshot: the blur does the work, the transparency is a hint.
  Body text contrast is measured against the worst case, not assumed.

  Blur is one value from a token, not per-component guesswork.
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
| Depth | `--shadow-sm`, `--shadow-md`, `--glow-accent`, `--glow-hover` |
| Radius | `--radius-sm/md/lg/full` |
| Layout | `--page-max`, `--measure` |

`apps/web/src/app/globals.css` maps these onto Tailwind's theme, so
components write `bg-surface` / `text-fg-muted` / `border-subtle` and
**never a raw colour value**. There are no section-specific colour
constants anywhere.

## shadcn/ui (Phase 9)

shadcn is not a dependency — its components are copied into
`packages/ui/src/components/` as source and are **owned and edited** here.
Consumers import them as `@portfolio/ui/components/<name>`.

Those components are written against shadcn's own variable names. Rather
than give those names colours of their own — which would leave Phase 10's
theme CMS writing two palettes and keeping them in step forever —
`packages/ui/src/shadcn.css` **aliases every one of them to a token above**
and introduces no colour. Dark-scheme and `[data-theme]` overrides flow
through for free, because the aliases are `var()` references rather than
copies.

| shadcn name | Alias of |
| --- | --- |
| `--background` / `--foreground` | `--bg` / `--fg` |
| `--card`, `--popover` | `--surface` |
| `--primary` / `--primary-foreground` | `--accent` / `--accent-fg` |
| `--secondary`, `--muted` | `--surface-muted` |
| `--muted-foreground` | `--fg-muted` |
| `--destructive` / `--destructive-foreground` | `--danger` / `--danger-fg` |
| `--border` / `--input` | `--border-subtle` / `--border-strong` |
| `--ring`, `--radius` | already exist; reused unchanged |

### The one role that does not line up

The systems disagree on **`accent`**. Here it is the brand blue used for
primary actions and the focus ring; in shadcn it is a subtle hover surface,
closer to this project's `--surface-muted`.

`--accent` is deliberately not reassigned — the admin's list pages already
use `bg-accent` for primary buttons, and repointing it would repaint all of
them. So a generated component that uses `accent` for a hover state has that
usage rewritten to `surface-muted`/`fg` when it is added. This is the only
such divergence, and it is the first thing to check on any new component.

### Rules when adding a component

`pnpm dlx shadcn@latest add <name>` from `packages/ui`, then, before
committing:

1. Rewrite the generated `@/lib/utils` import to a relative `../lib/utils.ts`
   specifier. Apps consume this package's TypeScript source, so `@/` would
   resolve against the *consuming app's* `src/`, not this package's.
2. Rewrite `accent` usages per the divergence above.
3. Replace hard-coded colours (`text-white`) with the token utility, so dark
   mode inverts them.
4. Drop the generated `dark:` variants. This project switches palettes at the
   token layer under `prefers-color-scheme`, so those rules would adjust an
   already-adjusted value a second time.
5. Check the interactive target is at least 44px, matching the rest of the
   admin. shadcn's defaults are 36px.

Each app's `globals.css` carries an `@source` pointing at
`packages/ui/src`, because Tailwind otherwise scans only the app itself and
would omit utilities used solely by the shared components.

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
