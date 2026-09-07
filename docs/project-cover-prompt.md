# Prompt: cover, icon and CMS fields for any project

Paste the block below into Claude Code **inside any project's repository** —
any language, any stack. It produces a cover image, an icon, and the exact text
for every field of this portfolio's project form.

It is written as a **standalone brief**. The assistant reading it has never
seen this portfolio repository, so every dimension, limit and rule it needs is
stated inline rather than referred to.

Three things it is built to avoid:

- **Assuming a toolchain.** The first version assumed Node and Playwright were
  installed, which is true here and false in a Python or Rust repository. It
  now offers a ladder of rendering options and a working fallback.
- **Writing before the picture is approved.** The image is the cheap half and
  the copy is the expensive one, so it stops between them.
- **Inventing facts.** It reads manifests, git history and the live deployment
  instead of recalling. A portfolio that overstates a project is worse than one
  that omits it.

---

```
Read this repository and produce three things for my portfolio CMS: a cover
image, an icon, and the text for a project entry.

You have not seen my portfolio repository and do not need to — everything you
need is below. Work in this order and stop where it says stop.

────────────────────────────────────────────────────────────────────────
STEP 1 — learn this project, from the repository only
────────────────────────────────────────────────────────────────────────

Read whatever exists: README, and whichever manifest this stack uses —
package.json, pyproject.toml / requirements.txt, go.mod, Cargo.toml,
pom.xml, Gemfile, composer.json, *.csproj. Then the entry points, the
config, and the git log.

Establish, and tell me plainly:

  * what it does, in one sentence a non-specialist would understand
  * the real stack, with versions read from the manifest — not from memory
  * whether it is deployed anywhere, and the URL if so
  * what is genuinely finished versus started
  * first commit date, most recent commit date, commit count
    (git log --reverse --format=%ad --date=short | head -1, etc.)
  * its visual identity, if it has one: colours from the CSS, theme file,
    tokens, Tailwind config or design constants; the fonts; the general feel

    If it is deployed, ALSO read the *computed* colours from the live page.
    A colour set at runtime — by a CMS, a theme switcher, a user setting —
    does not appear in the source at all, so reading the source alone can
    give you the wrong palette with no sign that anything is wrong.

If the project has no visual identity of its own, say so and use a neutral
dark palette. Do not borrow another project's colours.

────────────────────────────────────────────────────────────────────────
STEP 2 — the cover and the icon, then STOP
────────────────────────────────────────────────────────────────────────

Author both as SVG, then render both to PNG.

  Cover   1200 x 675  — exactly 16:9, because the project card crops covers
                        to 16:9. Any other ratio loses edges.
  Icon     256 x 256  — square. It is *displayed at 32px* beside the project
                        title, so 256 is only for sharpness.

Put the SVGs, the PNGs and any render script in a `covers/` directory at the
repository root. Add `/covers/` to `.gitignore`, with a comment saying why:
these images get uploaded to the CMS and stored in object storage, so
committing them as well would leave two copies of the same picture with no
way to tell which one the site actually serves.

── Rendering SVG to PNG, whatever this project is built with ──

Try these in order and use the first that works. Say which one you used.

  1. Playwright, if it is already a dependency or `npx playwright --version`
     works. Load the SVG in a page and screenshot the <svg> element.
  2. `rsvg-convert -w 1200 -h 675 in.svg -o out.png` (librsvg)
  3. `inkscape --export-type=png --export-width=1200 in.svg`
  4. `magick -density 200 in.svg out.png` (ImageMagick)
  5. Python: `cairosvg`, if it is already available.

If none exist: do NOT install anything. Give me the finished SVGs, say that
no renderer was available, and tell me the one command to run once I have
installed a tool of my choice. An unasked-for dependency in someone's
repository is a worse outcome than a manual step.

── Rules for the cover ──

  * Use this project's own colours from step 1. Do not invent a palette that
    merely resembles them.
  * NO web fonts. SVG text renders in whatever fonts the viewer happens to
    have, so a file using a web font looks different on every machine. Use:
      ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica,
      Arial, sans-serif
      ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
  * A gradient painted onto a shape shows that shape's edge. For a soft glow
    use a radialGradient that reaches zero opacity before the shape ends —
    a linear gradient on a circle leaves a visible arc.
  * It is seen small, on a card. If it is not legible at 400px wide it has
    failed.
  * Say what the project IS. A texture with a name on it tells nobody
    anything.

── Rules for the icon (these are different, and stricter) ──

  * It is drawn at 32 PIXELS. That single fact governs everything:
      - no text, no letters, no numerals — they become a smudge
      - no thin strokes; anything under ~3px at 256 disappears
      - three filled shapes at most
      - one idea, stated geometrically. What is this project, as a shape?
  * A rounded square tile reads better than a bare glyph at small sizes and
    survives being placed on any background.
  * Before showing me anything, render the icon at 20px, 24px, 32px and 64px
    side by side and LOOK at it. If you cannot tell what it is at 32px, it is
    wrong — simplify and try again. Show me that comparison too.

── Then stop ──

Show me the rendered cover, the icon, and the small-size icon comparison.
Do not write any of the project copy yet. Wait for me to approve or ask for
changes.

────────────────────────────────────────────────────────────────────────
STEP 3 — only after I approve: the CMS fields
────────────────────────────────────────────────────────────────────────

Give me each field ready to paste, respecting the limits exactly. Write
plainly and specifically. No marketing language; no adjective doing work a
fact should do.

Where the repository cannot tell you something, write
"[you need to fill this in]" rather than guessing.

  Title           max 160
  Slug            lowercase, hyphens only
  Summary         max 400   Shown on the card. One or two sentences.
  Description     max 8000  Optional. Longer detail for the project page.
  Accent colour   a hex, or "leave blank" to follow the site's own accent
  Problem         max 4000  Optional. What was wrong, or what needed to exist.
  Solution        max 4000  Optional. What was built, and the decisions worth
                            knowing about.
  Learnings       max 4000  Optional. What you know now that you did not
                            before. Prefer things that COST something to find
                            out — a platform limit, a wrong assumption, a bug
                            that survived the tests. Be specific: the number,
                            the error, the measurement. This is usually the
                            most interesting part of the page, and vague
                            learnings are worse than none.
  Status          Draft or Published
  Position        whole number; lower appears first
  Period label    max 80, e.g. "2026" or "Aug 2026 – present"
  Started on      yyyy-mm-dd, from the first commit
  Completed on    yyyy-mm-dd, or blank if ongoing
  Featured        yes or no, with a reason
  Links           label (max 80) + URL each. Live site, repository, anything
                  else real. Never a URL you have not verified resolves.
                  Never link a private admin panel.
  Technologies    the list to create in the CMS first — the form cannot tag a
                  technology that does not exist yet. Real dependencies only.
                  Do not pad the list to look impressive.
  Gallery         which screenshots I should take, and of what. Optional.
  Icon            confirm the file path from step 2.

End with a list of anything the repository could not answer, so I know what
is left for me.
```

---

## Notes for future me

**Why the live page is read for colours.** An accent set through a CMS is not
in the source. Reading `tokens.css` alone would have produced the wrong purple
for this very repository — the tokens say `#8ea6ff`, the site is `#9d00ff`.

**Why the icon rules are stricter than the cover's.** The cover gets ~400px
and the icon gets 32. Those are different design problems, and the mistake is
to treat the icon as a small cover. Three shapes, no text, and prove it at
size before showing anybody.

**Why the renderer is a ladder.** The first draft of this prompt assumed
Playwright. That is true in this monorepo and false in most repositories, and
a prompt that silently installs a Node dependency into someone's Rust project
has done real damage in exchange for saving one manual step.
