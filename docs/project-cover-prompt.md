# Prompt: cover image and CMS details for a project

Paste the block below into Claude Code **inside another project's repository**.
It produces a cover image in that project's own visual language and the exact
text for every field of this CMS's project form.

Two things it is built to avoid. It **shows the cover before writing any
copy**, because approving a picture is quick and rewriting three paragraphs is
not. And it **reads the repository for its facts** rather than inventing
plausible ones — a portfolio that overstates a project is worse than one that
omits it.

---

```
Read this repository and produce two things for my portfolio CMS: a cover
image, and the text for a project entry.

Work in this order, and stop where it says stop.

## Step 1 — learn the project, from the repository only

Read the README, the manifests (package.json / pyproject.toml / go.mod /
Cargo.toml — whichever exist), the entry points, the config, and the git log.
Establish:

  * what it does, in one sentence a non-specialist would understand
  * the real stack, with versions taken from the manifests — not from memory
  * whether it is deployed anywhere, and where
  * what is genuinely finished versus started
  * the first and most recent commit dates, and the commit count
  * its visual identity, if it has one: colours from the CSS/theme/tokens, the
    fonts, the general feel. If it has a running deployment, read the computed
    values from the live page — a colour set at runtime is not in the source.

If the project has no visual identity of its own, say so and use a neutral
dark palette rather than borrowing another project's.

## Step 2 — the cover image, and STOP

Produce a 1200x630 cover as SVG, then render it to PNG at 2x with Playwright
(`@playwright/test` is usually already installed; if not, say so rather than
adding a dependency).

Put both in a `covers/` directory at the repository root, and add `/covers/`
to `.gitignore` with a comment explaining why: the image is uploaded to the
CMS and stored in R2, so committing it would leave two copies with no way to
tell which one the site serves.

Rules for the image:

  * Use the project's own colours, read in step 1. Do not invent a palette
    that merely resembles them.
  * No web fonts. SVG text renders in whatever fonts the viewer has, so use
    a system stack: `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
    Helvetica, Arial, sans-serif` and `ui-monospace, SFMono-Regular, Menlo,
    Consolas, monospace`.
  * A gradient painted onto a shape shows that shape's edge. For a soft glow
    use a radialGradient that reaches zero opacity before the shape ends.
  * It will be seen small, on a card. Legible at 400px wide or it has failed.
  * Say what the project *is*. A decorative texture with a name on it tells a
    visitor nothing.

Then **show me the rendered PNG and stop**. Do not write the project copy
yet. Wait for me to approve the image or ask for changes.

## Step 3 — after I approve, the CMS fields

Give me each field below, ready to paste, respecting the limits. Write plainly
and specifically; no marketing language, no adjectives doing work that facts
should do. Where the repository does not tell you something, say
"[you need to fill this in]" rather than guessing.

  Title            max 160
  Slug             lowercase, hyphens; suggest from the title
  Summary          max 400. Shown on the card. One or two sentences.
  Description      max 8000, optional. Longer detail for the project page.
  Accent colour    a hex, or "leave blank" to follow the site accent
  Problem          max 4000, optional. What was wrong, or what needed to exist.
  Solution         max 4000, optional. What was built, and the decisions worth
                   knowing about.
  Learnings        max 4000, optional. What is known now that was not before.
                   Prefer things that cost you something to find out — a
                   platform limit, a wrong assumption, a bug that survived the
                   tests. These are the most interesting part of the page.
  Status           Draft or Published
  Position         a whole number; lower appears first
  Period label     max 80, e.g. "2026" or "Jan – Mar 2026"
  Started on       yyyy-mm-dd, from the first commit
  Completed on     yyyy-mm-dd, or blank if it is ongoing
  Featured         yes or no, with a reason
  Links            label (max 80) + URL, for each. Live site, repository, and
                   anything else real. Never a URL you have not verified.
  Technologies     the list to create in the CMS first — the form cannot tag a
                   technology that does not exist yet. Real dependencies only;
                   do not pad the list.
  Gallery          which screenshots to take, if any, and of what
  Icon             a suggestion, or "none"

End with anything the repository could not answer, listed plainly, so I know
what is left for me.
```

---

## Notes for future me

The prompt asks for the live page's *computed* colours because an accent set
through a CMS is not in the source at all — reading `tokens.css` alone would
have produced the wrong purple for this very project.

The instruction to stop after the image exists because the expensive part is
the writing, and the cheap part is the picture. Getting approval in that order
wastes the least work.
