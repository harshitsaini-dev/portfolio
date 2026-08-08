# Learning Log

Notes on things learned while building this project that are worth
remembering for future work.

## Phase 9 — media service

### Measure the dependency's semantics before designing around them

Two facts about `put` decided most of this slice, and neither was knowable
from the type: an unconditional put never returns `null`, and a put overwrites
silently. Both took one throwaway probe against a real local bucket.

The first invalidated an instruction the foundation had written for its own
future caller. The second turned "duplicate keys are practically impossible"
from a reassurance into a data-loss hazard — because the destruction happens
*before* the duplicate is detected, and nothing raises at the moment it
happens.

A plan written from types alone will be confidently wrong about anything the
types cannot express, and "what does this return when it declines" and "what
happens to the existing value" are exactly that kind of question.

### The dangerous failure is the one that does not raise

`project_media` and `resumes` are `ON DELETE RESTRICT` and would have thrown.
`projects.cover_media_id` and `site_settings.social_image_id` are
`ON DELETE SET NULL`: the delete succeeds and a published project quietly
loses its cover image.

The instinct is to write `try { delete } catch (fk) { ... }` and feel covered,
because the loud half of the problem is handled. Half the references produce
no error at all, so the catch block is a comfort rather than a control. When
constraints in one table disagree about deletion, "does it throw?" stops being
a usable proxy for "is it safe?".

### A refusal that fires for the wrong reason still reads as a pass

The collision test refused the second create and asserted the refusal, so it
looked green. It was refusing on a **type mismatch** — the intruder payload
was PDF bytes declared as PNG — and never reached the key reservation it
existed to prove.

Asserting the *reason*, not just the outcome, is what caught it. That is the
same lesson the partial-update fix produced from the other direction: there,
a preservation check passed because it inspected a field that could not fail;
here, a refusal check passed because something refused earlier. Both are
tests that would keep passing after the code they guard was deleted.

### `Promise.all` on two fail-closed seams leaks the one that succeeds

`getAdminMediaService()` originally resolved storage and repositories with
`Promise.all`, which is the reflexive choice for two independent awaits. It
was wrong in a way no type or unit test would show.

The storage seam fails closed while no bucket exists, so the call always
rejects. But `Promise.all` had already *started* the database resolution, and
the database seam's development path spawns a real `getPlatformProxy()`
workerd process. Nothing disposed it, because the function threw before it
could return anything to dispose. Every failed call leaked a process.

It surfaced as the **next test suite hanging**, several minutes later, with
its own migration step wedged behind the orphan — which is about as far from
the cause as a symptom can get. The tell was that the suite passed in
isolation and only hung when run after this one.

Resolving sequentially fixes it and is better anyway: the seam expected to be
unavailable should decide first, so a request that cannot proceed never pays
to open a binding. **Parallelism is not free when the operations acquire
resources and one of them is expected to fail.**

The test now pins the database provider before asserting the storage failure,
and asserts the database provider is **never consulted** — so the leak cannot
come back quietly.

### A thrown write does not prove nothing was written

The compensation logic assumed that if `create()` threw, the insert had not
happened. That is true of the INSERT itself — it is wrapped in a try — but
the repository then reads the row back *outside* that try, so a read-back
failure throws with the row already committed. Compensating there deleted
the object out from under a live row.

The irony is exact: the mechanism whose entire purpose is preventing a
metadata row that points at a missing object was the only thing that could
produce one. Ordering the two writes correctly is necessary and not
sufficient; the *recovery* path needs the same scrutiny as the happy path,
because it runs precisely when the system is already misbehaving.

The general rule: before undoing step A because step B failed, establish
what step B actually did. "It threw" is not a state.

Two follow-ons worth keeping. A failed *check* is a third state, not a
synonym for "no" — writing `getByStorageKey(key).catch(() => null)` would
have reintroduced the bug in one line while looking defensive. And the
reviewing eye that caught it was reading the collaborator's error paths, not
its success paths; every test in the suite passed both before and after.

### Compensation has three outcomes, not two

The obvious pair is "compensated" and "did not compensate". The third — the
compensating action itself failing — is where the reporting goes wrong: it is
tempting to surface the *cleanup* error, because it is the most recent thing
that happened.

The caller does not care that cleanup failed; they care that their upload did
not happen. So the original failure stays primary, and the orphan travels as a
separate signal to a separate audience. Getting that ordering right needed a
test that arms two faults in sequence, which is only possible because the fake
allows it.

## Phase 9 — storage foundation

### Check what the tooling can already do before designing around its absence

The audit concluded that local R2 would need `r2_buckets` in a committed
config, so it planned for the in-memory fake to be the only local storage.
That conclusion was reasonable and wrong. `getPlatformProxy()` accepts a
`configPath`, so a **throwaway config in a temp directory** gets a real
miniflare-backed bucket while every committed file stays untouched — the
same trick `d1-type-compatibility.mjs` was already using to generate
Cloudflare types without adding a dependency.

The pattern was in the repository the whole time, one directory away from
where the plan was written. Worth ten minutes of prototyping before accepting
a constraint: the difference here is a whole layer of real-storage
verification the plan had written off.

### A fake needs a source of truth, and types are not enough

Three mechanisms keep this fake honest, and it is worth being clear about
what each one *cannot* catch. `tsc` against Cloudflare's `R2Bucket` catches a
contract of the wrong shape but says nothing about behaviour. The real
simulated bucket catches behaviour — that a missing `get` returns `null`
instead of throwing, that deleting an absent key is not an error — which no
type can express. Writing the fake in TypeScript catches the fake drifting
from the contract, which neither of the others would notice.

The order matters too: every semantic is asserted against **real storage
first**, then of the fake. Written the other way round, the "real" test
becomes a check that reality matches our assumption rather than the source of
the assumption.

### Structural impossibility beats validation, when it is available

The obvious way to get a safe object key from an upload is to sanitise the
filename. It is also a blocklist, and it has to anticipate `..`, backslashes,
control characters, null bytes, reserved device names, Unicode normalisation
collisions, and case-insensitive clashes — and it stays wrong until the last
one is found.

Generating the key instead means **no user byte is in it**, so there is
nothing to sanitise and traversal is not prevented but impossible. The test
for it is unusual and worth copying: rather than feeding hostile filenames
through a sanitiser and checking the output, it asserts the function **takes
no filename parameter at all**. An absent code path cannot regress.

### An error taxonomy can be too informative

"Unknown format" and "known format we do not accept" felt like they wanted
separate rejection reasons — the second is more helpful to a user, after all.
Collapsing them was the better call: distinguishing them lets a client
enumerate which formats are recognised-but-refused, and, more practically, it
puts a signpost in the code saying "here is the branch where you would allow
GIF". A closed set of five reasons is enough to act on and gives nothing away.

## Projects and Technologies partial-update fix

### Picking the assertion field *is* the test

Both suites already had a preservation check, and both picked a field that
could not fail: Projects asserted `summary` survives an edit, Technologies
asserted `partial.data?.slug === undefined`. Neither field carries a
`.default()`, so `.partial()` never materialised either one. Every field that
*did* have a default went unchecked — including the eight scalars and three
collections that were being destroyed.

A preservation test is only as good as the field it inspects. The rule now:
assert the fields that carry **create defaults**, set to deliberately
non-default values, and prefer asserting the whole row over choosing a
representative at all. The fixtures for this fix are published, featured,
positioned at 7 and 9, with populated prose and dates and one of each
relationship — every one of them a field the old parse would have flattened.

### Testing the layer below the broken one proves nothing about it

`technologies-tests.mjs` genuinely did prove that a name-only patch preserves
`category`. It built the patch by hand and passed it to the repository — and
the repository was never broken. `buildPatch` skips `undefined` correctly and
always did.

The bug lived in the **schema**, which manufactures keys the caller never
sent. A test that skips the schema and starts at the repository is testing
the half that works. For a boundary defect, the payload has to enter at the
boundary; otherwise the test is shaped like the fix rather than like the bug.

### Verify a regression test by watching it fail

Every new check here was run against the pre-fix schemas before being
trusted: 23 fail in Projects, 4 in Technologies, 8 in the Server Action
suite, with the failure text naming the exact destruction
(`status is preserved — expected "published", got "draft"`). That took one
temporary revert and three runs.

It is worth the minutes. A regression test that has never been observed
failing is a guess about what the bug was, and this repository now has two
examples of a test that passed while the bug it was named after was live.

### The fix was smaller than the bug

The blast radius was ten fields and three relationship tables across two
merged CMS areas. The repair is **two schema files** and no change to any
repository, action, component, or migration.

That ratio is the tell for a boundary defect: when the wrong data is being
manufactured at the entrance, every layer downstream behaves correctly on
input that lies to it. The temptation is to add guards downstream — a
`if (input.media?.length)` in the action would have "fixed" the media
symptom — and each such guard would have made the real contract harder to
see and left the scalar corruption untouched.

## Phase 9 — R2/media audit

### The third occurrence of a bug means the *rule* was never enforced

`.partial()` over a defaulted create shape has now caused the same defect
three times: education (caught pre-merge), timeline (caught post-merge and
fixed in `c345131`), and projects and technologies (found by this audit and
fixed in the task that followed it).

After the second occurrence the rule was written into `ARCHITECTURE.md` and
every entity built afterwards followed it. What nobody did was **go back and
check the entities built before the rule existed** — and those are exactly
the ones that cannot possibly comply, because they predate it. A rule added
after the fact protects future code by default and past code never.

The cheap version of that sweep is one grep. `grep -rn '\.partial()'
packages/schemas/src` returns ten hits, eight of which are comments
*explaining why the module does not use it*, and two of which are live calls.
That asymmetry is itself the signal: when most mentions of a pattern are
apologies for not using it, the remaining uses are probably not deliberate.

### A doc that claims enforcement is worse than one that claims intent

`ARCHITECTURE.md` said the partial-update contract was "now enforced by
construction rather than by convention", and `TESTING.md` said the rule was
asserted "for every entity whose update schema exists". Both were false, and
both were *more* harmful than saying nothing: a reader auditing this area
would have read those sentences and moved on, which is presumably what
happened for two merged slices.

Claims of enforcement need the same evidence as test results. "Enforced by
construction" means there is a mechanism that makes the wrong thing
impossible — and there was none here, only a convention plus discipline. The
corrections now name the exceptions explicitly rather than softening the
wording, because a reader needs to know *which* entities are unsafe, not that
some might be.

### A passing test can be passing for the wrong reason

`projects-tests.mjs` has a check literally named *"untouched fields are
preserved"*. It passes. It inspects `summary` — the one optional-ish field in
that schema carrying **no default** — so it would have passed just as happily
with the bug present, which it was.

Picking the field to assert on is not incidental to that test; it *is* the
test. The right choice is the field most likely to be clobbered — one with a
default, ideally set to a non-default value first — and the strongest version
asserts the whole row rather than choosing at all.

### Design the failure ordering before the happy path

The most useful hour of this audit went on a table of what breaks when one of
two systems fails, before any interface was sketched. It produced the
governing rule directly — metadata must never outlive its object — and that
rule then decided the write order, the delete order, the compensation, the
orphan strategy, and why `getByStorageKey()` was already the right primitive.

Had the happy path been designed first, "insert the row, then upload the
file" would have looked perfectly reasonable, and the bug it creates only
shows up as broken images in production some weeks later.

### Look for the requirement before ruling on the risk

The SVG question is usually answered from reflex — SVG carries active
content, so sanitise it or ban it. The more useful move was to check whether
anything actually needed one, and the schema answered flatly: no table
attaches a logo or icon to a tool, technology, or skill.

That turns a security trade-off into no decision at all. It is also more
durable than a ban, because it records *why* the answer might change: if
logos ever get a column, the question genuinely reopens, and the reasoning
does not have to be reconstructed.

## Phase 8 — Sections CMS

### "Unchanged" is still a field the contract does not accept

The obvious key-immutability tests are: reject a rename, and reject a rename
smuggled beside a valid field. The one that is easy to miss is rejecting
`{ key: "projects" }` when the stored key *already is* `projects`.

It is tempting to allow that — nothing would change, so what is the harm?
The harm is that it makes the contract conditional on data rather than on
shape. A client that always echoes the full object back would work by
accident until the day someone edits the key field, and then fail in a way
no test covered. `.strict()` refusing the field regardless of its value is
the simpler rule and the honest one.

### A strict rejection must refuse the whole patch, not the acceptable part

When a key is smuggled beside a legitimate `title` change, there are two
defensible-sounding outcomes: apply the title and drop the key, or refuse
everything. Only the second is safe — a partial application means the caller
got a success for a request that was half-ignored.

That is what `.strict()` already does, but it was worth an explicit
assertion (`the whole patch was refused — the title is unchanged too`)
rather than trusting the library. The test costs one line and documents an
intent that a future refactor could quietly break.

### Read-only is a presentation decision, not just a disabled input

The edit form shows the section key in a `<dl>`, not a `<input disabled>` or
`<input readonly>`. Both of those still *look* like form controls: disabled
reads as "temporarily unavailable, maybe I can enable it", and readonly is
focusable and copyable but still visually a field. Neither is honest about a
value that cannot change in this UI at all.

The structural test followed from the presentation choice: assert there is
**no input named `key` anywhere**, and **no disabled or readonly input at
all**. Both are things a future contributor might reach for while "improving"
the form, and both would now fail loudly.

## Phase 8 — Socials CMS

### A wrapper's exit code is not the command's exit code

A full `pnpm test` + `pnpm build` run was interrupted. The background task
reported **exit code 0** and "completed" — but its captured output ended with
`test: -1`. The test phase had been *terminated*; only the build had actually
finished. Reporting that as a pass would have been a fabricated green.

The habit worth keeping: when a long run is interrupted for any reason, read
the **inner** result line, not the task's summary. And if the inner result is
missing or negative, re-run rather than reconstruct. Orphaned processes from
the killed run had to be cleared first, or the re-run inherits their locks.

### Free text is a schema fact, not a UI shortcut

`social_links.platform` is `TEXT NOT NULL` with no CHECK, no enum, no lookup
table. A dropdown of GitHub / LinkedIn / X would have looked more polished
and been strictly wrong: it rejects values the database accepts, and it dates
the moment a new platform appears.

What made this testable rather than a matter of taste was asserting **both**
directions — eleven arbitrary values accepted (Cyrillic, Japanese,
punctuation), *and* empty / whitespace-only / over-long still rejected. "Free
text" does not mean "unvalidated", and a test suite that only proved the
first half would have permitted an empty platform.

The structural check is the one that will survive refactoring: the control is
an `<input type="text">` with no `list` attribute, and the page contains zero
`<select>` elements. That fails loudly if someone later adds a vocabulary.

### NOT NULL changes which shared validator applies

Three entities now store a URL. Certifications and Tools use
`nullableHttpUrlSchema` because their columns are nullable; Socials uses
`httpUrlSchema` because `url` is `NOT NULL`. Same allowlist, different
emptiness contract — blank means "no link" in two of them and "validation
error" in the third, and an update may clear the first two but never the
third.

Reaching for the shared helper is right; reaching for the *same variant*
without re-reading the column definition would have quietly allowed a blank
URL into a NOT NULL column.

## Phase 8 — Tools CMS

### A shared control earns its keep on the third consumer, not the second

Extracting the http(s) allowlist for certifications was arguable at the time
— two consumers is the threshold where "share it" and "copy it" both look
reasonable. Tools was the third, and it cost one import line and zero
decisions: no reasoning about which protocols to allow, no chance of
disagreeing with the other two, and the twelve rejection cases came along
free.

The signal to extract is not the count but the *kind*: the leaf text and
position primitives are still redeclared per module and that is still right,
because a different length limit is a domain decision. A different protocol
allowlist is a vulnerability.

### A `UNIQUE` column has two write paths, and tests usually only cover one

`tools.name` is `UNIQUE`, so a duplicate can arrive on **create** or on
**rename**. The obvious test is the create collision; the rename collision is
the one that silently goes untested, because it needs two rows and an update
rather than one row and an insert.

Both are asserted here, and the rename case also checks that the refused
update left the row untouched — a conflict that half-applied would be worse
than one that failed cleanly.

## Phase 8 — Skills CMS

### A security assertion that fails on legitimate copy is still a bug — in the assertion

The leak check "no result message contains SQL or constraint text" failed on
the message "This category still contains skills." It matched `skills\.`;
the copy simply ends a sentence with the word. Nothing leaked.

The tempting fix is to delete the pattern until the suite goes green. That
converts a security check into decoration. The actual fix was to narrow it to
what a real leak looks like — a table qualifier is `skills.category_id`, a
dot followed immediately by an identifier character, which prose never is —
and then to **prove the narrowed version still fires** with three controls:
it must reject a genuine `SQLITE_CONSTRAINT` message and a
`UNIQUE constraint failed` message, and accept the prose.

The rule that generalises: whenever you loosen an assertion to fix a false
positive, add the negative control in the same edit. Otherwise the next
person cannot tell a check that passes from a check that cannot fail.

### "Don't cascade" is a product decision the schema already made

`ON DELETE RESTRICT` on `skills.category_id` is not an obstacle to route
around; it is the schema stating that skills must not be destroyed as a side
effect of tidying up categories. The CMS's job was to *explain* that, not to
pre-delete children so the parent delete would succeed.

The tell that you are about to do the wrong thing: writing a loop that
deletes child rows before a parent delete "for a better UX". If the database
says no, the interface should say why.

### An accepted-but-ignored field is worse than a rejected one

`categoryId` is not updatable. The lazy option is to let the update schema
accept it and let the repository's allowlist silently drop it — no error, no
crash. But the caller then sees a success response for a move that never
happened, and the bug surfaces later as "the CMS lost my change."

`.strict()` rejecting it is louder and correct. Silence is the expensive
option when the caller's mental model is wrong.

## Phase 8 — Certifications CMS

### "Don't duplicate" and "don't touch that file" can genuinely conflict

The brief said to reuse the projects URL rule *and* not to change projects.
The symbol was not exported, so both could not be literally true. The
resolution was to ask which instruction protected something real: the
"don't touch" guard exists to prevent behaviour changes and scope creep, and
a pure extraction changes neither, whereas copying a protocol allowlist
creates a second control that can drift into accepting `javascript:`. So the
rule moved to a shared module, projects' behaviour stayed identical, its 96
checks acted as the regression proof, and the deviation was reported
explicitly rather than quietly.

The generalisable line: **share what is dangerous when it diverges, keep
per-module what is merely a preference.** Length limits are preferences.
Protocol allowlists are not.

### A canary probe can pass for the wrong reason — and fail for one too

The first confidentiality run reported a leak. It had not leaked: the canary
token was grepped case-insensitively and matched the *row id in the request
URL*, which the redirect body echoed. The real content was never disclosed.

Two lessons, and the second is the one that matters more. First, a canary
token must not overlap anything that legitimately appears in a URL, header,
or id. Second, the reason the false positive was caught at all is that the
probe was paired with a **positive control** — the same probe against an
authorized request, which found all four tokens and returned 200. Without
that control, "no canary found" is indistinguishable from "the grep was
broken", and a confidentiality test that can only ever pass is not a test.

### The invariant paid for itself again

Adding three routes moved the foundation suite 83 → 90 with **no test
edited**. It walks the working tree rather than a hand-maintained list, so
new routes are covered the moment they exist. Coverage that grows by
construction is worth more than coverage that grows when someone remembers.

## Phase 8 — Timeline partial-update fix

### The same bug twice, because the pattern propagated it

Education found `.partial()` not neutralising `.default()` and shipped the
safe shape. Timeline had the identical defect, inherited from the module
education was copied *from*. Finding a bug in a copy is evidence about the
original, and acting on that — recording it, queuing it, then fixing it —
is what stopped it sitting there indefinitely.

Worth generalising: when a shared pattern turns out to be wrong, the
question is not "where did I just find it?" but "everywhere this pattern
was applied, is it wrong there too?"

### Two defects compounding is worse than either alone

The schema leaked `highlights: []` into every partial patch. Independently,
the action wrote `(highlights ?? [])`, treating omission as "clear". Either
alone is a bug; together they turned a one-field rename into **deleting
every bullet on the entry**. The `?? []` looked like defensive
null-handling — it is exactly the kind of line that reads as careful and
does the opposite, because it erases the distinction between *unspecified*
and *empty*.

`undefined` and `[]` are different requests. So are `undefined` and `null`,
and `undefined` and `0`. Collapsing them with `??` is convenient precisely
where it is most dangerous.

### The fix needed no new repository method

The instinct on finding "the action can't express this" is to extend the
data layer. Both paths already existed: the ordered `update()` for
parent-only patches and `updateWithHighlights()` for the aggregate. The
action just had to *choose*. Checking what the repository already offered
before adding to it kept `packages/database` untouched and the database
subtotal flat.

## Phase 8 — Education CMS

### `.partial()` does not undo `.default()`

The bug this slice found, and the one worth remembering: deriving an update
schema as `createSchema.partial()` looks like it produces "every field
optional", but a field declared with `.default()` is still *materialised*
when its key is absent. The patch arrives carrying `position: 0`,
`isVisible: true`, and `null` for every optional — values the caller never
sent — and the repository's patch allowlist dutifully writes them.

The user-visible effect would have been editing a qualification and
silently resetting the entry's display order and un-hiding it. Nothing
about the code reads as dangerous; the two APIs simply compose differently
than they appear to.

### The test caught it because it asserted persisted state, not parse success

The validation half of the suite passed the whole time — the schema *did*
accept a partial patch. What failed was the local-D1 assertion that a
hidden entry stays hidden and an ordered entry keeps its position. Checking
"did the mutation succeed?" would have been green; checking "is the row
still what I expect?" was not.

Worth generalising: for anything that writes, assert the state afterwards,
not just the absence of an error.

### Uniformity is a reason to look harder, not to look less

I wrote education's schemas by copying the timeline module, which is
exactly what a settled pattern is *for*. The copy inherited a latent defect,
and it only surfaced because education's tests happened to exercise a
partial patch against real D1 while timeline's did not.

Two consequences. A pattern propagates bugs as efficiently as it propagates
structure. And finding one in the copy is evidence about the original —
which is why the timeline module is now recorded as affected and queued for
its own fix, rather than quietly repaired here or left unmentioned.

## Phase 8 — Admin list overflow fix

### An absolutely positioned descendant escapes an unpositioned scroll container

The part I had to actually understand rather than pattern-match: an
`overflow-x-auto` container clips and scrolls its *in-flow* descendants, but
an absolutely positioned one is laid out against the nearest **positioned**
ancestor — which, for an unpositioned wrapper, is something further up, or
the initial containing block. Tailwind's `sr-only` is
`position: absolute`, so the accessible labels inside a wide table were
being placed relative to the viewport from a cell far to its right.

That is why the table scrolled correctly while the *page* also scrolled: two
different containing blocks, doing exactly what they were told. `relative` on
the wrapper makes it the containing block and the symptom disappears.

### Fix the containment, not the symptom

Every quick fix on offer here — `overflow-x-hidden` on the body, dropping the
`sr-only` labels, shrinking the table, hiding columns on mobile — works by
removing something: the ability to scroll, the accessible name, the
legibility, or the data. The actual fix adds one word and removes nothing.

When an accessibility feature appears to be "causing" a layout bug, that is
usually a sign the layout is wrong, not the accessibility feature.

### The check that would have caught it is the check nobody writes

The invariant is boring — "wrappers that scroll must be positioned" — and
asserting it structurally felt like testing CSS. But this had regressed
twice, and the browser evidence that should have caught it was measuring
empty tables. A structural assertion is not a substitute for rendering
verification; it is insurance against the day the rendering verification
looks at the wrong state again.

## Phase 8 — Timeline CMS

### "Is this atomic?" deserves an answer, not an assumption

`setHighlights()` is internally atomic, which made it tempting to call
`create()` then `setHighlights()` and move on. But atomicity does not
compose: two atomic calls are not one atomic operation, and the failure mode
— an entry persisted with no bullets — is invisible until a user hits it.
Writing the test that forces a failing child was what turned the question
into a decision.

The general shape: when a guarantee spans two calls, either it is expressed
in a layer that can hold both, or it does not exist.

### An empty result cannot report "not found"

`meta.changes === 0` looked like a free existence check until the empty case
appeared: an empty patch with no highlights legitimately changes zero rows.
The signal and the error condition were indistinguishable, so the check had
to be explicit. Worth asking of any "did it match anything?" inference what
a legitimate zero looks like.

### The empty state hid a real responsive bug for three phases

I verified "no horizontal overflow at any width" for projects, technologies,
and profile — but at 375px those pages rendered their *empty state*, which
has no table. The populated table was only ever measured at 1280 and 768.
The bug had been merged twice before a wider table made it obvious.

Two lessons. Test the state that actually stresses the layout, not whichever
one the fixture happens to produce. And measure the user-facing symptom —
"can the page be scrolled sideways?" — rather than a proxy like
`scrollWidth`, which reported overflow even after the container was
correctly scrolling internally, and would have sent me chasing the wrong
element.

### Finding a bug and owning a bug are separate decisions

Having found it, I fixed it everywhere — including two previously merged
pages that had nothing to do with the feature I was building. That made the
Timeline diff a feature change *and* a drive-by repair of merged slices,
which is harder to review and harder to revert independently.

The scope correction split them: the shell change stayed, because
`/timeline` provably does not work without it, and the two merged pages went
back to `main` for a dedicated fix. The useful test is not "is this fix
correct?" but "does the feature I am shipping require it?" — and that is
answerable by reverting the change and measuring, which is what settled it
here (408px of page scroll without the shell fix).

The corollary: a discovery you decline to act on still has to be *recorded*,
including that the affected pages remain broken. Silently leaving it out
would have been worse than the scope creep.

### `flex-1` without `min-w-0` is a latent overflow

A flex item's automatic minimum size is its content, so any wide child
escapes the container. Paired with absolutely-positioned `sr-only` text
escaping a non-`relative` scroll wrapper, it produced an overflow with two
independent causes — fixing one left the symptom unchanged, which is exactly
when it is tempting to conclude the first fix was wrong.

## Phase 8 — Profile CMS

### Let the constraint pick the route shape

The reflex after two collection CMS slices is to build a third one: a list,
a `/new`, an `/[id]`. The profile table's `CHECK (id = 'singleton')` makes
all three meaningless — there is nothing to list, nothing to create a
second of, and no id to choose. Reading the constraint first turned "how do
I adapt the collection pattern?" into "this is a different shape", which
was both less code and a more honest UI.

### Not every capability belongs in the UI

`ProfileRepository.clear()` exists and works. Surfacing it would have been
the "complete CRUD" reflex, and it would have put a no-undo wipe of the
site's identity one mis-click away for a workflow nobody asked for. The
repository is a toolkit, not a specification for the interface.

### The empty state is a real state, not an error

The schema permits zero rows, so `get()` returning `null` is normal. It
would have been easy to treat that as "not found" and render an error, or
to auto-create a blank row on first visit to dodge the case entirely. Both
would have been lies about what the system holds. Rendering the same form
with different wording was less work than either.

### Announce success politely; announce failure assertively

The error summary takes focus because a failure needs attention. The save
confirmation uses `role="status"` and does not, because yanking focus after
a *successful* action is disorienting. Same form, two different urgencies —
worth distinguishing rather than reaching for `role="alert"` both times.

### Test counts should track contracts, not features

The profile repository already covered its singleton lifecycle, so this
slice added zero repository-package tests and the database subtotal stayed
at 256. After the technologies correction — where a *contract* change did
require canonical coverage — the rule became clear: repository tests grow
when a repository contract grows, not once per feature that consumes it.

## Phase 8 — Technologies CMS

### A structural invariant pays out when you forget about it

Three new protected routes were added and the foundation suite went 53 → 59
on its own, because the Phase 6 invariant walks `(protected)/**` rather
than checking a hand-maintained list. Nothing had to be remembered, and if
a route had been added without `withAdminPage`, the suite would have failed
without anyone thinking about authorization that day. That is the return on
building the check recursively instead of enumerating routes.

### Let the schema tell you what the CMS is

The temptation with a three-column table is to add an icon field, a
visibility toggle, an ordering control — all plausible, all things a
technologies CMS "should" have. None exist in the committed schema, so all
of them would have been either silently discarded or a lie about what the
system stores. Reading the migration first turned a design question into a
non-question.

### Ownership is decided by the table, not by the feature you are building

The usage count was for the technologies screen, so it went onto the
technology repository — which then had to query `project_technologies`, a
table Phase 5 explicitly assigned to the projects aggregate. The reasoning
felt local and correct and was structurally wrong: one join table now had
two repositories reading it, which is precisely the drift the ownership
rule exists to stop.

The test that would have caught it did not exist either, because the change
felt like "a method for the technologies feature" rather than "an extension
to a repository contract" — so it got admin-suite coverage instead of
canonical repository-package coverage, and the reported database subtotal
was wrong as a result.

Two habits worth keeping: when adding a query, ask which table it touches
and who owns that table — not which screen wants it. And when a repository
*contract* changes, the repository package's tests are the ones that must
grow, whatever else consumes it.

### Cross-aggregate reads compose at the application layer

The fix was not a join-table repository or a reporting abstraction, both of
which would have added a layer to avoid a two-line `Promise.all`. The page
calls `technologies.list()` and `projects.countByTechnology()` and joins
them itself. Each repository stays inside what it owns, and the place that
needs both is the place that knows why.

### `ON DELETE RESTRICT` is a UI requirement, not just a database setting

A constraint that can legitimately refuse an action changes what the
interface owes the user. Knowing only "delete failed" after the fact is a
worse product than knowing "used by 2 projects" beforehand — and that
information has to come from a query someone deliberately wrote. The
constraint quietly specified a repository method.

The discipline that goes with it: the count must never become the
enforcement. It decides what the UI *says*; the database decides what
*happens*, and the test invokes the real action to prove bypassing the UI
changes nothing.

### Interoperability is worth testing even when no code connects the two

The projects picker already read the technologies table, so integrating the
new entity required no code at all — which is exactly the kind of claim
that deserves checking rather than assuming. Creating a technology,
tagging a project, reopening it, and watching the usage count go to 1
confirmed a wiring that no diff would have shown.

## Phase 7 — CI fix

### A source-policy test that reads the git index tests the wrong thing

The scanner used `git ls-files`, so it was blind to exactly the files most
likely to violate a brand-new policy: the brand-new files. It passed
locally, then failed on CI the moment the commit made them tracked. The
test was correct throughout — it simply could not see what it was meant to
check.

The general shape: when a check enumerates "everything", ask *everything
according to whom?* The index, the working tree, and the build output are
three different populations, and a policy about source code means the
working tree.

### A test that must exclude itself has a blind spot by construction

The old scanner skipped its own file, because it contained the banned
string. Assembling the identifier at runtime from fragments removed the
need for that exclusion entirely — so the scanner now covers itself. When a
check needs a carve-out, it is worth asking whether the carve-out can be
designed away instead.

### Negative controls keep earning their place

Writing "documentation asserting the identifier is populated must be
rejected" immediately failed — the regex gap was `[^.\n]` and could not
span the dot in `globalThis.<identifier>`. A real violation written the
natural way would have passed silently. The control was added to prove the
check *could* fail, and it found a live hole in the check itself.

## Phase 7 — correction pass

### A plausible-looking integration seam is still a fabrication

`globalThis.__ADMIN_DB__` read as a reasonable adapter contract, was
documented confidently in four files, and was entirely made up. The real
API is `getCloudflareContext().env.DB`. The tell was that no source was
ever cited for it — a deferred integration point should be written from the
target's documentation or marked unimplemented, never invented and then
described as though it worked.

The fix was not to install the package. It was to be honest about the gap:
a narrow seam, a production path that throws, and a compile-time proof that
the real provider will drop straight into it.

### Test what your code does, not what the framework does

A 404 from `POST` with `Next-Action: fake-action-id` felt like proof that
mutations reject anonymous callers. It proves the opposite of useful: Next
rejects unknown action ids before application code runs, so a completely
unguarded app returns the same 404. The check passed for a reason that had
nothing to do with the thing being claimed.

The question worth asking of any security test is: *if the protection were
removed entirely, would this test still pass?* Here it would have.

### "It made the build green" is not a justification

`serverExternalPackages: ["wrangler"]` was originally added because the
build failed without it, which is a symptom, not a reason. Removing it and
reading the actual import trace — the Wrangler CLI being pulled into the
production Server Component graph — turned it into a decision that can be
defended, and produced assertions that keep it true.

### Don't bulk-rewrite files through a shell for a two-character change

Piping documentation through `Get-Content`/`Set-Content` to update a test
count double-encoded three files and destroyed every em-dash, arrow, and
symbol in them. Reconstructing them was possible only because the damage
was uniform. A targeted edit would have changed the two numbers and nothing
else.

**This recurred during the Skills correction**, on the same shortcut and for
the same reason — updating a handful of test counts. It was caught before
commit by two signals worth remembering: the diff stat jumped from ~300
insertions to 872/605, and the em-dash count in `PROJECT_STATE.md` collapsed
from 527 to 24. The file was restored with `git checkout` and the edits
re-applied one at a time. That a documented lesson repeated is the point:
the rule needs to be *"never shell-rewrite a whole doc"*, not *"be careful
when shell-rewriting a whole doc"*.

## Phase 7

### `redirect()` inside a try/catch is a silent footgun

`redirect()` signals by throwing. A Server Action with a broad
`catch (error)` around its mutation will swallow that throw and report a
mutation failure to the user — for a mutation that *succeeded*. The fix is
positional, not defensive: call `redirect()` after the try block.

### A client-side redirect after a mutation is a race

The first delete implementation used `router.push` in the client. It
raced `revalidatePath`, and the user landed back on the edit page of a
project that no longer existed. Redirecting from the Server Action is both
correct and works without JavaScript. When both server and client could
perform a navigation, the server is the one that knows the mutation
actually committed.

### Zod's default is to *drop* unknown keys, not reject them

Without `.strict()`, a payload containing `id` or `createdAt` parses
cleanly and the fields vanish. That looks safe, and mostly is — but it
means a client attempting to overwrite a database-managed column gets a
success response. Failing loudly is the more honest boundary.

### `z.url()` is not a safe-URL check

It accepts `javascript:` and `data:`. Rendered into an `href`, that is
stored XSS. Protocol allowlisting has to be explicit.

### A test that fails is not automatically a wrong test

The invariant suite reported the correctly-guarded `[id]/page.tsx` as
unguarded. The temptation is to relax the test; the actual bug was the
matcher's regex `<[^>]*>`, which cannot parse a nested generic like
`withAdminPage<{ params: Promise<{ id: string }> }>(`. Regexes cannot
match balanced delimiters — a small hand-written scanner can. The
instinct to check the *test* before the *code* was the useful part.

### Development fallbacks must not be reachable in production

The D1 binding resolver could easily have fallen back to
`getPlatformProxy()` whenever the injected binding was missing. That is
exactly how a deployment quietly serves the wrong database. Production
throws instead.

### Route metadata evaluates outside the page component

`generateMetadata` runs independently of the component, so it sits outside
any wrapper-based page guard. Per-record admin tab titles are not worth an
exception to an authorization invariant.

## Phase 6

- **A layout redirect does not stop the page from rendering.** This is the
  most surprising thing in the phase. React renders a layout and its
  `children` concurrently, so when only the layout redirected, the
  dashboard component still executed and its full RSC payload was
  serialized into the 307 response — 11.9 KB of it, in a *production*
  build. The page looked protected in a browser, because browsers discard
  a redirect body. `curl` would have seen everything.
  - **In an App Router app, a layout is a composition boundary, not a
    confidentiality boundary.** Anything that must not be *computed* for an
    unauthorized request has to be gated before the component that computes
    it runs — not by a parent that renders alongside it.
  - The general lesson: when testing an authorization boundary, assert on
    the **raw response bytes**, not the rendered DOM. The DOM shows what a
    browser chose to display; the body shows what the server actually sent.
- **Fixing the instance is not fixing the class.** Guarding the one
  existing page closed the leak but left a convention — "every future page
  must remember to self-guard" — that one forgotten line in Phase 7 would
  break, silently, while the route still *looked* protected under the
  protected layout. Security properties that depend on remembering are
  latent bugs with a delay fuse.
  - The fix was to wrap the page **function** rather than its output:
    `withAdminPage(render)` simply does not call `render` until the guard
    resolves. Ordering becomes structural instead of conventional.
  - It cannot be a JSX boundary. `<Protected>{children}</Protected>` has
    precisely the flaw being fixed — `children` is an already-built element
    tree React may render independently. When the bug *is* concurrent
    rendering, the fix cannot live in the render tree.
  - And a convention nobody can verify is worth little, so the invariant is
    enforced by a recursive test over `(protected)/**/page.*` — with
    negative controls, and verified by actually adding an unguarded page
    and watching the suite fail.
- **Route metadata is evaluated separately from the component.** Even after
  the leak was closed, the page's `metadata.title` still appeared in the
  unauthenticated redirect body, because Next evaluates a route's
  `metadata` export independently. Harmless for a static title; a
  `generateMetadata` that reads a record would leak that record. A page
  wrapper cannot cover it — metadata needs its own guard.
- **`force-dynamic` can be a security requirement.** The build output said
  `○ (Static)` for the protected route, which meant the authorization check
  would run once at build time and every visitor would get the same cached
  answer. Reading the route table in build output is a cheap habit that
  catches this class of bug instantly.
- **Prefer the platform for modal dialogs.** `<dialog>` + `showModal()`
  gives Escape-to-close, focus trapping, focus restoration, and an inert
  background — the four things hand-rolled drawers get wrong — for free and
  with no library. Verified: 20 tabs never escaped, and programmatic
  `.focus()` on background elements was refused by the browser.
- **A focus-trap assertion needs care.** Tabbing through a modal shows
  `document.body` as the wrap point, so `dialog.contains(activeElement)`
  reports false on that step and looks like a leak. The property worth
  asserting is "focus never lands on a *background focusable element*",
  not "activeElement is always inside the dialog".
- **Sidebars come before `<main>` in the DOM.** Using heading elements for
  navigation group labels therefore put six `h2`s ahead of the page's
  `h1`. Group labels are not document sections — `aria-labelledby` on the
  list keeps the association without polluting the heading outline.
- **A component rendered twice needs `useId()`.** The same navigation
  renders in the sidebar and the drawer; fixed label ids collided
  instantly. This is the second time this project has hit duplicate ids
  from a repeated component (see Phase 2) — worth checking for by default.
- **Make an unsafe fallback impossible to reach rather than merely
  discouraged.** Development auth requires a non-production build *and* an
  explicit opt-in *and* the absence of real Access configuration. Because
  Next hard-codes `NODE_ENV` at build time, the branch is compiled out of
  production entirely — no runtime environment variable can resurrect it.
  Guards that depend on a single flag are one misconfigured deploy away
  from being disabled.
- **`node --conditions=react-server`** resolves `server-only` to its no-op
  build, which is what lets server modules be imported by plain Node test
  scripts. Without it, `server-only` throws on import and the auth boundary
  cannot be tested outside a bundler at all.

## Phase 5

- **The allowlist is the injection defence, and it comes free with good
  design.** Building an `UPDATE ... SET` clause from an incoming patch
  object is where ORMs get owned: if the *keys* become column names, a key
  like `"title = 'pwned', is_featured = 1 --"` is SQL. Declaring
  `{ field → { column, encode } }` per repository means the only
  identifiers that ever reach SQL are ones written in source, and unknown
  keys are silently ignored. The same table also makes `id` and
  `createdAt` unpatchable — not by checking for them, but by their absence.
- **A test that can't reach the failure state isn't testing the failure.**
  The first attempt at "invalid persisted data is rejected" tried to
  `UPDATE tools SET is_visible = 7` — and the schema's CHECK refused it.
  The schema was doing its job; the test was unreachable. The fix was to
  assert *both* halves: that the schema refuses the bad write, and that the
  decoder rejects the bad row when handed one by a stubbed driver. Two
  honest assertions beat one that quietly never ran.
- **Test the code, not a transcription of it.** Driving `wrangler d1
  execute` from outside can only run SQL strings, which would have meant
  re-typing each repository's query into the test — proving the test's copy
  works, not the repository. Importing the real modules and giving them a
  `D1Like` adapter tests the shipped code. That the layer depends on a
  ~10-method interface rather than a concrete driver is what made this
  possible; a narrow dependency is a testability feature, not just tidiness.
- **`node:sqlite` is a serious testing option now.** Built into Node 22+:
  no dependency, no container, no auth, milliseconds to start, and real SQL
  semantics. Combined with Node 24 running TypeScript directly via type
  stripping, an integration suite needs no build step and no test runner.
  The honest caveat is that it isn't workerd — so schema proof stays with
  the Wrangler-based smoke test and this suite covers repository logic.
- **Node's type stripping resolves the *literal* specifier.** Extensionless
  `./factory` imports — normal under `moduleResolution: Bundler` — simply
  don't load. Explicit `.ts` specifiers plus
  `allowImportingTsExtensions` make the same source work for both tsc and
  Node, which is what removed the build step from the test loop.
- **`satisfies` doesn't pin a generic.** Annotating a config object with
  `satisfies FieldSpecs<XUpdate>` still let inference widen `TUpdate` from
  the literal, producing errors that pointed at the wrong place entirely.
  Passing explicit type arguments to the factory fixed it, and made the
  annotation redundant — the property is contextually typed once the
  generic is pinned.
- **Model what the database actually guarantees.** Singleton-key tables
  permit zero rows, so the repository returns `Profile | null` and offers
  no `getOrThrow` convenience. A repository that pretends a row always
  exists just moves the null check somewhere less careful.
- **Don't claim transactionality you haven't verified.** D1 documents
  `batch()` as one implicit transaction, and the relationship-replace
  operations depend on that. The first pass could only say "verified
  against our adapter, trusted remotely" — which was honest but weak. The
  follow-up pass ran the same operation through a real workerd binding and
  watched Cloudflare's own batch roll back. Same code, much stronger claim.
- **A test double cannot validate the contract it implements.** The
  111-check suite ran the repositories over a `D1Like` adapter *we* wrote.
  If `D1Like` had the wrong method shape, the adapter would have had the
  same wrong shape and every test would still pass. Adapter-backed tests
  prove *your logic*; only the real dependency proves *your contract*. The
  fix was not to replace the fast suite but to add a small second one
  against a real `getPlatformProxy()` binding — breadth from the cheap
  layer, truth from the real one.
- **"Satisfies structurally" is a hypothesis until a compiler says so.**
  Asserting that Cloudflare's `D1Database` fits our hand-written interface
  was reasonable and, as it turned out, correct — but it had never been
  compiled. Wrangler can generate the real types, so proving it took one
  temp directory and a three-line assertion file. Any claim of the form "X
  is type-compatible with Y" is cheap to verify and embarrassing to get
  wrong.
  - And the proof itself needs a negative control: deliberately requiring
    a method `D1Database` lacks made the check fail, which is what makes
    the passing result mean something.
- **Hand-rolled crypto-adjacent code deserves direct tests, not incidental
  ones.** Every row id comes from a 15-line `uuidV7`. The repository tests
  touched it constantly but only ever asserted "ids are distinct strings" —
  which a function returning a counter would satisfy. Testing the actual
  spec (version nibble, variant bits, exact 48-bit big-endian timestamp,
  10k same-millisecond uniqueness) required making the timestamp
  injectable: a one-argument change that turned an untestable function into
  a verifiable one. Worth checking the RNG varies too — a constant-output
  generator passes every format assertion.
- **Wrangler's persistence layout is asymmetric.** `--persist-to <dir>`
  writes into `<dir>/v3/...`, but `getPlatformProxy({ persist: { path } })`
  wants the versioned directory itself. Guessing wrong connects you to an
  empty database that silently passes nothing — so the test asserts the
  directory exists before connecting, turning a future layout change into a
  loud failure instead of a mysterious one.

## Phase 4

- **`shell: true` re-splits your arguments.** The smoke test first drove
  `pnpm exec wrangler`, which on Windows needs `shell: true` to resolve
  the `.cmd` shim — and the shell then split every SQL string on
  whitespace, so `--command "SELECT name FROM ..."` arrived as fifteen
  separate arguments. Spawning the tool's JS entry directly
  (`node node_modules/wrangler/bin/wrangler.js`) keeps `shell: false` and
  argv exact everywhere. Rule of thumb: if an argument can contain spaces,
  never route it through a shell.
- **A schema you have only read is a schema you have not tested.**
  Writing DDL that *looks* correct is easy; proving a CHECK actually
  rejects `is_visible = 7`, or that RESTRICT actually blocks a delete,
  takes a real engine. The smoke test tries to insert bad rows and asserts
  the database says no — which is a different and much stronger claim than
  "the constraint appears in the file".
  - It paid off immediately: the run surfaced an unexpected `_cf_METADATA`
    table. That turned out to be a D1 internal rather than a schema bug,
    but the check did its job — it noticed something the author did not
    know was there.
- **Constraint tests need negative controls or they pass vacuously.** If
  every statement errored for an unrelated reason — bad config, wrong
  path — "the database rejected it" would still be true and every
  assertion would pass. Here the valid seed inserts must succeed (the
  helper throws on unexpected non-zero exit), so the suite proves the
  database distinguishes good rows from bad ones, not merely that it
  complains.
- **Prove the offline claim rather than asserting it.** "This test doesn't
  need Cloudflare auth" is easy to write and easy to get wrong. Running
  the whole suite with a deliberately invalid `CLOUDFLARE_API_TOKEN` — and
  seeing every check still pass — turns it into evidence.
- **Decide `ON DELETE` per relationship.** Defaulting everything to
  CASCADE is how deleting one tag silently strips it from thirty published
  projects. The useful question is "does the parent *own* this child?" —
  CASCADE if yes, RESTRICT if the delete would destroy independent
  content, SET NULL if the reference is decoration.
- **Partial unique indexes enforce "at most one X" in the database.**
  `CREATE UNIQUE INDEX ... WHERE is_current = 1` makes "only one current
  résumé" impossible to violate, instead of a rule every future code path
  has to remember.
- **Migrations are append-only history, not editable files.** The runner
  records what it applied by name; editing an applied file means the new
  content never runs anywhere it is already recorded, and environments
  quietly diverge. (The rule binds once a migration is committed or
  applied anywhere shared. Correcting a comment in an uncommitted
  migration that has only ever touched disposable local state is fine —
  and better than shipping a wrong comment forever.)
- **"At most one" is not "exactly one".** `id TEXT PRIMARY KEY CHECK
  (id = 'singleton')` prevents a *second* settings row. It does nothing to
  guarantee a *first* one — the table is legitimately empty until
  something writes to it. Documenting it as "exactly one row" would have
  had every future reader assume a singleton read can't return null. A
  schema constrains what is *possible*; making something *exist* is
  bootstrap work.
- **When a package manager offers to disable a security check, that is the
  moment to look closely.** `pnpm add wrangler@latest` hit the default
  24-hour `minimumReleaseAge` and resolved it by writing exclusion entries
  for the offending packages — leaving a green install and a quietly
  weakened policy. The version was 7.5 hours old, which is exactly the
  window the control exists for. Pinning the previous release satisfied
  the policy with zero exemptions and cost nothing.
  - Related trap: `miniflare@5.20260801.0-alpha` *looks* like it was
    published on 1 August. It was published the same day as the wrangler
    release. A date embedded in a version string is a label, not evidence
    — check `npm view <pkg> time`.
- **Don't hardcode `node_modules/...` paths.** Resolving a CLI's entry
  point through `createRequire().resolve('<pkg>/package.json')` plus the
  package's declared `bin` field survives hoisting-layout changes and
  upstream file moves, and needs no extra dependency.

## Phase 3

- **A contrast script that regex-scrapes `getComputedStyle` will lie to
  you.** An audit reported the nav link at 2.88:1 — an alarming AA
  failure. The CSS was fine; the *script* was broken. Modern browsers
  return colours in `oklab(0.988 0.0004 -0.0012 / 0.85)` form, and pulling
  the first three numbers out of that yields a near-black "colour". The
  reliable method is to let the browser do the conversion: paint the
  backdrop and then the colour onto a 1×1 canvas and read the composited
  pixel back. That also handles alpha and nested translucent layers for
  free.
  - Wider lesson: when a measurement contradicts the code you just wrote,
    suspect the measurement before rewriting the code. Fixing the
    "failure" here would have meant changing correct CSS.
- **Tokens are the shareable part of a design system; components often
  are not.** Only `tokens.css` went into `packages/ui`. Two apps looking
  like one product is a *colour, type, and spacing* problem — component
  structure can legitimately differ between a public site and a CMS.
  Promoting components with a single consumer would have added React deps
  and transpile config to buy an abstraction guessed from one example.
- **A plain CSS file is an excellent workspace-package boundary.** No
  React, no build step, no bundler config — a subpath export
  (`"./tokens.css"`) plus an `@import` in the consuming app, and Turbopack
  resolved it with no extra setup.
- **Define the focus style once, globally.** A single `:focus-visible`
  rule in `globals.css` means no component can ship without a focus
  indicator — far more reliable than remembering per component. Also worth
  checking the ring against *card* surfaces, not just the page
  background: it needs 3:1 against whatever it actually sits on.
- **Export a type scale as class constants, not wrapper components.**
  `<h3 className={type.subheading}>` keeps the heading level a decision
  about document structure; `<Subheading>` quietly couples semantics to
  styling and is how heading hierarchies drift.
- Playwright's `page.emulateMedia({ colorScheme, reducedMotion })` makes
  both a genuinely verifiable claim rather than a reasoned one — worth
  reaching for instead of documenting a limitation.
- **A skip link needs `tabIndex={-1}` on its target, or it does not
  actually skip anything.** `<a href="#main-content">` pointing at
  `<main id="main-content">` changes the URL hash and scrolls the page —
  which looks like success — but `<main>` is not focusable, so
  `document.activeElement` stays on `<body>` and screen-reader focus never
  moves. `tabIndex={-1}` makes the target programmatically focusable
  without adding it to the tab order.
  - The verification lesson matters more than the fix: hash change and
    scroll position are **proxies**, and we asserted on the proxies. The
    real assertion is `document.activeElement === target`. When testing
    focus behaviour, always assert on `activeElement` itself — and a good
    second check is what the *next* Tab reaches, since that is what the
    user actually experiences.

## Phase 2

- **Measure contrast, don't eyeball it.** The disabled primary button
  looked fine and was not fine: white on a 70%-opacity blue composited to
  **3.58:1**, under the WCAG AA 4.5:1 floor. Opacity is the trap — it
  blends the *background* toward the page colour while the foreground text
  stays put, so a pairing that passes at full strength can fail when
  dimmed. Running the actual relative-luminance formula against
  `getComputedStyle` values in the browser caught it in seconds.
  - The fix was also the better design: a non-functional control should
    not wear primary-CTA styling in the first place.
- **Don't invent links that go nowhere.** With no real destinations yet,
  the honest option is an explicit "unavailable" state — a focusable
  `aria-disabled` button plus visible text saying why — rather than an
  `href="#"` that lies to the reader. Modelling this in the *type*
  (a discriminated union with `status: "available" | "unavailable"`) makes
  the honest path the easy one and the dishonest path unrepresentable.
- **A component rendered twice needs unique ids.** The contact CTA appears
  in both the hero and the contact section; generating `aria-describedby`
  ids from the label alone produced duplicates, which is invalid HTML and
  silently breaks the association for assistive technology. Passing a
  `context` prop fixed it. Worth a quick scripted check for duplicate ids
  and dangling ARIA references on any page built from repeated components.
- **`scroll-margin-top` is what makes anchor navigation work under a
  sticky header** — without it the browser scrolls the target to y=0,
  where the header covers it.
- Programmatically calling `.focus()` in a loop is good for auditing focus
  *styles*, but it destroys the real tab sequence. To test actual Tab
  order, reload first, then press Tab. (In dev, Next.js's dev-tools overlay
  also claims the first Tab stop; it is not present in a production build.)

## Phase 1A

- **A local check that passes on stale build artifacts is not a passing
  check.** Our first CI run failed on `LayoutProps` being undefined, even
  though `pnpm typecheck` had passed locally many times. The reason:
  Next.js *generates* route-aware globals (`LayoutProps`, `PageProps`,
  `RouteContext`) into `.next/types` during `next dev` / `next build` /
  `next typegen`; they are not part of the `next` package's shipped types.
  Local runs had those files lying around from earlier dev sessions. A
  fresh CI runner had nothing, and ran `typecheck` before `build`.
  - Fix: `"typecheck": "next typegen && tsc --noEmit"` — make the check
    generate what it depends on instead of assuming it is already there.
  - General lesson: when a check depends on generated files, either the
    check generates them, or it is only testing your machine. To find
    these, delete the generated directory (here, `.next`) and re-run
    before trusting a green result.
  - Reproducing this safely means deleting *only* the generated,
    already-gitignored output — never `node_modules`, the lockfile, or
    source.
- GitHub Actions pin action versions by major tag (`@v7`). When a run
  warns that an action targets a deprecated Node runtime, the check is to
  read that action's own `action.yml` at the newer major and confirm both
  `using: node24` and that every input you pass still exists — not to bump
  the number and hope.
- `create-next-app` scaffolds its own `pnpm-workspace.yaml`,
  `pnpm-lock.yaml`, `node_modules`, `AGENTS.md`, and `CLAUDE.md` per app;
  when nesting inside a pnpm monorepo these must be removed/reconciled so
  there is a single root lockfile and workspace definition, and so the
  per-app `CLAUDE.md`/`AGENTS.md` don't shadow or conflict with the root
  `CLAUDE.md`.
- On this Windows environment, running `create-next-app` directly with a
  target subpath from the repo root failed with a
  "path is not writable" error; running it from inside the parent `apps/`
  directory with a relative target name (`web`, `admin`) succeeded. Worth
  remembering if scaffolding more apps later on Windows.
- No Turborepo is used in this project by design — plain pnpm workspace
  filtering/recursive commands are sufficient for the current scope and
  avoid an extra tool/config surface.
