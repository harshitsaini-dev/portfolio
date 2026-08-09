# Project State

Source of truth for what has actually been done. Update this file after
every task. Only record checks that were actually performed — never claim
something passed without running it.

## Current phase

**Phase 19 — Performance. Complete.**

Phase 9 is code complete with provisioning outstanding (below). Phases 10-16
are complete: 10-14 were built during the polish work and their roadmap
entries have been corrected to match, 15 is the contribution playground, 16 is
loading states.

**Phase 9 — R2/media. Code complete; provisioning outstanding.**

All seven slices are merged. What remains is **not code**: no R2 bucket
exists, no bucket binding is in any committed config, and creating them is a
human action — see `docs/DEPLOYMENT.md`. Everything runs against miniflare's
local simulation until then.

## Phase 19 — performance (branch `feat/performance-pass`)

### Production numbers had to come off disk

`next start` cannot run here: there is no D1 binding outside Wrangler, and the
seam fails closed by design, so the server starts and every route throws
`DatabaseUnavailableError`. That is the seam working, not a fault.

So the byte counts below are read from `.next/static` after a real production
build — those are genuine minified production numbers — and runtime behaviour
is measured against the dev server, where absolute timings are dominated by
compile time and only *relative* measurements mean anything.

### The 3D bundle is 872 KB and it is genuinely not downloaded

Three.js and R3F are 872 KB of a 1798 KB static JS total — half of everything.
`hero-scene-mount.tsx` already loads it through `dynamic(..., { ssr: false })`
behind four gates: the CMS enable flag, `prefers-reduced-motion`, a small-screen
check, and an actual WebGL context probe.

The work here was proving the gates hold, because this is exactly the kind of
thing that regresses silently — a stray eager import in the module graph and the
chunk ships to everyone with nothing visibly different.

Measured requests for three/fiber/drei chunks on the home page:

| case | three chunks | canvases |
| --- | --- | --- |
| desktop, normal | 5 | 1 |
| desktop, reduced motion | **0** | 0 |
| small viewport | **0** | 0 |

The canvas count matching the chunk count is the part that matters: the bundle
arrives exactly when something renders it, and never otherwise.

### The LCP image was lazy-loaded

The one real defect. The hero portrait is the largest thing painted above the
fold, so it decides LCP — and it carried `loading="lazy"`, which defers an image
until layout is known and drops its priority.

`ContentImage` gained an opt-in `priority` prop (`loading="eager"` plus
`fetchPriority="high"`), passed only by the base portrait. Deliberately opt-in:
a page where several images claim priority has no priority at all.

Proving it needed care. The raw request-start time was useless — 3659ms on one
run and 5649ms on the next, because the dev server's compile time swamps
everything and varies per run. Measuring the *gap* between the HTML response
finishing and the image being requested cancels compile time out, and that is
stable:

- **lazy (baseline):** 8, 8, 11, 7 ms
- **eager + high:** 4, 4, 3, 4 ms

Non-overlapping — the slowest prioritised run beats the fastest lazy one. On
localhost with no contention 4ms is not the point; the point is where the
request sits in the queue against thirty other requests on a real connection.

### Layout stability is already good

CLS 0.0084 at 1440 and 0.0016 at 390 — well inside the 0.1 threshold. The
`width`/`height` attributes `ContentImage` writes are doing their job.

### The x-ray portrait is gated too

The second-largest asset, 828 KB, is the x-ray overlay. Verified it is not
loaded when the effect does not run: under reduced motion the `.xray-window`
layer is absent and the page loads one fewer media image.

Worth recording, because an earlier reading looked alarming and was an artifact:
"a phone downloads 2101 KB, more than the desktop's 1273 KB". Playwright reports
a *fine pointer* at a 390px viewport, so `(hover: hover) and (pointer: fine)`
matched and the overlay rendered. A real touch device fails that query and never
loads it.

### Left open, deliberately

`/media/[id]` serves originals with no size variants. The portrait is 828 KB and
renders into a ~340px box on a phone; the base portrait is another 335 KB. This
is the largest remaining win on the site and it is **not** an oversight —
`ContentImage` documents why it is a plain `<img>` rather than `next/image`
(routing R2 bytes back through the optimizer inside the same Worker) and names
Phase 22, when image serving is actually decided, as the point to revisit.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (703/703 admin, 243/243,
181/181, 83/83), `pnpm build` — all passed.

## Phase 18 — accessibility pass (branch `feat/accessibility-pass`)

Run with axe-core 4.12 against the public home, a project case study, and
three admin screens (dashboard, projects list, new-project form), at WCAG
2.0/2.1 A and AA, in both themes, at 1440 and 390.

### The light theme did not exist on a dark machine

The serious one, and no static review would have found it. Measured: with
`data-theme="light"` set, `--bg` was still `#0b0c10`.

`:root[data-theme="light"]` declared only `color-scheme`. The
`@media (prefers-color-scheme: dark)` block declared the whole palette at
**equal specificity and later in the file**, so it kept winning — meaning a
visitor whose OS prefers dark, who explicitly picked light, got no change at
all. The toggle was broken in precisely the case it exists for.

It went unnoticed because the reverse works: `[data-theme="dark"]` does spell
out a full palette, so dark-on-a-light-machine was always fine, and that is the
direction anyone testing on a light laptop would try.

Fixed by guarding the media query with `:root:not([data-theme="light"])`,
rather than duplicating twenty light values into a third block that would then
have to be kept in sync. Verified across all six combinations of OS preference
(light, dark) and choice (system, light, dark) — each now resolves to the
palette it names.

### A decorative console outside every landmark

The robot terminal's output carried `aria-label` on a role-less `div`, which
most assistive technology does not expose at all — so the "readable if you go
looking for it" that the label was written for was never actually reachable,
while axe correctly flagged the content as sitting outside any landmark.

Replaced with `aria-hidden`, which is the honest description: text that cycles
forever and repeats nothing the real content does not already say.

### A breadcrumb link told apart by colour alone

On the case study, the "Projects" link measured 2.54:1 against the plain text
beside it, under the 3:1 that WCAG 1.4.1 requires when colour is the only
distinction. Underlined it, which removes the dependency on colour rather than
chasing a ratio that would still fail for anyone unable to separate the hues.

### What was already correct

- **No violations at all** on the three admin screens.
- Every one of 22 tab stops on the home page paints a visible focus indicator,
  and in dark theme every indicator clears 3:1 against the page (weakest is the
  skip link at 3.43:1). This is a computed-style question axe does not answer.
- The skip link is the first tab stop.

### One finding that turned out not to be a defect

A first-time visitor on a light-preference machine gets a dark site. That is
not the media query being ignored: `layout.tsx` renders `data-theme` from the
CMS **site default**, which is currently dark. Deliberate, and the visitor's
own choice still overrides it.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (703/703 admin, 243/243,
181/181, 173/173, 161/161, 146/146, 83/83), `pnpm build` — all passed.

## Phase 17 — mobile refinement (branch `feat/mobile-refinement`)

### What the audit did *not* find

No page-level horizontal overflow at 390x844, 768x1024 or 1440x900, on the
public home, a case study, or the admin. Everything that measured wider than
the viewport sat inside a deliberate `overflow-x-auto` container.

One reading did say otherwise and was wrong: `main` measured 385px wide in a
380px viewport, offset by -4px. That is `page-enter` — an entrance animation
that scales and translates the element — so `getBoundingClientRect` was
reporting a *transformed* box mid-animation. Measured after it settles,
`scrollWidth` and `clientWidth` are both 380. Worth recording because a
transform reads as overflow in every one of these sweeps.

### The portrait had never been responsive

The hero portrait rendered 520x520 on a 390px phone — 150px past the edge.
`ContentImage`'s fixed mode sets `style="width:520px;height:520px"` inline, and
an inline style beats a class, so the hero's `h-[26rem] sm:h-[34rem]
lg:h-[38rem]` had **never applied at any width**. The responsive classes were
in the source the whole time, doing nothing.

The fix is a `sizing?: "fixed" | "css"` prop: in `css` mode `ContentImage`
writes no inline size and lets the caller's classes decide. The `width`/
`height` attributes still reserve the box, so nothing regresses on layout
shift. Both portrait call sites in `xray-portrait.tsx` pass it. Measured
after: 347x424 on the phone, 544 at 768, 608 at 1440.

### The cut-out photo now fades into the page

The bottom fade lived on `.xray-fade`, which masks only the x-ray overlay — so
the photograph itself ended at a hard horizontal edge and only the overlay
dissolved. Moved to the host as `.portrait-fade`, covering photograph and
overlay in one pass. Two gradients on two elements would ramp independently
and the overlay would win the tail; one mask on the parent cannot.

The first attempt was `#000 68%, transparent 100%` and the owner reported a
visible edge in it. **The edge was real and it was not at the bottom.** A
two-stop gradient is fully opaque up to 68% and then falls at a constant rate,
so the *rate of change* jumps from nothing to everything at that one line, and
the eye reads the discontinuity as a seam even though no pixel there is
transparent. The replacement is a seven-stop eased ramp — opacity and its
derivative both move continuously — finishing at 96% so the box edge can never
show. Verified in both themes; light is where a seam shows worst.

### The navigation drawer opened with no animation

Structural, not a missing class. `showModal()` moves the element from
`display: none` into the top layer in one step, and a transition needs a
previous computed value to interpolate from — a `display: none` element has no
rendered frame, so the drawer was always painted fully open.

Three things are needed together, and it stays broken without any one:
`@starting-style` supplies the missing first frame; `allow-discrete` on
`display` defers the flip to the *end* of the close transition so the drawer is
still visible while it slides out; and `overlay` must transition too, or the
element leaves the top layer the instant `close()` is called and the exit plays
somewhere invisible.

Measured opening: `left` 380 → 267 → 108, opacity 0 → 0.35 → 1. Measured
closing: `display` stays `block` while `left` goes 108 → 365, then flips to
`none`.

### The snake board is played, not scrolled

It was fifteen flex rows of fixed 16px cells inside a horizontally scrolling
container, so a phone player had to scroll sideways to see the wall they were
about to hit. Replaced with one CSS grid of `repeat(30, minmax(0, 1fr))` and
`aspect-square` cells: `1fr` divides whatever width there is, so the board
scales rather than overflowing, and with the row wrappers gone there is
nothing left to scroll.

The cell *count* stays fixed at every width deliberately. A board that changed
shape on a phone would be a different game, and the best score is a single
number shared across both.

Measured: 340x172 with 8.9px cells at 390, 672x332 with 18px cells at 1440
(the fixed cells were 16px), no wrapper scroll and no page overflow at either.
Play verified after the change — the head moves x11 → x19 along y7, ArrowUp
takes it to y4, and hitting the right wall ends the round — which is what
proves the flattened index → (x, y) mapping still matches the game logic.

### Touch targets

The social row's "X" link measured 33x44 and the header brand 81x20. Both
grew to a 44px minimum. The brand is not inline text in a sentence, so the
WCAG 2.5.8 inline exception does not cover it; the header row is already
`h-16`, so the larger box costs no layout.

The remaining sub-44px controls are inline text links inside prose, which the
exception does cover.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (703/703 admin, 181/181
and 83/83 media, web suites passing), `pnpm build` — all passed. Verified in
Chromium at 390x844 and 1440x900, in both themes.

## Phase 15 — the Contribution Playground (branch `feat/contribution-playground`)

Snake, played on a grid of contribution-graph squares, as its own page
section — so an editor can retitle, reorder or hide it like any other.

### Built in the DOM, not in WebGL

The obvious build is instanced cubes in a canvas. It was not built that way,
and the reason is this project's own rule: 3D enhances an experience, it never
*becomes* the only way to use one. A canvas cannot be focused, cannot be read,
and cannot be operated without a pointer, so anything interactive inside one
needs a parallel DOM implementation before it is usable at all.

So the board *is* the DOM: 450 real elements, arrow keys and WASD to steer,
space to pause, on-screen buttons for touch, and a visible focus ring — a game
you steer with the arrow keys and cannot focus is a game only a mouse can
start. The depth is a CSS `perspective` and a 14-degree tilt, dropped under
reduced motion.

### It starts when asked

Nothing moves until Start is pressed. That is what makes it safe under
`prefers-reduced-motion` without special-casing: a board that began running on
scroll would be continuous unrequested motion in the middle of a page, while a
board that waits for a press is motion the visitor chose. It also pauses when
the tab is hidden, for the same reason the 3D scene does.

### Refs drive the loop, state drives the paint

The snake, direction, food and score live in refs. A loop reading them from
state closes over the values from the render that installed it, so the snake
would move in whatever direction it had a tick ago — the classic
setInterval-in-React bug, and in a game it is unplayable rather than untidy.

A chain of timeouts rather than an interval, because the delay shrinks as the
score rises and an interval cannot change its own period.

### The best score is the only thing persisted

In `localStorage`, in this browser, nothing sent anywhere. Read through a
small external store rather than state plus a mount effect — the same pattern
as the theme toggle — so the server snapshot is explicit and hydration cannot
mismatch. A number to beat is the reason anybody plays a second round, so it
is shown as a figure while playing rather than only in the announcement.

### What a screen reader gets

The board is `aria-hidden`. Announcing 450 cells, or a snake's coordinates ten
times a second, describes the mechanism rather than the game. What is
announced is score and phase, through one polite `role="status"`.

That is the honest position: it is a visual toy, it says so, it is fully
keyboard-operable, and it is a section an editor can hide entirely.

### Two corrections along the way

**The first build was a drawing tool, not a game** — the owner asked for
snake, and it was replaced wholesale.

**The drawing version had two real defects, both caught by measurement** and
worth recording because the second one repeats a pattern:

- Dragging across seven cells painted exactly one. Once a stroke begins the
  browser retargets pointer events to the element it started on, so
  `onPointerEnter` never fires on the siblings. Hit-testing with
  `elementFromPoint` asks the question actually being asked.
- The grid was transposed against its own ARIA: 53 `role="row"` elements in a
  grid declaring `aria-rowcount={7}`. A screen reader would have announced 53
  rows of 7.

### The section tests failed, correctly

Adding a seventh section broke six assertions that had `6`, `5` and the full
key order written out. They were doing their job. The counts are derived from
`SECTION_KEYS` now, so a new section is a one-line change there rather than a
hunt through the test file — but the *order* is still spelled out, because
that is the thing under test.

### A dev-server trap, hit for the third time

Adding `skeleton.css` to `packages/ui` 500'd both dev servers with
`"./skeleton.css" is not exported under the condition "style"`. The export map
was correct and `pnpm build` passed throughout: Turbopack caches the failed
package resolution. `pnpm dev:clean` fixes it, which is exactly why that
script exists — see `docs/DECISIONS.md`.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (703/703 admin, 101/101
web, 181/181 and 83/83 elsewhere), `pnpm build` — all passed. Verified in
Chromium: the board renders 450 cells, Start moves the snake, space pauses it,
arrow keys steer, and the best score survives a reload.

## Phase 16 — loading states and skeletons (branch `feat/loading-skeletons`)

`loading.tsx` on all 40 admin routes and on the public case-study route, built
on one shared `Skeleton` primitive.

### Why the admin needed this most

Every admin page is dynamic and reads D1 on the server. Without a
`loading.tsx`, Next.js holds the **previous** page on screen for the whole
gap — click Tools from Projects and the Projects list simply stays there, with
nothing saying anything happened.

Fourteen list routes share one `CollectionLoading` and every form route shares
one `FormLoading`, rather than forty hand-written files: forty near-identical
files is how the third one quietly stops matching its page.

### Skeletons, not spinners

The bars mirror the layout that is coming — the header's three lines, the
button at its real height, the table at its real column count. A spinner says
"something is happening"; a skeleton says "this is what is about to be here",
which is also what stops the page jumping when it arrives.

### Accessibility

Every bar is `aria-hidden`. A screen reader announcing "blank, blank, blank"
describes the loading *mechanism* rather than the page. `SkeletonScreen` wraps
each set in one `role="status"` with `aria-busy` and a single polite label, so
assistive technology hears "Loading" once.

### The shimmer is gated; the placeholder is not

The moving highlight lives inside `prefers-reduced-motion: no-preference`.
Without it the bars are still there, still the right shape. That is the
**opposite** gating to the scroll reveals, and deliberately so: there the
hidden state must not exist without the mechanism to clear it, because the
failure mode is invisible content. Here the failure mode is a still rectangle.

### Two bugs the verification caught

**The admin does not import `motion.css`.** The skeleton CSS was written there
first, so in the admin it rendered as twenty-two unstyled `<div>`s: correct
markup, correct ARIA, and nothing visible. The DOM check passed while the
feature was broken. The skeleton styles are their own `skeleton.css` now,
imported by both apps — `motion.css` stays public-site-only.

**The public loading state caused the layout jump it exists to prevent.** The
first version left the site header out, reasoning that Next.js keeps the
surrounding layout. True in general, false here: the header is rendered by
`page.tsx`, not a layout, so it is inside the replaced segment. Measured —
during loading there was no header, and content arrived 64px lower. A
placeholder of the same height now holds the space, and the measured shift is
**1px**.

### How it was verified

Throttling and route interception both failed in instructive ways: Next
prefetches the case-study link, so a click transitions instantly and there is
no loading state to see, and intercepting every request broke client-side
navigation outright.

What worked was giving the page a real 3-second delay, observing, and removing
it again. Admin: skeleton appears with 22 styled bars, `aria-busy`, the
shimmer running, and zero skeletons once the heading reads "Skills". Public:
13 bars, label "Loading project", and a 1px shift on arrival.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (703/703 admin, 181/181
and 83/83 elsewhere), `pnpm build` — all passed.

## The carousel stage sizes itself (branch `fix/carousel-stage-height`)

The owner reported a project card cut off along its bottom edge. It was, and
the stage's `overflow: hidden` was doing exactly what it had been told.

### The cause was a guess that went stale

The stage height was a fixed `34rem`. Slides are absolutely positioned, so
they contribute no height and the stage has to be given one — and that number
was derived from the cards as they stood on the day it was written. Measured
at the reported width: the tallest card is **566px** against a **544px**
stage, so 22px of it was being clipped.

A stage whose height is a guess about its contents will keep going stale every
time a project gains a technology tag or a longer summary. So it is measured
now: `ProjectsCarousel` finds the tallest slide and publishes it as
`--stage-height`, with the old value left only as a fallback for the frames
before that runs.

### Two details that would have been wrong

**`offsetHeight`, not `getBoundingClientRect().height`.** The slides carry a
3D rotation, and a rect measures the *rotated* bounding box — taller than the
card itself, which would have left a growing gap under the shortest one.
`offsetHeight` is the layout height, before any transform.

**A `ResizeObserver`, not a window `resize` listener.** A card's height depends
on its own width, which changes with the container rather than only with the
viewport, and its content can change under it.

### Verified by making it fail

Resizing the window proved nothing: the slide is `min(28rem, 56%)`, so at
1024px it is still 448px wide and the cards do not change height at all. The
real check was forcing a card to grow the way longer CMS copy would — the
stage went **582px to 662px**, and back to 582px when it shrank. Never
clipped at any point.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (703/703 admin, 181/181
and 83/83 elsewhere), `pnpm build` — all passed.

## Hover glow and glass (branch `feat/glow-and-glass`)

Requested: a glow on hover, "like when you hover a skill", plus glass and
blur. Both reverse rules recorded in `docs/DESIGN.md`, so that file was
updated beside the originals rather than quietly contradicted.

### Two glows, doing different jobs

The old rule was *"one glow, one place: there is no other glow on the site"*.
It now reads: an **ambient** glow (the hero wash, always on, still the only
one) and an **interaction** glow that exists only while something is hovered
or focused.

That distinction keeps the original intent. Ambient glow is decoration and
more of it reads as a template; interaction glow is feedback, absent at rest,
on exactly the thing under the pointer. **A page at rest looks the same as it
did before.**

One token, two utilities, driven by `:hover` **and** `:focus-visible` — plus
`:has(:focus-visible)` so a card whose link is focused lights up too. A
keyboard reaches the same affordance a mouse does.

### What is and is not gated on reduced motion

The glow and the border are **not** gated: they are feedback that a hover
registered, they do not move, and gating them would leave a visitor who asked
for less motion with no hover state at all — the same reasoning that keeps
`.press` outside the guard. The **lift is** gated, because that is the part
that moves. Verified under emulation: glow and border present, lift absent.

### Glass, bounded by legibility

The old rule was *"no glassmorphism system"*. Panels that sit over something —
cards, the contact panel — now use a translucent fill with a backdrop blur.

The fill is **86%, not the 40-60% that reads as glassy in a screenshot**,
because the 3D figure passes behind the page and this project has already had
one report of text becoming hard to read where it showed through. The blur
carries the effect; the transparency is a hint.

Measured rather than assumed, compositing the card fill over the palest thing
that can pass behind it (the robot's hood, `#dfe3ee`): body text **5.42:1**,
headings **11.58:1**, pills **5.42:1** — all above AA. Over the page
background: 7.75, 16.57, 7.75.

### Two bugs found by measuring

**The lift silently did nothing on any `.reveal` card.** `transform:
translateY(-2px)` was being overridden by the reveal animation, which runs
with `both` — its filled `to` state (`transform: none`) stays applied forever,
and an animation's value beats a normal declaration in the cascade. The glow
appeared and the card did not move. The lift uses the independent `translate`
property now, which the reveal never touches, so the two compose.

**Hovering a skill lit up the card *and* the pill.** The skill category card
was marked `interactive`, which contradicted the rule written in the same
change — a panel that lights up without being interactive promises something
it cannot deliver, and a skill category card is not clickable. Two effects at
once read as blur rather than as "this one". The pills glow; the card holds
still. Project cards keep it, because they contain a link.

### Applied to

Skill pills, tool rows (a tinted variant, since a row has no border to light),
project cards, technology badges, carousel arrows, the contact panel and the
skill category cards. The bespoke hover on project cards — its own translate,
border and shadow — was replaced by the shared one: three components each
inventing a hover is how a site ends up with three hover languages.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (703/703 admin, 181/181
and 83/83 elsewhere), `pnpm build` — all passed.

## Phase 9 slice 6 — the résumé CMS (branch `feat/resume-cms`)

The last piece of Phase 9. The `resumes` repository, the media service's
résumé path and the public download link in the hero all existed and were
tested; there was no screen to create one.

### Shape

A résumé record points at an uploaded PDF and carries a label. Uploading
happens in the media library, which already accepts PDFs — so this is an
attach-and-label screen, not a second uploader. Create, edit, publish and
delete, with a `getDocumentOptions` helper mirroring `getMediaOptions`: the
picker offers documents only, because the public route serves whatever the row
points at and offering images would let somebody publish a screenshot as a
résumé.

### Publishing is its own action, deliberately

At most one résumé may be current, enforced by a **partial unique index**
rather than by application logic. Setting the flag through a normal update
would trip that index whenever another row held it, so `isCurrent` is absent
from both the create and update schemas — there is no path by which a form
could reach the unsafe route — and `repos.resumes.makeCurrent()` clears the
others in the same batch.

Creating never publishes. That is stated on the New screen, so the absence of
a "current" checkbox reads as a decision rather than an oversight.

### Deleting a résumé does not delete its file

`resumes.media_asset_id` is `ON DELETE RESTRICT`, so the database blocks
deleting a *media asset* a résumé points at. Deleting the *résumé* leaves the
PDF in the library, and the confirmation says so. It also says, only when
true, that deleting the published one removes the download from the site.

### Verified end to end in Chromium

Uploaded a PDF; confirmed the empty list says the public site shows no
download; created a résumé and confirmed the public site still showed none;
published it and confirmed the download link appeared pointing at
`/media/[id]`; created and published a second and confirmed **exactly one**
row carried the Published badge; unticked Visible on the published one and
confirmed the public link disappeared; deleted both and confirmed the site was
back to no download.

One correction along the way: the first check reported the public link as
missing when it was present. The assertion compared the link's text for
equality with the label, and the link carries an `sr-only` "(opens in a new
tab)" suffix. The test was wrong, not the page.

### A small copy fix

`MediaPickerField` hard-coded "No image" for its empty option. On a picker
offering PDFs that is simply wrong, and a control that mislabels its own empty
state teaches an editor to distrust the rest of the form. The wording is now a
prop defaulting to the old value, so no existing caller changed.

### The auth sweep paid for itself immediately

The coverage invariant added with the robot lines picked up all four new
résumé actions with no work: the admin suite went from 695 to **703 checks**
without a line written for it.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (703/703 admin, 181/181
and 83/83 elsewhere), `pnpm build` — all passed.

## Phase 9 slice 5 — project gallery attachment (branch `feat/project-gallery`)

The per-project gallery can now be attached in the admin. That was the last
missing piece of it: the `project_media` table, `repos.projects.setMedia`, the
`projectMediaInputSchema`, the action's write path and the public case-study
page's `<figure>` gallery **all already existed and were tested**. The project
form sent `media: []` on every save, so nothing could ever be attached.

### What the form does now

Rows of "pick an asset, optionally caption it". Position is **implied by row
order** — the action assigns `position: index` — so there is no second source
of truth to contradict the list an editor is looking at. Reordering is by
Move up / Move down rather than drag: buttons work with a keyboard and a
screen reader with no extra machinery, and this list is a handful of items.

Rows with no asset chosen are dropped from the payload rather than rejected,
so "Add image" can leave an empty row on screen without blocking a save. A
blank caption is normalised to `null`, because the column is nullable and
sending `""` would be the one path by which an empty-string caption could
round-trip.

### The hazard that is now closed

`updateProjectAggregate` replaces the collection wholesale whenever
`input.media` is present, and the form always sent it — as `[]`. Nothing could
add gallery rows, so nothing was being destroyed, but the shape was exactly
the one that made the Phase 9 audit's `.partial()` defect destructive. The
edit page now loads the existing rows, so saving an untouched project
round-trips its gallery instead of clearing it.

Verified in Chromium: added a row with a caption, saved, reopened and found it
persisted, confirmed the public case-study page rendered the `Gallery`
heading, one `<figure>`, the caption and the correct `/media/[id]` source —
then removed the row and confirmed the removal persisted too.

### A mistake worth recording

The first attempt at that verification targeted "the last two `<select>`
elements", assuming they were the gallery pickers. They were the cover and
icon pickers, which sit *after* the gallery section — so the test silently
rewrote the project's cover image and icon and reported the gallery as not
saving. Both were restored, and the retest targeted the pickers by their
labels instead.

### Roadmap correction

Slice 7 (public delivery routes for images and the current résumé) was already
complete and had not been recorded — `media/[id]/route.ts` serves both, and
the hero renders the résumé link. The roadmap has been corrected rather than
left to imply pending work that does not exist.

**Slice 6 — the résumé CMS — is the only Phase 9 work left.** The repository,
the service's résumé path and the public surface all exist; there is no admin
screen to upload one.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (695/695 admin,
181/181 and 83/83 in the other suites), `pnpm build` — all passed.

## The robot's lines are CMS content (branch `feat/robot-lines-cms`)

The sentences the hero's robot says were hard-coded in the component, which
put editorial copy in a React file — the thing this project's "content is
data-driven, never hardcoded in UI" rule exists to prevent. The owner asked to
add and remove them from the CMS, which is that rule arriving as a request.

### The slice

Migration 0007 adds `robot_lines` — deliberately the plainest table in the
schema: a sentence, an order and a visibility flag. No category, no weight, no
scheduling, because none is needed to say a sentence and every speculative
column is one more thing to keep true. `position` and `is_visible` follow the
same convention as `tools` and `socials`, so the shared ordered-repository
helper and the admin's list conventions apply without a special case.

Plumbed end to end: types, Zod create/update pair, repository, three Server
Actions, list/new/edit admin routes, delete confirmation, nav entry, and the
public read. The 20 lines previously in the component are seeded by the
migration, so behaviour after it is what it was before — with the difference
that it is now editable.

### What stays in code, and why

The **greeting** is not a row. It is chosen from the clock in India and has to
be computed: a stored row saying "good morning" would be wrong for most of the
day. The component composes it with the CMS lines at the moment it picks one.

The public site receives plain strings rather than records — the bubble needs
the text and nothing else, and handing a decorative component ids and
timestamps gives it things it has no business knowing.

### The tests caught two things

**The migrations smoke test failed on the new table.** It asserts the exact
set of tables rather than a minimum, so a new one is a deliberate decision
someone has to record. Working as intended.

**The action-auth suite would not have covered these actions at all.** It
imports each module by name, so a new entity is only guarded if somebody
remembers to add a block — and this project has already shipped that exact
gap once, when the protected-page invariant matched `page.*` only and the
first `route.ts` went unguarded.

So there is now a **coverage invariant** that reads the actions directory,
imports every module, and requires every exported `*Action` to throw
`AdminUnauthorizedError` on an unauthenticated call with an empty form — empty
because authorization must be checked *before* validation, so an action that
validates first returns instead of throwing, which is the bug it catches. A
new entity is covered the moment its file exists.

Verified against the broken state rather than assumed: removing
`requireAdminIdentity()` from one action made the sweep fail with two named
failures; restoring it returned 695/695.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (695/695, up from 611),
`pnpm build` — all passed. Verified in Chromium: create, edit and delete
through the admin, with a new line reaching the public site's HTML and
disappearing again after deletion.

## The hooded robot, rebuilt by hand (branch `feat/robot-rebuild`)

The supplied glTF model was dropped at the owner's request, so the hero's
figure is composed from primitives again — rebuilt against a screenshot rather
than tuned from memory.

### Proportions are the whole job

With geometry, ratios are what decide whether a figure reads as a character:
the hood is wider than the body (1.56 against 1.16) and nearly as tall as the
torso and legs together, the face is a dark plate with two glowing slots
rather than round eyes and a smile, and the limbs are short and thick.

The previous version failed on all three — a spherical hood swallowed the
head, the shoulder joints sat level with the face so the arms appeared to grow
out of it, and pale hands floated free of the sleeves. Every part is now
placed from one origin (the torso centre) instead of nudged individually.

### Four bugs the owner reported, each with a real cause

**A "glitching nose".** Z-fighting: the hood is 1.5 deep so its front surface
is at z = 0.75, and the face plate was 0.14 thick at z = 0.68 — putting *its*
front at exactly 0.75 too. Two coplanar surfaces give the depth buffer nothing
to decide with, and it alternates per pixel. The stack is now strictly
ordered: hood front 0.75, plate 0.69–0.83, brim outside the plate in XY, eyes
0.845–0.895.

**A bar sticking out of the head.** The brim torus was rotated 90° about X,
which laid it flat in the XZ plane. A torus is authored in the XY plane, which
is already the plane of the face — the rotation was the bug, not the geometry.

**Walking off the side of the window on scroll.** The x bound was fixed while
the visible frame is not: moving toward the camera *shrinks* it. At z = 0 the
viewport is about 6.6 units wide; at z = +1 it is about 5.3, and `DEPTH` moves
the figure exactly that far forward. The bound is now measured every frame
with `getCurrentViewport` at the figure's own depth. The first attempt at this
still clipped the arm, because it used the hood's half-width — the arms reach
much further, especially mid-wave.

**The head barely followed the cursor.** Yaw was 0.5 radians across the full
screen width, so most of the time it was a few degrees of nothing. Now 0.85,
with the body taking 35% of the turn — a head that swivels on a motionless
torso reads as a doll.

### Scroll turns it left, right, then left

`sin(scroll · π · 2.5)` passes through +1 at a fifth of the way down, −1 at
three fifths, and +1 again at the end. A sine eases through each reversal
instead of snapping.

### The robot speaks

`RobotSpeech` shows one line at a time in a bubble beside the figure — 4.6s
on, 7.2s off, never the same line twice running. Deliberately unlike the
terminal beside it: the terminal is a machine's log in monospace, this is the
figure talking, in the page's own typeface, with nothing there most of the
time.

**The copy is not a feature tour.** The first version narrated the site —
"everything here is editable", "the projects rotate on their own". The owner
cut all of it: a portfolio that explains its own interface is one that does
not trust it. It now says short programming facts, attributed quotes, small
interjections, and a greeting chosen by the hour **in India** rather than the
visitor's zone — the figure stands in for the owner, so its "good morning"
should mean his.

Every fact is checkable, and the ones that could not be stated precisely were
dropped rather than softened. No "over 40 years", no "the first ever": a
number invented to sound authoritative is a lie in the one place nobody would
think to check.

The copy follows the terminal's two rules: nothing names the infrastructure,
and nothing claims a measurement it does not have. Each line carries an emoji,
which is safe here in a way it would not be in body copy — the element is
`aria-hidden`, so nothing is announced as "waving hand sign" mid-sentence, and
a screen reader is not interrupted every eight seconds by small talk. Not
rendered at all under reduced motion or below `lg`.

**The bubble is pinned to the figure, not to a corner.** The scene projects
the top of the hood through the camera each frame and publishes it as
`--robot-x` / `--robot-y` on the document element; the bubble reads those in
CSS and never re-renders. That avoids a second copy of the positioning maths,
which would be free to drift from the first. Measured: the bubble's centre
lands at 1204.9px against a published anchor of 1204.9px.

The custom properties carry fallbacks, so a browser where the scene never
starts puts the bubble where the figure would have been rather than at the
page origin, and a `clamp` keeps it on screen when the figure is at the
right-hand margin.

### A switch for it, in the CMS

Migration 0006 adds `scene_settings.is_speech_enabled`, plumbed through types,
schema, repository, admin form and the public mapper.

It lives in `scene_settings` rather than `site_settings` because the bubble
exists only when the scene does — it is positioned from the figure's projected
coordinates, so with no scene there is nothing to pin it to. Putting the
switch beside `is_enabled` keeps that dependency visible instead of offering
an apparently independent toggle that silently does nothing.

It defaults **on**, unlike every other column in that table. They are off
because the scene as a whole is opt-in; this is a sub-feature of something
already opted into.

Verified end to end: unchecked in the CMS → 0 bubbles on the public site,
checked → 1.

### A clock in the header

`08 - August - 2026 09:54 AM IST`, always in India whoever is looking. That is
the point of putting it on a portfolio — it answers whether this is a
reasonable hour to expect a reply, which is the one thing a reader cannot work
out for themselves. A visitor's local time was shown beside it briefly and the
owner cut it.

`Intl.DateTimeFormat` with `timeZone: "Asia/Kolkata"` does the conversion; a
hard-coded +05:30 would bake a political fact into this file that belongs in
the platform's database. Assembled from `formatToParts`, because no locale
produces exactly this punctuation.

Read through `useSyncExternalStore` with the **formatted string** as the
snapshot — returning a fresh `Date` would fail the `Object.is` check every
call and re-render forever, where a string changes only when the displayed
minute does. The server snapshot is null, so the server's clock and the
browser's can never disagree during hydration. Unlike the robot, this is real
content: a `<time>` element with a machine-readable `dateTime`, not hidden
from assistive technology.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (611/611), `pnpm build`
— all passed. Verified in Chromium: the figure stays in frame at every scroll
position, the face no longer flickers, distinct speech lines rotate, the
bubble's centre lands within 0.1px of the published anchor, and the clock
matches an independently formatted IST value.

## X-ray portrait, and a second image the CMS owns (branch `feat/xray-portrait`)

Hovering the hero portrait opens a circular window onto a robot version of the
same figure. The pair is configured in the CMS.

### Migration 0005 — `profile.xray_media_id`

A second nullable media reference, `ON DELETE SET NULL` like every other one.
A separate column rather than a variant of the avatar, because the site never
chooses between the two — it composites one over the other, and each carries
its own alt text. A single column plus a naming convention would put that
relationship in a filename, where nothing could enforce it.

Plumbed end to end: types, Zod schema, the profile repository's read and
upsert, the admin form's second picker, and the public content mapper. Applied
to the local D1 only.

### The generated figure is the fallback, not the plan

`RobotSkeleton` draws an endoskeleton whose every coordinate was sampled from
the portrait's **own alpha channel** — head at y 30–195 and widest (127px) at
y 80, shoulders opening from 157px at y 220 to 245px at y 260 — so the skull
plate is a traced outline rather than a rounded rectangle, and it sits inside
the face instead of on top of it. Those numbers describe *that photograph*.

It is used only when no x-ray image is configured. The owner supplied one
(`xrays.png`, 1024x1024, same pose and crop), so the site uses that.

An earlier attempt showed a filtered negative of the photo instead. Wrong
twice: a negative of a person is still a person, and the filter chain blew a
dark navy jacket out to a flat white disc.

### Three bugs, each with a real cause

**`mask-composite: intersect` did not intersect.** Two mask layers on one
element — the circular reveal and the portrait's base fade — rendered as a
hard-edged rectangle anchored at the cursor. Reported twice as visible edges.
Replaced with two **nested** elements, each carrying a single mask: the
intersection then holds by construction, with no compositing keyword and much
older browser support.

**Scanlines made the boundary findable.** A regular pattern gives the eye a
grid to notice the window's shape against, so the reveal read as a rectangle
of texture. Dropped for the image path; the mask's falloff also widened, from
opaque-to-55% to opaque-to-28% with a long ramp.

**The window stayed open after the pointer left.** Measured: radius still at
its full value with the pointer moved far away, which is exactly the reported
"the whole x-ray shows at once". `pointerenter`/`pointerleave` were the cause
and are no longer used — the pointer is tracked on `window` and whether it is
over the portrait is recomputed **from the live rect every frame**. Geometry
cannot get out of step with reality; events can.

Verified after the fix: closed 0 → open 91.9 → closed 0 → still closed 0. And
approaching from the top-right, the radius ramps 0 → 14 → 46 → 72 → 92 over
about 800ms and never exceeds 92.

The radius itself dropped from 130 to 92: the portrait renders into a 520px
box, so 130 was a 260px window — half the image — with nothing much left
outside it to look through.

The `requestAnimationFrame` loop also stops once the window is shut, rather
than running for the life of the page.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (611/611), `pnpm build`
— all passed. Verified in Chromium: the CMS saves and reloads both images,
the reveal tracks the pointer exactly, and the open/close behaviour above.

## Public theme toggle (branch `feat/public-theme-toggle`)

A light/dark control in the public site's header, top right, on the owner's
request.

### It layers over the CMS default rather than replacing it

Two separate things, and keeping them separate is the design. `default_theme`
is the *site's* setting, owned by the admin and server-rendered into
`data-theme`. The toggle stores one *visitor's* override in `localStorage` on
top of it. A site configured "dark" still starts dark for everyone who has not
chosen.

Three states, matching the `THEME_PREFERENCES` the schema already models:
system, light, dark. A two-way switch would be simpler and would take
something away — once a visitor touched it they could never get back to
following their operating system, which is the default and what most people
want. Choosing "system" removes the attribute rather than writing
`data-theme="system"`, which matches no rule and would only look like it did
something.

### The flash is prevented in the document, not in React

A blocking script in `<head>` applies the stored choice before the first
paint. A component cannot: by the time React hydrates the page has already
been painted in the site default, so a visitor who chose dark would see a
white flash on every navigation.

The script interpolates nothing — the only value in it is a constant key, and
the only thing it writes is one of two hard-coded strings behind an equality
check, so a tampered storage value cannot reach the DOM as anything but a
removal.

### A real hydration error, and the right fix

Measured, not assumed: with the site default at dark and a stored choice of
light, React logged a hydration mismatch on `<html>` — the server said one
thing and the pre-paint script had already made it say another.

`suppressHydrationWarning` on that element only. It does not cascade, so every
other mismatch on the page is still reported. The difference there is the
entire point of the script; anywhere else it would be hiding a bug.

### Read as an external store

`useSyncExternalStore` rather than `useState` plus a mount effect — the same
pattern the rest of this app uses, and the one the lint config enforces. It
also means a change in one tab reaches the others through the `storage` event,
and the server snapshot is explicit.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (611/611), `pnpm build`
— all passed. Verified in Chromium: the full cycle dark → system → light →
dark with the background actually changing, persistence across reload, the
attribute present before hydration, and zero console errors.

## Portrait, terminal and cursor polish (branch `feat/hero-polish`)

Four owner requests, plus a real bug found along the way.

### The cut-out portrait is live

`photo.png` was uploaded through the admin media library — the real upload
path, not a fixture — and set as the profile photo. 343,533 bytes, detected as
`image/png`, served from `/media/019fe42d-…` at 768x768.

Its base is now masked with a gradient so the figure dissolves into the page
instead of ending at the hard horizontal line where the photograph was
cropped. That line is the single thing that gives away a pasted-on cut-out.
Opaque to 68% so nothing above the waist is touched.

### The robot terminal moved to the bottom-right

On instruction, and it reads better there: the panel is now on the same side
as the robot, so the figure and the console it speaks through are one thing
rather than two objects in opposite corners.

Its lines are also structured data now rather than pre-padded strings, so each
part can be coloured — accent prompt, muted system chatter, foreground for the
lines about the person, and a success-coloured `ok`. The status is pushed
right by flex rather than by spaces, which only lined up at one font size.

### `--success` added, and `--danger` was never wired up on the public site

The token set had a failure colour and no success one, so anything meaning
"done" reached for the accent — which is the brand and already means "this is
the action". `--success` is defined for both themes and contrast-checked:
11.1:1 against the page background in dark.

Adding it surfaced an existing bug. `apps/web`'s `@theme` block never mapped
`--color-danger`, so `text-danger` and `border-danger` in the contact form
generated no utility at all — measured in the browser, `.text-danger` computed
to `--fg`. Validation errors have been rendering in the ordinary foreground
colour since Phase 11. Not a WCAG failure, because the errors say what is
wrong in words and colour was never carrying the meaning alone; it was a style
that silently did nothing. Both `danger` and `success` are mapped now.

### The cursor inverts what it is over

Over running text and over links and buttons, the ring inverts its backdrop.

Three corrections came out of the owner's feedback, and each had a real cause:

- **Blocky pixels.** The ring was a 32px element scaled *up* to 2.6. Because
  `will-change: transform` promotes it to its own layer, the browser
  rasterised it once at 32px and stretched that bitmap. It is rendered at 80px
  and scaled *down* now; shrinking a bitmap does not enlarge its pixels.
- **`mix-blend-mode: difference` replaced by `backdrop-filter: invert()`.**
  The arithmetic is identical, but the blend version had to transition its
  background from transparent to white, and every frame in between was a pale
  veil over the text.
- **No motion between the two states.** The inversion was switched on at full
  strength while the ring was still growing. `--cursor-invert` is written each
  frame with an eased value, so the effect ramps with the ring.

Rates were tuned twice against the owner's eye — the original finished in
about 170ms and read as a flip, 760ms read as sluggish, and the inversion now
settles at about 430ms. Measured: monotonic ramp, 0 to 95% in 490ms.

The easing is genuinely framerate-independent now. The old comment claimed
that above `x += (target - x) * 0.2`, which is exactly the fixed-fraction
form it warned about; all three eased values use `1 - exp(-k·dt)`.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (611/611), `pnpm build`
— all passed. Verified in Chromium: portrait mask, terminal position and
colours, cursor inversion over text and over links, and the ramp timing.

## Projects as a 3D slideshow (branch `feat/projects-carousel`)

A coverflow-style carousel with previous/next arrows and an automatic loop, on
the owner's request. The cards are unchanged — `ProjectCard` moved out of
`projects-section.tsx` so the grid and the carousel render the same component.

### It can only ever add

Three conditions gate the arrangement: JavaScript is running, motion is
welcome, and the viewport is at least `48rem`. Fail any one and the markup is
the two-column grid it has always been — full list, no `inert`, no arrows.
Verified with Chromium's reduced-motion emulation: plain grid, 4 cards, 0
inert, 0 arrows.

That direction matters. The initial state is "everything visible" and the
carousel is what takes things away, so a carousel that never starts strands
nothing.

### The JS breakpoint has to match the CSS one

A real bug, caught before merge. The CSS declined to stack below `48rem`, but
the component still marked non-active cards `inert` at any width. On a phone
that gave four visible cards of which three had dead links and were skipped by
screen readers — worse than either arrangement alone. `useMediaQuery` now gates
the behaviour on the same query the stylesheet uses; the constant carries a
comment saying they must stay in step.

### Pause-on-hover was so large it read as broken

Reported by the owner as the slides not auto-advancing. They were not: the
pointer handlers were on the wrapper, which spans the full section width and
the whole 34rem stage, so a mouse resting anywhere near the projects held the
loop indefinitely.

Pointer pausing now belongs to the active card (about 448px of a 1072px stage)
and the controls. Focus pausing stayed on the wrapper, where it cannot misfire
because focus only ever lands on a control or a link inside the active card.

Measured after the fix: pointer inside the stage but off the card advanced
1→2 across 7s; pointer on the card held at 2 across 8s.

### Measurements, after several wrong readings

Position was settled by measurement, and three intermediate screenshots were
misread first — two were captured mid-transition, and `page.goto` to a
URL differing only by its hash does not reload, so one showed stale component
state. The settled numbers at 1440px: active 491→939, neighbours 92→486 and
944→1337, no overlap.

`overflow: hidden` on the stage is a correctness fix rather than a style
choice — the slide at offset +2 reached x=1627 against a 1440px viewport, and
a slide at zero opacity still occupies its position. The owner then reported
the resulting edges as too strong, so a `mask-image` gradient fades the outer
15% at each side instead of slicing there.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (611/611), `pnpm build`
— all passed. Verified in Chromium: arrows, `ArrowLeft`/`ArrowRight`, wrap in
both directions (4→1 and 1→4), autoplay, pause behaviour, reduced-motion
fallback, and no horizontal overflow at 1440px.

## Contact section made smaller (branch `feat/contact-compact`)

The owner reported the Get in touch section taking up too much area. The form
itself was already compact; the layout around it was not.

`ContactForm` was `max-w-md` inside a `max-w-2xl` panel, so it left an empty
column down its right-hand side, and the section's copy sat *above* the form
rather than beside it — paying for the same width twice and stacking the two
heights. The panel now puts the copy and the form in two columns from `md` up,
and the form fills its column.

Measured in Chromium at 1440x900: the panel went from **895x360** to
**768x338**, about 19% less area. No control was shrunk — every field keeps its
`min-h-11` target — and the section is the same at 390px wide, where it stacks
copy-first.

Two smaller corrections went with it:

- The name/email pair splits at `lg`, not `sm`. From `md` the form lives in a
  narrower column, and splitting at `sm` put two inputs into roughly 340px at a
  768px viewport, too narrow for either placeholder.
- The panel passes `padded={false}` and supplies its own padding. Leaving the
  default on put `p-5 sm:p-6` and `p-6 sm:p-7` in one class list, and Tailwind
  resolves that by stylesheet order rather than attribute order — so which
  padding won was incidental rather than chosen.

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (611/611), `pnpm build`
— all passed. Layout verified in Chromium via Playwright at 1440x900 and
390x844; no horizontal overflow at either.

## Phase 12 — motion (branch `feat/motion`)

Scroll reveals and hover polish, built on **CSS scroll-driven animations**
rather than an animation library.

### Why not Motion

The project brief names Motion, and it was not used. The thing it would buy
here — reveals as elements enter the viewport — is now a CSS feature, and the
cost is not small: the public site ships two small client components and
nothing else, and every element that animated would have to become one.

A library stays the right answer for orchestration, layout transitions and
gestures, and the 3D phases may well bring it in. It is not the right answer
for "fade this in", and the decision is recorded so it can be revisited on its
merits rather than re-argued.

### Content is never hidden by something that might not run

The most common failure of scroll reveals is an element stranded at
`opacity: 0` because the mechanism meant to reveal it never ran — a failed
script, an observer that never fired, a browser without support. That is a
blank page, not a missing animation.

The initial state lives **inside** `@supports (animation-timeline: view())`
**and** inside `prefers-reduced-motion: no-preference`. A browser that cannot
run the animation never applies the hidden state either. The failure mode is
"no animation", and it is **structural rather than remembered**.

### Restraint

One reveal per element, 8px of travel, no slide-ins, scaling, rotation or
bounce. At this content density more reads as a template rather than as craft.

### Tests

**3314/3314 across 23 suites.** The motion test is deliberately a **source**
check rather than a browser one: both guarantees come from *where* the rule
sits, and a browser test cannot check the branch its own browser does not
take. It asserts the animation is declared inside both guards and that no bare
`.reveal { opacity: 0 }` exists.

Checked against a deliberately broken copy first — adding that bare rule makes
it fail — so it tests the behaviour rather than agreeing with the code.

### Browser-verified

With support present, 12 below-fold reveals sit at opacity 0 and reach 1 when
scrolled into view. Under emulated `prefers-reduced-motion: reduce`, **all 19
reveals are visible and none are animating** — the hidden state is not applied
at all.

## Phase 11 — contact form and inbox (branch `feat/contact-inbox`)

The public contact form writes to D1, the admin reads and triages, and an
optional email copy goes to the owner.

### The public site's only write

`lib/db/binding.ts` said this app reads and never writes. That statement is
amended rather than quietly broken: **one** write exists, it appends to
`contact_messages`, and it touches no other table.

### What the anti-abuse measures are, and what they are not

Three defences that cost nothing: a **honeypot** field, a **minimum
completion time**, and **hard length limits**. All three live in the schema
rather than at the call site, so a second caller cannot forget them.

It is **not rate limiting**, and it does not pretend to be. Real rate limiting
counts requests per origin over time, and this project **stores no IP
address** — `contact_messages` keeps only a coarse `source_country`, a privacy
decision that predates this form. Enforcing a rate without an identifier
belongs at the edge: Cloudflare Rate Limiting and Turnstile, both dashboard
configuration, both Phase 21/22 and both **human actions**. Inventing a
`rate_limits` table of hashed IPs would have contradicted the schema's own
stated position.

Every rejection that is not an ordinary field error returns the **same**
generic message. Telling a bot which check caught it is telling it how to pass
next time, and a honeypot is only worth having while it is invisible.

### Email notification (optional)

Asked for during the slice. `notifyOwner()` sends a copy through Resend's
HTTPS API — **not SMTP**, because Cloudflare Workers cannot open raw TCP
sockets, which rules out Gmail's SMTP directly.

The ordering is the important part: **the message is written to D1 first, and
a failed send never fails the visitor's submission.** They filled in a form
and it was saved; saying otherwise because a third-party API was slow would be
a lie about what happened and would invite a duplicate. Unconfigured is a
normal state, not an error — the site works with no provider at all, which is
what the inbox is for.

The send is awaited rather than fired and forgotten: a Worker can be torn down
as soon as it returns, so an unawaited request is one that might never be made.

**Manual action required from the owner** to enable it: create a Resend
account and API key, verify a sending domain, and set `RESEND_API_KEY`,
`CONTACT_NOTIFY_TO` and `CONTACT_NOTIFY_FROM`. `.env.example` documents the
names only.

### Two bugs found while verifying

* **`"use server"` files may export async functions and nothing else.** The
  action file exported `contactIdleState`, an object, and every route 500'd
  with *"A 'use server' file can only export async functions, found object."*
  The state and the shared rejection message moved to a plain module — the
  right answer anyway, since the form and the action have to agree on that
  shape.
* **`Date.now()` cannot be called during render**, `useMemo` included, and
  `setState` in an effect triggers a cascading render. Both lint rules fired
  in turn. The timestamp is now written straight to the input's DOM value in
  an effect: once after mount, re-rendering nothing.

### Inbox

List and detail, with status transitions (read / unread / archived / spam) and
a separate permanent delete behind a two-step confirmation — archiving keeps
the message, deleting does not, so they are not the same control. There is
**no create action**: an admin that could author a message could put something
in the inbox nobody sent. Message bodies render as text with
`whitespace-pre-wrap`; nothing interprets a stranger's input as markup.

Inbox validation lives in `packages/schemas` rather than the admin app, which
has no `zod` dependency and should not gain one to check two fields.

### Tests

**3310/3310 across 23 suites**; the web suite grew from 81 to 97 checks,
covering the honeypot, the timing window, every length ceiling, unknown-field
rejection, and that a stored message arrives unread with no country.

### Browser-verified

A real submission through the public form landed in D1 as `unread` with
`source_country` null, the confirmation replaced the form and took focus, the
inbox listed it, and marking it read set both the status and `read_at` — the
latter stamped by the repository rather than the action.

## Phase 10 — theme and settings CMS (branch `feat/theme-cms`)

The `site_settings` row now drives the public site's name, description,
default theme, accent colour, favicon and whether the contact section exists.

### One accent column, two themes

The design system has two accents — `#2547d0` in light, `#8ea6ff` in dark —
because a colour that reads on white is often unreadable on near-black. The
schema has one `accent_color`. Two consequences, both deliberate:

* **The text drawn on the accent is computed, not stored.** Whether black or
  white sits on top is a contrast question with a correct answer, so
  `packages/ui/src/accent.ts` calculates it rather than adding a second field
  the editor would have to reason about.
* **The admin warns rather than refuses.** A dark accent on a dark background
  is a real problem, but the editor may be about to pin the theme, or may
  simply want it. Refusing would be the CMS overruling its owner.

The warning threshold is **3:1, not 4.5:1**: the accent is used for eyebrows,
links and the focus ring, whose WCAG minimum is 3:1. Holding it to the
body-text threshold would reject usable brand colours for a rule that does not
apply to them.

### The accent never becomes CSS text

`accentCustomProperties()` returns an object for React's `style` prop, so the
editor's value is set as an inline custom property and never enters a
stylesheet as text — there is no syntax to escape into. The schema restricts
it to `#rrggbb`; this restricts what could be done with it if that ever
failed. The project's rule is that the admin controls a theme configuration,
never arbitrary CSS, and the layout is where that rule is kept.

`--accent-soft` is derived with `color-mix` rather than stored, so the hero's
wash follows the accent instead of becoming a second thing to keep in step.

### `data-theme` is set only when pinned

`tokens.css` has reserved `:root[data-theme="light"|"dark"]` since Phase 3.
The attribute is written only for `light` or `dark`; `system` leaves it off so
`prefers-color-scheme` decides, which is what "system" means. Writing
`data-theme="system"` would match no rule and only look like it did something.

### Migration 0004 — favicon

Asked for during the slice. A separate column from `social_image_id`: a
favicon renders at 16–32px, where a preview card's composition and text are
unreadable. Applied **locally only**.

A comment claiming the CMS favicon "replaces" the convention-based
`src/app/favicon.ico` was wrong, and was corrected after measuring: the page
emits **both**, that file first and the CMS one second. Browsers use the last
suitable declaration, so the CMS icon wins — and the file stays as the
fallback for a site whose settings have no favicon.

### A test whose premise was wrong

A test asserted that a favicon pointing at a missing asset falls back to none.
It failed — because the foreign key **refuses** an id that does not exist, so
that state is unreachable. Rewritten to assert the two mechanisms that
actually hold the guarantee: the FK refuses an unknown id, and deleting the
asset sets the column NULL rather than leaving a dangling reference.

### The build caught what the tests could not

Making the root layout read the CMS broke `next build`: Next prerenders
`/_not-found` by default, the layout resolves a D1 binding, and the
composition seam **correctly refuses** to hand one out in a production build.

That refusal is the seam working as designed, not something to route around.
The fix is `export const dynamic = "force-dynamic"` on the layout, which is
also the honest statement — every response on this site now depends on the
database. The home and project pages already declared it individually; the
layout covers the routes with no page of their own.

Worth recording separately: the failure was committed before being noticed,
because the build ran in the same command as the commit. It was fixed in the
same change, but the lesson is the ordering.

### Tests

**3289/3289 across 23 suites**; the web suite grew from 65 to 81 checks.

### Browser-verified

A near-black accent (`#111111`) showed 18.26:1 on light and 1.04:1 on dark and
produced the low-contrast warning naming the dark background; `#7c3aed`
cleared both and the warning disappeared. Saving it repainted the public site
— `--accent`, a computed white `--accent-fg`, a matching `--ring`, a derived
`--accent-soft`, and section eyebrows actually painted in it. Pinning dark set
`data-theme="dark"`; disabling contact removed both the section and its
navigation link; the chosen favicon was served from `/media/[id]` as
`image/png` and declared last.

## Project case-study pages, and admin chrome (branch `feat/project-pages-and-admin-chrome`)

### `/projects/[slug]`

One project in full: cover, long-form description, technologies, links and a
media gallery the cards never show.

The publication rule lives next to the read rather than in the route, so a
caller that forgets it cannot serve a draft. Missing, draft and archived all
resolve to `null` and become the same 404 — not a 403, and not a page saying
"not published". Either of those confirms the slug exists, which is exactly
what a draft is meant not to reveal.

`generateMetadata` reads the project, which is safe here in a way it is not in
the admin: `getProjectDetail` returns `null` for anything unpublished, so an
unpublished title cannot reach a `<title>`. The admin's rule about metadata
bypassing route protection does not apply to a page with no protection.

The site is no longer one page, so the header's name became a link home and
its section links became root-relative. A bare fragment on a project page
looks for a section that is not there.

`ContentImage` gained a **fluid** mode. Large images cannot use the fixed one:
it pins width and height in an inline style, which would override the
responsive classes, and it claims square dimensions, which is wrong for a
photograph. Fluid mode reserves space from the asset's own recorded width and
height, so the page does not reflow as covers load.

### Admin sidebar scrolls independently

Reported by the owner: scrolling a CMS form dragged the navigation up with it.
The sidebar was an ordinary block in the page's single scroll region. It now
sticks below the header with its own bounded height and overflow.

Three classes, all needed: `self-start` (a flex item stretches to its
container's height by default, and an item as tall as the scroll container has
nowhere to stick to), `sticky top-16` (rest beneath the header, not under it),
and `h-[calc(100dvh-4rem)]` with `overflow-y-auto`. `dvh` rather than `vh`
because mobile browsers change the visible height as toolbars collapse.

### One scrollbar treatment, shared

`packages/ui/src/scrollbars.css` replaces the platform default for the page
and for scrollable panes, in one place used by both apps — a visitor who opens
the site and the admin should not see two different scrollbars. Built from the
same tokens, so it follows the theme into dark mode.

**Thinned, never hidden.** `scrollbar-width: none` would remove the only
signal that there is more content below the fold while leaving the overflow.
The opt-in `.scroll-subtle` class is deliberately not applied to horizontally
scrolling tables, where sideways overflow is already easy to miss.

### A stale notice corrected

The project form told the editor that uploads "arrive with R2 storage in a
later phase". They arrived. What is actually missing is the per-project
gallery, so it says that instead.

### Tests

**3271/3271 across 23 suites**; the web suite grew to 65 checks. The new ones
assert that a draft, an archived project and an unknown slug are
indistinguishable, and that a gallery image with no alt text is dropped along
with its caption.

### Browser-verified

A published project renders with its cover and metadata title. Setting it to
draft in the CMS made `/projects/<slug>` return **404, identical to an unknown
slug**, and removed it from the home page; publishing restored both. The
sidebar stays pinned at 64px while the form scrolls, and both scrollbars
compute `scrollbar-width: thin`.

## Section manager drives the public page (branch `feat/section-order-and-project-pages`)

The `sections` table now controls the public page's order, headings and
visibility. Section headings are no longer written in JSX.

### Rows override defaults; they do not replace them

The obvious rule — "the table is the page" — has a cliff in it. The table
starts empty, so the first row an editor created would silently delete six
sections from the site. Nobody adding a "Projects" section expects About and
Contact to vanish.

So `lib/content/sections.ts` declares the renderable keys and their default
copy, and a row **overrides** the matching key: position, title, eyebrow,
visibility. Hiding is `is_visible = 0`, which is what that column is for;
deleting a row means "no override", not "no section". A row whose key matches
no component is ignored — the admin's section form accepts any slug, so
validating the key against the renderable list belongs there, and is a
follow-up.

The page navigation is derived from the same resolved list, so a hidden
section cannot leave a link pointing at markup that is not on the page.

### A bug the browser caught that the types could not

Sections were first read with `visibleOnly: true`, matching every other
public read. That is exactly wrong here: it removes the hidden row from the
result, and the resolver cannot tell "no row, use the default" apart from "a
row that says hide this". **Measured in the browser** — hiding Contact in the
CMS made it reappear on the public site with its default title.

Fixed by reading every section row and letting `isVisible` decide. The test
added for it was checked against the reverted fix first: it fails in four
places, so it is testing the behaviour rather than agreeing with the code.

### A wrong diagnosis, recorded because the reasoning is the reusable part

`next dev` returned 500 for the admin with `"./shadcn.css" is not exported
under the condition "style"`. The export existed, the symlink was correct,
the target file was there, and `next build` passed. The change made in
response — declaring an explicit `style` condition on the CSS exports — was
then tested by reverting it: with plain-string exports and a cleared
`apps/admin/.next`, everything worked. **The cause was a stale Turbopack
cache**, left by the branch rebasing, and the exports change was reverted
rather than committed with a justification that was not true.

### Tests

**3259/3259 across 23 suites**; the web suite grew from 40 to 53 checks.

### Browser-verified

Creating a `contact` section with position 0 and title "Say hello" moved it to
the top of the page, retitled its heading, and reordered the navigation to
match. Hiding it removed both the section and its navigation link. Re-showing
it restored both.

## Public site reads the CMS (branch `feat/public-site-data`)

`apps/web` is no longer placeholder content. The home page renders from D1
through the repository layer, and the images an editor attached in the admin
appear on the public site.

The Phase 2 swap worked as designed: every section already took its data from
one content object, so the page changed **one import**. No section's markup
was rewritten to accommodate the data source.

### What was added

* `apps/web/src/lib/dev-platform.ts` — the one place this app names
  `wrangler`, a deliberate sibling of the admin's rather than a shared module.
  What would be shared is a **devDependency import**, and a package that names
  `wrangler` puts it on every consumer's dependency graph.
* `lib/db/binding.ts` and `lib/storage/binding.ts` — the app's composition
  boundaries, both failing closed in production exactly as the admin's do.
* `GET /media/[id]` — public, `public, max-age=31536000, immutable` caching,
  and no authorization, because these images are published content. Identical
  to the admin route in the parts that protect a visitor: content type from
  the row, re-checked against the allowed list, `nosniff`, no filename.
* `lib/content/site-content.ts` — the domain → view-model mapper, and the one
  place the publication filter runs.
* `next.config.ts` — `serverExternalPackages: ["wrangler"]` plus the public
  site's own security headers. Deliberately no `X-Robots-Tag`: the admin is
  `noindex` because nobody should find it, this site exists to be found.

### Decisions worth recording

**The view models stayed.** They are no longer "placeholder types" — they are
view models, and they earn their place: the domain stores `startedOn` and
`endedOn`, a timeline card shows "2024 – present", and deciding what that
string says is presentation. Collapsing the two layers would push formatting
into the repository or date arithmetic into JSX.

**An empty database is a valid state.** Nothing throws because a table is
empty; each section renders an honest empty state. The single exception is the
profile, which falls back to copy describing the absence, because the page
needs an `<h1>`.

**An image without alt text is dropped, not rendered.** The admin requires alt
text on images, but the column is nullable for PDFs, and a row predating that
rule would otherwise emit an `<img>` no screen reader could describe.

`placeholder-content.ts` was deleted — nothing imported it, and it is in git
history if it is ever wanted.

### Two bugs found and fixed during verification

* **`next dev` returned 500 immediately.** Turbopack tried to parse
  `workerd.exe` as a module, because it resolves dynamic imports statically.
  The admin had already hit and documented this; the fix is
  `serverExternalPackages`.
* **The avatar rendered as a rounded square.** `ContentImage` set
  `rounded-md` in its base classes and the caller appended `rounded-full`.
  Two radius utilities on one element do not compose — the winner is decided
  by stylesheet order, not attribute order. The radius is now a prop with one
  value.

### Tests

**3246/3246 across 23 suites.** `apps/web` gained its first suite (40 checks),
which runs the real `getSiteContent()` against a real disposable D1 built from
the real migrations. Its most important assertions seed rows that **must not**
appear — a draft project, an archived project, a hidden tool, a hidden
timeline entry — and check they do not, rather than trusting that
`visibleOnly` was passed.

### Browser-verified (`playwright-local` MCP, web on :3000)

The site renders the profile name, headline, avatar, a published project with
its icon, a tool with its logo, the footer, and honest empty states for every
section with no content yet. Publishing a project in the admin made it appear
on the public site without a rebuild.

### Still not done

Section order and visibility from the `sections` table are not yet honoured —
the page renders a fixed order. Project detail pages (`/projects/[slug]`) do
not exist. Both are follow-ups, not blockers.

## Entity icons (branch `feat/entity-icons`) — COMPLETE

Asked for after the owner reported that skills, tools and technologies showed
no icons at all. That was not a rendering bug: **the committed schema had no
icon column anywhere**, and several schema modules said so in as many words.
The chosen approach is an uploaded logo per item, referencing `media_assets`,
rather than an `icon_key` naming an icon set or a `logo_url` pointing at
somebody else's CDN.

### Migrations 0002 and 0003 — applied locally only

0002 covers technologies, tools, skills and social links; 0003 covers
projects, skill categories, timeline entries, education, certifications and
sections, and adds the avatar column `profile` never had. All nullable, all
`ON DELETE SET NULL`, matching `projects.cover_media_id`.

0003 is a second migration rather than a longer 0002 because 0002 had already
been applied to a local database holding authored content, and editing an
applied migration would have meant destroying that database to pick up the
change. **No remote database was touched.**

### All eleven entities wired

Types, schemas, repositories, actions, forms and pages, with
`MediaPickerField` in every create and edit form.

The reference grammar lives once in
`packages/schemas/src/internal/media-reference.ts`, with the create and
update variants declared separately — never `.partial()` of the create shape,
which is the defect that once cleared a technology's category on every
unrelated rename.

Two entities are not uniform:

* **Projects** carries both references. The cover heads the case study at
  full width; the icon sits beside the title in lists at about 40px, and one
  file rarely reads well at both sizes. `cover_media_id` has existed since
  Phase 7 and no UI ever exposed it — it is editable for the first time here.
* **Profile** carries `avatar_media_id`, labelled "photograph" rather than
  "icon", because it is a picture of a person.

Most actions already passed `parsed.data` or a rest-spread patch straight to
the repository, so the reference flows without further change. Projects and
profile enumerate their columns and were updated explicitly — a field missing
from that list is dropped silently between a validated payload and the write.

### Supporting work

* `GET (protected)/media/[id]/raw` serves the bytes. Until it existed no
  uploaded file could be seen anywhere in the admin, so no picker could show
  an icon.
* `MediaThumbnail` and `MediaPickerField`, plus `getMediaOptions()`, which
  filters to images — the library also holds PDFs, and a PDF attached as an
  icon would render as a grey placeholder wherever it appeared.

### Three defects found in existing code

* **The repository test harness loaded `0001_initial_schema.sql` by name.**
  From the moment a second migration existed it measured a schema the
  application no longer had, reporting it only as an opaque "create failed".
  It now applies every file in `migrations/` in order.
* **The protected-page invariant discovered `page.*` only**, so the first
  `route.ts` under `(protected)/` was enforced by nothing. A sibling
  route-handler invariant now requires the awaited guard to be the *first*
  statement in every exported method, with six negative controls — including
  a handler that resolves a binding before authorizing, and one that guards
  `GET` but not `DELETE`.
* **Three Tailwind utilities in the media CMS resolved to nothing**
  (`bg-accent-strong`, `text-on-accent`, `border-border`), drawing the accent
  background with the inherited dark foreground — a WCAG AA contrast failure
  on the slice's primary action. Fixed in commit `09f52ee`.

### Tests

**3206/3206 across 22 suites.** Two project assertions were rewritten rather
than relaxed: `coverMediaId` sat in the list of fields an update must refuse,
which was correct while nothing validated it, and is replaced by coverage of
the behaviour it should now have. The database-managed fields beside it are
untouched and still refused.

The tools and socials suites still assert that an invented `icon` field is
rejected, and still pass — `.strict()` refuses `icon`; the real column is
`iconMediaId`.

### Browser-verified (`playwright-local` MCP, admin on :3001)

| Check | Result |
| --- | --- |
| `GET /media/<id>/raw` | 200, `image/png`, 179 bytes, PNG magic `89 50 4e 47` |
| Response headers | `nosniff`, `inline`, `private, max-age=31536000, immutable` |
| Unknown id | 404 |
| List thumbnail | 40×40 at both 1280px and 375px, no horizontal overflow |
| Picker present | all 11 forms; projects renders 2 (cover + icon) |
| Technologies | create persists, edit preselects, **rename keeps the icon** |
| Tools | create persists, edit preselects, **rename keeps the icon** |
| Projects | cover and icon both persist; **rename keeps both** |
| Profile | avatar persists through the singleton upsert |

One measurement during verification returned a false negative — an HTML regex
matched `-icon-heading` before `-icon` and reported the project icon as unset.
Re-measured against the live DOM, both references were present. Recorded
because the lesson is the reusable part: a heuristic that reads markup can
manufacture a defect that does not exist.

### Local test data

A 64px blue PNG, a technology "TypeScript 5", a tool "Blender 4", a project
"Icon Verification Project Renamed" and a profile row were created in the
**local** development database while verifying. None is seeded content;
delete them from the CMS when convenient.

### Not done

The public site does not render any of these images yet — `apps/web` is still
placeholder content, and connecting it is the next slice.

## shadcn/ui configured (branch `feat/shadcn-design-system`)

Approved as "shadcn now, Motion/Animate UI later" — those two remain
deferred to Phase 12 and nothing for them is installed.

Components are copied into `packages/ui/src/components/` as owned source,
not pulled in as a dependency. `packages/ui/src/shadcn.css` aliases every
shadcn variable name onto an existing token from `tokens.css` and
**introduces no colour of its own**, so Phase 10's theme CMS still has one
palette to write. `docs/DESIGN.md` records the mapping, the single `accent`
divergence, and the checklist for adding a component.

New dependencies, all in `packages/ui`: `clsx`, `tailwind-merge`,
`class-variance-authority`, `radix-ui` — the four every shadcn component
imports.

Two problems were found and fixed while wiring it up, both of which would
have shipped silently:

* The shadcn `@/lib/utils` alias **cannot cross the package boundary**. Apps
  consume this package's TypeScript source, so `@/` resolved against the
  consuming app's `src/`. Caught by `pnpm typecheck`. Generated imports are
  now rewritten to relative `.ts` specifiers.
* The generated Button used `hover:bg-accent hover:text-accent-foreground`.
  With this project's `accent` being the brand blue, hovering an outline or
  ghost button would have flooded it blue and set a foreground colour that
  does not exist.

Also raised the Button's default target from shadcn's 36px to the 44px the
rest of the admin uses, replaced its hard-coded `text-white` with the danger
token so dark mode inverts it, and dropped its `dark:` variants — the tokens
already flip under `prefers-color-scheme`, so those rules adjusted an
adjusted value.

### Browser-verified (`playwright-local` MCP, admin on :3001)

The media list's "Upload file" action is the first consumer. Computed styles
on the rendered element:

| Property | Value | Proves |
| --- | --- | --- |
| `tagName` | `A`, `href="/media/new"` | `asChild` keeps it a real link |
| `background-color` | `rgb(37, 71, 208)` | the variable bridge resolves `--primary` → `--accent` |
| `color` | `rgb(255, 255, 255)` | `--primary-foreground` → `--accent-fg` |
| `height` | `44px` | the touch-target override applied |
| `border-radius` | `10px` | `--radius` → `--radius-md` (0.625rem) |
| `display` | `flex` | `@source` scanning reaches `packages/ui` |

It is visually indistinguishable from the hand-written button it replaced,
which is the intended outcome: shadcn adopts the existing design system
rather than introducing a second one.

## Media CMS design-token fix (commit `09f52ee`)

Three Tailwind utilities in the media CMS resolved to nothing, because the
theme names behind them do not exist: `bg-accent-strong`, `text-on-accent`
and `border-border`. The upload and edit buttons therefore drew the brand
accent background with the *inherited dark foreground* instead of
`--accent-fg` — a WCAG AA contrast failure on the slice's primary action.

Found by diffing the classes used in the media components against the names
`globals.css` actually maps; the other ten list pages were unaffected. Fixed
to the mapped names, and the media buttons adopted the `min-h-11` pattern
those pages already use. Browser-verified before and after.

## Phase 9 — media library CMS (implemented, awaiting review)

The first Phase 9 slice with a **user interface**, and the first that can be
verified in a browser.

### A local bucket, and a decision reversed to get one

`getAdminStorage()` now falls back to a **locally simulated R2** in
development. `wrangler.d1.jsonc` gained an `r2_buckets` entry, which creates
**no remote resource** — miniflare simulates it under
`.wrangler/state/v3`, with no account, no credentials and no network.
**Production still fails closed.**

This reverses the storage foundation's "fails closed in every environment"
stance. That was correct while nothing consumed storage; the CMS is the
consumer, and without a local binding every upload throws and the slice
cannot be browser-verified at all. `DECISIONS.md` records the reversal
rather than quietly diverging from itself, and the seam's own comment says
so too.

### `wrangler` is still named exactly once

The guard in `db-composition-tests.mjs` allows exactly one
production-reachable file to name `wrangler`. A second dynamic import in the
storage seam would have broken it **and** spawned a second workerd process
for one config.

So the resolution moved to **`src/lib/dev-platform.ts`**, which both seams
read from. The guard now points there and **gained a check** — the D1
binding must no longer name `wrangler` itself — so the suite went
**34 → 35**.

Worth recording: the discarded Antigravity branch hit this same wall and
wrapped the import in `eval('import("wrangler")')` to hide it from the
bundler. That defeated the guard instead of satisfying it, and its CI failed
**31/34** twice.

### What was built

| Piece | Notes |
| --- | --- |
| `uploadMediaAssetAction` | `requireAdminIdentity()` **before** the body is read or a binding resolved |
| `updateMediaAssetAction` | alt text only; enforces the image alt-text rule on update too |
| `deleteMediaAssetAction` | delegates to the service, so all four reference checks apply |
| `/media`, `/media/new`, `/media/[id]` | all through `withAdminPage`, all static metadata |
| `mediaAssetUpdateSchema`, `mediaPurposeSchema` | `purpose` is a closed set, never a caller-supplied prefix |

The upload form posts **FormData rather than a JSON payload**, unlike every
other form here: a `File` has no JSON representation that is not base64.
Validation strength is unchanged because it never depended on the transport
— the action re-reads the bytes and the shared policy sniffs them.

**Still not built:** project attachment and cover UI, résumé UI, and public
delivery. **No R2 bucket exists in Cloudflare.**

### Verification actually performed

| Command | Result |
| --- | --- |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** (exit 0) — **3181 real checks**, 22 suites |
| `pnpm build` | **PASS** (exit 0) |

Two suites failed first, both asserting the pre-reversal stance that storage
fails closed in *every* environment — seven checks in the storage foundation
and two in the media service's composition group. **They were rewritten, not
deleted**: the production guarantee is now asserted more strongly (including
that a repeated production call cannot drift into the development path, which
nothing checked before), and development is asserted to resolve a
contract-satisfying bucket.

### Browser verification (`playwright-local` MCP, real local D1 + R2)

Manual MCP verification, **not** automated Playwright CI tests.

| Proof | Result |
| --- | --- |
| A real 7,853-byte PNG uploads | row **and** object created, key `media/019fe20a….png` |
| The uploaded filename reaches the key | **no** — server-generated id only |
| An SVG renamed `.png` | **refused**: "not a PNG, JPEG, WebP, or PDF, whatever it is named" |
| After that refusal | **0 rows, 0 objects** |
| Delete, two-step confirm | row **and** object removed |
| Focus moves to the confirm button | yes |
| Error summary takes focus on failure | yes |
| 375px: page scrolls sideways | **no**; wrapper is `relative`, caption and `sr-only` labels intact |
| Console errors | **0** |

One thing measured and **not** changed: the row-action link is 18px tall,
below the 44px touch guidance. Every existing list page uses the same inline
text-link pattern, so this is a **pre-existing repository-wide** choice, not
something this slice introduced. Changing it here would have been an
unrelated sweep across nine pages; it is recorded as a known item instead.


| Step | State |
| --- | --- |
| Audit and architecture | **merged** — `e3321d7 docs: document phase 9 media foundation` |
| Prerequisite partial-update regression | **merged** — `89f67f8`, PR #37, post-merge `main` CI `31246283285` |
| Storage seam and upload policy | **merged** — `79ad35b feat: add R2 storage foundation` |
| Storage-test text-safety hygiene fix | **merged** — `3808983 fix: keep storage tests text-safe`, post-merge `main` CI `31251658312` |
| **Media service** | **implemented, awaiting review** (this branch) |
| Media CMS, upload action, résumé UI, attachment UI, public delivery | **not started** |

**No R2 bucket exists, no bucket binding is configured in any committed file,
and no Cloudflare resource was created or mutated.** Baseline moved
**3089 → 3181**; all 3089 previous checks still pass.

## Phase 9 — media service (implemented, awaiting review)

The cross-system orchestration layer between validated bytes, object storage,
and D1 metadata. **Still no UI**: no upload action, no media CMS, no résumé
or attachment screens, no public delivery, and **Media remains an unavailable
`Phase 9` navigation placeholder**.

### Why this layer exists at all

R2 and D1 are two independent systems with **no shared transaction**. Every
write therefore has a state where one side succeeded and the other did not.
Left to call sites, each one invents its own half-correct recovery — so the
recovery lives in exactly one place, and the ordering is chosen so the only
reachable residue is the harmless one.

**Metadata must never outlive its object.** An orphaned object is invisible,
costs a little storage, and is exactly recoverable (`storage_key` is UNIQUE
and `getByStorageKey()` exists). A metadata row pointing at a missing object
is a broken image on a public portfolio.

| Flow | Order | Failure leaves |
| --- | --- | --- |
| create | R2 put, **then** D1 insert | an object with no row |
| delete | D1 delete, **then** R2 delete | an object with no row |

### Two contract facts measured, not assumed

Both were checked against a **real local simulated R2** before any code was
written, and both changed the design:

1. **An unconditional `put` never returns `null`; a conditional one returns
   `null` and stores nothing.** So `null` means *declined*, and the service
   treats it as a storage failure. **This corrects the storage foundation's
   own rationale**, which said the service should "treat a promise that
   resolves at all as success" — that would have persisted a metadata row for
   a file that was never written, the precise state the ordering model
   exists to prevent. The contract *shape* is unchanged; only the comment was
   wrong, and it now says so.
2. **`put` overwrites an existing key silently** — verified by writing 3 bytes
   then 5 to the same key. That is what makes a key collision a data-loss bug
   rather than a duplicate-row bug, and it is why the service preflights.

### Collision safety — the case "UUIDs don't collide" does not cover

Before writing, the service reserves a key by checking **both** authorities,
and regenerates (up to five attempts) if either says occupied:

- `media.getByStorageKey(key)` — does an asset already claim it?
- `storage.head(key)` — is an object there anyway? This catches an **orphan**
  from an earlier failed create, whose bytes are still somebody's until a
  reconciliation removes them.

Neither check substitutes for the other. Without the preflight, a colliding
id would have R2 silently overwrite a published image, and D1 would only
report the duplicate *afterwards* — if at all.

Proven deterministically with an injected generator that always returns the
same id: the colliding create is refused with `key_unavailable`, **no second
put is issued**, and the existing object's bytes, D1 row, alt text, and
content type are all byte-for-byte unchanged. The orphan variant is proven
too.

If a D1 `ConflictError` on `storage_key` still occurs (a genuine race), the
service **does not delete the object** — that object may be what the winning
row now points at, and deleting it would convert a failed upload into someone
else's broken image. It reports failure and flags cleanup.

### Create flow

1. `evaluateUpload()` on the bytes — **storage is never touched for a
   rejected upload**, so an unsupported, mismatched, empty, or oversized file
   costs no write.
2. **Alt-text invariant.** Migration `0001` says alt text is "required for
   images", but the column is nullable with no CHECK — the schema cannot
   express "required only for images", because nothing in the row
   distinguishes an image from a PDF. So the rule lives here.
3. Reserve a key (above).
4. `put`, treating a throw **or a `null`** as failure.
5. `media.create()` with the **sniffed** content type and real byte size.
6. On D1 failure: **establish whether the row landed before touching the
   object.** A thrown `create()` does not prove it did — see below. Only when
   the row is positively absent is the compensating delete issued; success
   then means no row and no object. If that delete also fails → **original
   failure stays primary**, orphan flagged, diagnostic emitted, never a
   success.

### A thrown `create()` does not prove the row is absent

Found in review, and it was a real data-integrity hole in the safety
mechanism itself.

`createMediaAssetRepository.create()` runs its `INSERT` inside a `try` and
then reads the row back **outside** it. `getById()` has its own catch, so a
read-back failure throws while the row is already committed. The service
originally treated any non-conflict throw as "the insert did not happen" and
deleted the object — stranding a live metadata row pointing at a missing
file, **the one residue this entire ordering model exists to rule out**.

Reproduced against real local D1 before the fix: one `media_assets` row, zero
objects, and `cleanupRequired: false`, so nothing even flagged it.

The compensation decision now distinguishes three states:

| `getByStorageKey(key)` | Object | `cleanupRequired` | Why |
| --- | --- | --- | --- |
| returns a row | **kept** | `false` | Row and object agree; deleting is what would break it |
| returns `null` | **deleted** | `false` | Row positively absent, so the object is provably unreferenced |
| **throws** | **kept** | `true` | State unknown; an orphan is recoverable, a stranded row is not |

The lookup is a real `try`/`catch`, deliberately **not**
`getByStorageKey(key).catch(() => null)` — treating a failed lookup as "no
row" is the same mistake as treating a declined `put` as a successful write,
and it reintroduces the defect exactly.

**This does not claim compensation leaves no residue under every failure.**
In the indeterminate case an object is deliberately retained and may have no
row; that is the tolerated direction, surfaced through `cleanupRequired` and
an `indeterminate_persistence` diagnostic carrying the key, rather than
pretended away.

### Delete flow

**All four references are checked before anything moves.** Two are
`ON DELETE RESTRICT` (`resumes`, `project_media`) and would raise; two are
`ON DELETE SET NULL` (`projects.cover_media_id`,
`site_settings.social_image_id`) and the database would **carry out the
delete while silently clearing a published project's cover or the site's
social image**. Catching a foreign-key error is therefore not a safety check —
for half the references there is no error to catch.

A referenced asset is **refused, never auto-detached**: removing a cover is an
editorial act, not a side effect of tidying a library. The message names every
place it is used, so the editor learns all of them at once.

Then D1 first, storage second. A failed D1 delete leaves storage untouched. A
failed storage delete after a successful D1 delete returns **success with
`objectRemoved: false`** — the editorial intent succeeded, nothing can resolve
the asset any more, but the caller is told the difference rather than handed a
clean result.

### Persisted metadata — and what is honestly absent

`storage_key`, sniffed `content_type`, real `byte_size`, trimmed `alt_text`.
**`width`, `height`, and `checksum` are persisted as `null`.** Nothing in this
slice can measure image dimensions or hash bytes without adding a decoder or a
hashing step, and a fabricated value in a column the public site will trust is
worse than an honest absence. `original_filename` was **not** added and no
migration `0002` was created.

### Repository extensions — two, both counting queries

The existing surface could not answer "is this asset referenced?" without
listing every project and filtering in memory, so two methods were added
following the `countByTechnology` precedent, which exists for exactly this
"can this be deleted?" reason:

| Method | Relation | Index used |
| --- | --- | --- |
| `projects.countMediaReferences(id)` → `{covers, attachments}` | `projects.cover_media_id`, `project_media` | `idx_projects_cover_media`, `idx_project_media_asset` |
| `resumes.countByMediaAsset(id)` → `number` | `resumes.media_asset_id` | `idx_resumes_media_asset` |

`site_settings.social_image_id` needed nothing — the existing `get()` returns
the singleton. Both new methods are owned by the repository that owns the
relation, and both got canonical real-D1 tests: the database subtotal moved
**297 → 315**.

### A resource leak the implementation found in itself

`getAdminMediaService()` first resolved the storage and database seams with
`Promise.all`. **Both fail closed**, and storage always rejects while no
bucket exists — but `Promise.all` had already started the database
resolution, whose development path spawns a real `getPlatformProxy()`
workerd process. Nothing disposed it, because the function threw before it
could return anything to dispose. **Every failed call leaked a process.**

It surfaced as the *next* test suite hanging minutes later, wedged behind the
orphan — a symptom about as far from its cause as one can get. The tell was
that the suite passed in isolation and only hung when run after this one.

Now resolved sequentially, storage first, which is also the better order: the
seam expected to be unavailable decides, and a request that cannot proceed
never pays to open a binding. The suite asserts the database provider is
**never consulted** when storage is unregistered, so it cannot come back.

### `.env.example` cleanup

The four S3-style R2 placeholders (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) were **removed**. They belong to the
S3 API, which this project does not use — the delivery architecture was chosen
partly so no long-lived access key exists anywhere, and the storage seam is
asserted to read none of them. An unused credential placeholder is an
invitation to populate it. `DATABASE_URL` is equally unused (D1 is a binding,
not a connection string) but was left in place with an honest note, as
removing it was outside this task's scope.

## Phase 9 — storage foundation (merged)

The reusable layer beneath the future media service. **Everything here sits
below the UI and action layers**: no Server Action, no route, no component,
and no navigation entry was added, and **Media is still an unavailable
`Phase 9` nav placeholder**.

### What still does not exist

- **No R2 bucket.** None has been created and none is named in any committed
  file. Creating one is a human action against a billable Cloudflare account
  — see `docs/DEPLOYMENT.md`.
- **No bucket binding in any committed config.** `wrangler.d1.jsonc` was not
  touched and still contains only the D1 binding.
- No media service, upload handler, media CMS, résumé UI, project attachment
  UI, cover-image UI, or public delivery route.
- No migration change: `0001` untouched, **no `0002`**, and **no
  `original_filename` column** — that decision stays open, as recorded in the
  audit.
- No new workspace package and no new runtime dependency.

### The storage contract — `packages/types/src/storage.ts`

`ObjectStorage`, declared **structurally**, exactly as `D1Like` already is,
so no package imports a Cloudflare SDK — not even a type-only one.

```
put(key, body, options?)  get(key)  head(key)  delete(key)  list(options?)
```

Five operations, not the R2 API. Multipart uploads, conditional reads and
writes, range requests, custom metadata, and bulk delete are all deliberately
absent: every exposed method is one a future caller could reach for. **`list`
earns its place only because orphan reconciliation is a documented
requirement**, not a hypothetical one.

`put` resolves to `StoredObject | null` because R2's conditional-write
overload can decline to write. This application issues no conditional writes,
so the future service treats a promise that resolves at all as success and
never reads the value — the metadata it persists comes from its own validated
input, never from what storage echoes back.

### The seam — `apps/admin/src/lib/storage/binding.ts`

`setAdminStorageProvider()` / `clearAdminStorageProvider()` /
`getAdminStorage()`, mirroring the D1 seam, with **one deliberate
difference**: it fails closed in **every** environment, not just production.

`db/binding.ts` falls back to a local `getPlatformProxy()` binding in
development because a real local D1 database exists. **There is no bucket to
fall back to here**, so inventing a local development bucket would mean
adding `r2_buckets` to a committed config for a resource that does not exist
— the same premature deployment guess Phase 4 refused to make for D1. Failing
closed is the correct state until the bucket is provisioned.

There is deliberately **no environment-variable credential path**. An R2
access key and secret are only needed by the S3 API, which this architecture
does not use; a Worker binding carries no credentials at all. Asserted in
tests: the seam's source contains no `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, or `AWS_*` reference, and no
hardcoded bucket name.

### The upload policy — `packages/schemas/src/media.ts`

Pure: no storage, no database, no clock, no randomness. The one value that
must be unique is **injected**, which is why the policy is testable without a
bucket and why it can live beside `internal/url.ts` and `internal/slug.ts`
rather than inside the admin app.

| Aspect | Decision |
| --- | --- |
| Accepted types | `image/png`, `image/jpeg`, `image/webp`, `application/pdf` — **four, and no more** |
| SVG | **Excluded.** Active content, no committed table attaches a logo to a tool/technology/skill, and no approved sanitizer exists |
| Detection | Byte signatures only, bounded to the first **16 bytes** |
| Declared vs sniffed | Must agree; a mismatch is **rejected**, never silently corrected |
| Canonical extensions | `png`, **`jpg`** (never `jpeg`), `webp`, `pdf` |
| Image ceiling | **5 MiB** (`5 * 1024 * 1024`) |
| PDF ceiling | **10 MiB** (`10 * 1024 * 1024`) |
| Key grammar | `{namespace}/{id}.{ext}`, namespace ∈ `media` \| `resumes` |

Both ceilings are **application-level editorial bounds chosen by us**. No
Cloudflare platform limit is asserted or implied.

**The ceiling follows the sniffed type, not the declared one**, so a PDF
renamed to `.png` cannot borrow the image allowance and an oversized image
cannot claim the PDF one.

### The key contract

`{namespace}/{uuidv7}.{extension}` — for example
`media/019f8c2a-....png`. **No byte of user input reaches it.** The namespace
is one of two literals, the id comes from the existing `uuidV7` generator
that already produces row ids, and the extension is derived from the
**sniffed** content type.

That is the whole point: path traversal is **structurally impossible rather
than filtered**, and there is no filename to sanitise. A sanitiser is a
blocklist that must anticipate traversal sequences, control characters, null
bytes, reserved device names, Unicode normalisation collisions, and
case-insensitive clashes — and it stays wrong until the last one is found.

The two namespaces carry the public/restricted classification, because
`media_assets` has no privacy column and one is not being invented:

- `media` — portfolio images, publicly addressable **by key**.
- `resumes` — **never addressable by key**; the public site will resolve the
  current, visible résumé through `is_current`/`is_visible`, so un-publishing
  one actually stops serving it.

**The filename is used for nothing.** It is not persisted (no column exists),
not part of the key, and not consulted for validation — the sniffed bytes
decide the type.

### The test fake — `apps/admin/src/lib/storage/memory-storage.ts`

In-memory, with one-shot fault injection on every operation. **This is why
the contract is a structural interface at all**: the compensation paths the
media service will need — put succeeded then the D1 insert failed; the D1
delete succeeded then the object delete failed — are unreachable without
injectable failure.

Written in TypeScript rather than left as a `.mjs` helper so `tsc` proves it
satisfies `ObjectStorage`. A fake that has drifted from the contract is worse
than no fake: every test built on it keeps passing while describing something
that cannot happen. The suite also asserts **no application source file
imports it**, so it cannot quietly become a second storage backend.

### Storage foundation verification

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** (exit 0) — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** (exit 0) — **2888 real checks** |
| `pnpm build` | **PASS** (exit 0) — admin routes unchanged, all still `ƒ (Dynamic)` |

New suite: **storage foundation, 240 checks**. Subtotals: database **297**
(unchanged — `packages/database` was not touched) and admin **2591**.

The suite shipped at 234 and gained **6** in a follow-up hygiene fix: two of
its fixtures held **literal NUL bytes**, which made Git classify the whole
JavaScript file as binary. The source now uses escapes, and the added checks
assert the fixtures still carry **real** NUL characters at runtime — so the
repair cannot be "finished" by quietly removing them.

**The fake is kept honest by real storage.** The same suite runs the contract
against a **real local simulated R2** created by `getPlatformProxy()` from a
throwaway config in a temp directory, and every semantic the fake claims is
observed there first: missing `get`/`head` return `null`, deleting a missing
key resolves rather than throwing, `put` overwrites silently, and a generated
key is accepted verbatim. It also compiles Cloudflare's own **`R2Bucket`
against `ObjectStorage`** using Wrangler-generated types, so "a real bucket
satisfies this" is proven rather than hoped for.

**No committed configuration file was read or written for any of that, no
bucket was created, nothing went over the network, and CI needs no Cloudflare
credentials.** The temp directory is deleted afterwards.

### Stale phase-gating instructions, corrected

The audit reported that `CLAUDE.md` and
`.claude/skills/cloudflare-d1-r2/SKILL.md` still described Phase 1A and told
future sessions **"Do not write D1/R2/Cloudflare-specific code in this
phase"** — which directly contradicts Phase 9 and had already been false
since Phase 4. Both were corrected with targeted edits, not rewritten:

- `CLAUDE.md` — the phase summary now says Phase 9 and points at
  `PROJECT_STATE.md` as the source of truth; the D1/R2 prohibition is
  replaced by the rules that actually apply now (repository layer, both
  fail-closed seams, local-only Cloudflare work). **Every security and
  architecture rule was preserved**, and two were made stronger by naming the
  storage seam explicitly.
- The skill — status corrected to "D1 implemented, R2 foundation only, no
  bucket", with the current contract, seam, policy, and the list of what is
  still unbuilt.

## Projects and Technologies partial-update fix (COMPLETE, merged)

The defect the Phase 9 audit found, now repaired **and merged** as
`89f67f8 fix: preserve project and technology partial updates`, verified by
**Pull Request #37 on GitHub Actions/Linux** and again by the **post-merge
`main` CI run `31246283285`**. It moved the baseline **2488 → 2648**; every
one of the 2488 previous checks still passed.

### Root cause

`projectUpdateSchema` and `technologyUpdateSchema` were derived with
`.partial()` from create shapes carrying `.default()`. In Zod 4, `.partial()`
makes a key optional but does **not** remove its default, so an absent key is
still materialised. Measured before the fix:

```
projectUpdateSchema.parse({ title: "Only the title" })   => 11 keys
projectUpdateSchema.parse({})                            => 10 keys
technologyUpdateSchema.parse({ name: "TypeScript 5" })   =>  2 keys
```

Two layers then acted on values the caller never sent. The repository's patch
allowlist wrote the scalars, and `applyRelations` **cannot distinguish a
materialised `[]` from a caller deliberately clearing a collection**, so it
replaced links, technologies, and media wholesale.

Measured blast radius, through the real authenticated `updateProjectAction`
against real local D1, from a payload naming only `title`:

| Field | Before | After |
| --- | --- | --- |
| `status` | `published` | **`draft`** |
| `isFeatured` | `true` | **`false`** |
| `position` | `9` | **`0`** |
| `description`, `periodLabel`, `startedOn`, `completedOn` | set | **`null`** |
| `project_links` | 2 | **0** |
| `project_technologies` | 1 | **0** |
| `project_media` | 1 | **0** |

The action **redirected as though it had succeeded**. For technologies, a
rename cleared `category`.

### Why the existing tests missed it

Both suites asserted the wrong thing, in the same two ways.

- **Parse success instead of parse content.** `projects-tests.mjs` asked only
  *"does a single-field update parse?"* — which was true before and after. It
  never counted the keys.
- **A field that could not fail.** Its `untouched fields are preserved` check
  inspected `summary`, the one nullable-ish field with **no default**, so it
  passed while the bug was live. Technologies' equivalent checked
  `partial.data?.slug === undefined` — also default-free. **`category`, the
  one field that did have a default, was never checked.**
- **The repository was tested, but the schema was bypassed.**
  `technologies-tests.mjs` did prove that a name-only *repository* patch
  preserves `category` — and it does. The repository was never broken. The
  patch has to arrive **through the schema** for the defect to appear, and no
  test did that.

### The fix

**Schema-only, in two files.** Both update shapes are now written out
explicitly with `.optional()` fields and **no defaults**, following the
pattern education established and timeline was repaired to: leaf schemas
declared once without defaults, the create shape adding `.default(...)`, the
update shape adding `.optional()`.

**No repository, action, migration, or UI change was needed**, and none was
made. `buildPatch` already skips `undefined` values, and `applyRelations`
already guards each collection on presence — both were correct all along and
were simply being fed a patch that lied about what the caller sent. Verified
after the fix: a single-field parse yields exactly one key, and an empty
parse yields zero.

### Project and technology update semantics now guaranteed

- **Omitted scalar** → persisted value preserved. `status`, `isFeatured`, and
  `position` are no longer reset by an edit that does not mention them.
- **Omitted collection** → `links`, `technologyIds`, and `media` stay absent,
  so the relationship is left entirely alone.
- **Explicit `[]`** → still a deliberate clear, still applied.
- **Explicit falsy** → `position: 0` and `isFeatured: false` are real edits.
- **Explicit `null`** → still a deliberate clear on every nullable scalar,
  including `technologies.category`.
- **Create is unchanged** and still applies all its defaults, asserted
  directly in both suites so the fix cannot have leaked optionality into it.

### The `.partial()` sweep

Every exported update schema was **measured**, not read: a one-field parse
and an empty parse against all ten. Before the fix, exactly two materialised
extra keys (projects and technologies); the other eight were already clean.
After the fix, **all ten produce exactly one key from a one-field patch and
zero from an empty one.** No live `.partial()` call remains anywhere in
`packages/schemas` — the five remaining mentions are documentation.

`profileSaveSchema` is deliberately excluded: it is a **full save**, not a
patch, so materialising all seven fields is its correct behaviour.

### Regression coverage added

**+160 checks**, all of which fail against the pre-fix code — verified by
temporarily restoring the old schemas and re-running:

| Suite | Was | Now | Fails pre-fix |
| --- | --- | --- | --- |
| Projects CMS | 96 | **185** | **23 checks** |
| Technologies CMS | 90 | **112** | **4 checks** |
| Server Action authorization | 562 | **611** | **8 checks** |

The persisted-state fixtures deliberately set **every default-bearing field
to a non-default value** — published, featured, position 7/9, populated
description and dates, plus a link, a technology tag, and a `project_media`
attachment — because those are exactly the fields the old parse would have
overwritten. `summary` is still asserted, but only alongside the others,
never as the proof.

### Browser verification was not required, and why

**No UI behaviour changed.** Both edit forms build a complete payload —
`project-form.tsx` sends all thirteen fields on every submit and
`technology-form.tsx` all three — so no browser flow could ever produce the
partial payload that triggered this, which is precisely why the defect
survived two merges unnoticed. The unsafe surface is the **exported Server
Action contract**, reachable by any caller that posts a partial payload, and
that is what the new action-level suite exercises directly against real local
D1. Inventing a fake partial-submit browser flow would have proved nothing
that the real action call does not already prove. No component, form, route,
or style was touched.

## Phase 9 — R2/media (audit and architecture — merged)

**Status: merged** as `e3321d7 docs: document phase 9 media foundation`. Its
blocker was fixed and merged (above), and the storage foundation it designed
is now implemented (above). What follows is the audit record.

**Phase 8 — Remaining CMS is COMPLETE**, merged and CI-verified on `main`
(`91334d1 docs: mark sections CMS and phase 8 complete`, Pull Request #35,
post-merge `main` CI run `31243357467`). Baseline at closure: **2488 real
checks**.

Phase 9 has started with an **audit-and-architecture pass only**. No R2
bucket exists, no binding is configured, no object storage code was written,
and no media CMS surface was built. What this pass produced is the
implementation plan recorded below and in `ARCHITECTURE.md`, `DATABASE.md`,
`DECISIONS.md`, `TESTING.md`, and `DEPLOYMENT.md`.

**The audit found a cross-cutting defect in already-merged code and stopped
rather than fixing it** — see *Blocker: partial project and technology
updates* below. **It has since been repaired** in its own task; the fix and
its evidence are recorded under *Projects and Technologies partial-update
fix* above, and the blocker section below is retained as the audit record of
how it was found.

- **Technologies CMS: COMPLETE.** Merged into `main` as
  `97d6425 feat: add technologies CMS`, verified by **Pull Request #14 on
  GitHub Actions/Linux** and again by the **post-merge `main` CI run
  `31084430634`**.
- **Profile CMS: COMPLETE.** Merged into `main` as
  `f2ff5c3 feat: add profile CMS`, verified by **Pull Request #16 on
  GitHub Actions/Linux** and again by the **post-merge `main` CI run
  `31094360487`**.
- **Timeline / professional experience CMS: COMPLETE.** Merged into `main`
  as `aae6d38 feat: add timeline CMS`, verified by **Pull Request #18 on
  GitHub Actions/Linux** and again by the **post-merge `main` CI run
  `31100867892`**.
- **Admin populated-list horizontal-overflow regression: COMPLETE.** Merged
  into `main` as `6d65504 fix: contain admin table overflow`, verified by
  **Pull Request #20 on GitHub Actions/Linux** and again by the
  **post-merge `main` CI run `31104352259`**. See *Responsive overflow
  regression* below.
- **Education CMS: COMPLETE.** Merged into `main` as
  `99e59cd feat: add education CMS`, verified by **Pull Request #22 on
  GitHub Actions/Linux** and again by the **post-merge `main` CI run
  `31110395395`**.
- **Timeline partial-update regression fix: COMPLETE.** Merged into `main`
  as `c345131 fix: preserve timeline partial updates`, verified by **Pull
  Request #24 on GitHub Actions/Linux** and again by the **post-merge
  `main` CI run `31155349531`**. **Timeline CMS itself remained COMPLETE
  throughout**; this was a post-merge repair, not outstanding feature work.
  See *Timeline partial-update regression* below.
- **Certifications CMS: COMPLETE.** Merged into `main` as
  `c1b153d feat: add certifications CMS`, verified by **Pull Request #26 on
  GitHub Actions/Linux** and again by the **post-merge `main` CI run
  `31161985127`**. `main` is clean and synced after the merge. See
  *Phase 8 — Certifications CMS* below.
- **Skills CMS: COMPLETE.** Merged into `main` as
  `f138280 feat: add skills CMS`, verified by **Pull Request #28 on
  GitHub Actions/Linux** and again by the **post-merge `main` CI run
  `31171449984`**. `main` is clean and synced after the merge. Both the
  implementation review and the pre-merge copy correction were accepted. See
  *Phase 8 — Skills CMS* below.
- **Tools CMS: COMPLETE.** Merged into `main` as
  `3f15349 feat: add tools CMS`, verified by **Pull Request #30 on
  GitHub Actions/Linux** and again by the **post-merge `main` CI run
  `31178459051`**. `main` is clean and synced after the merge. See
  *Phase 8 — Tools CMS* below.
- **Socials CMS: COMPLETE.** Merged into `main` as
  `1d26dbd feat: add socials CMS`, verified by **Pull Request #32 on
  GitHub Actions/Linux** and again by the **post-merge `main` CI run
  `31192174164`**. `main` is clean and synced after the merge. See
  *Phase 8 — Socials CMS* below.
- **Sections CMS: COMPLETE.** Merged into `main` as
  `5402186 feat: add sections CMS`, verified by **Pull Request #34 on
  GitHub Actions/Linux** and again by the **post-merge `main` CI run
  `31204188654`**. `main` is clean and synced after the merge. The **last of
  the nine Phase 8 areas**. See *Phase 8 — Sections CMS* below.
- **Phase 7:** Complete (merged to `main`, CI green).
- **Phase 9 — R2/media: IN PROGRESS, audit and architecture only.** The
  media domain has been audited against migration `0001` and the committed
  repositories, and an implementation plan is recorded. **No R2 bucket,
  binding, adapter, service, upload handler, or CMS surface exists.** No
  Cloudflare resource was created or mutated.

Unchanged and still outstanding: the **remote `portfolio-cms` schema
remains unapplied**, **Cloudflare Access dashboard configuration remains
pending**, and the **production OpenNext D1 provider remains deferred to
Phase 22** (fail-closed until then).

## Active task

**Phase 9 media service.** Implemented and verified locally on
`feat/media-service`; awaiting review, merge, and post-merge `main` CI.
**Phase 9 is not complete** — every CMS surface above this layer, the upload
Server Action, and public delivery remain unbuilt.

## Phase 9 — R2/media (audit record)

### Blocker: partial project and technology updates

**Discovered during this audit, in already-merged code. Reported, not fixed
in the audit pass** — the task's scope rules required stopping rather than
expanding into completed CMS areas. **Now fixed in a dedicated task** — see
*Projects and Technologies partial-update fix* above for the repair, the
`.partial()` sweep across all ten update schemas, and the regression
coverage. What follows is the audit record as written at discovery.

`docs/ARCHITECTURE.md` states the project rule: *"Update shapes must not be
derived with `.partial()` when fields carry `.default()`."* Two modules still
violate it:

```
packages/schemas/src/projects.ts:130      projectUpdateSchema     = projectCreateSchema.partial();
packages/schemas/src/technologies.ts:73   technologyUpdateSchema  = technologyCreateSchema.partial();
```

This is the **same defect class** as the timeline partial-update regression
fixed in `c345131`. It was measured, not inferred. Calling the **real,
unmodified `updateProjectAction`**, authenticated, against **real local D1**,
with a payload mentioning only `title`:

| Field | Before | After a title-only update |
| --- | --- | --- |
| `status` | `published` | **`draft`** |
| `isFeatured` | `true` | **`false`** |
| `position` | `7` | **`0`** |
| `description` | prose | **`null`** |
| `periodLabel` / `startedOn` / `completedOn` | set | **`null`** |
| `project_links` | 1 | **0** |
| `project_technologies` | 1 | **0** |
| **`project_media`** | **1** | **0** |

The action reported success and redirected. `projectUpdateSchema.parse({
title })` yields **11 keys**, including `media: []`, `links: []`, and
`technologyIds: []`; `applyRelations` treats a defaulted `[]` as "replace
with nothing", so `setMedia`, `setLinks`, and `setTechnologies` all wipe.
`coverMediaId` survived only because it is absent from the schema entirely
— which is itself a gap, see below.

Technologies is the milder case: `technologyUpdateSchema.parse({ name })`
returns `{ name, category: null }`, so **renaming a technology silently
clears its category**.

**Why the existing suites did not catch it.** `projects-tests.mjs:222`
asserts only that a single-field update *parses* (`partial.success`), never
what the parsed patch contains; `projects-tests.mjs:377` checks that
`summary` survives, and `summary` carries no default, so it passes for the
wrong reason. The `.partial()`-safety group added for every entity from
Education onward was never retrofitted to Projects or Technologies. This is
`LEARNING.md`'s own lesson — *"the test caught it because it asserted
persisted state, not parse success"* — reappearing in the two modules
written before that lesson existed.

**Why it blocks Phase 9 specifically.** `project_media` is the attachment
table the media CMS is built on. Shipping media attachment onto an update
path that silently detaches every asset would make the defect user-visible
for the first time, and would look like Phase 9 broke it.

**Not reachable through the admin UI today**, because the project form
always submits the complete object — exactly as with the timeline
regression. The exported Server Action contract is what is unsafe.

### Audited media schema — read from migration `0001`, not from docs

```
media_assets
  id TEXT PK
  | storage_key  TEXT NOT NULL UNIQUE   -- "Object key within the R2 bucket"
  | content_type TEXT NOT NULL
  | byte_size    INTEGER NOT NULL CHECK (byte_size >= 0)
  | width        INTEGER CHECK (width  IS NULL OR width  > 0)
  | height       INTEGER CHECK (height IS NULL OR height > 0)
  | checksum     TEXT
  | alt_text     TEXT
  | created_at | updated_at
-- no index beyond the PK and the UNIQUE on storage_key

resumes
  id TEXT PK | label TEXT NOT NULL
  | media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT
  | is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0,1))
  | is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1))
  | created_at | updated_at
UNIQUE INDEX idx_resumes_single_current ON (is_current) WHERE is_current = 1
INDEX idx_resumes_media_asset ON (media_asset_id)

project_media
  id TEXT PK
  | project_id     TEXT NOT NULL REFERENCES projects(id)      ON DELETE CASCADE
  | media_asset_id TEXT NOT NULL REFERENCES media_assets(id)  ON DELETE RESTRICT
  | caption TEXT
  | position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0)
  | created_at                      -- no updated_at
  UNIQUE (project_id, media_asset_id)
INDEX idx_project_media_project_position ON (project_id, position)
INDEX idx_project_media_asset            ON (media_asset_id)
```

**Every foreign key pointing at `media_assets` — four, and they disagree:**

| Referrer | Column | Nullable | Delete rule |
| --- | --- | --- | --- |
| `resumes` | `media_asset_id` | NOT NULL | **RESTRICT** |
| `project_media` | `media_asset_id` | NOT NULL | **RESTRICT** |
| `projects` | `cover_media_id` | nullable | **SET NULL** |
| `site_settings` | `social_image_id` | nullable | **SET NULL** |

**`media_assets` references nothing** — there is no foreign key out of it.

**This asymmetry is the single most important audit finding for delete
design.** Two referrers block a delete; two silently clear their pointer. So
"did the delete throw?" does **not** answer "was it safe to delete?" — an
asset used only as a project cover deletes successfully and silently removes
that cover. The media service must pre-check `cover_media_id` and
`social_image_id` itself, because the database will not.

**Settings and profile:** `site_settings.social_image_id` is the only
settings-side media reference. **`profile` has no media column at all** — no
avatar, no photo — so no profile media surface can be built without a
migration, and none is planned.

### Columns that do not exist, and what follows

- **No original/display filename column.** Nothing in `media_assets` can
  hold the uploaded filename or a human label. The uploaded filename is
  therefore used for **nothing persistent** in the plan below. Giving the
  media library a human-readable name requires a migration `0002` adding
  `original_filename` — **a decision deliberately left open, not taken.**
- **No privacy, kind, or visibility column.** D1 cannot mark an asset
  public or private, which is why the plan classifies objects by **storage
  key prefix** instead — the only classification available without a
  migration.
- **No variant, parent, or derived-image column**, and `storage_key` is
  UNIQUE per row, so responsive variants cannot be modelled as extra rows.
  Phase 9 therefore stores originals only.
- **`alt_text` is nullable, though its migration comment says "Required for
  images".** The comment states an intent the constraint does not enforce.
  The rule is real and must be enforced in the validation layer; it is not
  a guarantee the database provides. Recorded in `DATABASE.md`.

### What already exists — no invention required

| Piece | State |
| --- | --- |
| `MediaAsset` / `Create` / `Update`, `Resume` / `Create` / `Update`, `ProjectMediaItem` / `Input` | present in `@portfolio/types` |
| `createMediaAssetRepository` → **`repos.media`** | present, decodes all ten columns, `getById` / `getByStorageKey` / `list` / `create` / `update` / `delete` |
| `createResumeRepository` → **`repos.resumes`** | present, including `getCurrent()` and a batched `makeCurrent()` |
| `project_media` access | owned by the **project aggregate** — `setMedia` / `listMedia`, one `db.batch()`, no standalone repository |
| `storage_key` immutability | already enforced — `MEDIA_PATCH` omits it, so no update can rewrite it |
| Repository coverage | media and résumé lifecycles, cascade, and `ON DELETE RESTRICT` already tested in the database suite |

**`storage_key` being both UNIQUE and unpatchable means the metadata
uniqueness authority already exists and is already correct.** Nothing in
`packages/database` needs to change for Phase 9's core flow.

### What is missing

- No R2 binding, adapter, or storage seam anywhere in the repository.
- No storage-key generator, MIME policy, byte-size policy, or upload schema.
- No media service, no upload Server Action, no media CMS routes; navigation
  still shows **Media** as `availableIn: "Phase 9"`.
- **`coverMediaId` is absent from `projectCreateSchema`/`projectUpdateSchema`
  entirely**, so the CMS cannot set a project cover even though the column
  and the repository patch spec both support it.
- `.env.example` still lists `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` /
  `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` under "reserved for future
  phases". **The recommended architecture needs none of them** — a Workers
  R2 binding requires no credentials. Those names should be removed rather
  than filled in.

### Selected architecture — summary

Full rationale in `ARCHITECTURE.md` and `DECISIONS.md`.

- **Private bucket, delivery through the application.** No public bucket
  access, no presigned URLs, no S3 credentials. Public images are served by
  a cacheable app route; the current résumé is served from its own stable
  path so its object key is never exposed.
- **Binding seam mirroring `binding.ts`** — `setAdminStorageProvider()`,
  fail-closed in production until Phase 22, local `getPlatformProxy()` for
  development, structural `R2Like` interface so no Cloudflare package is
  imported.
- **Storage keys are server-generated**: `{prefix}/{uuidv7}.{ext}`, where
  the prefix classifies public vs restricted, the id comes from the existing
  `runtime.newId()`, and the extension is derived from the **sniffed** MIME
  type. Never the uploaded filename, never client-supplied.
- **R2 first, then D1, on create; D1 first, then R2, on delete** — so a
  failure can only ever leave a harmless orphan object, never metadata
  pointing at a missing file.
- **Allowlist: PNG, JPEG, WebP for images; PDF for résumés. SVG excluded**,
  because nothing in the committed schema attaches a logo to a tool or
  technology, so no product requirement for it exists yet.
- **Replacement never mutates an object or reuses a key** — a new object is
  a new asset row, and the referrer is repointed.

### Verification actually performed in this pass

Documentation-only, so the full suite was deliberately not re-run. What was
run:

| Check | Result |
| --- | --- |
| Migration `0001` read in full as the authoritative source | done — 434 lines |
| `projectUpdateSchema` single-field parse, measured | **11 keys materialised** |
| Real `updateProjectAction` against real local D1, authenticated | **10 fields/relationships silently reset** |
| `technologyUpdateSchema` single-field parse, measured | `category` forced to `null` |
| `git diff --check` | clean |
| Scope, secret, and encoding checks on edited Markdown | clean |

The diagnostic probes were scratchpad-only and are **not** committed.

## Phase 8 — Sections CMS (COMPLETE)

The last Phase 8 entity, and the only one whose primary key-like column is
**immutable after creation**.

### Persisted schema — read from migration `0001`

```
sections
  id TEXT PK
  | key TEXT NOT NULL UNIQUE      -- "Stable machine key the UI maps to a
  |                                   component, e.g. 'projects'"
  | title TEXT NOT NULL
  | subtitle TEXT | eyebrow TEXT
  | position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0)
  | is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1))
  | created_at | updated_at
INDEX idx_sections_visible_position ON (is_visible, position)
```

**No foreign keys in either direction** — nothing references `sections` and
it references nothing, so a delete removes exactly one row. There is **no
route, component, icon, page, slug, anchor, description, layout, variant,
theme, animation, background, 3D-settings, or media column**, so the CMS
exposes none. Migration `0001` was **not edited** and **no `0002` created**.

### The machine-key contract — the defining constraint of this slice

`key` is what the public UI maps to a component. Three layers already agreed
on that before this slice existed, and none of them was changed:

| Layer | How it enforces immutability |
| --- | --- |
| Migration | `key TEXT NOT NULL UNIQUE`, with the comment naming its purpose |
| `SectionUpdate` (`@portfolio/types`) | omits `key` entirely |
| `createSectionRepository` patch allowlist | omits `key`, commented *"renaming it silently would break rendering"* |

The CMS adds the fourth layer: **`sectionUpdateSchema` has no `key` member
and is `.strict()`, so an update carrying `key` is rejected**, not
accepted-and-discarded. That distinction is the whole point — a silently
dropped field reads to the caller as a rename that succeeded and did
nothing. Same stance the Skills slice took with `categoryId`.

The edit UI renders the key in a `<dl>` as read-only context with a sentence
explaining why it cannot change — **not** a disabled or `readonly` input,
which would still look like a control that could be enabled. The edit
payload omits `key` entirely.

**Key grammar is reused, not invented.** `docs/DATABASE.md` lists
`sections.key` under its **Slugs** heading beside `projects`,
`technologies`, and `skill_categories`, and the migration's own example
(`projects`) is that exact shape — so it uses the shared `slugSchema` rather
than a fourth grammar. **No enum**: the schema defines no closed set, so
restricting the CMS to today's components would invent a constraint the
database does not have and block adding a section before its component
ships. Uniqueness stays the database's; a duplicate create surfaces as a
safe conflict.

### Routes

```
apps/admin/src/app/(protected)/sections/
  page.tsx        list — every section, hidden ones badged
  new/page.tsx    create (key editable, once)
  [id]/page.tsx   edit (key read-only) + delete
```

All three go through `withAdminPage`, so the Phase 6 recursive invariant
discovered them automatically — the foundation suite grew 118 → **125**
without the invariant being touched. All three use **static** metadata.
Navigation's last "Phase 8" placeholder became a real link, so every Content
entry is now live and only Phase 9+ items remain unavailable.

### Repository — unchanged

`createSectionRepository` **already existed**, already decoded all nine
committed columns, already provided `getByKey()`, and was already exposed as
**`repos.sections`**. **No repository contract changed and
`packages/database` was not touched**, so the database subtotal is unchanged
at **297**. `getByKey()` is exercised by the CMS suite — a section is
addressable by key, an unknown key returns `null`, and after a delete the
key stops resolving and becomes claimable again.

### Public rendering is NOT part of this slice

This is the Admin/data CMS only. `apps/web` was not touched: no section is
rendered publicly and no component mapping was wired. That remains future
work, and the `key` contract is what makes it possible later.

## Phase 8 — Socials CMS (COMPLETE)

### Persisted schema — read from migration `0001`, not from prior docs

```
social_links
  id TEXT PK | label TEXT NOT NULL | platform TEXT NOT NULL
  | url TEXT NOT NULL
  | position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0)
  | is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1))
  | created_at | updated_at
INDEX idx_social_links_visible_position ON (is_visible, position)
```

**No UNIQUE constraint, and no foreign key in either direction** — nothing
references `social_links` and it references nothing. There is **no username,
handle, icon, icon key, logo, colour, category, follower count,
verification flag, or slug column**, so the CMS exposes none.
`migrations/0001_initial_schema.sql` was **not edited** and **no migration
`0002` was created**.

This is the first CMS entity with **no nullable columns at all**: `label`,
`platform`, and `url` are each `NOT NULL`, so nothing here normalises to
`null`.

### `platform` is free text, deliberately

The column is plain `platform TEXT NOT NULL` — no CHECK, no enum, no lookup
table. The schema validates presence and length and **nothing else**, and the
form renders a plain labelled text input rather than a `<select>`. A
vocabulary here (GitHub / LinkedIn / X / …) would be inventing a constraint
the database does not have: it would reject values the schema permits and go
stale as platforms appear and disappear. Asserted in both directions — eleven
arbitrary values accepted (including Cyrillic, Japanese, and punctuation),
while empty, whitespace-only, and over-long are still rejected, so "free
text" does not mean "unvalidated".

### `url` is NOT NULL, so it takes the REQUIRED shared policy

`httpUrlSchema` from `internal/url.ts` — not the nullable variant
certifications and tools use. Blank is a validation error rather than "no
link", and an update may change the URL but **never clear it**. The shared
helper itself was not modified.

### Routes

```
apps/admin/src/app/(protected)/socials/
  page.tsx        list — every link, hidden ones badged
  new/page.tsx    create
  [id]/page.tsx   edit + delete
```

All three go through `withAdminPage`, so the Phase 6 recursive invariant
discovered them automatically — the foundation suite grew 111 → **118**
without the invariant being touched. All three use **static** metadata.
Navigation gained one **Social links** entry.

### Repository — unchanged

`createSocialLinkRepository` **already existed**, already decoded all eight
committed columns, and was already exposed on the factory as
**`repos.socialLinks`** (not `repos.socials` — the property name was checked
rather than assumed). **No repository contract changed and
`packages/database` was not touched**, so the database subtotal is unchanged
at **297**.

### External-link rendering

The list renders `url` as a real anchor with `target="_blank"` and
`rel="noopener noreferrer"`, and an accessible name that identifies the link
and its platform. **Nothing is fetched from the stored URL server-side** — no
favicon, no OpenGraph, no remote metadata.

## Phase 8 — Tools CMS (COMPLETE)

The simplest slice in Phase 8 so far: a flat ordered entity needing **no new
architecture, no repository change, and no migration**.

### Persisted schema — read from migration `0001`, not invented

```
tools
  id TEXT PK | name TEXT NOT NULL UNIQUE | purpose TEXT | url TEXT
  | position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0)
  | is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1))
  | created_at | updated_at
INDEX idx_tools_visible_position ON (is_visible, position)
```

| Aspect | Column |
| --- | --- |
| Required | `name` (and it is **UNIQUE**) |
| Nullable | `purpose`, `url` |
| Ordering | `position`, non-negative |
| Visibility | `is_visible` |
| Timestamps | `created_at`, `updated_at` |

There is **no slug, icon, category, version, or relationship column**, so the
CMS exposes none. Nothing references `tools` and `tools` references nothing —
no foreign keys in either direction, so a delete removes exactly one row.
`migrations/0001_initial_schema.sql` was **not edited** and **no migration
`0002` was created**.

**`name` being UNIQUE is the one constraint that produces conflicts**, on
both create and rename. Uniqueness stays the database's: an
application-level "is this taken?" check is a race the constraint already
wins, so the action passes the validated payload straight through and
translates the resulting `ConflictError` into human wording.

### Routes

```
apps/admin/src/app/(protected)/tools/
  page.tsx        list — every tool, hidden ones badged
  new/page.tsx    create
  [id]/page.tsx   edit + delete
```

All three go through `withAdminPage`, so the Phase 6 recursive invariant
discovered them automatically — the foundation suite grew 104 → **111**
without the invariant being touched. All three use **static** metadata.

Navigation gained a real `/tools` link, replacing its "Phase 8" unavailable
entry. It stays a **separate** entry from Skills: nothing in the schema
relates the two tables, so folding them under one label would imply a
relationship that does not exist.

### Repository — unchanged

`createToolRepository` **already existed** in
`packages/database/src/repositories/content.ts`, already decoded all eight
committed columns, and was already exposed as `repos.tools`. **No repository
contract changed and `packages/database` was not touched**, so the database
subtotal is unchanged at **297** and no repository-package tests were added.

### Validation

`@portfolio/schemas` gained `tools.ts`. `.strict()` on both shapes, so `id`,
`createdAt`, `updatedAt`, and unknown fields are rejected. Create applies
defaults; update declares `.optional()` fields with **none** — the rule
education established and the timeline regression paid for, applied from the
outset.

`url` refines against `nullableHttpUrlSchema` from `internal/url.ts` — the
**third** consumer of the shared http(s) policy after projects and
certifications, imported rather than copied. Blank input normalises to
`null`, for both `purpose` and `url`.

### The tool link

The list renders `url` as a real anchor with `target="_blank"` and
`rel="noopener noreferrer"`, falling back to `—`. That anchor is exactly the
sink the protocol allowlist protects, which is why the rejection of
`javascript:`, `data:`, `file:`, `mailto:`, `ftp:`, protocol-relative, and
bare-hostname values is asserted at both the schema and real-action layers.

## Phase 8 — Skills CMS (COMPLETE)

The first Phase 8 area with **two entities and a foreign key the editor
chooses**.

### Persisted schema — read from migration `0001`, not invented

```
skill_categories
  id TEXT PK | name TEXT NOT NULL | slug TEXT NOT NULL UNIQUE
  | description TEXT
  | position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0)
  | is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1))
  | created_at | updated_at
INDEX idx_skill_categories_visible_position ON (is_visible, position)

skills
  id TEXT PK
  | category_id TEXT NOT NULL REFERENCES skill_categories(id) ON DELETE RESTRICT
  | name TEXT NOT NULL
  | proficiency INTEGER CHECK (proficiency IS NULL OR proficiency BETWEEN 1 AND 5)
  | position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0)
  | is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1))
  | created_at | updated_at
  UNIQUE (category_id, name)
INDEX idx_skills_category_position ON (category_id, position)
```

**`skills` has no slug, description, URL, icon, or colour column**, so the
CMS exposes none — and the module imports no URL helper, because neither
table stores a URL. `migrations/0001_initial_schema.sql` was **not edited**
and **no migration `0002` was created**.

### Category deletion — the constraint is surfaced, never worked around

`skills.category_id` is `ON DELETE RESTRICT`. Deleting a category that still
holds skills **fails**, and the CMS surfaces that rather than defeating it:
**no child skill is ever deleted to make a parent deletion succeed.** The
chain follows the Technologies precedent — database integrity is real →
repository raises a typed `ConflictError` → the action returns a safe
conflict result → the UI explains what to change.

**The guidance names only operations this CMS supports.** Because a skill
cannot be moved between categories, the in-use copy tells the editor to
*delete* the dependent skills; it does not suggest moving or reassigning
them, which would advertise a control that does not exist. See
*A skill cannot be moved between categories* under known limitations.

### Routes — one coherent area, one nav entry

```
apps/admin/src/app/(protected)/skills/
  page.tsx                     categories with their skills nested
  new/page.tsx                 create skill
  [id]/page.tsx                edit + delete skill
  categories/page.tsx          category list with skill counts
  categories/new/page.tsx      create category
  categories/[id]/page.tsx     edit + delete category
```

**Rationale for nesting categories under `/skills`**: a skill cannot exist
without a category, so they are one editing surface, and two sibling
top-level entries would imply two independent areas. Next.js resolves static
segments ahead of dynamic ones, so `/skills/new` and `/skills/categories` are
unambiguous against `/skills/[id]`. Navigation gains **one** entry, "Skills";
`tools` keeps its own separate unavailable entry.

All six go through `withAdminPage`, so the Phase 6 recursive invariant
discovered them automatically — the foundation suite grew 90 → **104**
without the invariant being touched. All six use **static** metadata.

### Repository — one narrow extension

`createSkillsRepository` already owned both entities. One method was added:
**`getSkillById(id)`** — the admin edit route addresses a skill directly and
has no category in hand, and the alternative (`listWithSkills()` then a
linear scan) reads every category and skill to return one row. The private
helper already existed. Canonical tests live in `packages/database`, so the
**database subtotal moved 287 → 297**.

**`categoryId` was deliberately NOT made updatable.** The repository's patch
allowlist has excluded it since Phase 5 and `SkillUpdate` omits it, because a
move must also resolve the skill's position in the destination and its
`UNIQUE (category_id, name)` collision there. The update schema is
`.strict()` and **rejects** a `categoryId` rather than accepting and ignoring
it, which would look like a move that silently did nothing. The edit page
shows the owning category as read-only text and says so.

### Validation

`@portfolio/schemas` gained `skills.ts` with four shapes — category create /
update and skill create / update — each **declared separately**, create with
defaults and update with `.optional()` and none.

`slug` uses the project's canonical grammar, moved to
`packages/schemas/src/internal/slug.ts` so skill categories became its third
consumer rather than its third copy; `technologies.ts` now imports it too.
**Projects still carries its own identical copy** — out of scope, and
consolidating it is a behaviour-neutral follow-up.

`proficiency` is an integer 1–5 or null, matching the CHECK exactly. **Null
means "not rated", kept distinct from 1 ("lowest")** — the UI renders "Not
rated" rather than a zero.

## Phase 8 — Certifications CMS (COMPLETE)

### Persisted schema — read from migration `0001`, not invented

```
certifications
  id TEXT PK | title NOT NULL | issuer NOT NULL | credential_id
  | credential_url | issued_on | expires_on
  | position NOT NULL DEFAULT 0 CHECK (position >= 0)
  | is_visible NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1))
  | created_at | updated_at

INDEX idx_certifications_visible_position ON (is_visible, position)
```

There is **no issuer logo, media, category, or relationship column**, so the
CMS exposes none. `migrations/0001_initial_schema.sql` was **not edited** and
**no migration `0002` was needed** — the committed schema already supported
the entity completely.

Nothing in the schema references `certifications`, so a delete removes
exactly one row and cascades to nothing.

### Routes

```
apps/admin/src/app/(protected)/certifications/
  page.tsx            list — every certification, hidden ones badged
  new/page.tsx        create
  [id]/page.tsx       edit + delete
```

All three go through `withAdminPage`, so the Phase 6 recursive invariant
discovered them automatically — the foundation suite grew 83 → **90** without
the invariant being touched or special-cased. All three use **static**
metadata; none reads certification data during metadata evaluation.

### Repository — unchanged

`createCertificationRepository` **already existed** in
`packages/database/src/repositories/content.ts`, already decoded every
committed column, and was already wired into `createRepositories()` as
`repos.certifications`. **No repository contract changed and
`packages/database` was not touched**, so the database subtotal is unchanged
at **287** and no repository-package tests were added.

### Validation — and the one shared control

`@portfolio/schemas` gained `certifications.ts`. `.strict()` on both shapes,
so `id`, `createdAt`, `updatedAt`, and unknown fields are rejected. Dates are
`YYYY-MM-DD` with a cross-field rule that `expiresOn` must not precede
`issuedOn`; `position` is a non-negative integer; `isVisible` is a strict
boolean.

**Create and update are written out separately from the start.** This is the
first entity authored after the timeline partial-update regression, so it
never had a `.partial()` phase: create applies defaults, update declares
plain `.optional()` fields with none. Asserted directly — a single-field
patch parses to exactly one key, each unmentioned field is proven absent
rather than defaulted, and explicit `position: 0` / `isVisible: false`
survive as real values.

**The URL rule is shared, not copied.** `credential_url` is the second URL
column in the schema. The http(s) protocol allowlist projects established in
Phase 7 was moved to `packages/schemas/src/internal/url.ts`, and both
modules now refine against the same predicate. **This is the single
deliberate edit to the projects module in this task** — an extraction with
no behavioural change, made because "reuse the established URL rule" cannot
be satisfied by writing a second copy of it. Projects' 96 existing checks
are the regression proof and all still pass. Rationale in `DECISIONS.md`.

Blank optional input normalises to `null` consistently, including the URL.

### Server mutations

Three actions — create, update, delete — each following
`requireAdminIdentity()` → Zod → repository → typed `ActionResult` /
`redirect()`, reusing the existing result model verbatim. Certifications own
no child table and nothing references them, so there is no aggregate write.

### Ordering and visibility

Ordering uses the persisted `position` column via the existing ordered
repository — an explicit validated numeric field. **No drag-and-drop.**

`is_visible` is an explicit labelled checkbox. Hidden certifications stay
listed in the admin with a **Hidden** badge rather than being filtered out;
`visibleOnly` remains for future public reads. **No public rendering was
added** — `apps/web` is untouched, matching every sibling entity.

### The credential link

The list renders `credential_url` as a real anchor with `target="_blank"`
and `rel="noopener noreferrer"`, falling back to the credential ID and then
to `—`. That anchor is precisely the sink the protocol allowlist protects,
which is why the rejection of `javascript:`, `data:`, `file:`, `mailto:`,
`ftp:`, protocol-relative, and bare-hostname values is asserted at both the
schema and real-action layers.

## Timeline partial-update regression — COMPLETE (merged)

**Timeline CMS remains COMPLETE.** This is a post-merge repair of the
exported update contract, not incomplete feature work.

### Root cause

`timelineEntryUpdateSchema` was derived as `timelineEntryFields.partial()`
from a create shape carrying `.default()`. In Zod 4, `.partial()` does
**not** neutralise a default — an absent key is still materialised. Measured
before the fix:

```
timelineEntryUpdateSchema.parse({ summary: "" })
// => 8 keys: summary/location/periodLabel/startedOn/endedOn = null,
//            position: 0, isVisible: true, highlights: []
```

The repository's patch allowlist then wrote those columns. A second defect
compounded it: `updateTimelineEntryAction` passed `(highlights ?? [])` to
`updateWithHighlights`, so the defaulted `[]` became a **highlight
replacement**. A one-field partial update therefore reset the entry's
display order, un-hid it, nulled its optional text and dates, and **deleted
every bullet**.

The admin form always submits the complete object, which is why no browser
flow ever exposed it — but the exported Server Action contract was unsafe.

### The fix

**Schema** — `timelineEntryUpdateSchema` is now written out explicitly with
`.optional()` fields and **no defaults**, mirroring the pattern education
established. Leaf schemas are declared once without defaults; the create
shape adds `.default(...)`, the update shape adds `.optional()`. Measured
after: `parse({ summary: "" })` yields **exactly one key**. The **create
schema is unchanged** and still applies all its defaults, asserted directly.

**Action** — `updateTimelineEntryAction` now distinguishes the three cases
rather than collapsing two of them:

| Payload | Meaning | Path taken |
| --- | --- | --- |
| `highlights` omitted | leave highlights alone | `repos.timeline.update(id, patch)` |
| `highlights: []` | intentionally clear | `updateWithHighlights(id, patch, [])` |
| non-empty `highlights` | replace | `updateWithHighlights(id, patch, …)` |

Auth order is untouched: `requireAdminIdentity()` → Zod → repository.

### Semantics now guaranteed

- **Omitted parent field** → the persisted value is preserved. An omitted
  `position` does not become `0`; an omitted `isVisible` does not become
  `true`; omitted nullable text/dates do not become `null`.
- **Explicit value** → applied, including falsy ones. `position: 0` sets
  zero, `isVisible: false` sets false, `summary: ""` still normalises to
  `null`.
- **Omitted highlights** → existing highlights preserved.
- **Explicit `highlights: []`** → owned highlights intentionally cleared.
- **Explicit non-empty highlights** → replaced, renumbered contiguously
  from zero, through the existing aggregate write.

### Empty patch

An update with no mutable fields and no highlights is a **safe no-op**,
which is the ordered repository's existing behaviour: `buildPatch` reports
an empty clause, so it reads the row back rather than issuing an `UPDATE`.
No malformed SQL, and `updated_at` is deliberately not bumped. Asserted
byte-for-byte at both the CMS-boundary and real-action layers.

### Date cross-field behaviour — unchanged, and documented

`datesAreOrdered` passes when either date is absent, so a patch supplying
only `startedOn` is **not** compared against the persisted `endedOn`. A pure
parser has no access to stored state, and reaching into the database from a
schema would put persistence behind validation. The admin form always
submits both, so the rule still binds every real edit. Cross-checking a
one-sided patch against stored data would belong in the action layer and was
deliberately **not** added — this fix stays minimal.

**Calendar-semantic date validation remains a separate known hardening
item** across projects, timeline, and education. Not touched here.

### Repository — unchanged

No repository API changed and `packages/database` was not touched. Both
methods the fix needs already existed: `update()` from the ordered base for
the parent-only path, and `updateWithHighlights()` for the aggregate path.
The database subtotal is therefore unchanged at **287**, and no repository
tests were added.

Aggregate atomicity is preserved exactly where it applied before: whenever
highlights are supplied, parent and children still go through the single
`db.batch()` write, and the existing forced-failure rollback coverage still
passes.

## Phase 8 — Education CMS (COMPLETE)

### Routes

```
apps/admin/src/app/(protected)/education/
  page.tsx            list — every entry, hidden ones badged
  new/page.tsx        create
  [id]/page.tsx       edit + delete
```

All three go through `withAdminPage`, so the Phase 6 recursive invariant
discovered them automatically — the foundation suite grew 76 → 83 without
the invariant being touched or special-cased. All three use **static**
metadata; none reads education data during metadata evaluation.

### Schema fields used — and deliberately not invented

```
education
  id | qualification NOT NULL | institution NOT NULL | field_of_study
  | summary | period_label | started_on | ended_on
  | position NOT NULL CHECK (>= 0) | is_visible NOT NULL CHECK (0,1)
  | created_at | updated_at
```

There is **no logo, URL, media, institution relationship, grade, or
technology column**, so the CMS exposes none. `position` and `is_visible`
*are* real columns, so both are exposed and validated.
`migrations/0001_initial_schema.sql` was **not edited**; the committed
schema was sufficient and no forward migration was needed.

Nothing in the schema references `education`, so a delete removes exactly
one row and cascades to nothing.

### Repository — unchanged

Education already uses `createOrderedRepository` with `getById`, `list`
(including `visibleOnly`), `create`, `update`, and `delete`. **The
repository contract did not change**, so no repository-package tests were
added — the generic ordered plumbing (position ordering, visibility
filtering) is already proven in Phase 5 via the sections fixtures. The
database subtotal is therefore unchanged at **287**.

### Validation — and a real bug this caught

`@portfolio/schemas` gained `education.ts`. `.strict()` on both shapes, so
`id`, `createdAt`, `updatedAt`, and unknown fields are rejected. Dates are
`YYYY-MM-DD` with a cross-field rule that `endedOn` must not precede
`startedOn`; `position` is a non-negative integer; `isVisible` is a strict
boolean.

**Create and update are written out separately, on purpose.** The first
draft derived the update shape with `.partial()`, matching the sibling
modules — and the local-D1 tests failed. In Zod, `.partial()` does **not**
neutralise `.default()`: a defaulted field is still materialised when its
key is absent. A patch built that way silently carried `position: 0`,
`isVisible: true`, and `null` for every optional, and the repository's
allowlist then wrote them — so editing only the qualification would reset
the entry's display order and un-hide it.

The update shape now declares plain `.optional()` fields with no defaults,
so an absent key stays absent and `buildPatch` skips the column. Asserted
directly: a single-field patch parses to exactly one key, and each
unmentioned field is proven absent rather than defaulted.

**The same latent defect exists in the merged timeline module** — see
*Known limitations*. It was not repaired here.

### Server mutations

Three actions — create, update, delete — each following
`requireAdminIdentity()` → Zod → repository → typed `ActionResult` /
`redirect()`, reusing the existing result model verbatim. Education owns no
child table and nothing references it, so there is no aggregate write.

### Ordering and visibility

Ordering uses the persisted `position` column via the existing ordered
repository — an explicit validated numeric field, matching the timeline
convention. **No drag-and-drop**, and no invented ranking semantics.

`is_visible` is an explicit labelled checkbox. Hidden entries stay listed in
the admin with a **Hidden** badge rather than being filtered out — the
admin view is the editorial view; `visibleOnly` is for public reads.

### Security

Auth runs **before** validation and before the database is composed —
asserted with a provider-consultation counter that stays flat across every
denied call. Unauthenticated create inserts nothing; unauthenticated update
leaves the record byte-identical; unauthenticated delete leaves the row
present. A forged Access assertion is rejected and **does not fall back to
the development identity**. No raw database errors reach the client, no raw
SQL exists in admin actions or pages, and `id`/`createdAt`/`updatedAt` are
never client-managed.

### Responsive rule — applied

Verified in the **populated** state, per the project rule: the existing
AdminShell `min-w-0` plus a positioned (`relative`) horizontal-scroll
wrapper on the list. Internal table scrolling is intentional; page-level
sideways scrolling is not. No global overflow hiding, and no accessible
label or caption removed.

### Public-site boundary — unchanged

`apps/web` was **not touched**. It continues to render Phase 2 placeholder
content, including its own education section. Nothing in the roadmap places
public data integration in this subtask, and no admin-created content was
hardcoded into React.

### Phase 8 — Education CMS — CI

- **Pull Request #22 CI passed** on GitHub Actions/Linux.
- PR #22 was **rebase-merged** into `main` as
  `99e59cd feat: add education CMS`.
- The **post-merge `main` CI run `31110395395` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the merged Education CMS state.

The first `gh run watch` after the merge errored on a **local GitHub CLI
connection timeout** while querying the API; a follow-up
`gh run list --branch main` confirmed the run itself completed
successfully. That was a local network hiccup, **not a CI failure**.

## Responsive overflow regression — COMPLETE

### Root cause

Tailwind's `sr-only` is `position: absolute`, and an absolutely positioned
element is laid out against its nearest **positioned** ancestor. A
`overflow-x-auto` container that is not itself positioned therefore does
**not** contain such a descendant. So a wide list table scrolled correctly
inside its wrapper while its `sr-only` action labels resolved against the
viewport from a cell beyond it, widening the document's scroll area and
scrolling the whole page sideways on a phone.

The shared-shell half — `min-w-0` on `main` — was already fixed during
Timeline and **remains required**: a flex item's automatic minimum size is
its content, so without it a wide table stretches `main` past the viewport
before the wrapper ever receives a constrained width to scroll within. Both
halves are needed; neither alone is sufficient.

### The fix

`relative` added to the existing `overflow-x-auto` wrapper on
`/projects` and `/technologies`, matching what `/timeline` already did.
Two lines of styling. No table redesign, no column changes, no card
conversion, no data or action changes, no navigation changes.

**What was deliberately not used:** global `overflow-x-hidden`, clipping the
page, removing `sr-only` text, shrinking tables until unusable, or hiding
columns on mobile. Each of those hides the symptom by discarding either
accessible content or legibility. The correct fix contains the positioned
descendant instead — the accessible text stays in the DOM and stays
reachable.

### Verification (`playwright-local` MCP, real local D1, seeded rows)

Manual MCP verification — **not** automated Playwright CI tests. Every page
was checked with **at least one real row seeded**, because the empty state
renders no table and passes regardless — which is exactly how this defect
survived two merges.

`/projects` and `/technologies`, populated, at 1280 / 768 / 375: **no
page-level horizontal scrolling at any width.** At 375 specifically, for
both pages:

| Proof | `/projects` | `/technologies` |
| --- | --- | --- |
| Document width ≤ viewport | 375 ≤ 375 ✓ | 375 ≤ 375 ✓ |
| `window.scrollTo(500,0)` moves the page | **no** ✓ | **no** ✓ |
| Wrapper `scrollWidth > clientWidth` | 704 > 343 ✓ | 640 > 343 ✓ |
| Wrapper can actually scroll | ✓ | ✓ |
| Caption + `sr-only` labels still in DOM | 3 `sr-only`, caption present ✓ | 3 `sr-only`, caption present ✓ |
| Row actions keyboard-focusable | ✓ | ✓ |

Keyboard access was checked beyond focusability: focusing the off-screen
**Edit** link scrolled the *wrapper* to reveal it (`scrollLeft > 0`) while
the page itself stayed put (`scrollX === 0`), and the link ended up inside
the viewport.

Regression checks: `/timeline` populated at 375 still has no page-level
sideways scroll and still scrolls internally with its caption intact;
`/profile` is unaffected (document 360 ≤ 375); admin navigation renders all
five real destinations and every link is focusable.

### Automated coverage

The admin foundation suite gained a **horizontal scroll containment**
group (67 → 76 checks). It asserts that every `overflow-x-auto` wrapper in
a protected page is also `relative`, and that the shell's `main` carries
`min-w-0`, with four negative controls proving the check rejects a bare
wrapper and a mixed pair.

This is a structural source assertion, which the project already uses for
the `withAdminPage` invariant and the removed-global scan. It earns its
place here because the defect regressed twice and is invisible to any check
that does not seed rows — a new list page that forgets `relative` now fails
in CI rather than shipping.

**It does not replace real browser verification.** It asserts the structure,
not the rendering; the populated-state MCP checks above remain the evidence
that the pages actually behave correctly.

### Scope — what the fix did not touch

Migrations, `packages/database`, `packages/schemas`, Server Actions,
navigation, `apps/web`, and the GitHub Actions configuration were all
unchanged, as were Cloudflare resources. No remote D1 mutation, no
`--remote`, no Access dashboard change, no OpenNext work, no R2, and no
Education implementation.

### Verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #20
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **980 real checks** |
| `pnpm build` | **PASS** — all admin routes still `ƒ (Dynamic)` |

Suite totals after the fix: database **287** (26 + 59 + 157 + 41 + 4,
unchanged) and admin **693** (42 + **76** + 34 + 96 + 90 + 77 + 110 + 168)
— **980 total**. All 971 previous checks pass; `apps/web` remains the only
no-op suite.

### Responsive overflow regression — CI

- **Pull Request #20 CI passed** on GitHub Actions/Linux.
- PR #20 was **rebase-merged** into `main` as
  `6d65504 fix: contain admin table overflow`.
- The **post-merge `main` CI run `31104352259` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the merged fix.

## Phase 8 — Timeline CMS (COMPLETE)

### Routes

```
apps/admin/src/app/(protected)/timeline/
  page.tsx            list — every entry, with its highlight count
  new/page.tsx        create
  [id]/page.tsx       edit + delete
```

All three go through `withAdminPage`, so the Phase 6 recursive invariant
discovered them automatically — the foundation suite grew 61 → 67 without
the invariant being touched. All three use **static** metadata.

The route path keeps the table's name (`timeline`), while the UI and
navigation say **"Experience"**, matching how the public site and docs
already describe this content.

### Schema fields used — and deliberately not invented

```
timeline_entries
  id | role NOT NULL | organization NOT NULL | summary | location
  | period_label | started_on | ended_on | position | is_visible
  | created_at | updated_at

timeline_highlights
  id | timeline_entry_id → entries ON DELETE CASCADE | content NOT NULL
  | position | created_at
```

There is **no employer logo, URL, technology relationship, media, or extra
date column**, so the CMS exposes none. `is_visible` and `position` *are*
real columns here (unlike technologies), so both are exposed and validated.
`migrations/0001_initial_schema.sql` was **not edited**, and no forward
migration was needed.

### Aggregate ownership — and one narrow repository extension

`timeline_highlights` remains owned solely by the timeline aggregate. No
highlights repository was created, no other repository touches the table,
and no child SQL exists in a Server Action or page.

**The repository gained two methods**, because the existing API could not
offer the guarantee the CMS needs:

```ts
createWithHighlights(input, highlights): Promise<TimelineEntryWithHighlights>
updateWithHighlights(id, patch, highlights): Promise<TimelineEntryWithHighlights>
```

`create()` followed by `setHighlights()` is two round-trips. If the second
failed, the entry would be left persisted with no highlights — a half-saved
aggregate. Both statements now go into **one `db.batch()`**, so parent and
children commit or roll back together. This was not assumed: the repository
suite forces a failing child (a `NULL` bullet against `content NOT NULL`)
and asserts the parent update rolled back with it, `updatedAt` did not
advance, the previous highlights survived intact, and no orphaned parent row
was left behind by a failed create.

Transaction logic stayed in the repository rather than moving into Server
Actions.

### Ordering

Highlight order **is array order**. The form submits an explicit ordered
list and never sends `position`; the repository assigns it from the index,
renumbering contiguously from zero on every write. Nothing depends on DOM
order, and `position` is rejected if a client tries to supply it.

Entry order uses the existing `position` column, validated server-side as a
non-negative integer.

### Validation

`@portfolio/schemas` gained `timeline.ts`. `.strict()` on both the entry and
the highlight object, so `id`, `createdAt`, `updatedAt`, and unknown fields
are rejected — including `position`, `timelineEntryId`, and `createdAt` on a
child row. Dates are `YYYY-MM-DD`, with a cross-field rule that `endedOn`
must not precede `startedOn`; a null `endedOn` is the documented "current
role" case and is always allowed.

Highlights are capped at **40**, an **application-level bound to keep one
aggregate edit reasonably sized** — editorial and defensive, chosen by us. A
role with more than forty bullets is a document rather than a timeline
entry, and the cap stops a single submission from growing the aggregate's
write into an arbitrarily long statement list. **No Cloudflare D1 platform
limit is claimed or implied.**

Child errors are keyed by index (`highlights.1.content`), so the form can
place the message on the offending row.

### Server mutations

Three actions — create, update, delete — each following
`requireAdminIdentity()` → Zod → repository → typed `ActionResult` /
`redirect()`, reusing the existing result model verbatim. **There are no
independent highlight actions**: highlights travel with the entry, which the
test suite asserts by name.

### Form UX

Parent fields sit in labelled sections (Role, Dates and display) with the
Highlights editor visually separated. Highlights support add, edit, remove,
and **reorder via move-up/move-down buttons** — not drag-and-drop. The
design system has no accessible drag implementation, and a pointer-only
reorder would leave keyboard users unable to achieve the same result, so
the accessible control is the only control. Each row's buttons name the
bullet they move, and reorder/add/remove are announced through a polite
`role="status"` region.

### Delete semantics

Two-step confirmation, POST-only, naming the entry **and its highlight
count** before confirming. `ON DELETE CASCADE` removes the owned highlights;
unrelated entries and their highlights are untouched — tested in both the
repository suite and the CMS suite, and re-checked with an orphan query.

### Accessibility

Verified in-browser: every parent control and every highlight control has an
explicit label; field-level and per-child errors render with `aria-invalid`
and `aria-describedby`; a `role="alert"` error summary takes focus on a
failed submission; buttons show a pending state; add / remove / reorder are
fully keyboard operable (a focused **Move up** activated with Enter swapped
the rows and updated the submitted payload); reorder, add, and remove are
announced through a polite `role="status"` region; and the highlight
controls measured **≥ 44px** with none undersized. The form has no page
overflow at 375px.

### Public-site boundary — unchanged

`apps/web` was **not touched**. It continues to render Phase 2 placeholder
content. Nothing in the roadmap places public data integration in this
subtask, and no admin-created content was hardcoded into React.

### Phase 8 — Timeline CMS — CI

- **Pull Request #18 CI passed** on GitHub Actions/Linux.
- PR #18 was **rebase-merged** into `main` as
  `aae6d38 feat: add timeline CMS`.
- The **post-merge `main` CI run `31100867892` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the merged Timeline CMS state.

## Phase 8 — Profile CMS (COMPLETE)

### Route — one, because the entity is a singleton

```
apps/admin/src/app/(protected)/profile/page.tsx
```

No `/profile/new` and no `/profile/[id]`. `profile` is a singleton-key
table whose primary key is pinned to `'singleton'` by a CHECK constraint,
so there is never more than one record and never a choice of which to edit
— a collection-style route shape would imply otherwise.

It goes through `withAdminPage`, so the Phase 6 recursive invariant
discovered it automatically (the foundation suite grew 59 → 61 without the
invariant being touched). Static metadata, never `generateMetadata`: route
metadata evaluates independently of the component, and here the record is
the site owner's name — precisely the wrong thing to leak.

### Schema fields used — and deliberately not invented

The committed `profile` table is:

```
id ('singleton') | full_name NOT NULL | headline NOT NULL | tagline
| bio | location | availability | public_email | created_at | updated_at
```

- **Editable:** `full_name`, `headline` (both required), and the nullable
  `tagline`, `bio`, `location`, `availability`, `public_email`.
- **Repository/database-managed:** `created_at`, `updated_at`.
- **Singleton identity:** `id`, fixed to `'singleton'` and supplied by the
  repository.

There is **no avatar, website, social, or any URL column**, so the CMS
exposes none and there is no URL validation — there would be nothing to
validate. `public_email` is a real column and is checked as an email.
`migrations/0001_initial_schema.sql` was **not edited**; the committed
schema was sufficient and no forward migration was needed.

### Validation

`@portfolio/schemas` gained `profile.ts` with a single `profileSaveSchema`
(`.strict()`), mirroring the existing modules. `id`, `createdAt`, and
`updatedAt` are absent by design, so a payload attempting to supply them —
including an attempt to steer the singleton key — is **rejected outright**.
Blank optional text normalises to `null`, consistent with the projects and
technologies modules. The optional email normalises the empty case to
`null` *before* the format check, so clearing the field is not an error.

### Server mutation — one action, no redirect

`saveProfileAction` follows the established order:
`requireAdminIdentity()` → Zod → repository → typed `ActionResult`. The
existing `ActionResult` was reused verbatim; no second abstraction.

There is no create/update pair and no `id` parameter, because the row's
identity is fixed and `ProfileRepository.upsert()` is the only write.

It **returns** rather than redirecting. The collection actions redirect to
their list because the user has finished with a record; the profile is
edited in place on a single route, so a redirect would target the page the
user is already on. Instead it calls `revalidatePath("/profile")` — so the
server component re-reads the saved row and nothing renders stale — and
returns a `success` result the form uses to confirm.

### Repository — unchanged

The Phase 5 profile repository is used exactly as-is: `get()` returning
`Profile | null`, and `upsert()`. **The repository contract did not
change**, so no repository-package tests were added; the existing Phase 5
singleton coverage already proves upsert-creates-then-updates, `created_at`
preservation, `updated_at` advancing, the CHECK constraint rejecting a
second row, and zero rows being a valid state. The database subtotal is
therefore unchanged at **256**.

`clear()` exists on the repository but is **deliberately not exposed in the
UI** — see *Delete decision* below.

### Empty and configured states

The same screen handles both, changing only what it *says*:

- **Not configured** — an explanatory panel ("No profile has been
  created… there is only ever one profile, so this same screen edits it
  afterwards") and a **"Create profile"** submit label.
- **Configured** — a summary line with the last-updated date and a **"Save
  changes"** label.

The singleton key is never rendered, never submitted, and not in the
payload.

### Delete decision — no destructive UI

`ProfileRepository.clear()` is not surfaced. Deleting the site's identity
is not a routine editorial action, it has no undo, and the schema already
treats zero rows as valid — so nothing is broken by its absence. Adding a
destructive control for it would be offering a footgun for no workflow
anyone asked for. Revisit only if a real need appears.

### Public-site boundary — unchanged, and deliberately

**Profile data now genuinely exists in D1 locally**, created through the
admin. `apps/web` was still **not touched**: it continues to render the
Phase 2 placeholder-driven public profile content, and will until the
roadmap reaches the public data-integration work.

Phase 7 established that public-side conversion is not part of the CMS
slices, and nothing in the roadmap or architecture moves it into this one.
The project rule that admin-editable content ultimately comes from data
still holds — the conversion is simply not this subtask's job, and pulling
it forward would be scope expansion into unreviewed work. **No
admin-created content was hardcoded into React.**

### Navigation

Profile became a real linked destination, replacing its "Phase 8"
placeholder. Every other unbuilt entry stays an unlinked, phase-labelled
placeholder — no dead links.

### Phase 8 — Profile CMS — CI

- **Pull Request #16 CI passed** on GitHub Actions/Linux.
- PR #16 was **rebase-merged** into `main` as
  `f2ff5c3 feat: add profile CMS`.
- The **post-merge `main` CI run `31094360487` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the merged Profile CMS state.

## Phase 8 — Technologies CMS (COMPLETE)

### Routes

```
apps/admin/src/app/(protected)/technologies/
  page.tsx            list — every technology, with project usage
  new/page.tsx        create
  [id]/page.tsx       edit + delete
```

All three go through `withAdminPage`, so the Phase 6 recursive invariant
discovered them automatically — the foundation suite grew 53 → 59 checks
without the invariant being touched, weakened, or special-cased. All three
use **static** metadata, never `generateMetadata`, for the Phase 6 reason:
route metadata evaluates independently of the component, so a metadata
function that read a record would leak it to unauthenticated requests.

### Schema fields used — and deliberately not invented

The committed `technologies` table is:

```
id | name | slug (UNIQUE) | category (nullable) | created_at | updated_at
```

There is **no icon, logo, visibility, or position column**, so the CMS
exposes none. Adding such a control would either silently drop the value or
imply storage that does not exist. `migrations/0001_initial_schema.sql` was
**not edited**, and no forward migration was needed.

### Validation

`@portfolio/schemas` gained `technologies.ts`, mirroring the projects
module: `.strict()` so `id`/`createdAt`/`updatedAt` and unknown fields are
**rejected** rather than dropped; the same slug shape
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`) with **uniqueness left to the database**;
blank `category` normalised to `null` rather than `""`. Types are inferred
with `z.infer`. Persisted-row decoding remains the repository's job.

### Server mutations

Three Server Actions reusing the Phase 7 architecture unchanged —
`requireAdminIdentity()` → Zod → repository → typed `ActionResult` /
`redirect()`. The **existing `ActionResult` model was reused verbatim**; no
second result abstraction was introduced. Every mutation re-authenticates
independently, authorization is never read from a hidden form field, and
`redirect()` is called outside the try/catch.

### Repository

The Phase 5 repositories are used as-is — no parallel data layer, and **no
raw SQL anywhere in admin application code**. The technology repository was
**not extended**; it still owns only the `technologies` table.

One minimal extension was added to the **projects** repository:
`countByTechnology()`, a single grouped query returning technology id →
project count. It lives there because `project_technologies` is owned by
the projects aggregate — see *Repository ↔ table ownership* in
`docs/DATABASE.md`. The admin technologies list **composes** the two
repositories at the page layer:

```ts
const [technologies, usage] = await Promise.all([
  repos.technologies.list(),
  repos.projects.countByTechnology(),
]);
```

It earns its place because `project_technologies.technology_id` is
**`ON DELETE RESTRICT`**: without a usage count, the only way to learn
whether a technology can be deleted is to try and fail. The list shows
"Unused" or "N projects", and the edit page replaces the delete control
with an explanation when the technology is still referenced.

**Corrected before commit.** The first implementation put this method on
the technology repository, which gave `project_technologies` a second
owner and contradicted the Phase 5 boundary. See `docs/DECISIONS.md`.

**The UI is not the enforcement.** The schema is. The server rejects an
in-use delete regardless of what the UI offered, and that rejection is
tested through the real action, not just the repository.

### Delete semantics

- An unused technology deletes normally, behind a two-step confirmation
  (POST only — never a GET or a link).
- An in-use technology produces a **safe conflict**: "This technology is
  still used by one or more projects. Remove it from them first."
- **Referencing projects are never touched**, and no raw constraint text
  (`FOREIGN KEY constraint failed`, `SQLITE_*`) ever reaches the browser.
- Deleting a *project* still cascades its join rows and leaves the
  technologies themselves alive — the reverse direction, also tested.

### Projects interoperability

The Phase 7 projects form already rendered its picker from
`repos.technologies.list()`, so **no Projects CMS redesign was needed**.
Creating technologies simply populates it. Technology mutations
`revalidatePath("/projects")` so the picker cannot serve a stale list.

### Media / icon boundary

None. Phase 9 owns R2. No binary upload, no fake upload control, and no
hardcoded image URLs as CMS content.

### Navigation

Technologies became a real linked destination. It is deliberately **not**
folded into the existing "Skills & tools" placeholder: `skills`,
`skill_categories`, and `tools` are separate tables that no route manages
yet, and linking this entry under that label would imply a CMS that does
not exist. Every other Phase 8 entry stays an unlinked, phase-labelled
placeholder — no dead links.

## Phase 7 — Projects CMS vertical slice: COMPLETE.

Implemented on `feat/projects-cms`, corrected before merge, verified by
**Pull Request #12 on GitHub Actions/Linux** (after one initial
source-policy failure and a focused follow-up fix), rebase-merged into
`main` as:

- `af63b1c feat: add projects CMS vertical slice`
- `4434c1c fix: make admin D1 composition test CI-safe`

and verified again by the **post-merge `main` CI run `31077681211`**.

- **Phases 0–7:** Complete.

## Blockers

**None.** Phase 7 has none, and the Technologies CMS subtask has none.

Two items remain outstanding but are **deployment prerequisites, not
blockers** — see *Known limitations* and *Manual actions*: the
**Cloudflare Zero Trust dashboard configuration**, and the **remote
`portfolio-cms` schema**, which is still intentionally unapplied. Until
Access exists the admin app denies every request, which is the intended
fail-closed behaviour.

## Next suggested task

**Phase 9 — R2/media.** Not started. It begins only after this closure is
reviewed, merged, and its post-merge `main` CI is green. Rationale is at the
end of this file.

## Phase 8 — Sections CMS: verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #34
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — inner exit `0`, **2488 real checks** |
| `pnpm build` | **PASS** — inner exit `0`, all three routes dynamic (`ƒ`) |

Exit codes were read from the **commands themselves**, not from a wrapper's
task status — the Socials slice showed those can disagree.

### Continuous integration

- **Pull Request #34 passed CI on GitHub Actions/Linux.**
- The **post-merge `main` CI run `31204188654` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the merged Sections CMS state.

**One operational note, for the record:** the first push attempt failed with
`Could not resolve host: github.com`, and the earliest `gh pr create`
attempts failed because the branch did not yet exist on the remote. That was
a **transient network/DNS problem on the workstation, not a repository or
Git-history problem** — no history was rewritten and no recovery surgery was
needed. Once connectivity returned,
`git push -u origin feat/remaining-cms-sections` succeeded, PR #34 was
created normally, its CI passed, it merged, and the post-merge `main` run
passed.

| Suite | Checks | Change |
| --- | --- | --- |
| **Database subtotal** | **297** | **unchanged — no repository change** |
| Admin authentication | 42 | — |
| Admin foundation / invariant / containment | **125** | **+7** — three new protected pages, discovered automatically |
| Admin D1 composition boundary | 34 | — |
| Projects CMS | 96 | — |
| Technologies CMS | 90 | — |
| Profile CMS | 77 | — |
| Timeline CMS | 173 | — |
| Education CMS | 112 | — |
| Certifications CMS | 167 | — |
| Skills CMS | 233 | — |
| Tools CMS | 146 | — |
| Socials CMS | 161 | — |
| **Sections CMS** | **173** | **new** |
| **Server Action authorization** | **562** | **+63** — the real exported section actions |
| **Admin subtotal** | **2191** | — |
| **Total** | **2488** | up from 2245 |

**All 2245 previous checks still pass**, and none were weakened.

### Real-D1 results

Create and read-back of every column, including `getByKey()` addressing; a
null round-trip for both nullable columns; a duplicate key refused as a
`ConflictError` with no row created; update with clearing; visibility
filtering; deterministic ordering across repeated reads.

**The key-immutability group is the one that matters.** A rename attempt is
rejected before persistence, the stored key is unchanged, the section is
still addressable by its original key, and the *new* key was never created.
A key smuggled beside a legitimate `title` change refuses the **whole
patch** — the title does not change either — which is the correct behaviour
for a `.strict()` boundary and worth asserting rather than assuming. After a
delete, the freed key stops resolving and can be claimed again.

A preservation fixture with deliberately non-default values had **one** field
changed and everything else survived, including its key and `createdAt`;
explicit `position: 0` / `isVisible` were honoured; an empty patch was a
byte-for-byte no-op that did not bump `updated_at`; a bystander was untouched
throughout. `PRAGMA foreign_key_check` clean, NOT NULL scan zero, duplicate
key scan zero.

### Browser verification (`playwright-local` MCP, real local D1)

**Manual MCP verification — not automated Playwright CI tests.** Automated
E2E remains Phase 20.

Nav entry resolves and the empty state renders. An empty submit rejected
both `key` and `title` with focus on the error summary (`role="alert"`);
`Not A Valid Key!` was rejected with "Use lowercase letters, numbers, and
single hyphens" while the valid title beside it was accepted; a duplicate
key surfaced as "Conflict — That key is already used by another section."
with **no SQL or constraint text**.

**The immutable key was verified structurally**, not just visually: on the
edit route there is **no `input`/`textarea`/`select` named `key` anywhere**,
**no disabled or readonly input at all**, the key renders in a `<dl>` as
term "Key" / value `projects` with its explanation, and the serialized form
payload **does not contain a `key` property**. On create it is a normal
editable field.

Two sections created (positions 0 and 2) showed deterministic ordering and
the **Hidden** badge; both nullable columns rendered as `—` when empty;
editing title/eyebrow/subtitle/position/visibility persisted across a full
reload **with the key unchanged**; clearing both nullables returned them to
`—`. Two-step delete named **both the title and the key** and explained the
consequence, moved focus to the confirm button (44px), restored on
**Cancel**, and removed only its target — the unrelated section survived.
All six visible controls resolved to a real `<label for>`.

**Zero console errors and zero warnings.**

### Responsive results (populated list, not an empty state)

| Width | Page scrolls sideways | Wrapper | Caption / `sr-only` |
| --- | --- | --- | --- |
| 1280px | **no** (1280 / 1280) | no internal scroll needed | present (6 `sr-only`) |
| 768px | **no** (768 / 768) | no internal scroll needed | present (6 `sr-only`) |
| 375px | **no** (375 / 375) | **scrolls internally** (704 / 343) | present (6 `sr-only`) |

The wrapper was `position: relative` at every width; row actions 44px. No
global `overflow-x-hidden`, no `sr-only` removed.

### Confidentiality results

Canaries were seeded in the **editorial content** — title, subtitle, and
eyebrow — deliberately not the row id or the key, either of which appears
legitimately in a URL. With Access configured **and `ADMIN_DEV_AUTH=enabled`
at the same time**, all eight probes (HTML list, `/sections/new`, the direct
edit route, RSC list, RSC edit, and forged-assertion variants of both HTML
routes and RSC) returned **307** with **no canary content**.

**Positive control:** the same probe against authorized requests returned
`200` and found all three canaries on both the list and the edit route.

Local test data was removed **by explicit id** after confirming the table
held only rows this task created (it was verified empty beforehand); the
dev-auth file and MCP artifacts were removed too.

## Phase 8 — Socials CMS: verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #32
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** (exit 0) — **2245 real checks** |
| `pnpm build` | **PASS** (exit 0) — all three routes emitted as dynamic (`ƒ`) |

| Suite | Checks | Change |
| --- | --- | --- |
| **Database subtotal** | **297** | **unchanged — no repository change** |
| Admin authentication | 42 | — |
| Admin foundation / invariant / containment | **118** | **+7** — three new protected pages, discovered automatically |
| Admin D1 composition boundary | 34 | — |
| Projects CMS | 96 | — |
| Technologies CMS | 90 | — |
| Profile CMS | 77 | — |
| Timeline CMS | 173 | — |
| Education CMS | 112 | — |
| Certifications CMS | 167 | — |
| Skills CMS | 233 | — |
| Tools CMS | 146 | — |
| **Socials CMS** | **161** | **new** |
| **Server Action authorization** | **499** | **+60** — the real exported social link actions |
| **Admin subtotal** | **1948** | — |
| **Total** | **2245** | up from 2017 |

**All 2017 previous checks still pass**, and none were weakened.

**A note on how this total was obtained.** A first full run was interrupted
mid-suite and its wrapper reported success while the inner result was
`test: -1` — a *terminated* run, not a passing one. Only the `pnpm build`
half of it had genuinely completed. The orphaned processes were cleared and
the whole thing re-run clean; the numbers above come from that second run,
which exited `0` for both commands. A task-level exit code is not the same
as the command's own exit code, and the difference was worth catching.

### Continuous integration

- **Pull Request #32 passed CI on GitHub Actions/Linux.**
- The **post-merge `main` CI run `31192174164` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the merged Socials CMS state.

### Real-D1 results

Create and read-back of every column; a platform value no vocabulary would
have predicted (`some-brand-new-network-2031`) round-tripping verbatim and
uncanonicalised; update changing both `platform` and `url` to other arbitrary
valid values; visibility filtering (`list()` shows a hidden row,
`list({visibleOnly: true})` does not); deterministic ordering across repeated
reads.

A preservation fixture built with deliberately non-default values (position
6, hidden, its own platform and url) had **one** field changed and everything
else survived, including `createdAt`; explicit `position: 0` and `isVisible`
were honoured; an empty patch was proven a byte-for-byte no-op that does not
bump `updated_at`; a bystander row was untouched throughout. An invalid
payload and a `javascript:` URL were both proven rejected **before** the
database with the stored row unchanged. Delete removed only its target.
Integrity: `PRAGMA foreign_key_check` clean, a NOT NULL scan across all three
required columns at zero, and a scan proving **every stored URL is http(s)**.

### Browser verification (`playwright-local` MCP, real local D1)

**Manual MCP verification — not automated Playwright CI tests.** Automated
E2E remains Phase 20.

Nav entry resolves and the empty state renders. All three required fields
were rejected on an empty submit — `label`, `platform`, and `url` each with
`aria-invalid="true"` — with focus moved to the error summary
(`role="alert"`). `javascript:alert(1)` was rejected with "Enter a valid
http(s) URL" keyed to `url` while the exotic platform beside it was accepted.

**Platform freedom was proven structurally, not just behaviourally**: the
control is an `<input type="text">` with **no `list` attribute**, and the
page contains **zero `<select>` elements** — on both the create and edit
views. Values exercised through the real form included
`some-brand-new-network-2031`, `A platform with spaces & punctuation!`, and
`Личный сайт`, all stored verbatim.

Two rows created (positions 0 and 2) showed deterministic ordering and the
**Hidden** badge; both links rendered with `target="_blank"`,
`rel="noopener noreferrer"`, and accessible names naming the link and its
platform. Editing pre-filled exactly (including a Japanese label and
`isVisible: false`), changed the platform to another script, toggled
visibility, repositioned, and persisted across a full reload. Two-step delete
named the target, moved focus to the confirm button (44px), restored cleanly
on **Cancel**, and on confirm removed only that row — the unrelated link
survived. All five visible controls resolved to a real `<label for>`.

**Zero console errors and zero warnings.**

### Responsive results (populated list, not an empty state)

| Width | Page scrolls sideways | Wrapper | Caption / `sr-only` |
| --- | --- | --- | --- |
| 1280px | **no** (1280 / 1280) | no internal scroll needed | present (8 `sr-only`) |
| 768px | **no** (768 / 768) | no internal scroll needed | present (8 `sr-only`) |
| 375px | **no** (375 / 375) | **scrolls internally** (704 / 343) | present (8 `sr-only`) |

The wrapper was confirmed `position: relative` at every width; row action
links measured 44px. No global `overflow-x-hidden`, and no `sr-only` content
removed.

### Confidentiality results

Canaries were seeded in **`label`, `platform`, and `url`** — deliberately not
the row id, which legitimately appears in a URL path. With Access configured
**and `ADMIN_DEV_AUTH=enabled` at the same time**, all eight probes (HTML and
RSC across the list, the direct edit route, and `/socials/new`, plus
forged-assertion variants of both HTML routes and RSC) returned **307** with
**no canary content**.

**Positive control:** the same probe against authorized requests returned
`200` and found all three canary tokens on both the list and the edit route —
so "no leak" is a real result rather than a probe that matches nothing.

Local test data, the temporary dev-auth file, and MCP artifacts were removed
afterwards.

## Phase 8 — Tools CMS: verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #30
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **2017 real checks** |
| `pnpm build` | **PASS** — all three routes emitted as dynamic (`ƒ`) |

| Suite | Checks | Change |
| --- | --- | --- |
| **Database subtotal** | **297** | **unchanged — no repository change** |
| Admin authentication | 42 | — |
| Admin foundation / invariant / containment | **111** | **+7** — three new protected pages, discovered automatically |
| Admin D1 composition boundary | 34 | — |
| Projects CMS | 96 | — |
| Technologies CMS | 90 | — |
| Profile CMS | 77 | — |
| Timeline CMS | 173 | — |
| Education CMS | 112 | — |
| Certifications CMS | 167 | — |
| Skills CMS | 233 | — |
| **Tools CMS** | **146** | **new** |
| **Server Action authorization** | **439** | **+60** — the real exported tool actions |
| **Admin subtotal** | **1720** | — |
| **Total** | **2017** | up from 1804 |

**All 1804 previous checks still pass**, and none were weakened.

### Continuous integration

- **Pull Request #30 passed CI on GitHub Actions/Linux.**
- The **post-merge `main` CI run `31178459051` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the merged Tools CMS state.

### Real-D1 results

Create and read-back of every column; a null round-trip proving both
optionals come back as `null` rather than `""`; a duplicate name refused as a
`ConflictError` with no row created; **a rename onto a taken name also
refused, with the row left alone**; update with clearing; visibility
filtering (`list()` shows a hidden row, `list({visibleOnly: true})` does
not); deterministic ordering across repeated reads.

A preservation fixture built with deliberately non-default values (position
6, hidden, populated purpose and url) had **one** field changed and
everything else survived, including `createdAt`; explicit `position: 0` and
`isVisible` were honoured; an empty patch was proven a byte-for-byte no-op
that does not bump `updated_at`; a bystander row was untouched throughout.
An invalid payload and a `javascript:` URL were both proven rejected
**before** the database with the stored row unchanged. Delete removed only
its target; `PRAGMA foreign_key_check` clean, plus explicit NOT NULL and
duplicate-name scans returning zero.

### Browser verification (`playwright-local` MCP, real local D1)

**Manual MCP verification — not automated Playwright CI tests.** Automated
E2E remains Phase 20.

The nav entry became a real link; the empty state renders. Server-side
validation confirmed **through the real form**: an empty submit returned a
`name` error with focus moved to the error summary (`role="alert"`), and
`javascript:alert(1)` was rejected with "Enter a valid http(s) URL" keyed to
`url`. A duplicate name surfaced as "Conflict — That name is already used by
another tool." with **no SQL or constraint text**.

The list showed both rows in position order with the **Hidden** badge on the
hidden one, the URL rendered as an anchor carrying
`rel="noopener noreferrer"`, and `—` for null purpose and url. Editing
pre-filled correctly including `isVisible: false` and empty nulls; after
saving, a full reload confirmed the change persisted, the badge cleared, and
the row repositioned. Two-step delete named the tool, moved focus to the
confirm button (44px), restored cleanly on **Cancel**, and on confirm removed
only the target — the unrelated tool survived. All five visible controls
resolved to a real `<label for>`.

**Zero console errors and zero warnings.**

### Responsive results (populated list, not an empty state)

| Width | Page scrolls sideways | Wrapper | Caption / `sr-only` |
| --- | --- | --- | --- |
| 1280px | **no** (1280 / 1280) | no internal scroll needed | present (8 `sr-only`) |
| 768px | **no** (768 / 768) | no internal scroll needed | present (8 `sr-only`) |
| 375px | **no** (375 / 375) | **scrolls internally** (704 / 343) | present (8 `sr-only`) |

The wrapper was confirmed `position: relative` at every width; row action
links measured 44px. No global `overflow-x-hidden`, and no `sr-only` content
removed.

### Confidentiality results

With Access configured **and `ADMIN_DEV_AUTH=enabled` at the same time** — so
development auth would rescue the request if precedence were wrong — a canary
tool was seeded and probed. All seven probes (HTML and RSC across `/tools`,
`/tools/new`, the `[id]` route, and forged-assertion variants) returned
**307** with **no canary content**.

**Positive control:** the same probe against an authorized request returned
`200` and found all three canary tokens — so "no leak" is a real result
rather than a probe that matches nothing.

Local test data, the temporary dev-auth file, and MCP artifacts were removed
afterwards.

## Phase 8 — Skills CMS: verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #28
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **1804 real checks** |
| `pnpm build` | **PASS** — all six routes emitted as dynamic (`ƒ`) |

| Suite | Checks | Change |
| --- | --- | --- |
| **Repository integration** | **167** | **+10** — `getSkillById` and skills FK/not-found coverage |
| **Database subtotal** | **297** | **+10 — the repository contract changed** |
| Admin authentication | 42 | — |
| Admin foundation / invariant / containment | **104** | **+14** — six new protected pages, discovered automatically |
| Admin D1 composition boundary | 34 | — |
| Projects CMS | 96 | — |
| Technologies CMS | 90 | — (unchanged by the slug extraction) |
| Profile CMS | 77 | — |
| Timeline CMS | 173 | — |
| Education CMS | 112 | — |
| Certifications CMS | 167 | — |
| **Skills CMS** | **233** | **new** |
| **Server Action authorization** | **379** | **+87** — the real exported category and skill actions |
| **Admin subtotal** | **1507** | — |
| **Total** | **1804** | up from 1460 |

**All 1460 previous checks still pass**, and none were weakened.

### Continuous integration

- **Pull Request #28 passed CI on GitHub Actions/Linux.**
- The **post-merge `main` CI run `31171449984` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the merged Skills CMS state.

### Real-D1 results

Categories: create, read-back, null `description` round-trip, duplicate slug
refused as a `ConflictError` with no row created, partial update preserving
everything unmentioned, hidden category still listed in the admin view but
excluded from `visibleOnly`.

Skills: create with the owning FK persisted, unrated proficiency
round-tripping as `null` rather than `0`, deterministic ordering at both
levels, `UNIQUE (category_id, name)` refused within a category **but the same
name accepted in a different one**, a one-field patch preserving
proficiency/position/visibility/category/`createdAt`, explicit `position: 0`
and `isVisible` honoured, an explicit `null` proficiency clearing the rating,
and an empty patch proven a byte-for-byte no-op.

FK integrity: a skill under a nonexistent category is refused; deleting an
in-use category is refused **and not one of its skills was destroyed**;
deleting a skill removes exactly that row while its category and siblings
survive; an empty category *can* be deleted; `PRAGMA foreign_key_check` is
clean and an explicit orphan scan returns zero.

### Browser verification (`playwright-local` MCP, real local D1)

**Manual MCP verification — not automated Playwright CI tests.**

Nav entry resolves; the empty state refuses to offer "New skill" with zero
categories. Category flow: required-field validation with focus moved to the
error summary; a mixed-case slug `Languages` **normalised to `languages`**; a
duplicate slug surfaced as a safe conflict; edit persisted across reload.
Skill flow: the category selector contained the **real** categories, labelled
and keyboard reachable; Hidden badges on both a skill and a category;
"Not rated" preserved as distinct from a score; the edit page has **no
category selector** and explains why.

Deletion: two-step confirm named the target, moved focus to the confirm
button (44px), restored on **Cancel**, and removed only its target. The
in-use category showed explanatory copy and **no delete control**; once
emptied, the control appeared and the delete succeeded.

**Zero console errors and zero warnings.**

### Responsive results (populated lists)

| Width | Page scrolls sideways | Skills list wrappers | Categories list wrapper |
| --- | --- | --- | --- |
| 1280px | **no** (1280 / 1280) | 2 wrappers, no internal scroll needed | no internal scroll needed |
| 768px | **no** (768 / 768) | 2 wrappers, no internal scroll needed | no internal scroll needed |
| 375px | **no** (375 / 375) | **both scroll internally** (576 / 328) | **scrolls internally** (704 / 343) |

Every `overflow-x-auto` wrapper was `position: relative` at every width;
captions and all `sr-only` content were retained at 375px; row actions 44px.

### Confidentiality results

With Access configured **and `ADMIN_DEV_AUTH=enabled` simultaneously**, a
canary category and skill were seeded. All ten probes (HTML and RSC across
the list, detail, and new routes, plus forged-assertion variants) returned
**307** with **no canary content**. **Positive control:** the same probe
against authorized requests returned `200` and found all four canary tokens.

Local test data, the dev-auth file, and MCP artifacts were removed afterwards.

## Phase 8 — Certifications CMS: verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #26
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **1460 real checks** |
| `pnpm build` | **PASS** — all three routes emitted as dynamic (`ƒ`) |

| Suite | Checks | Change |
| --- | --- | --- |
| **Database subtotal** | **287** | **unchanged — no repository change** |
| Admin authentication | 42 | — |
| Admin foundation / invariant / containment | **90** | **+7** — three new protected pages, discovered automatically |
| Admin D1 composition boundary | 34 | — |
| Projects CMS | 96 | — (unchanged by the URL extraction) |
| Technologies CMS | 90 | — |
| Profile CMS | 77 | — |
| Timeline CMS | 173 | — |
| Education CMS | 112 | — |
| **Certifications CMS** | **167** | **new** |
| **Server Action authorization** | **292** | **+58** — the real exported certification actions |
| **Admin subtotal** | **1173** | — |
| **Total** | **1460** | up from 1228 |

**All 1228 previous checks still pass**, and none were weakened. The
foundation suite's +7 came from the invariant discovering the new routes on
its own — six protected-page assertions and one scroll-containment
assertion — with no change to the invariant itself.

### Continuous integration

- **Pull Request #26 passed CI on GitHub Actions/Linux.**
- The **post-merge `main` CI run `31161985127` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the merged Certifications CMS state.

### Browser verification (`playwright-local` MCP, real local D1)

**Manual MCP verification — not automated Playwright CI tests.** Automated
E2E remains Phase 20. Run against real local D1 with development auth.

Empty state, nav entry, and both create flows verified; a second
certification created hidden at position 2 to exercise ordering and the
badge. Server-side validation confirmed **through the real form**: a fully
empty submit returned field errors on `title` and `issuer` with focus moved
to the error summary (`role="alert"`), `javascript:alert(1)` was rejected
with "Enter a valid http(s) URL" keyed to `credentialUrl`, and an expiry
before the issue date was rejected keyed to `expiresOn`.

The list showed both rows in position order (0, 2) with the **Hidden** badge
on the hidden one, the credential rendered as an anchor carrying
`rel="noopener noreferrer"`, and `—` for null dates. Editing pre-filled
correctly including `isVisible: false` and empty nulls; after saving, a full
page reload confirmed the change persisted and the badge cleared. Two-step
delete named the certification, moved focus to the confirm button, restored
cleanly on **Cancel**, and on confirm removed only the target — the
unrelated certification survived. Row action links measured 44px and are
keyboard focusable.

**Zero console errors and zero warnings** across the entire session.

### Responsive results (populated list, not an empty state)

| Width | Page scrolls sideways | Wrapper | Caption / `sr-only` |
| --- | --- | --- | --- |
| 1280px | **no** (1280 / 1280) | no internal scroll needed | present (8 `sr-only`) |
| 768px | **no** (768 / 768) | no internal scroll needed | present (8 `sr-only`) |
| 375px | **no** (375 / 375) | **scrolls internally** (704 / 343) | present (8 `sr-only`) |

The form at 375px also produced no document-level horizontal overflow, all
eight visible controls resolved to a real `<label for>`, and the submit
button measured 44px. No global `overflow-x-hidden` was used and no
`sr-only` content was removed.

### Confidentiality results

With Access configured **and `ADMIN_DEV_AUTH=enabled` at the same time** —
so development auth would rescue the request if the precedence were wrong —
a canary certification was seeded and probed:

| Request | Status | Canary content |
| --- | --- | --- |
| Unauthenticated HTML list | 307 → `/denied` | **not present** |
| Unauthenticated HTML edit | 307 → `/denied` | **not present** |
| Unauthenticated RSC list | 307 | **not present** (0 bytes) |
| Unauthenticated RSC edit | 307 | **not present** (0 bytes) |
| Forged `Cf-Access-Jwt-Assertion` (HTML) | 307 → `/denied` | **not present** |
| Forged `Cf-Access-Jwt-Assertion` (RSC) | 307 | **not present** |

**Positive control:** the same probe against an authorized request returned
`200` and found all four canary tokens, and the canary row was confirmed
present in D1 — so "no leak" is a real result rather than a probe that
matches nothing.

One methodological note worth recording: the first probe run reported a
false positive because the canary token was grepped case-insensitively and
matched the *row id in the request URL* echoed by the redirect body, not any
disclosed content. The probe was corrected to match only content tokens
(never the id) before the result above was accepted.

Local test data, the temporary dev-auth file, and MCP artifacts were removed
afterwards.

## Timeline partial-update fix: verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #24
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **1228 real checks** |
| `pnpm build` | **PASS** |

| Suite | Checks | Change |
| --- | --- | --- |
| **Database subtotal** | **287** | **unchanged — no repository change** |
| Admin authentication | 42 | — |
| Admin foundation / invariant / containment | 83 | — |
| Admin D1 composition boundary | 34 | — |
| Projects CMS | 96 | — |
| Technologies CMS | 90 | — |
| Profile CMS | 77 | — |
| **Timeline CMS** | **173** | **+63** — partial-update schema and real-D1 regression |
| Education CMS | 112 | — |
| **Server Action authorization** | **234** | **+25** — the real exported action, partial payloads |
| **Admin subtotal** | **941** | — |
| **Total** | **1228** | up from 1140 |

**All 1140 previous checks still pass**, and none were weakened.

### Continuous integration

- **Pull Request #24 passed CI on GitHub Actions/Linux.**
- The **post-merge `main` CI run `31155349531` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the merged fix.

### Real-D1 regression result

A fixture entry was created with deliberately non-default values — position
`6`, `isVisible: false`, populated summary/location/periodLabel/both dates,
and three highlights — so any leaked default would be visible. Changing
**one** parent field then preserved: position 6, visibility false, all four
optional text/date fields, `createdAt`, and all three highlights
byte-for-byte in order. A bystander entry (position 9, its own highlight)
was untouched throughout. Explicit `position: 0` / `isVisible: true` were
applied; explicit `[]` cleared the highlights; an explicit replacement
persisted in order with contiguous positions; and an empty patch left the
row byte-for-byte identical.

### Action-auth regression result

An **unauthenticated partial** update — the exact shape the regression made
dangerous — throws `AdminUnauthorizedError`, leaves the entry
byte-for-byte identical, leaves its highlights identical, and never
consults the database provider. Authenticated controls prove the full
matrix through the **real exported action**: partial preserves omitted
fields and highlights, explicit falsy values are honoured, `[]` clears,
a list replaces, and an empty patch is a safe no-op.

### Browser verification (`playwright-local` MCP, real local D1)

Manual MCP verification — **not** automated Playwright CI tests. The bug
lives in the exported partial-update contract, which the admin UI never
exercises, so this pass regression-checks the **real UI** rather than
pretending to reproduce the exploit; the partial-patch behaviour is proven
by the schema, action, and local-D1 tests above.

Populated list loads with position, Hidden badge, and highlight counts; the
edit page pre-fills correctly including `isVisible: false` and position 2; a
normal full-form update still works and left all three highlights intact; a
highlight reorder still persisted (verified in D1 as contiguous positions
0/1/2) with position, visibility, and summary all preserved; two-step delete
still names the entry and its highlight count, moves focus to the confirm
button, and Cancel restores. Populated list at 375px: **no page-level
horizontal scrolling**, wrapper scrolling internally, caption present.
**Zero console errors.**

Local test data and the temporary dev-auth file were removed afterwards.

## Phase 8 — Education CMS: verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #22
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **1140 real checks** |
| `pnpm build` | **PASS** — all `/education*` routes are `ƒ (Dynamic)` |

### Test suites after the Education CMS

| Suite | Checks | Change |
| --- | --- | --- |
| UUIDv7 | 26 | — |
| D1 migration smoke | 59 | — |
| Repository integration | 157 | — |
| D1 binding compatibility | 41 | — |
| D1Like type compatibility | 4 | — |
| **Database subtotal** | **287** | **unchanged — the repository contract did not change** |
| Admin authentication | 42 | — |
| Admin foundation / invariant / containment | **83** | +7 — the invariant and containment check discovered the three new routes |
| Admin D1 composition boundary | 34 | — |
| Projects CMS | 96 | — |
| Technologies CMS | 90 | — |
| Profile CMS | 77 | — |
| Timeline CMS | 110 | — |
| **Education CMS** | **112** | **new** |
| **Server Action authorization** | **209** | +41 for education |
| **Admin subtotal** | **853** | — |
| **Total** | **1140** | up from 980 |

**All 980 previous checks still pass**, and none were weakened or removed.
`apps/web` remains the only no-op suite.

### Browser verification (`playwright-local` MCP, real local D1)

Manual MCP verification — **not** automated Playwright CI tests.

- `/education` empty state, with Education wired into navigation
  (`aria-current`) and **no dead links** — six real destinations.
- Required-field validation *and* the cross-field date rule fired together:
  focus moved to the `role="alert"` summary, `aria-invalid="true"` on all
  three fields, and "Required" / "End date must not precede the start date"
  wired through `aria-describedby`.
- Created two entries; the list showed them **ordered by position**
  (0 then 1), with redirects to `/education?created=1`.
- Edited one: renamed it and unchecked **Visible**. The list still shows it,
  badged **Hidden** — and read back from D1 directly: `position` still 1,
  `isVisible` false, and `visibleOnly` returns 1 of 2 rows.
- **Populated list at 375px**: document width 375 ≤ viewport, the page
  **cannot** be scrolled sideways, the wrapper needs and can scroll
  internally (704 > 343), caption and 4 `sr-only` labels present, and both
  "Edit …" actions focusable. Also clean at 768 and 1280.
- Form at 375px: no page overflow, **9/9 controls labelled**, none
  placeholder-only, all focusable, 44px submit control.
- Two-step delete named the entry, moved focus to "Yes, delete", Cancel
  restored the initial state, and confirming deleted it — **the unrelated
  entry survived**.
- **Unauthenticated confidentiality:** with dev auth off and a seeded canary
  entry, all nine combinations of `/education`, `/education/new`,
  `/education/[id]` × plain / `RSC: 1` / forged header returned 307 to
  `/denied`, with **zero-length RSC bodies** and the canary appearing **0
  times**. The canary was verified **unchanged** afterwards.

Local test data and the temporary dev-auth file were removed afterwards.

## Phase 8 — Timeline CMS: verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #18
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **971 real checks** |
| `pnpm build` | **PASS** — all `/timeline*` routes are `ƒ (Dynamic)` |

### Test suites after the Timeline CMS

| Suite | Checks | Change |
| --- | --- | --- |
| UUIDv7 | 26 | — |
| D1 migration smoke | 59 | — |
| Repository integration | **157** | **+31** — the aggregate write and its rollback |
| D1 binding compatibility | 41 | — |
| D1Like type compatibility | 4 | — |
| **Database subtotal** | **287** | **+31 — the repository contract changed** |
| Admin authentication | 42 | — |
| Admin foundation / invariant | **67** | +6 — the invariant discovered the three new routes (later 76; see the regression fix) |
| Admin D1 composition boundary | 34 | — |
| Projects CMS | 96 | — |
| Technologies CMS | 90 | — |
| Profile CMS | 77 | — |
| **Timeline CMS** | **110** | **new** |
| **Server Action authorization** | **168** | +44 for timeline |
| **Admin subtotal** | **684** | — |
| **Total** | **971** | up from 780 |

**All 780 previous checks still pass**, and none were weakened or removed.
`apps/web` remains the only no-op suite.

The database subtotal moved because the *repository contract* changed —
consistent with the rule set after the technologies correction: repository
tests grow when a repository contract grows, not once per CMS entity.

### Browser verification (`playwright-local` MCP, real local D1)

Manual MCP verification — **not** automated Playwright CI tests.

- `/timeline` empty state, and Experience wired into navigation with
  `aria-current`.
- Created an entry with three highlights; reordered one via **Move up**
  before saving, announced as "Highlight moved to position 2 of 4".
- A blank highlight was rejected with the error scoped to **row 4 only**
  (`aria-invalid="true"`, "Required"), focus moved to the `role="alert"`
  summary, and the three valid rows left unflagged.
- After removing the blank row the entry saved, redirected to
  `/timeline?created=1`, and listed with a highlight count of 3.
- Reopening showed the **exact stored order** (Alpha, Charlie, Bravo) —
  the reorder had persisted.
- Edited the parent and children together (renamed the role, edited one
  bullet, removed another). Read back directly from D1: parent updated,
  two highlights at contiguous positions 0 and 1, **zero orphan rows**.
- Two-step delete named the entry *and* its highlight count, moved focus to
  "Yes, delete", Cancel restored the initial state, and confirming deleted
  it — **the unrelated entry survived**.
- **Unauthenticated confidentiality:** with dev auth off and a seeded canary
  entry, all nine combinations of `/timeline`, `/timeline/new`,
  `/timeline/[id]` × plain / `RSC: 1` / forged header returned 307 to
  `/denied`, with **zero-length RSC bodies** and the canary appearing **0
  times**. The canary entry was verified **unchanged** afterwards.

Local test data and the temporary dev-auth file were removed afterwards.

### A pre-existing responsive defect was discovered — and deliberately NOT
### repaired here

Testing the populated timeline list at 375px exposed **page-level
horizontal scrolling**: the whole document scrolled sideways instead of the
table scrolling inside its own wrapper.

Two independent causes, both predating this task:

1. `main` in the admin shell is `flex-1` **without `min-w-0`**. A flex
   item's automatic minimum size is its content, so a list table carrying a
   `min-w-*` stretches `main` past the viewport.
2. The `sr-only` labels inside those tables are absolutely positioned, and
   a scroll wrapper that is not a containing block lets them resolve
   against the viewport, widening the page's scroll area even after (1).

**What the Timeline commit changed, and why it is scoped that way:**

- `min-w-0` on the shell's `main` — kept, because it is a **necessary
  dependency of `/timeline`'s own responsive correctness**, proven rather
  than assumed. With the shell reverted to `main` and only Timeline's
  wrapper fix in place, `/timeline` at 375px still scrolled the page
  sideways by 408px, `main` measured 768px wide, and the table wrapper did
  not scroll internally. With `min-w-0` restored: no page scroll, `main`
  375px, wrapper scrolls internally. This is a shared-shell dependency
  introduced by Timeline.
- `relative` on **Timeline's own** scroll wrapper — kept, local to this
  feature.
- **`/projects` and `/technologies` were restored to their `main` versions
  before the commit.** They are previously merged slices, and repairing them
  was not Timeline's job.

**The pre-existing defect therefore still exists on those two pages**, and
nothing here claims otherwise. Measured after the revert, with the shell fix
in place: `/projects` at 375px still scrolls the page sideways by 323px
because its `sr-only` labels still escape its wrapper. The shell change does
**not regress** it — `main` now fits the viewport (360px ≤ 375) and its table
scrolls internally, both strictly better than before — but the residual
`sr-only` containment issue remains, and Timeline itself is unaffected.

**My earlier Phase 7/8 reports said "no horizontal overflow at any width",
which was overstated.** Those checks measured populated tables only at 1280
and 768; at 375 they measured the *empty* state, which renders no table at
all. The gap was in the evidence, not the claim's wording.

A separate focused `fix/*` task should repair `/projects` and
`/technologies` — see *Next suggested task*.

## Phase 8 — Profile CMS: verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #16
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **780 real checks** |
| `pnpm build` | **PASS** — `/profile` is `ƒ (Dynamic)` |

### Test suites after the Profile CMS

| Suite | Checks | Change |
| --- | --- | --- |
| UUIDv7 | 26 | — |
| D1 migration smoke | 59 | — |
| Repository integration | 126 | — |
| D1 binding compatibility | 41 | — |
| D1Like type compatibility | 4 | — |
| **Database subtotal** | **256** | **unchanged — the repository contract did not change** |
| Admin authentication | 42 | — |
| Admin foundation / invariant | **61** | +2 — the invariant discovered `/profile` on its own |
| Admin D1 composition boundary | 34 | — |
| Projects CMS | 96 | — |
| Technologies CMS | 90 | — |
| **Profile CMS** | **77** | **new** |
| **Server Action authorization** | **124** | +31 for profile |
| **Admin subtotal** | **524** | — |
| **Total** | **780** | up from 670 |

**All 670 previous checks still pass**, and none were weakened or removed.
`apps/web` remains the only no-op suite; coverage is representative, not
exhaustive.

The 77 Profile checks are validation (accepted input, 20 rejection cases,
blank-to-null normalisation for every optional field, email format,
explicit proof that `id`/`createdAt`/`updatedAt` and unknown fields are
unreachable) plus a real local-D1 lifecycle pass: no row initially, first
save creates, values read back including a multi-paragraph bio, second save
updates **the same row** with exactly one row remaining, `createdAt`
preserved, `updatedAt` advanced, blank optionals clearing to `null`, a
payload carrying an `id` never reaching the database, the schema CHECK
rejecting any other key, and `PRAGMA foreign_key_check` clean.

The 31 added authorization checks invoke the **real exported**
`saveProfileAction` unauthenticated and read the database back: no profile
created when none exists, an existing profile left byte-identical, auth
proven to run **before** validation and before the database is touched, and
the provider never consulted during a denied call. Authenticated positive
controls cover a successful save that preserves `createdAt`, malformed
input returning field-keyed validation, a client-supplied singleton `id`
and `createdAt` both rejected, exactly one row surviving every attempt, and
no result message leaking SQL, constraint text, or the singleton key.

### Browser verification (`playwright-local` MCP, real local D1)

Manual MCP verification — **not** automated Playwright CI tests.

- `/profile` with **no row**: the "Not configured yet" panel renders and
  the submit button reads **"Create profile"**.
- Required-field validation and a malformed email were rejected together:
  focus moved to the `role="alert"` summary, `aria-invalid="true"` on all
  three fields, and "Required" / "Enter a valid email address" wired
  through `aria-describedby`.
- A valid save succeeded, the page flipped to the configured state with a
  last-updated line and a **"Save changes"** label, and "Profile saved."
  was announced via `role="status"` **without stealing focus**.
- Reload retained every value, including the multi-paragraph bio.
- A second save changed the headline, set availability, and cleared the
  tagline. Read back from D1 directly: **exactly one row**, `createdAt`
  preserved, `updatedAt` advanced, cleared tagline stored as `null`.
- **No duplicate profile could be created through the UI**, and **no
  internal singleton id is exposed** anywhere in the rendered HTML.
- No horizontal overflow at 1280, 768, or 375; **7/7 form controls have a
  real `<label for>`**, none placeholder-only.
- **Unauthenticated confidentiality:** with dev auth off and a seeded
  canary profile, `/profile` returned 307 to `/denied` for plain,
  `RSC: 1`, and forged-header requests, with **zero-length RSC bodies** and
  the canary appearing **0 times**. The canary profile was verified
  **unchanged** afterwards.
- Console errors relevant to the feature: **none** — only HMR reconnects
  and 404s from dev-server restarts, which is development-session noise.

A POST carrying a fabricated `Next-Action` id also returned 404. That is
**transport behaviour only** and proves nothing about authorization — Next
rejects an unknown action id before any application code runs, so a
completely unguarded app answers identically. **The mutation-authorization
proof is the exported-action suite above**, which invokes the real
`saveProfileAction` with no identity and reads the database back.

Local test data and the temporary dev-auth file were removed afterwards.

## Phase status summary

| Phase | Status |
| --- | --- |
| Phase 0 — Tools/environment | **Complete** |
| Phase 1 — Docs/spec + repo + CI + CLAUDE.md + `.claude` skills | **Complete** |
| Phase 2 — Static responsive portfolio | **Complete** (merged to `main`, CI green) |
| Phase 3 — Design system | **Complete** (merged to `main`, CI green) |
| Phase 4 — D1 schema/migrations | **Complete** (merged to `main`, CI green) |
| Phase 5 — Repository/data layer | **Complete** (merged to `main`, CI green) |
| Phase 6 — Admin foundation | **Complete** (merged to `main`, CI green) |
| Phase 7 — Projects CMS vertical slice | **Complete** (merged to `main`, CI green) |
| Phase 8 — Remaining CMS | **Complete** on the merge of this closure — all nine CMS areas (Technologies, Profile, Timeline, Education, Certifications, Skills, Tools, Socials, Sections) merged and CI green, plus the admin list overflow and timeline partial-update regression fixes |

Phases 9–22 are not started. See `docs/ROADMAP.md` for the authoritative
full sequence.

## Phase 8 — Technologies CMS: verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #14
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **670 real checks** |
| `pnpm build` | **PASS** — all `/technologies*` routes are `ƒ (Dynamic)` |

### Test suites after the Technologies CMS

| Suite | Checks | Change |
| --- | --- | --- |
| UUIDv7 | 26 | — |
| D1 migration smoke | 59 | — |
| Repository integration | **126** | **+15** — canonical `countByTechnology()` semantics |
| D1 binding compatibility | **41** | **+3** — the aggregate column's real-D1 result shape |
| D1Like type compatibility | 4 | — |
| **Database subtotal** | **256** | **+18 — no longer 238** |
| Admin authentication | 42 | — |
| Admin foundation / invariant | **59** | +6 — the recursive invariant discovered the three new routes on its own |
| Admin D1 composition boundary | 34 | — |
| Projects CMS | 96 | — |
| **Technologies CMS** | **90** | **new** |
| **Server Action authorization** | **93** | +45 for technologies |
| **Admin subtotal** | **414** | — |
| **Total** | **670** | up from 511 |

The database subtotal changed because extending a **repository contract**
requires canonical tests in the repository package, not only in the admin
suite that consumes it. Raw query semantics are owned by
`packages/database`; the admin suite owns the page-level composition.

**All 511 previous checks still pass**, and none were weakened or removed.
`apps/web` remains the only no-op suite; coverage is representative, not
exhaustive.

The 15 new repository-package checks own the raw semantics of
`countByTechnology()`: zero usage when nothing references a technology, a
correct count for one project, aggregation across multiple projects,
independent counts per technology, the count dropping when an association
is removed, a project delete cascading its join rows and removing its
usage, and unknown or unreferenced ids producing no phantom count. The 3
new real-D1 checks cover what only a real binding can settle — the
`COUNT(*)` aggregate column decoding as a number through workerd rather
than the Node adapter.

The 90 Technologies checks are validation (accepted input, 18 rejection
cases, database-managed-field rejection, update-patch semantics) plus a
real local D1 pass: create/read/list ordering, duplicate-slug
`ConflictError`, update semantics (`undefined` ignored, `null` clears, id
and `createdAt` immutable), rename-onto-taken-slug conflict, the **page
composition** of `technologies.list()` with `projects.countByTechnology()`
(including an assertion that the technology repository exposes no
project-usage read), **in-use delete rejected with the projects and their
tags intact**, delete succeeding once detached, project deletion cascading
join rows while leaving technologies alive, and
`PRAGMA foreign_key_check`.

The 45 added authorization checks invoke the **real exported**
`createTechnologyAction` / `updateTechnologyAction` /
`deleteTechnologyAction` unauthenticated and read the database back:
nothing inserted, the record byte-identical, the record still present.
Auth is proven to run **before** validation and before the database is
touched. Authenticated positive controls then cover duplicate-slug
conflict, malformed input, a client-supplied `id`, not-found, the in-use
delete conflict, and delete succeeding after detachment — each asserting
the message carries no SQL or constraint text.

### Browser verification (`playwright-local` MCP, real local D1)

Manual MCP verification — **not** automated Playwright CI tests.

- Empty state → create (slug auto-suggested `TypeScript` → `typescript`) →
  redirect to `/technologies?created=typescript` → row appears as "Unused".
- Edit → category updated → redirect to `/technologies?updated=typescript`
  → change persisted.
- Required-field validation kept the user on the page, moved focus to a
  `role="alert"` summary, set `aria-invalid="true"`, and wired "Required"
  through `aria-describedby`.
- Duplicate slug → "That slug is already used by another technology", with
  **no SQL or constraint string** anywhere in the HTML.
- **Interoperability:** the technology appeared in the Projects picker;
  a project was created with it; the list then showed "1 project"; the
  association persisted on reopening the project.
- **In-use delete** offered no delete control and explained why.
- Unchecking the association, saving, then returning: the delete control
  reappeared, two-step confirmation moved focus to "Yes, delete", Cancel
  restored the initial state, and confirming deleted it and returned to the
  empty-state list. **The project survived.**
- No horizontal overflow at 1280×900, 768×1024, or 375×812; all three form
  controls have real `<label for>` elements with no placeholder-as-label.
- **Unauthenticated confidentiality:** with dev auth off and a seeded
  canary technology, all nine combinations of `/technologies`,
  `/technologies/new`, `/technologies/[id]` × plain / `RSC: 1` / forged
  header returned 307 to `/denied`, with **zero-length RSC bodies** and the
  canary appearing **0 times**.
- Console errors relevant to the feature: **none**. The session log
  contains only HMR WebSocket reconnects from dev-server restarts and 404s
  for records deleted during the flows — development-session noise, not
  feature failures.

**These checks were performed before the repository-ownership correction,
and were not re-run afterwards.** That correction moved the usage-count
query from `TechnologiesRepository` to `ProjectsRepository` and changed the
page to compose the two repositories; it is internal and
output-equivalent — the same counts, the same rendered markup — and it is
covered by the automated suites, which were re-run and pass. Recorded
plainly rather than implying a fresh browser pass that did not happen.

### Sub-44px touch targets — checked, and pre-existing

Two links measure under 44px at 375px width: the visually-hidden "Skip to
main content" link, and the inline breadcrumb. Both are **identical to the
existing Projects pages** (verified side by side), so this is the
established breadcrumb pattern rather than a regression introduced here.
Every button and primary action meets the 44px minimum. Deferred to the
dedicated accessibility phase (Phase 18) as a deliberate decision rather
than changed here.

### Phase 8 — Technologies CMS — CI

- **Pull Request #14 CI passed** on GitHub Actions/Linux.
- PR #14 was **rebase-merged** into `main` as
  `97d6425 feat: add technologies CMS`.
- The **post-merge `main` CI run `31084430634` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the merged Technologies CMS state.

## Phase 8 — known limitations (not blockers)

- **All nine Phase 8 areas are delivered, merged, and CI-verified.** The
  phase closes on the merge of this documentation pass; Phase 9 engineering
  starts only after that merge and its post-merge `main` CI.
- **A skill cannot be moved between categories, and a section key cannot be
  renamed.** Both are deliberate contracts enforced at the schema, type, and
  repository layers, and both reject the attempted mutation rather than
  silently discarding it.
- **A skill cannot be moved between categories in the CMS.** The repository
  patch allowlist and `SkillUpdate` have excluded `categoryId` since Phase 5,
  because a move must also resolve position and the
  `UNIQUE (category_id, name)` collision in the destination. The update
  schema rejects it explicitly rather than ignoring it, the edit page shows
  the category read-only, and **all category-deletion guidance names only
  deletion** — it never suggests moving skills elsewhere, because there is no
  control that would do that. Supporting moves would be a deliberate
  repository extension, not a form change.
- ~~A post-merge regression is outstanding in the timeline update
  schema.~~ **Fixed and merged** as `c345131` — see *Timeline partial-update
  regression* near the top of this file. **Timeline CMS remained COMPLETE
  throughout**; this was a post-merge repair, not incomplete work, and it
  was **not an Education defect** — Education surfaced it and shipped the
  correct pattern first.
- **Date validation is shape-only across projects, timeline, education, and
  now certifications.** `2024-13-99` matches `YYYY-MM-DD` and is accepted; a
  real calendar parser would reject it. Documented and asserted rather than
  assumed. Any tightening should be applied to all four consistently.
  **The timeline partial-update fix did not change this**, and a one-sided
  timeline date patch is still **not** compared against an omitted persisted
  counterpart — a pure parser has no access to stored state. Both remain a
  separate future validation-hardening item.
- ~~A known responsive regression is outstanding on `/projects` and
  `/technologies`.~~ **Fixed and merged** as `6d65504` — see *Responsive
  overflow regression* near the top of this file.
- **The public site is still placeholder-driven.** Profile, timeline, and
  education data exist in D1, but `apps/web` has not been converted to read
  them.
- **`apps/web` automated tests remain a no-op** — still the only
  fake-green script in the repository.
- **Browser tests remain manual MCP verification**, not automated
  Playwright CI. Automated E2E is Phase 20.
- **Remote D1 remains unmigrated**, so the CMS is local-only.
- **A real deployed Cloudflare Access session remains unverified** end to
  end.
- **The production OpenNext D1 binding provider remains deferred to
  Phase 22**, and fails closed until then.
- **No R2 / media upload** — Phase 9.
- **The small mobile breadcrumb / skip-link touch-target pattern** remains
  deferred to the dedicated accessibility phase (Phase 18).

## Phase 7 — completed work

### Route structure

```
apps/admin/src/app/(protected)/projects/
  page.tsx            list — all statuses, admin view
  new/page.tsx        create
  [id]/page.tsx       edit + delete
```

All three use `withAdminPage`, so the Phase 6 recursive invariant test
covers them automatically. Projects is now a **real** navigation
destination; the remaining Phase 8 entries are still inert labels.

### D1 runtime binding

`src/lib/db/binding.ts` is the app's single database composition boundary:
`getAdminRepositories()` → `createRepositories(db)`. No component
constructs a binding, and there is no global mutable repository state.

- **Production: explicitly not implemented.** The real
  `@opennextjs/cloudflare` API is `getCloudflareContext().env.DB`, and
  installing that package also requires an app-level `wrangler.json`,
  `open-next.config.ts`, and `initOpenNextCloudflareForDev()` — Phase 22
  work. So the module exposes a narrow provider seam,
  `setAdminDatabaseProvider()`, and production **fails closed with a clear
  internal error** naming what Phase 22 must register. No fake global
  stands in for it.
- **Local:** `next dev` is a Node server with no Workers `env`, so the
  binding comes from Wrangler's `getPlatformProxy()` — the same real
  workerd-backed local D1 the Phase 5 tests use, with
  `remoteBindings: false`. The import is dynamic and development-guarded,
  and `serverExternalPackages: ["wrangler"]` keeps it out of the production
  bundle. **No Cloudflare credentials, no `--remote`.**

### Validation

`@portfolio/schemas` gained the project schemas (Zod 4.4.3). This is the
**untrusted-input** boundary and is deliberately distinct from the
persistence-row decoders in `@portfolio/database`, which validate data
coming *out* of a store we own. Types are inferred from the schemas, so
validator and type cannot drift.

Notable rules: `.strict()` so `id`/`createdAt`/`updatedAt` and any unknown
field are **rejected**, not silently dropped; slug shape enforced
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`), with uniqueness left to the database;
URLs restricted to **http/https only** — `z.url()` alone would accept
`javascript:` and `data:`, which become stored XSS; duplicate technology
ids rejected before they hit the join table's composite key.

### Server mutations

Three Server Actions, each following the same order without exception:
`requireAdminIdentity()` → Zod → repository → typed result. Authorization
is **never** taken from a hidden form field; a Server Action is a POST
endpoint and is treated as independently reachable.

`ActionResult` (`src/lib/actions/result.ts`) distinguishes only what the UI
renders differently — validation / conflict / not_found / failure — and
never carries SQL, a constraint string, or a stack trace. Designed for
Phase 8 to reuse verbatim.

### Relationships

Links and technologies are written through the existing project aggregate
(`setLinks`, `setTechnologies`) — no second data layer, no redundant
storage of technology names. A non-existent technology id surfaces as a
foreign-key `ConflictError` and is reported as a form-level conflict.

**Media is deferred, honestly.** The schema supports metadata
associations, but no assets can exist until R2 arrives in Phase 9, so the
form states that plainly and sends an empty media array rather than faking
an upload or hardcoding asset ids.

### Public portfolio boundary — deliberately NOT in this phase

`docs/ROADMAP.md` scopes Phase 7 as "one entity end to end — projects —
proving the full create/read/update/delete path **through the data
layer**". It says nothing about public rendering, so `apps/web` still
renders from its Phase 2 placeholder module and was **not touched**.
Pulling that conversion forward would have been silent scope expansion.

## Phase 7 — verification actually performed

Locally on Windows, and again on **GitHub Actions/Linux** for both PR #12
and the post-merge `main` run:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **511 real checks** |
| `pnpm build` | **PASS** — all `/projects*` routes are `ƒ (Dynamic)` |

### Test suites after Phase 7

| Suite | Checks | Real? |
| --- | --- | --- |
| UUIDv7 | 26 | Yes |
| D1 migration smoke | 59 | Yes — real Wrangler/workerd D1 |
| Repository integration | 111 | Yes — `node:sqlite` D1 adapter |
| D1 binding compatibility | 38 | Yes — real workerd D1 binding |
| D1Like type compatibility | 4 | Yes |
| **Database subtotal** | **238** | — |
| Admin authentication | 42 | Yes |
| Admin foundation / invariant | **53** | Yes (+6 this phase) |
| **Admin D1 composition boundary** | **34** | **Yes — new; working-tree source policy, fail-closed production, `tsc` type proof** |
| **Projects CMS** | **96** | **Yes — new; validation + real local D1 CRUD** |
| **Server Action authorization** | **48** | **Yes — new; the real exported actions, unauthenticated, against real local D1** |
| **Admin subtotal** | **273** | — |
| **Total** | **511** | — |
| `apps/web` | — | **No — still the only no-op** |

Coverage is **representative, not exhaustive**.

The 96 Projects checks are validation (accepted input, ~20 rejection
cases, database-managed-field rejection, slug suggestion) plus a full CRUD
pass against **real local D1** with the real migration: create, duplicate
slug → `ConflictError`, relationship persistence and replacement, a failed
relationship batch leaving prior tags intact, list/filter, aggregate
reads, update semantics (`undefined` ignored, `null` clears, id and
`createdAt` immutable), rename-onto-taken-slug conflict, delete with
cascade, and `PRAGMA foreign_key_check`.

### Two defects found and fixed during verification

1. **Client-side navigation raced the mutation.** After a delete, the user
   was left on the edit page of a project that no longer existed. Replaced
   `router.push` in the client with `redirect()` in the Server Action —
   called **outside** the try/catch, because `redirect()` signals by
   throwing and the error handler would otherwise report a spurious
   failure. Also works without JavaScript.
2. **The invariant test had a false negative.** Its regex
   (`withAdminPage\s*(<[^>]*>)?`) could not parse nested generics, so it
   reported the correctly-guarded `[id]/page.tsx` as unguarded. Replaced
   with a balanced-angle-bracket scanner; all negative controls still
   reject. The test caught this itself — on its own matcher.

### Browser verification (`playwright-local` MCP, real local D1)

Full CRUD at 1280×900, then responsive at 768×1024 and 375×812:

- **Create** — slug auto-suggested (`Nebula CMS` → `nebula-cms`), link
  added, redirect to `/projects?created=…`, row visible in the list.
- **Edit** — form pre-populated including the relationship row; rename
  persisted; redirect to `/projects?updated=…`.
- **Validation** — clearing the title kept the user on the page, showed a
  `role="alert"` summary **with focus moved to it**, set
  `aria-invalid="true"`, and rendered "Required" wired via
  `aria-describedby`.
- **URL protocol** — `javascript:alert(1)` rejected with "Enter a valid
  http(s) URL"; no navigation.
- **Duplicate slug** — safe conflict message; **no SQL or constraint
  string** in the HTML.
- **Delete** — two-step confirmation, focus moved to the confirm button,
  Cancel restores the initial state, confirm deletes and redirects to an
  empty-state list.
- **No horizontal overflow** at any width; **10/10 form controls have a
  real `<label for>`**, none relying on a placeholder.
- **Confidentiality invariant holds** on the new routes: unauthenticated
  and forged-header requests to `/projects`, `/projects/new`, and
  `/projects/[id]` all 307 to `/denied`; **RSC bodies are zero-length**;
  **no project data leaked** in any response.
  - The only residual is the **static route title** on `/projects/new` —
    the exact Phase 6 `metadata` residual, which is precisely why these
    routes use static metadata rather than `generateMetadata`.
- **Mutation authorization is proven separately, in `pnpm test`.** A POST
  carrying a fabricated `Next-Action` id returns 404, but that proves
  nothing about our boundary — Next rejects an unknown action id before any
  application code runs, so a completely unguarded app returns the same
  404. It is kept only as a transport sanity check. The real proof invokes
  the actual exported `createProjectAction` / `updateProjectAction` /
  `deleteProjectAction` with no identity and reads the database back; see
  *Phase 7 correction pass* below.

## Phase 7 — correction pass (pre-commit)

Two claims from the first pass did not hold up and were corrected.

### 1. The production D1 contract was invented

The binding module claimed a future OpenNext adapter would populate
`globalThis.__ADMIN_DB__`. **No such API exists.** The documented
`@opennextjs/cloudflare` accessor is `getCloudflareContext().env.DB`.

`@opennextjs/cloudflare` (1.20.2) was **not** installed, because adopting
it also requires an app-level `wrangler.json` (`compatibility_date`,
`nodejs_compat`), an `open-next.config.ts`, and
`initOpenNextCloudflareForDev()` in `next.config.ts` — Phase 22 deployment
configuration. So production resolution is now **explicitly deferred**
behind a narrow seam, `setAdminDatabaseProvider(() => Promise<D1Like>)`,
and `getAdminDatabase()` throws `DatabaseUnavailableError` in production
until Phase 22 registers the real provider. Nothing claims to work today
that does not. Local `getPlatformProxy()` behaviour is unchanged.

The seam is not test-only scaffolding: `tsc` proves that a provider shaped
exactly like `async () => getCloudflareContext().env.DB`, returning
Cloudflare's own generated `D1Database`, already satisfies
`AdminDatabaseProvider` **with no cast**.

### 2. A fake `Next-Action` id proved nothing

The 404 from `POST` with `Next-Action: fake-action-id` was reported as
mutation-auth evidence. It is not — Next rejects an unknown action id
before any application code runs, so an unguarded app answers identically.
It is retained only as a transport sanity check.

Mutation authorization is now proven by `scripts/action-auth-tests.mjs`
(**48 checks**), which invokes the **actual exported**
`createProjectAction`, `updateProjectAction`, and `deleteProjectAction`
with no identity and reads real local D1 back: nothing is inserted, the
target project is logically identical afterwards, and it still exists.
Auth is also proven to run *before* validation and before the database is
touched, and a positive control confirms the same three functions really do
mutate when authenticated. Full scope and the framework shims used are
documented in `docs/TESTING.md`.

### 3. `serverExternalPackages: ["wrangler"]` re-evaluated, and kept

Removing it was **measured**, not assumed: `next build` then fails with an
import trace pulling `wrangler/wrangler-dist/cli.js` into the production
Server Component graph, because Turbopack resolves dynamic imports
statically. It stays, and the tests now assert that `wrangler` is
referenced exactly once, dynamically, inside the development-only resolver,
and is a devDependency — so production runtime code cannot depend on it.

### Correction-pass verification

Counts **as they stood at that point**; the CI correction below took the
total to its final **511**.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — 502 real checks (at that time) |
| `pnpm build` | **PASS** — all `/projects*` routes `ƒ (Dynamic)` |

Browser re-verification against real local D1 confirmed authenticated
create → edit → delete still work through the refactored binding (slug
auto-suggested, both redirects correct, two-step delete with focus on the
confirm button, empty-state list afterwards). With dev auth **off**, a
seeded canary project was used to re-check confidentiality: `/`,
`/projects`, `/projects/new`, and `/projects/[id]` all 307 to `/denied` for
plain, `RSC: 1`, and forged-header requests; **RSC bodies were 0 bytes**;
and the canary string appeared **0 times** in all twelve responses. The
only content in the redirect bodies is the static route title — the known
Phase 6 metadata residual. The canary was removed afterwards.

## Phase 7 — Linux CI correction (PR #12)

This was a **test-harness / source-policy failure, not an application
runtime failure** — no shipped behaviour was ever wrong. It is recorded in
full because the lesson is durable.

The first Linux CI run on PR #12 failed in
`apps/admin/scripts/db-composition-tests.mjs`:

```
FAIL  <legacy identifier> appears in no tracked source file
      — apps/admin/src/lib/db/binding.ts
```

**Root cause — two faults, one symptom.** The binding module's header
comment still named the removed identifier while explaining that it had
been removed. And the scanner enumerated files with `git ls-files`, so
during local verification — when `binding.ts` was still an **untracked new
file** — it never opened it and reported a false green. Committing made the
file tracked, and CI then correctly found the violation. The test was
right; it had simply been unable to see the file locally.

**Fix 1** — the comment now describes the removed contract without naming
the identifier, deferring to `docs/DECISIONS.md` for the history. The
provider architecture is unchanged: local Wrangler `getPlatformProxy()`,
production fails closed without a registered provider, Phase 22 registers
`getCloudflareContext().env.DB`.

**Fix 2** — source discovery now walks the working tree instead of the git
index, so a newly created untracked file is covered. Details and the
negative controls are in `docs/TESTING.md`. Proven live by temporarily
creating an untracked `.ts` file containing the identifier: the suite
failed and named it, then it was deleted.

While adding those controls, one of them caught a **second real gap**: the
documentation regex used a `[^.\n]` gap that could not span the `.` in
"populate `globalThis.<identifier>`", so a genuine violation written that
way would have passed. Widened to `[^\n]`.

The durable properties the fix established: application-source policy uses
**deterministic filesystem discovery**, not tracked-file-only discovery;
**new/untracked source files are included**; generated and vendored
directories are excluded; paths are normalized cross-platform so Windows
and Linux agree; and **negative controls prove an untracked violating
source file fails immediately**. The stale source occurrence was removed.

The D1 composition suite grew **25 → 34 checks**; repository total
**502 → 511**. That fix shipped as `4434c1c fix: make admin D1 composition
test CI-safe`; **PR #12 CI then passed**, the PR was rebase-merged, and the
post-merge `main` run `31077681211` passed. No Playwright rerun was needed:
the fix changed no application behaviour.

## Phase 7 — CI

- **Pull Request #12 initially failed once** on GitHub Actions/Linux — the
  source-policy blind spot described above.
- A **focused follow-up commit** fixed the scanner
  (`4434c1c fix: make admin D1 composition test CI-safe`).
- **PR #12 CI then passed.**
- PR #12 was **rebase-merged** into `main` as `af63b1c` and `4434c1c`.
- The **post-merge `main` CI run `31077681211` passed.**
- Linux therefore verified install, lint, typecheck, tests, and build for
  the final Phase 7 state.

## Phase 7 — known limitations

These are limitations, not blockers.

- **The production D1 / OpenNext binding provider is intentionally
  deferred to Phase 22.** Production fails closed until it is registered;
  production D1 runtime integration is **not** implemented today.
- **Remote D1 remains unmigrated**, so the CMS is local-only for now.
- **Cloudflare Access has not been exercised end to end** against a real
  deployment or dashboard session.
- **The public website still uses placeholder project data** — deferred,
  see above.
- **No technology CRUD**, so the Projects technology picker may be empty
  until Phase 8 adds technology management.
- **No R2 / media upload UI** — Phase 9.
- **No Projects list filtering UI.** The repository supports status
  filters; the admin list intentionally shows everything, and a filter
  control was not worth building for a single-entity slice.
- **Browser tests are manual MCP verification, not automated Playwright
  CI.** Automated E2E is Phase 20.
- **`apps/web` automated tests remain a no-op** — the only fake-green
  script in the repository.
- **CSP remains deferred** to the security/deployment phases.

### Phase 6 — CI

- **Pull Request #10 CI passed** on GitHub Actions/Linux.
- PR #10 was **rebase-merged** into `main`.
- The **post-merge `main` CI run passed.**
- Linux therefore verified lint, typecheck, tests, and build for Phase 6,
  including the two new admin suites.

## Phase 6 — completed work

### Authentication architecture

**Cloudflare Access is the identity provider.** There is deliberately **no
password storage, no session table, no application-issued auth cookie, and
no NextAuth/Auth.js**. Access authenticates the user at the edge and
forwards a signed assertion in `Cf-Access-Jwt-Assertion`.

**The application independently verifies that assertion.** Presence of the
header is not authentication: if the Worker is ever reachable by a path
that bypasses the Access edge — a misconfigured route, a `workers.dev`
URL, a preview deployment — anyone can set that header to anything.
Verifying signature, issuer, audience, and expiry makes a forged header
worthless. Access is the gate; this is the lock.

| Module | Role |
| --- | --- |
| `src/lib/auth/config.ts` | Reads `CF_ACCESS_*`, classifies the environment, owns the development-auth guard |
| `src/lib/auth/verify.ts` | JWT verification via `jose`; normalizes claims to an identity |
| `src/lib/auth/guard.ts` | `resolveAdminIdentity` / `getAdminIdentity` / `requireAdminIdentity` / `requireAdminIdentityOrRedirect` |
| `src/lib/auth/identity.ts` | The three-field identity model and display helpers |

All four are `server-only`, so a Client Component importing them is a build
error rather than a runtime surprise.

**Fail-closed.** Missing configuration, missing header, malformed token,
bad signature, wrong audience, wrong issuer, expired token, `alg: none`,
and HS256 algorithm-confusion all deny access. There is no branch that
returns an identity without a cryptographically verified token, and a
configured deployment that fails verification does **not** fall back to the
development identity.

**Development auth requires three independent conditions**, so no single
environment variable can enable it and a production build cannot be talked
into it at all:

1. `NODE_ENV !== "production"` — Next hard-codes this at build time, so the
   branch is compiled out of a production bundle.
2. `ADMIN_DEV_AUTH === "enabled"` — explicit opt-in, off by default.
3. Access must **not** be configured — real Access settings always win.

It is visibly labelled in the UI with a "Development auth" badge, generates
no credential, and never accepts a forged Access header.

### Route architecture

```
src/app/
  layout.tsx              root: html/body, noindex metadata
  error.tsx               generic error boundary (no message/stack shown)
  not-found.tsx           404, reveals no route structure
  denied/page.tsx         generic denial, OUTSIDE the protected group
  (protected)/
    layout.tsx            auth boundary + AdminShell; force-dynamic
    page.tsx              dashboard; guards itself before rendering
```

### Two security defects found and fixed during verification

1. **The protected route prerendered as static.** The build output showed
   `○ (Static)`, meaning the authorization check would run once at build
   time and never per request. Fixed with `export const dynamic =
   "force-dynamic"`, confirmed by the route becoming `ƒ (Dynamic)`.
2. **A layout-only redirect still shipped the page's content.** React
   renders a layout and its `children` concurrently, so the dashboard's
   full RSC payload was serialized into the 307 response body for
   unauthenticated requests — verified against a production build
   (11.9 KB body containing the component tree).

Both now have regression tests.

### Hardening pass — the protected-page invariant

Fixing defect 2 on the one existing route left a fragile convention:
*every future page must remember to self-guard*. Phase 7 adds several
routes; forgetting on one would silently reintroduce the disclosure while
the route still looked protected. That convention has been turned into a
structural invariant.

**`withAdminPage`** (`src/lib/auth/protected-page.ts`) wraps the page
*function*, not its output:

```tsx
export default withAdminPage(async ({ identity }) => { … });
```

It awaits `requireAdminIdentityOrRedirect()` and only then invokes the
render callback, so there is no path to page output — JSX or data
fetching — without a verified identity. The identity is passed in, so
pages never call the auth layer or see a raw claim. It deliberately is
**not** a JSX boundary: `<Protected>{children}</Protected>` has the exact
flaw being fixed.

**Enforced automatically.** `shell-tests.mjs` recursively discovers every
`(protected)/**/page.*` and fails if one is not exported through
`withAdminPage`. It is an *architectural regression guard*, not runtime
auth proof. Negative controls prove it rejects a plain default export, a
page importing the guard without awaiting it, a page guarding after
building markup, and a JSX boundary. Verified end to end by temporarily
adding a nested unguarded page — the suite found it and exited 1 — then
removing the fixture.

**Proxy remains deferred.** Re-evaluated and rejected again: Next's own
docs say Proxy is not an authorization solution, so it could never be
trusted as the boundary; a presence-only check would not stop a forged
header (the server guard already handles that in ~1 ms with no I/O); and
duplicating remote-JWKS verification there would add a network dependency
to every request for no security gain. With the page invariant enforced,
Proxy adds nothing the server guard does not already do.

## Phase 6 — verification actually performed

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **327 real checks** |
| `pnpm build` | **PASS** — admin `/` is `ƒ (Dynamic)` |

### Test suites after Phase 6

| Suite | Checks | Real? |
| --- | --- | --- |
| UUIDv7 | 26 | Yes |
| D1 migration smoke | 59 | Yes — real Wrangler/workerd D1 |
| Repository integration | 111 | Yes — `node:sqlite` D1 adapter |
| D1 binding compatibility | 38 | Yes — real workerd D1 binding |
| D1Like type compatibility | 4 | Yes |
| **Data/repository subtotal** | **238** | |
| **Admin authentication** | **42** | **Yes — new in Phase 6** |
| **Admin foundation / security invariant** | **47** | **Yes — new in Phase 6** |
| **Admin subtotal** | **89** | |
| **Total** | **327 real checks** | |
| `apps/web` | — | **No — still a no-op** |
| `apps/admin` | — | **No longer a no-op** |

**`apps/admin` no longer has a no-op test script**, and `apps/web` is now
the only no-op suite in the repository. Coverage remains **representative,
not exhaustive**: there is still no UI component or end-to-end testing, and
admin coverage is focused on the authentication boundary.

Auth tests generate a throwaway RSA key pair locally and inject the public
key through the verifier's `keyResolver` seam — **no network, no Cloudflare
account, no real Access token, no secrets**. Cases: valid token; missing;
empty; malformed; tampered payload; signed by a different key; expired;
wrong audience; wrong issuer; no subject; `alg: none`; HS256
algorithm-confusion; plus configuration and development-guard matrices, and
identity normalization (exactly `subject`, `email`, `source` — extra claims
and the raw token are provably absent).

### Browser verification (`playwright-local` MCP)

Viewports: **1440×900**, **1280×800**, **768×1024**, **375×812**.

- No horizontal overflow at any width (1425/1265/753/360 against
  1440/1280/768/375); zero overflowing elements; 44px minimum touch target.
- Sidebar visible from `lg`; menu button below it — no width shows both.
- Console: **0 errors, 0 warnings** (two benign dev-only info lines).
- Structure: one `<h1>`, heading sequence `H1,H2,H2`, landmarks
  header/nav/aside/main, **0 duplicate ids**, **0 dangling ARIA refs**,
  `aria-current="page"` on the active item, `robots: noindex, nofollow,
  nocache`, no broken links.
- Keyboard: skip link is the first stop and **moves focus to
  `MAIN#main-content`**; every stop shows a visible focus ring.
- Mobile drawer (native `<dialog>` + `showModal()`): opens by keyboard,
  `:modal` true, focus moves inside, **20 tabs never reached a background
  element**, background genuinely inert (programmatic `.focus()` on the
  skip link and menu button both refused), Escape closes, focus returns to
  the trigger, `aria-expanded` tracks state.
- Security: no JWT-shaped string, no `CF_ACCESS*`, no team domain, and no
  header name in the rendered HTML. Unauthenticated and forged-header
  requests both 307 to `/denied` with no admin content and no denial reason.
  Re-verified after the hardening pass against a **production build**, on
  four request shapes — plain HTML, `RSC: 1`, forged `alg: none` header, and
  forged header + `RSC: 1`: no `<aside>`, no `<nav>`, no `<dialog>`, and
  none of the dashboard or navigation text. The RSC responses have a
  **zero-length body**.
  - **Residual, documented for Phase 7:** the page's static
    `metadata.title` ("Dashboard · Portfolio Admin") still appears in the
    redirect body, because Next evaluates a route's `metadata` export
    independently of its component. Harmless here — it is a fixed route
    title, not data. It matters in Phase 7: a `generateMetadata` that reads
    a record (e.g. a project title) **must guard too**, since
    `withAdminPage` only wraps the component.
- Reduced motion: transitions collapse to `1e-05s`, zero running
  animations.
- Colour schemes: light `rgb(251,251,252)` / dark `rgb(11,12,16)` from the
  shared tokens. **No theme controls were added** — that is Phase 10.

## Phase 6 — Cloudflare and remote state

- **No Cloudflare Access application was created during Phase 6**, and no
  dashboard configuration was performed. Creating one would have meant
  mutating Cloudflare resources.
- **Dashboard configuration is still pending** — see *Manual actions*.
- **No production Access AUD or team-domain values are committed.**
  `.env.example` documents the variable *names* with commented
  placeholders only; neither value is a secret, but neither is present.
- **The remote `portfolio-cms` schema remains unapplied** (`num_tables: 0`)
  and **remote D1 was not mutated** — Phase 6 touched no database at all.
- **Tests and CI remain local-only** where local execution is appropriate:
  no Cloudflare credentials are required, and no `--remote` path exists in
  any script or workflow.

## Phase 6 — known limitations (not blockers)

Phase 6 is complete. These are carried forward:

- **Production Cloudflare Access dashboard/application configuration is
  still pending.**
- **No real Cloudflare Access session has been tested end to end.** The
  verifier is proven against locally minted tokens only.
- **No CSP.** Deferred to the security/deployment phases; a guessed CSP
  that breaks Next silently is worse than none. The other headers are set.
- **No CRUD implemented**, and **repositories are not yet wired into the
  admin app** — it does not touch D1.
- **`generateMetadata()` is not covered by `withAdminPage`.** Route
  metadata is evaluated independently of the component, so a future page
  whose metadata reads sensitive CMS data **must perform its own
  authorization**. All current metadata is static and contains no record
  data, and the invariant test does not yet check for this.
- **`apps/web` automated tests remain a no-op.**
- **Admin tests are focused and representative, not exhaustive.**
- **Remote D1 remains intentionally unmigrated.**
- `next dev` prints a `MODULE_TYPELESS_PACKAGE_JSON` warning when Node
  runs the `.mjs` test scripts against `.ts` sources. Cosmetic; adding
  `"type": "module"` to a Next app's manifest is a riskier change than the
  warning justifies.

### Phase 5 — what was delivered

**Repository boundary.** Application/server layer → repository interfaces
→ D1 repository implementations → prepared statements → D1. React and
Next.js application code contains **no scattered SQL**, and **Phase 5 did
not wire the repositories into either app** — that is Phase 6+. The apps
still render from the Phase 2 placeholder module.

**Composition.** `createRepositories(db)` is the single entry point. D1 is
**dependency-injected**; there is **no global mutable database binding**.
A real Cloudflare D1 binding satisfies the repository contract — verified
two ways rather than assumed:

- **Runtime:** a real workerd-backed `env.DB` from Wrangler's
  `getPlatformProxy()` passed into `createRepositories(env.DB)` with no
  cast.
- **Compile time:** Cloudflare's own Wrangler-generated `D1Database` type
  asserted assignable to `D1Like`, compiled with no cast.

**Domain repositories (15).** `profile`, `socialLinks`, `media`,
`resumes`, `projects`, `technologies`, `timeline`, `education`,
`certifications`, `skills`, `tools`, `sections`, `siteSettings`,
`sceneSettings`, `contactMessages` — covering all 20 tables. Join and
child tables remain **owned by their aggregate repository** rather than
exposed as unrelated top-level CRUD: `projects` owns `project_links`,
`project_media`, and `project_technologies`; `timeline` owns
`timeline_highlights`; `skills` covers categories and skills.

**Mapping and safety.** Explicit row-to-domain decoding with no
`as Entity` casts; SQLite integer booleans decoded to real JavaScript
booleans; nullable columns mapped intentionally to `null`; structurally
invalid persisted values surfaced as persistence errors rather than
coerced or defaulted. All dynamic values go through prepared statements
and `.bind(...)`; dynamic column fragments come only from explicit
per-repository allowlists; **no generic raw-SQL API is exposed**; and
SQL-injection-style hostile values — both as data and as patch keys — were
tested and treated as data only.

**Error model.** Four cases, unchanged: `not_found`, `conflict`,
`invalid_data`, `database_failure`. Public messages carry no SQL text or
bound values; the original error is preserved on `cause`.

**IDs and timestamps.** Application-generated **UUIDv7** via an
**injectable id generator**, with an **injectable clock** producing
**ISO-8601 UTC** timestamps. Deterministic UUIDv7 tests verified canonical
format, version 7, RFC 9562 variant bits, exact 48-bit timestamp
encoding, uniqueness (including 10,000 ids within one injected
millisecond), and lexicographic ordering by timestamp.

## Phase 5 — completed work

### Delivered

A typed, framework-independent repository layer over the Phase 4 schema.
**No new external dependencies.** **No application code changed** — the
apps still render from the Phase 2 placeholder module, so no Playwright
run was required.

**`packages/types`** — the portfolio content domain types
(`src/content.ts`): entity, create-input, update-patch, and filter shapes
for every persistence domain.

**`packages/database`** — the data layer:

| File | Role |
| --- | --- |
| `src/d1.ts` | The minimal `D1Like` contract this package depends on |
| `src/errors.ts` | Four-case persistence error model + driver classification |
| `src/runtime.ts` | Injectable `Clock` / `IdGenerator`, plus a UUIDv7 implementation |
| `src/mapping.ts` | Row decoders — every read passes through these |
| `src/internal/sql.ts` | Allowlisted patch builder, placeholder/limit helpers |
| `src/internal/ordered-repository.ts` | Shared CRUD plumbing for ordered content |
| `src/repositories/*.ts` | The domain repositories |
| `src/factory.ts` | `createRepositories(db)` composition |
| `src/index.ts` | Curated public API |
| `scripts/d1-test-adapter.mjs` | `D1Like` adapter over `node:sqlite`, for tests |
| `scripts/repository-tests.mjs` | 111-check repository integration suite |

### Explicitly NOT done (Phase 6+)

No admin UI, no API route handlers, no Server Actions, no authentication,
no R2 handling, no contact submission, no theme controls, no public
portfolio conversion from placeholder data, and **no remote migration**.
Repositories are **not wired into `apps/web` or `apps/admin`** — zero app
behaviour change was the goal.

### Repository — table ownership

15 repositories cover all 20 tables. Join and child tables are owned by
the aggregate they belong to rather than exposed as top-level CRUD:

| Repository | Tables owned |
| --- | --- |
| `projects` | `projects`, **`project_links`**, **`project_media`**, **`project_technologies`** |
| `timeline` | `timeline_entries`, **`timeline_highlights`** |
| `skills` | `skill_categories`, `skills` |
| `profile` / `siteSettings` / `sceneSettings` | the three singleton-key tables |
| `media`, `resumes`, `technologies`, `socialLinks`, `education`, `certifications`, `tools`, `sections`, `contactMessages` | one table each |

A project's links have no meaning apart from their project, so they are
reached through `projects.setLinks()` / `listLinks()`. Exposing them as a
standalone repository would invite callers to mutate a project's
relationships without going through the aggregate that understands them.

## Phase 5 — verification actually performed

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **238 real checks** (26 + 59 + 111 + 38 + 4) |
| `pnpm build` | **PASS** (exit 0) |

### Test suites — what each one actually proves

**238 real checks**, all green on Windows locally and on GitHub
Actions/Linux in CI.

| Suite | Checks | Executes against | Proves |
| --- | --- | --- | --- |
| UUIDv7 | **26/26** | pure function | Format, version/variant bits, timestamp encoding, uniqueness, ordering |
| D1 migration smoke test | **59/59** | **real Wrangler/workerd local D1** | Schema and constraints |
| Repository integration | **111/111** | repository code over a **`node:sqlite` D1 adapter** | Repository SQL, mapping, semantics — breadth |
| D1 binding compatibility | **38/38** | repository code through a **real local workerd D1 binding** | That `D1Like` matches the actual Cloudflare binding |
| D1Like type compatibility | **4/4** | `tsc` over **Wrangler-generated D1 types** | Compile-time assignability, no cast |
| `apps/web` | — | — | **Nothing — no-op placeholder** |
| `apps/admin` | — | — | **Nothing — no-op placeholder** |

### Phase 5 — CI

- **Pull Request #8 CI passed** on GitHub Actions/Linux.
- PR #8 was **rebase-merged** into `main`.
- The **post-merge `main` CI run passed.**
- Linux execution therefore proved **`getPlatformProxy`, workerd, and
  Wrangler type generation** all work on a clean CI runner — the parts of
  the suite that had previously only ever run on Windows.

**Important distinction.** The 111-check suite runs over an adapter *we
wrote*, so on its own it cannot prove the `D1Like` contract is correct — a
wrong contract and a matching wrong adapter would agree. The 38-check
suite is the actual binding proof, obtained from Wrangler's
`getPlatformProxy()`; it is smaller on purpose because breadth is already
covered.

**Still representative, not exhaustive.** Every repository is exercised,
but not every method of every repository, and there is no UI, component,
or end-to-end coverage.

The 111-check suite covers: singleton-key zero/one semantics; boolean and
null mapping; rejection of structurally invalid persisted data; the
project aggregate (create, unique-slug conflict, patch semantics,
immutable-id protection, status/featured filtering, ordering, links, media,
technologies, cascade on delete); batch rollback; ordered content with
visibility filtering (sections, skills, timeline); the contact inbox
(newest-first, status filter, status transition, `read_at` stamping,
invalid status); the single-current-résumé invariant; `PRAGMA
foreign_key_check` after mutations; and SQL-injection safety.

The 38-check binding suite covers binding acceptance without a cast, the
real migration being present, singleton get/upsert, project
create/read/list/update, unique-constraint → `ConflictError`, relationship
writes through real `batch()`, aggregate reads, **real-D1 batch
rollback**, contact inbox flow, integer→boolean mapping, SQL-injection
safety, and a final `PRAGMA foreign_key_check`.

## Phase 5 — pre-commit verification pass

A targeted review closed three gaps the first pass left open. No
architectural change was needed — the contract and the UUID
implementation both turned out to be correct, but neither had been
*proven*.

1. **`D1Like` was unverified against the real binding.** The 111-check
   suite ran only over a `node:sqlite` adapter we wrote, which cannot
   detect a wrong contract. Added
   `scripts/d1-binding-tests.mjs`: a real workerd `env.DB` from
   `getPlatformProxy()`, passed straight into `createRepositories` with no
   cast. **38/38 passed** — including real-D1 batch rollback, which
   upgrades that guarantee from "documented and locally simulated" to
   "verified against Cloudflare's own implementation".
2. **Compile-time assignability was claimed but not demonstrated.** Added
   `scripts/d1-type-compatibility.mjs`, which generates Cloudflare's own
   types with Wrangler's generator and compiles a type-only assertion.
   **4/4 passed.** The harness was negative-controlled: deliberately
   widening the asserted contract made it fail, so the pass is meaningful.
   `@cloudflare/workers-types` was still not added.
3. **`uuidV7` had only incidental coverage.** Added
   `scripts/uuid-tests.mjs` — **26/26 passed**. **No defect was found.**
   `uuidV7` gained an optional millisecond argument (test-only) so the
   48-bit timestamp encoding could be asserted exactly.

### Portability audit

- TypeScript `strict` and `noUncheckedIndexedAccess` remain on; **no
  compiler relaxation** was introduced. The only additions are
  `noEmit: true` and `allowImportingTsExtensions`, both required by the
  `.ts`-specifier setup and documented in the tsconfigs.
- `packages/database/src` contains **no `node:` imports, no `process`, no
  filesystem or Node database API, no `any`, and no absolute or
  user-specific paths**. Node-only code is confined to `scripts/`.

## Phase 5 — schema and remote D1 status

- **`migrations/0001_initial_schema.sql` remained unchanged throughout
  Phase 5** — byte-for-byte, verified before commit.
- **No schema defect was found** while building the repositories against
  it, so **no forward migration was needed**.
- **The remote `portfolio-cms` schema has still NOT been applied**
  (`num_tables: 0`).
- **No remote SQL mutation occurred** at any point.
- **CI and tests remain local-only.** No `--remote` path exists in any
  script or workflow; the binding suite runs with
  `remoteBindings: false`, and nothing requires Cloudflare credentials.

## Phase 5 — known limitations (not blockers)

Phase 5 is complete. These are carried forward:

- **Repositories are not yet wired into web/admin application behaviour.**
  Deliberate; that is Phase 6+.
- **`apps/web` and `apps/admin` still have no real automated tests** —
  both `test` scripts remain honest no-ops.
- **No UI, component, or end-to-end coverage yet.** That is Phase 20.
- **Repository coverage is representative, not exhaustive** — every
  repository is exercised, but not every method of every repository.
- **Remote D1 remains intentionally unmigrated**, so remote batch
  behaviour is still unverified. It is proven against *local* workerd,
  which is the same runtime, but the remote service was never touched.
- **No production/bootstrap seed operation yet.** Singleton reads may
  legitimately return `null` until Phase 6/7 bootstrapping and application
  workflows establish the required records — the schema permits zero rows
  by design.
- **No Zod.** Persistence-boundary decoding is hand-written; input
  validation belongs at the API/form boundary in Phase 6+.

### Phase 4 — what was delivered

**D1 resource.** One Cloudflare D1 database, `portfolio-cms`. No
additional databases were created. **The schema migration has not been
applied remotely**, and no production data exists.

**Tooling.** Wrangler pinned to **4.118.0**, installed as a root
workspace dev dependency — **not globally**. **`minimumReleaseAgeExclude`
is not used**; the repository's pnpm supply-chain minimum-release-age
protection is preserved intact. Build-script allowlisting is exact and
limited to three named packages — the pre-existing `unrs-resolver`, plus
`workerd` and `esbuild`. **No wildcard build-script permissions.**

**Migration architecture.** Root `migrations/` directory containing
`0001_initial_schema.sql`. History is **forward-only and immutable once
committed or shared** — future schema changes create new migration files
rather than rewriting `0001`. `wrangler.d1.jsonc` is a repository-level
D1 management config, separate from any future app deployment config. The
D1 binding name is **`DB`**. **Remote migrations are not part of normal
CI.**

**Schema.** 20 tables, 20 indexes. Key design decisions, all already
documented in `docs/DATABASE.md` and unchanged by this pass:

- TEXT primary keys holding application-generated **UUIDv7**.
- **ISO-8601 UTC TEXT** timestamps.
- SQLite/D1-compatible **CHECK** constraints for booleans, enums, and
  ordering.
- **Explicit foreign-key delete behaviors** chosen per relationship —
  CASCADE, RESTRICT, or SET NULL — rather than defaulted.
- **Normalized** project / media / technology relationships.
- **R2 binary storage deferred to Phase 9**; D1 stores metadata and
  references only.
- **Singleton-key tables permit zero or one row.** The schema does **not**
  guarantee a row exists. Phase 5 repository/bootstrap logic is
  responsible for ensuring required singleton records are present.

## Phase 4 — completed work

### Delivered

- **`migrations/0001_initial_schema.sql`** — the complete CMS schema as
  one versioned, immutable migration: **20 tables, 20 indexes**, 41 SQL
  statements. Full column/relationship/constraint reference in
  `docs/DATABASE.md`.
- **`wrangler.d1.jsonc`** — D1 management config (binding `DB`, database
  `portfolio-cms`, real database id, `migrations_dir: migrations`),
  deliberately separate from any future app deployment config.
- **Wrangler 4.118.0** added as a root workspace devDependency (not
  global). See the supply-chain note below for why not 4.119.0.
- **`packages/database/scripts/migrations-smoke-test.mjs`** — the
  project's first real automated test.
- `.gitignore` now excludes `.wrangler/` and `.dev.vars*`.
- `pnpm-workspace.yaml` gained `allowBuilds` entries for `workerd` and
  `esbuild` (both need their postinstall to fetch platform binaries;
  `workerd` is the runtime that backs local D1). Each entry is justified
  in-file; this is not a blanket script opt-in.

### Supply-chain correction (pre-commit review)

`pnpm add -w -D wrangler@4.119.0` silently appended a
`minimumReleaseAgeExclude` block to `pnpm-workspace.yaml`, exempting
`wrangler@4.119.0` and `miniflare@5.20260801.0-alpha` from pnpm's
supply-chain age policy. **That was rejected, not accepted.**

- The active policy is pnpm 11's **default 24-hour `minimumReleaseAge`**.
  It is not configured in this repository or in user config — the repo
  inherits the default. (`pnpm config get minimumReleaseAge` → `undefined`,
  yet installs report "Verifying lockfile against supply-chain policies".)
- Wrangler **4.119.0 was 7.5 hours old** — squarely inside the window the
  policy exists to protect against, since compromised publishes are
  typically caught and yanked within days. Auto-excluding it defeated the
  entire control.
- Note that `miniflare@5.20260801.0-alpha` was *also* published the same
  day despite its `20260801` version string — the version string is not
  the publish date.
- **Resolution: pinned `wrangler@4.118.0`** (published 5.3 days earlier,
  comfortably outside the window), restored `pnpm-lock.yaml` to its
  pre-wrangler state, and re-resolved. **Both
  `minimumReleaseAgeExclude` entries were removed**, and the policy now
  passes with no exemptions at all.
- `pnpm install --frozen-lockfile` succeeds and
  `pnpm exec wrangler --version` reports `4.118.0`.
- 4.118.0 pins the same class of alpha miniflare as 4.119.0, so nothing
  was gained or lost there; it is wrangler's own dependency choice.

`allowBuilds` and `minimumReleaseAgeExclude` are **not equivalent** and
were reviewed separately. `allowBuilds` permits a named package's install
script to run; the age policy governs whether a freshly published version
may enter the lockfile at all. The three `allowBuilds` entries
(`unrs-resolver`, `workerd`, `esbuild`) are each exact package names, each
verified to have a real `postinstall` that fetches a platform binary, and
each justified in-file. There is no wildcard or blanket approval.

### Explicitly NOT done (Phase 5+)

`packages/database/src/index.ts` remains **export-only**. No repository,
service, query, `prepare()` call, loader, route handler, or CRUD API was
written. No D1 access exists in any React component. No Zod domain
schemas, no auth, no R2, no contact backend, no deployment config, and no
production data.

**No application code changed**, so no Playwright regression run was
needed.

## Phase 4 — verification actually performed

| Command | Result |
| --- | --- |
| `pnpm install` | **PASS** — `workerd`/`esbuild` postinstalls ran |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — now partly real, see below |
| `pnpm build` | **PASS** (exit 0) |

### Local migration verification

From a deleted `.wrangler/` (clean state), using `wrangler.d1.jsonc`:

- `migrations list --local` before applying → `0001_initial_schema.sql`
  listed as pending.
- `migrations apply --local` → **41 commands executed successfully**,
  exit 0.
- `migrations apply --local` again → **"No migrations to apply!"** —
  idempotent at the runner level.
- `migrations list --local` after → no unapplied migrations remaining.

### Automated migration smoke test — 59/59 checks passed

*(Was 57. The pre-commit review added two assertions covering the
singleton-key correction: that the PRIMARY KEY allows at most one profile
row, and that the table legitimately permits zero rows.)*

**Now verified on both platforms:**

| Environment | Result |
| --- | --- |
| Local Windows | **59/59 passed** |
| Pull Request #6 — GitHub Actions/Linux | **59/59 passed** |
| Post-merge `main` — GitHub Actions/Linux | **59/59 passed** |

The test runs through `packages/database`, creates its own temporary local
D1 persistence directory, uses **Wrangler local mode only**, applies the
migrations, verifies tables and indexes, runs `PRAGMA foreign_key_check`,
exercises representative CHECK / UNIQUE / FOREIGN KEY / CASCADE /
RESTRICT / partial-UNIQUE / singleton-key behavior, cleans up its own
temporary state, **requires no Cloudflare authentication**, and **never
uses `--remote`**.

Run by `pnpm test`. It applies all migrations to a throwaway local D1
instance in an OS temp directory and asserts:

- all **20 expected tables** exist, and **no unexpected tables** were
  created;
- all **20 expected indexes** exist;
- `PRAGMA foreign_key_check` returns **zero violations** — both after
  migration and again after all constraint exercises;
- `projects.cover_media_id` genuinely references `media_assets`;
- constraints actually **reject** bad data: non-0/1 boolean, negative
  position, invalid enum value, non-singleton id, a second singleton row,
  orphan foreign key, duplicate project slug, duplicate join pair,
  `ON DELETE RESTRICT` on a technology still in use, and a second current
  résumé;
- singleton-key tables **permit zero rows** — the schema bounds the
  maximum, it does not force existence;
- `ON DELETE CASCADE` really removes a project's links with the project.

**Portability.** All paths derive from `import.meta.url` through Node's
`path`/`url` APIs — no `process.cwd()`, no hardcoded separators, no
user-specific absolute paths. The Wrangler entry point is located via
`createRequire(...).resolve("wrangler/package.json")` and the package's
declared `bin` field, rather than a hardcoded `node_modules/...` path, so
it does not depend on pnpm's hoisting layout or wrangler's internal file
structure. Verified to pass identically when invoked from the workspace
root, from `packages/database`, and from an unrelated directory
(`apps/web`). `shell: false` is retained for SQL argument safety, and the
string `--remote` appears nowhere except a comment forbidding it.

### CI verification

- **Pull Request #6 CI passed** on GitHub Actions/Linux.
- PR #6 was **rebase-merged** into `main`.
- The **post-merge `main` CI run passed.**
- GitHub Actions successfully installed **Wrangler and `workerd` on
  Linux**, meaning the `allowBuilds` entries work on a clean runner and
  the real D1 smoke test executes there.
- The database test therefore has **cross-platform proof: Windows and
  Linux.**

### Test coverage — precise state

| Package | `test` script | Real coverage? |
| --- | --- | --- |
| `@portfolio/database` | D1 migration smoke test | **Yes — 59 real checks against a live D1 engine, on Windows and Linux** |
| `apps/web` | prints "no automated tests yet" | **No — no-op** |
| `apps/admin` | prints "no automated tests yet" | **No — no-op** |

**The repository is not fully tested.** The database schema has genuine
automated coverage; the two applications have none. There is still **no
UI, component, integration, or end-to-end coverage** — that is Phase 20.

The test needs **no Cloudflare authentication** — verified by running the
full suite with a deliberately invalid `CLOUDFLARE_API_TOKEN`, which still
passed every check. It contains no `--remote` flag.

One real issue surfaced during development: the first run failed on
"no unexpected tables" because D1 creates an internal `_cf_METADATA`
table. Inspected, confirmed to be platform-owned rather than
migration-created, and excluded from that assertion alongside `sqlite_*`
and `d1_*`.

### Remote database status — STILL NOT MIGRATED

**The remote schema migration is intentionally still pending.** Phase 4
completing and merging did **not** change this.

The remote `portfolio-cms` database exists and was **left untouched**.
Verified two ways with read-only commands:

- `wrangler d1 list` → `num_tables: 0`
- `wrangler d1 migrations list --remote` → still reports
  `0001_initial_schema.sql` as **to be applied**

Standing policy:

- **No `wrangler d1 migrations apply --remote` has been executed**, at any
  point, by anyone or any script.
- **No remote SQL mutation has been executed.**
- **CI must remain local-only.** The smoke test contains no `--remote`
  flag and must never gain one.
- Applying the migration remotely will be an **explicit, controlled,
  human-initiated action**, taken later when deployment or runtime
  integration actually requires it.

No destructive command was run and no additional Cloudflare resource was
created. No production data exists.

## Phase 4 — known limitations (not blockers)

Phase 4 is complete. These are carried forward:

- **Remote schema is not deployed.** Deliberate — see the remote database
  policy above.
- **`pnpm test` is only partly real.** The database smoke test is genuine
  on both platforms; `apps/web` and `apps/admin` `test` scripts remain
  no-op placeholders asserting nothing. There is still **zero UI,
  component, integration, or end-to-end coverage**.
- **The schema is unexercised by application code.** Its shape is proven
  correct and self-consistent, but no repository layer has yet tried to
  satisfy a real query against it; Phase 5 may surface ergonomic gaps.
- **No seed data**, and **no required singleton rows exist**. Singleton-key
  tables permit zero rows by design; creating the required records is
  Phase 5 bootstrap work. No real personal data was inserted anywhere.
- `wrangler` pulls in `miniflare@5...-alpha` as a transitive dependency —
  wrangler's own choice, recorded in `pnpm-workspace.yaml`'s
  `minimumReleaseAgeExclude`, and only used by local tooling, never
  shipped to users.

## Phase 3 — summary (complete)

### Phase 3 — what was delivered

- Semantic design tokens in `packages/ui/src/tokens.css`
- Light and dark token sets, system-aware via `prefers-color-scheme`
- Tailwind theme mapping in `apps/web/src/app/globals.css`
- Typography roles (display, heading, subheading, minorHeading, lead,
  body, meta, fine, eyebrow)
- Layout system: container, page max width, responsive gutters, section
  rhythm, reading measure, grid gaps, card padding, radius scale
- Presentation primitives: action (button/link treatment), badge,
  surface/card, container, type scale
- All nine existing public portfolio sections migrated onto the system
- **Zero new external runtime dependencies**
- **Server Components preserved** — no `"use client"` anywhere
- No Motion, Three.js, CMS, D1, R2, or any later-phase work

### Phase 3 — CI

- **Pull Request #4 passed GitHub Actions.**
- Merged into `main`.
- **The post-merge `main` GitHub Actions run passed.**

## Phase 3 — completed work

Built a restrained premium design system and migrated every Phase 2 section
onto it. **No new dependencies.** All nine sections preserved; no content
area dropped and no change to the content architecture.

### Token architecture

Semantic tokens live in **`packages/ui/src/tokens.css`** — plain,
framework-agnostic CSS custom properties with no React or Tailwind
coupling, exported as `@portfolio/ui/tokens.css` and imported by
`apps/web/src/app/globals.css`. `apps/web` gained `@portfolio/ui` as a
workspace dependency.

Tokens are semantic (`--surface`, `--fg-muted`), never literal
(`--gray-200`): surfaces (`--bg`, `--surface`, `--surface-muted`), text
(`--fg`, `--fg-muted`), lines (`--border-subtle`, `--border-strong`),
accent (`--accent`, `--accent-fg`, `--accent-soft`), interaction
(`--ring`, `--selection-bg`, `--selection-fg`), depth (`--shadow-sm`,
`--shadow-md`, `--glow-accent`), radius, and layout (`--page-max`,
`--measure`). `globals.css` maps them onto Tailwind's theme so components
use `bg-surface` / `text-fg-muted` and never raw colour values.

`tokens.css` also carries empty `:root[data-theme="light"|"dark"]` blocks
so Phase 10 can add an explicit user override on top of the system
preference without restructuring. **Nothing writes `data-theme` today** —
no toggle, no persistence, no store, as specified.

### Architectural decision — what did *not* move to `packages/ui`

Only the tokens were promoted. The React primitives stayed in `apps/web`:
the public portfolio is currently their only consumer, and a primitive
with one consumer is not yet a shared primitive. Promoting them now would
also force React and `@types/react` into a package that does not need
them. Revisit when `apps/admin` is built (Phase 6) and the real shared
surface is known. Recorded in `docs/ARCHITECTURE.md`.

### Files added

- `packages/ui/src/tokens.css`
- `apps/web/src/components/ui/`: `typography.ts` (type scale as class
  constants), `container.tsx`, `surface.tsx`, `action.ts`, `badge.tsx`

### Files modified

- `packages/ui/package.json` (subpath export), `packages/ui/src/index.ts`
- `apps/web/package.json` (workspace dep), `apps/web/src/app/globals.css`
- `apps/web/src/app/page.tsx` (skip-link tokens)
- All nine section components migrated onto the system
- `apps/web/src/components/tag-list.tsx` **removed** — superseded by
  `ui/badge.tsx`; no remaining references (verified by grep)

## Phase 3 — verification actually performed

| Command | Result |
| --- | --- |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) — both apps and all packages |
| `pnpm test` | **Exits 0, but is an explicit no-op** — see below |
| `pnpm build` | **PASS** (exit 0) — `/` prerenders static |

**A green `pnpm test` is not test coverage.** The `test` script in each
app prints `"[app] no automated tests yet (Phase 1A)"` and exits 0. It
executes no assertions. **Automated unit, integration, and E2E coverage
is zero**, in local runs and in CI alike — a passing CI `test` step means
the script ran, not that any behaviour is tested. Real coverage is
Phase 20.

Everything verified in Phase 3 was verified by *manual, MCP-driven
browser inspection*, which is evidence but not repeatable regression
protection.

### Browser verification (`playwright-local` MCP)

| Check | 1280×900 | 768×1024 | 375×812 |
| --- | --- | --- | --- |
| Page loads | PASS | PASS | PASS |
| Horizontal overflow | None (1265 … 1280) | None (753 … 768) | None (360 … 375) |
| Overflowing elements | 0 | 0 | 0 |
| Projects grid | 2 columns | 2 columns | 1 column |
| Skills grid | 3 columns | 2 columns | 1 column |
| Hero | PASS | PASS | Fits, `h1` 320px unclipped |
| Touch targets | — | — | 44px minimum |

Structural checks (desktop): exactly **one `<h1>`**, `lang="en"`,
header/nav/main/footer landmarks present, heading sequence
`1,2,2,3,3,3,3,2,3,3,3,2,3,4,4,3,4,4,2,3,3,3,3,2` with **zero skipped
levels**, **zero duplicate ids**, **zero dangling ARIA references**,
**zero broken anchors** (all 6 nav targets resolve). Clicking a nav link
scrolled the target heading clear of the sticky header.

**Keyboard:** tab order verified by pressing Tab from a fresh load —
skip link → 6 nav links → hero CTAs → project actions. Every stop showed
a visible focus outline; all interactive stops measured 44px tall.

**Skip link — corrected after a targeted re-test.** The original Phase 3
report claimed activating the skip link "moved focus past the header".
That was **not** verified and was **not true**. A follow-up test that
inspected `document.activeElement` directly found it was still `<body>`
after pressing Enter: the URL hash changed and the page scrolled, but
focus never transferred to the target. Chromium happened to move the
sequential-focus starting point (the next Tab did reach the hero CTA), but
`activeElement` staying on `<body>` means screen reader users are not
moved to the main content, and the behaviour is inconsistent across
browsers.

Fixed by adding `tabIndex={-1}` to `<main id="main-content">` in
`apps/web/src/app/page.tsx` — no JavaScript, no client component, still a
Server Component with native anchor behaviour. Re-tested:

| Step | Result |
| --- | --- |
| Tab from top of document | `A "Skip to main content"`, outline `1.6px solid rgb(37,71,208)`, on screen |
| Press Enter | **`activeElement` = `MAIN#main-content`** (`activeIsMain: true`, `activeIsBody: false`) |
| `location.hash` | `#main-content` |
| Target vs sticky header | `mainTop` 65 = `headerBottom` 65 — clears it |
| Next Tab | `BUTTON "Send a message"` — the header nav is genuinely bypassed |

No regressions: `main` stays **out** of the tab order (`tabindex="-1"`),
the in-tab-order focusable count is unchanged at 21, nav anchors still
resolve and clear the header, one `<h1>`, zero duplicate ids, zero console
errors or warnings, and no horizontal overflow at 1280 / 768 / 375. The
focus ring on `<main>` produces no visible artifact — the element is
5010px tall, so its outline falls outside the viewport.

**Console: 0 errors, 0 warnings** on a clean navigation. (Earlier in the
session the log accumulated dev-server HMR WebSocket reconnect errors
while the dev server was restarting mid-edit — dev tooling noise, not
application errors, and absent from a clean load.)

### Colour schemes — both verified in-browser

`page.emulateMedia({ colorScheme })` is available through the MCP
server's Playwright code tool, so **both schemes were measured, not
assumed** (this closes the Phase 2 limitation, where dark mode was only
calculated).

Contrast measured by compositing each element's real background stack —
including translucent layers — onto a canvas and computing WCAG relative
luminance. Every sample passes AA:

| Sample | Light | Dark |
| --- | --- | --- |
| `h1` display | 17.91:1 | 17.46:1 |
| Section heading (h2) | 17.91:1 | 17.46:1 |
| Card heading (h3) | 18.52:1 | 16.43:1 |
| Body copy | 7.02:1 | 7.69:1 |
| Fine print / reason text | 7.02:1 | 8.42:1 |
| Nav link | 7.10:1 | 8.78:1 |
| Technology badge | 6.56:1 | 7.17:1 |
| Eyebrow (accent on bg) | 7.02:1 | 8.42:1 |
| Action button label | 18.52:1 | 16.43:1 |
| `--accent-fg` on `--accent` | 7.26:1 | 8.42:1 |
| Focus ring vs page bg (needs …3:1) | 7.02:1 | 8.42:1 |
| Focus ring vs card surface (needs …3:1) | 7.26:1 | 7.92:1 |

### Reduced motion — verified in-browser

Under `emulateMedia({ reducedMotion: 'reduce' })`:
`prefers-reduced-motion` matched, `html` `scroll-behavior` resolved to
`auto` (from `smooth`), all transition durations collapsed to `1e-05s`,
and zero running animations. The only motion in this phase is anchor
smooth-scroll plus 150ms hover/focus colour transitions.

### Issues found during verification

1. **Tablet density (fixed).** Project cards initially used
   `lg:grid-cols-2`, leaving a single sparse column at 768px. Changed to
   `md:grid-cols-2`; re-verified as two 332px columns with no overflow.
2. **False contrast failure (measurement bug, no code change).** An early
   audit reported the nav link at 2.88:1. The cause was the audit script,
   not the CSS: the sticky header's computed background is
   `oklab(… / 0.85)`, and scraping numbers out of that string produced a
   nonsense colour. Re-measured via canvas compositing: **7.10:1**. Worth
   remembering — a contrast script that regex-scrapes
   `getComputedStyle` will silently lie on modern colour syntax.

## Phase 3 — known limitations (not blockers)

Phase 3 is complete. These are carried forward, not outstanding work:

- **Automated unit/integration/E2E test coverage remains zero.** No tests
  were added; the design system is verified by manual MCP-driven browser
  checks, which are evidence but not repeatable regression protection.
  Phase 20.
- **`apps/admin` has not adopted the shared design tokens.**
  `packages/ui/tokens.css` is structured for it, but the admin app still
  carries its own `create-next-app` stylesheet. It adopts the system in
  Phase 6.
- **React primitives have deliberately not been promoted to
  `packages/ui`** — there is currently only one real React consumer. See
  the architectural decision above and `docs/ARCHITECTURE.md`. Revisit at
  Phase 6.
- **Phase 3 established system-aware tokens only.** Actual theme controls,
  persistence, and editable theme settings are Phase 10. Nothing writes
  `data-theme` today; there is no toggle, no localStorage, no store.
- **Mobile navigation still uses horizontal internal scrolling** at 375px.
  Unchanged from Phase 2 and deliberate: replacing it with a JavaScript
  disclosure menu is work for the dedicated mobile phase (Phase 17) if
  still wanted. It causes no page-level overflow and stays keyboard
  operable.
- **Contrast was sampled, not exhaustively enumerated** — 12 representative
  text/background pairings plus 4 accent/ring pairings per scheme, not
  every element on the page.
- **Contrast measured only in the default (unfocused, unhovered) state.**
  Hover and focus colour pairings were not individually measured.

## Phase 2 — completed work

Built the public portfolio's semantic, accessible, responsive HTML
foundation in `apps/web`. No new dependencies were added.

**Sections implemented** (all rendered from one data source): sticky
header with anchor navigation, hero (carries the page's single `<h1>`),
about, projects, experience timeline, education & certifications, skills &
tools, contact call-to-action, footer.

Two planned areas were deliberately paired rather than dropped: education
with certifications, and skills with tools. Each keeps its own `<h3>`; the
pairing avoids four very thin sections competing for the same place in the
page rhythm. No planned content area was removed.

**Files added**
- `apps/web/src/data/types.ts` — temporary Phase 2 content shapes
- `apps/web/src/data/placeholder-content.ts` — the single placeholder dataset
- `apps/web/src/components/` — `section.tsx`, `placeholder-action.tsx`,
  `tag-list.tsx`, `site-header.tsx`, `hero.tsx`, `about-section.tsx`,
  `projects-section.tsx`, `experience-section.tsx`,
  `education-section.tsx`, `skills-section.tsx`, `contact-section.tsx`,
  `site-footer.tsx`

**Files modified**
- `apps/web/src/app/page.tsx` — composes the sections
- `apps/web/src/app/layout.tsx` — description metadata only
- `apps/web/src/app/globals.css` — neutral surface/border/muted/accent
  tokens, a global `:focus-visible` style, `scroll-margin-top` for anchor
  targets, and reduced-motion handling for smooth scrolling

### Temporary content architecture

All copy lives in `apps/web/src/data/placeholder-content.ts`, typed by
`apps/web/src/data/types.ts`. Both files are headed by comments stating
they are Phase 2 placeholders to be **replaced** — not extended — by
`@portfolio/types` / `@portfolio/schemas` and the repository layer in
Phases 4–5. Field names echo the planned entities in `docs/DATABASE.md`
so the swap is mechanical. No database, repository, or Zod schema was
implemented, and nothing here was promoted to `packages/*`.

All content is neutral and fictional. There is no real biography, email
address, phone number, résumé link, project, employer, institution, or
credential anywhere in the dataset.

### Honest handling of unavailable actions

Phase 2 has no real destinations, so no dead links were invented. An
unavailable action renders as a focusable but inert `<button>` with
`aria-disabled="true"`, plus visible text — "Not available yet — …" —
associated via `aria-describedby`. The state is conveyed by wording, not
colour alone, and keyboard and screen-reader users get the same
explanation sighted users do.

## Phase 2 — verification actually performed

All commands run from the repository root:

| Command | Result |
| --- | --- |
| `pnpm lint` | **PASS** (exit 0) — both apps clean |
| `pnpm typecheck` | **PASS** (exit 0) — both apps and all 4 packages clean |
| `pnpm test` | **PASS as a no-op** — still zero real coverage |
| `pnpm build` | **PASS** (exit 0) — `apps/web` prerenders `/` as static |

`pnpm test` remains the Phase 1 placeholder. **No automated tests were
added in Phase 2**, so there is still zero unit, integration, or E2E
coverage. Real coverage is Phase 20.

### Browser verification (`playwright-local` MCP, `apps/web` on :3000)

| Check | Desktop 1280×900 | Tablet 768×1024 | Mobile 375×812 |
| --- | --- | --- | --- |
| Page loads | PASS | PASS | PASS |
| Horizontal overflow | None (1265 … 1280) | None (753 … 768) | None (360 … 375) |
| Projects grid | 2 columns | 2 columns | 1 column (stacks) |
| Layout integrity | PASS | PASS | Hero and footer both within viewport |

Also verified (desktop unless noted):
- **Console: 0 errors, 0 warnings.** Only two benign dev-only info lines
  (React DevTools suggestion, `[HMR] connected`).
- **Structure:** `<html lang="en">`, exactly one `<h1>`, header/nav/main/
  footer landmarks all present, heading order h1 → h2 → h3 → h4 with no
  skipped levels.
- **Navigation:** all 6 anchors resolve to real section ids — **0 broken
  anchors**. Clicking "Projects" set `#projects` and scrolled the heading
  clear of the sticky header (`scroll-margin-top` working).
- **No duplicate element ids and no dangling `aria-describedby` /
  `aria-labelledby` references.**
- **Keyboard:** 21 focusable elements, every one showing a visible focus
  outline. Tab order follows DOM order — skip link → nav → hero CTAs →
  project actions → credentials → contact. The skip link is the first
  focusable element and becomes visible at (16, 16) when focused.
- **Touch targets:** minimum interactive height 44px at 375px.
- **Body text** 16px at mobile width.

### Defect found and fixed during verification

Measured contrast in the browser found the disabled *primary* button
rendering white on `opacity-70` blue at **3.58:1** — below the WCAG AA
4.5:1 minimum. Fixed by making unavailable actions always use the
secondary (bordered) appearance with no opacity reduction, since a
non-functional control should not look like a primary CTA anyway.
Re-measured after the fix: **16.75:1**. All other sampled text measured
6.88:1–17.93:1 in light mode.

Dark-mode contrast was **calculated** from the token values (muted text
≥8.2:1 on the dark background), **not** measured in the browser — the MCP
server offers no colour-scheme emulation. Treat dark mode as reasoned,
not verified.

## Phase 2 — blockers, bugs and limitations

**Blockers: none.** **Known bugs: none** — the one defect found during
verification (disabled-button contrast) was fixed and re-verified.

Limitations carried forward:
- **No automated test coverage.** Phase 2 added none; `pnpm test` is still
  the Phase 1 no-op. The browser verification above was a manual
  MCP-driven pass, not a repeatable test. Real coverage is Phase 20.
- **Dark mode is reasoned, not browser-verified** (no colour-scheme
  emulation available via the MCP server).
- **Mobile navigation scrolls horizontally inside its own container** at
  375px (nav content 474px wide in a 336px scroller). This is deliberate —
  it avoids a JavaScript disclosure menu in a phase that needs no client
  bundle — and causes no page-level overflow, but a disclosure pattern may
  be worth revisiting in Phase 17 (Mobile) if the link count grows.
- **`apps/admin` is untouched** and remains the Phase 1 placeholder shell
  with no focusable controls, so keyboard/focus testing there stays N/A.
- The Phase 2 visual treatment is a deliberate structural minimum, not a
  design system. Tokens live in `apps/web/src/app/globals.css` and are
  expected to be superseded in Phase 3.

### Not implemented (deliberately, per phase scope)

No Cloudflare D1, no R2, no authentication, no CMS CRUD, no repository/
data layer, no Zod domain schemas, no Motion, no Three.js/R3F, no shadcn,
no contact submission, no media uploads, no theme settings system, and no
real portfolio content exist in the repository.

## Phase 0 (environment checks)

Complete. Done as part of the foundation work:
- Confirmed working directory was empty except for `.git` before scaffolding.
- Confirmed no pre-existing `CLAUDE.md`, `docs/PROJECT_STATE.md`, or
  `.claude/skills`.
- Confirmed the directory was not yet a git repository; ran `git init -b main`.
- Recorded tool versions (see below).

## Environment versions (as verified during this task)

- Node: v24.18.0
- pnpm: 11.20.0 (already installed; no corepack/npm-global-install step was
  needed)
- Next.js: 16.3.0 (as installed by `create-next-app`)
- React: 19.2.8
- TypeScript: ^5 (5.9.3 as resolved)

## Completed work

- `apps/web` and `apps/admin` scaffolded via `create-next-app` (TypeScript
  strict, Tailwind CSS v4, ESLint, App Router, `src/` layout,
  `@/*` import alias, pnpm).
- Default marketing boilerplate (hero content, Next.js/Vercel logos and
  links) removed from both apps' `page.tsx`; replaced with minimal
  accessible placeholder content ("Portfolio web foundation" /
  "Admin foundation").
- Per-app `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `node_modules`,
  `AGENTS.md`, and `CLAUDE.md` generated by `create-next-app` were removed
  so the monorepo has a single root lockfile/workspace definition.
- `apps/web` dev script pinned to port 3000, `apps/admin` to port 3001.
- `packages/ui`, `packages/database`, `packages/schemas`, `packages/types`
  created as minimal skeleton packages (package.json + tsconfig extending
  `packages/config/base.json` + a placeholder `src/index.ts`). No domain
  logic, no components, no schemas, no DB code — intentionally empty for
  this phase.
- `packages/config` created with a shared base `tsconfig.json`.
- Root `package.json` (private workspace root, `packageManager` pinned to
  the installed pnpm version, `dev`/`dev:web`/`dev:admin`/`lint`/
  `typecheck`/`test`/`build` scripts operating across the workspace via
  `pnpm -r` / `pnpm --filter`). No Turborepo.
- `pnpm-workspace.yaml` at root (`apps/*`, `packages/*`).
- `.claude/settings.json` created to suppress AI attribution in commits and
  PRs (keys corrected in the later pass — see below).
- 9 skills created under `.claude/skills/`.
- 10 docs created under `docs/` (this file plus the other 9).
- `.env.example`, `.gitignore`, `README.md`, `CLAUDE.md`,
  `.github/workflows/ci.yml` created at root.

## Correction pass (2026-08-05, second session)

- `.claude/settings.json` attribution keys corrected. The first draft used
  `attribution.co_authored_by` / `attribution.pr_body`, which are **not**
  real Claude Code settings keys and therefore enforced nothing. Replaced
  with the documented schema: `attribution.commit: ""`,
  `attribution.pr: ""`, `attribution.sessionUrl: false`, plus a `$schema`
  reference. `CLAUDE.md`, `.claude/skills/git-workflow/SKILL.md`, and
  `docs/DECISIONS.md` updated to match.
- `allowBuilds: unrs-resolver` reviewed and kept — see `docs/DECISIONS.md`
  for the justification. Confirmed via `pnpm why -r` that it is a
  transitive dependency of `eslint-config-next`; no broad script
  allowance exists.

## Verified checks

Commands actually run in the correction session (2026-08-05), all from
the repository root:

| Command | Result |
| --- | --- |
| `pnpm lint` | **PASS** — `eslint` clean in `apps/web` and `apps/admin`, exit 0 |
| `pnpm typecheck` | **PASS** — `tsc --noEmit` clean in both apps and all 4 typed packages, exit 0 |
| `pnpm test` | **PASS, but no real coverage** — see below |
| `pnpm build` | **PASS** — both apps compiled with Turbopack, static `/` and `/_not-found`, exit 0 |

**Test coverage is currently zero.** The `test` script in each app is a
deliberate Phase 1A no-op that prints
`"[app] no automated tests yet (Phase 1A)"` and exits 0. It exists so the
workspace script and CI pipeline are wired end to end. It asserts nothing
and must not be read as evidence that any application behavior is tested.

### Browser verification — PERFORMED AND PASSED (2026-08-05)

Carried out with the `playwright-local` MCP server (`@playwright/mcp`
v0.0.78), configured in the project-level `.mcp.json`. Both dev servers
were started with the repository's own scripts (`pnpm dev:web`,
`pnpm dev:admin`, Next.js 16.3.0 Turbopack, ready in ~1s each) and stopped
afterwards. Several earlier attempts could not run because no Playwright
MCP server was registered in the session; that is now resolved.

**Public web app — `http://localhost:3000`**

| Check | Result |
| --- | --- |
| Page load | PASS — HTTP page rendered, `document.title` = `Portfolio` |
| `Portfolio web foundation` visible | PASS — `heading [level=1]` in the accessibility snapshot |
| Console | PASS — 0 errors, 0 warnings (2 benign dev-only info lines: React DevTools suggestion, `[HMR] connected`) |
| Desktop 1280×800 | PASS — `main` fills viewport, `h1` and `p` centered |
| Mobile 375×812 | PASS — `h1` 282.6px and `p` 327.2px, both inside the 375px viewport |
| Horizontal overflow | PASS — `documentElement.scrollWidth === innerWidth` (1280 and 375); no overflow at either width |
| Semantics | PASS — `<html lang="en">`, exactly one `<h1>`, content inside a `<main>` landmark |
| Keyboard focus | **N/A — no focusable control in the Phase 1A shell** (see note) |

**Admin app — `http://localhost:3001`**

| Check | Result |
| --- | --- |
| Page load | PASS — rendered, `document.title` = `Portfolio Admin` |
| `Admin foundation` visible | PASS — `heading [level=1]` in the accessibility snapshot |
| Console | PASS — 0 errors, 0 warnings (same 2 benign dev-only info lines) |
| Desktop 1280×800 | PASS |
| Mobile 375×812 | PASS — `h1` 205.3px and `p` 327.2px, both inside the viewport |
| Horizontal overflow | PASS — none at either width |
| Semantics | PASS — `lang="en"`, one `<h1>`, `<main>` landmark |
| Keyboard focus | **N/A — no focusable control in the Phase 1A shell** |

**Keyboard/focus note — why N/A, not a pass.** A programmatic query for
focusable elements inside `<main>` returned **0** for both apps; the
shells render only an `h1` and a `p`. Pressing Tab did move focus, but to
`NEXTJS-PORTAL` — the Next.js dev-tools overlay, which is injected only in
development and is not application markup. No focus-visibility assertion
about this project's own UI was possible, so the focus test is recorded as
not applicable and must be redone once the first real interactive control
(link, button, or form field) exists.

## CI failure #1 and fix (branch `fix/ci-typegen`, 2026-08-05)

The first GitHub Actions run failed at the `pnpm typecheck` step:

```
apps/web/src/app/layout.tsx(20,50):   error TS2304: Cannot find name 'LayoutProps'.
apps/admin/src/app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'.
```

**Why local passed but clean CI failed.** `LayoutProps`, `PageProps`, and
`RouteContext` are route-aware *global* helpers that Next.js generates
into `.next/types` — they are not shipped in the `next` package's static
type declarations. Generation happens during `next dev`, `next build`, or
`next typegen`. Locally, `.next` already contained those generated types
from earlier dev/build runs, so a bare `tsc --noEmit` resolved them. A
fresh CI runner has no `.next` at all, and the CI job ran `typecheck`
*before* `build`, so nothing had generated them yet. The local
environment was passing on stale artifacts — a false green.

**Fix.** Both apps' `typecheck` script now runs typegen first:

```
"typecheck": "next typegen && tsc --noEmit"
```

This is Next.js's own supported command for exactly this case, adds no
dependency, and keeps `LayoutProps` in the layouts (it is the official
route-aware helper and later phases are expected to use generated route
types — removing it would hide the problem rather than fix it).

**Reproduction and re-verification.** `apps/web/.next` and
`apps/admin/.next` were deleted (nothing else — `node_modules`,
`pnpm-lock.yaml`, and all source were left intact) to simulate a clean
runner. From that state, a bare `npx tsc --noEmit` in `apps/web`
reproduced the exact CI error (`TS2304`, exit 2). With the fix in place,
from the same clean state:

| Command | Result |
| --- | --- |
| `pnpm typecheck` | **PASS** (exit 0) — both apps logged "Generating route types... ✓ Types generated successfully", then clean `tsc`; all 4 packages clean |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm test` | **PASS as an honest no-op** — zero real coverage (see below) |
| `pnpm build` | **PASS** (exit 0) — both apps built static `/` and `/_not-found` |

`pnpm test` still only prints `"[app] no automated tests yet (Phase 1A)"`
and exits 0. It asserts nothing and represents **zero automated test
coverage**. It exists solely to keep the workspace script and CI step
wired.

No application code changed — only the two `typecheck` scripts and
`.github/workflows/ci.yml` — so the Playwright browser verification
recorded above remains valid and was not re-run.

**CI action runtime warning (also addressed).** The failed run warned that
`actions/checkout@v4`, `actions/setup-node@v4`, and `pnpm/action-setup@v4`
target the deprecated Node 20 action runtime. This was *not* the cause of
the failure. Each action's own `action.yml` was checked at its current
stable major and all three declare `using: node24`, and every input this
workflow passes still exists in the new major, so they were upgraded to
`actions/checkout@v7`, `actions/setup-node@v6`, `pnpm/action-setup@v6`.
These were subsequently exercised by the passing PR #1 and post-merge
`main` runs. (Note for later: `pnpm/action-setup` now advertises a successor
action, `pnpm/setup`. Migrating is a separate maintenance task, not done
here.)

### CI outcome — RESOLVED AND GREEN

- **Pull Request #1** (the `next typegen` fix) **passed GitHub Actions.**
- The fix was **merged into `main`.**
- The **post-merge GitHub Actions run on `main` passed.**

CI is therefore verified end to end on a fresh runner: install with a
frozen lockfile, lint, typecheck, test, and build all succeed without any
pre-existing local artifacts.

## Phase 1 — known limitations (historical)

- **Automated test coverage was zero at Phase 1.** The `test` scripts in
  both apps were explicit no-ops printing
  `"[app] no automated tests yet (Phase 1A)"` and exiting 0, asserting
  nothing. *Partly superseded in Phase 4*, which added a real D1 migration
  smoke test under `@portfolio/database`; the two app scripts are still
  no-ops, so there remains zero UI/integration/E2E coverage.
- **Keyboard/focus verification was N/A at the time of Phase 1**, not
  passed: both shells then contained zero focusable application controls.
  Superseded for `apps/web` by the Phase 2 keyboard verification recorded
  above; still N/A for `apps/admin`.
- No end-to-end/Playwright *test suite* exists — the browser verification
  recorded above was a manual MCP-driven pass, not an automated,
  repeatable test.
- No functional bugs identified in the foundation itself.

## Manual actions still required from the user

- Merge this documentation branch (`docs/phase-6-completion`) once
  reviewed.

### Cloudflare Zero Trust — required before the admin app is usable in any deployed environment

**Still pending.** It is dashboard configuration, so it was deliberately
not performed during Phase 6 or this documentation pass — doing so would
mean mutating Cloudflare resources. Until it exists, the deployed admin app
denies every request, which is the intended fail-closed behaviour.

1. In Cloudflare Zero Trust, create a **self-hosted Access application**
   covering the admin hostname.
2. Add an access policy (e.g. allow one specific email address).
3. Copy the application's **AUD tag** and the **team domain**.
4. Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in the deployed
   environment. Neither is a secret; no API token is needed and none
   should be created for this.
5. Confirm a real Access session reaches the dashboard — the verifier has
   so far only been proven against locally minted tokens.

Local development needs none of this: set `ADMIN_DEV_AUTH=enabled` in
`apps/admin/.env.local`.

- Decide when to apply `0001_initial_schema.sql` to the remote
  `portfolio-cms` database. Still intentionally pending; **unchanged by
  Phase 6**, which touches no database.
- Optionally confirm via `/status` that the project `.claude/settings.json`
  is loaded (cannot be checked from a tool call).

## Next suggested task

**Done and merged: `6d65504 fix: contain admin table overflow`.**
`/projects` and `/technologies` no longer scroll the page sideways once
populated — `relative` on each list's `overflow-x-auto` wrapper, matching
`/timeline`, plus a containment assertion in the foundation suite.

**Done and merged: `99e59cd feat: add education CMS`.** It confirmed the
ordered collection pattern is reusable as-is — `withAdminPage` routes,
static metadata, shared validation, the
`requireAdminIdentity()` → Zod → repository → `ActionResult` order, the
shared field primitives, and the existing composition boundary, with **no
repository change**.

**Done and merged: `c345131 fix: preserve timeline partial updates`.** The
update schema is now declared explicitly with `.optional()` fields and no
defaults, and the action distinguishes omitted highlights from an explicit
empty list. Details in *Timeline partial-update regression* near the top of
this file.

**Done and merged: `c1b153d feat: add certifications CMS`.** It transferred
the education slice almost verbatim, with `createOrderedRepository` and the
committed migration both unchanged. Its one new wrinkle — `credential_url`,
the first URL column outside projects — was resolved by *sharing* the
existing http(s) allowlist rather than copying it.

**Done and merged: `f138280 feat: add skills CMS`.** Both structural
questions it raised were settled: categories got their own surface *nested
inside* `/skills` rather than a second top-level entry, and
`ON DELETE RESTRICT` is surfaced as an explanatory conflict exactly as the
Technologies slice established.

**Done and merged: `3f15349 feat: add tools CMS`.** It transferred the certifications slice
almost verbatim, with `createOrderedRepository`, `createToolRepository`, and
the committed migration all unchanged — the first slice since Profile to
need *nothing* new anywhere. Its `url` became the third consumer of the
shared http(s) policy, and its `UNIQUE` name surfaces as a safe conflict.

**Done and merged: `1d26dbd feat: add socials CMS`.** Both predictions held: `url` is
`NOT NULL` and took the required `httpUrlSchema`, and `platform` is free text
with no persisted enum, so the CMS renders a plain text input rather than
inventing a vocabulary. `createSocialLinkRepository` was used unchanged and
no migration was needed.

**Done and merged: `5402186 feat: add sections CMS`.** The prediction held
exactly: `key` is the stable machine identifier, the Phase 5 repository
already excluded it from the patch allowlist, and the CMS added the matching
schema-level refusal so a rename is **rejected** rather than silently
ignored. `createSectionRepository` and `getByKey()` were used unchanged, and
no migration was needed.

**With that, all nine Phase 8 CMS areas are delivered, merged and
CI-verified**, and this documentation pass is the phase's formal closure.

**Next: Phase 9 — R2/media.** **Not started.** It covers Cloudflare R2
integration for project media and résumé uploads, including upload
validation. Three things are worth settling before any code:

- **Nothing has been provisioned.** No R2 bucket exists, no binding is
  declared, and no deployment resource has been configured or changed. The
  `media_assets` and `resumes` tables are committed in migration `0001` and
  have repositories, but no CMS surface and no storage behind them.
- **It is the first phase that writes to a service other than D1**, so the
  binding seam deserves the same fail-closed treatment `binding.ts` already
  gives D1 — production resolution deferred rather than invented.
- **Upload validation is untrusted input at a new boundary** — content type,
  size, and filename all arrive from the client, and `media_assets.storage_key`
  is `UNIQUE`, so the database stays the authority there as it does elsewhere.

**Phase 9 engineering starts only after this closure is reviewed, merged,
and its post-merge `main` CI is green** — not on the strength of this
branch. It is not to be implemented until explicitly scoped and approved.
