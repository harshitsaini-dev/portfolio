"use client";

/**
 * The skill categories, on the same 3D slideshow the projects use.
 *
 * ## Why this file exists at all
 *
 * `Carousel3D` takes a `renderItem` callback, and a function cannot cross from
 * a Server Component into a Client one — React says so, and the first attempt
 * proved it with a 500. The projects have the same wrapper for the same
 * reason. So the callbacks are created here, inside the client boundary, and
 * the section above passes only data.
 */

import { Carousel3D } from "@/components/ui/carousel-3d";
import { OverflowPanel } from "@/components/ui/overflow-panel";
import { ContentImage } from "@/components/ui/content-image";
import { Surface } from "@/components/ui/surface";
import { type } from "@/components/ui/typography";
import type { SkillCategory } from "@/data/types";

/**
 * How many skills a card shows before folding the rest away.
 *
 * Five, because a bar takes two lines where a row took one, and because a
 * third column makes each card narrower. It is a layout number rather than an
 * editorial one — the owner decides *which* five by ordering them in the CMS.
 */
const LEAD_COUNT = 5;


export function SkillsCarousel({
  categories,
}: {
  categories: readonly SkillCategory[];
}) {
  return (
    <Carousel3D
      items={categories}
      getKey={(category) => category.id}
      label="Skill categories"
      itemNoun="category"
      // Two across in the fallback: a card holds a name and a full-width rail,
      // and three columns leaves neither enough room.
      gridClassName="grid gap-6 md:grid-cols-2"
      renderItem={(category) => <CategoryCard category={category} />}
    />
  );
}

/**
 * One category: what it covers, and the skills inside it.
 *
 * Lifted out of the section when the categories moved onto the carousel — it
 * is now rendered by a callback rather than a loop, and a card that big inline
 * made the section hard to read.
 */
function CategoryCard({ category }: { category: SkillCategory }) {
  const headingId = `${category.id}-heading`;

  return (
    /*
      Glass, but **not** `interactive`.

      A skill category card is not clickable, and this file's own rule is that
      a panel which lights up without being interactive promises something it
      cannot deliver. It was `interactive` at first, and hovering a pill lit up
      the card *and* the pill at once — two effects competing, which reads as
      blur rather than as "this one". The rows glow; the card holds still.
    */
    <Surface as="article" aria-labelledby={headingId} glass className="h-full">
      <div className="flex items-center gap-3">
        {/* Decorative: the heading beside it says the same thing. */}
        {category.image ? (
          <ContentImage image={category.image} size={32} decorative />
        ) : null}
        <h3 id={headingId} className={type.subheading}>
          {category.name}
        </h3>
      </div>
      <p className={`mt-2 ${type.bodySm}`}>{category.description}</p>

      <ul
        aria-label={`${category.name} skills`}
        className="mt-6 flex flex-col gap-4"
      >
        {category.skills.slice(0, LEAD_COUNT).map((skill) => (
          <SkillRow key={skill.id} skill={skill} />
        ))}
      </ul>

      {/*
        The overflow, in a panel of its own.

        Three shapes were tried here and the first two were wrong in ways worth
        recording. Printing every skill in the card grew it to several thousand
        pixels for a category of a hundred, and inside the carousel — whose
        stage is measured to its tallest card — that drags the whole section
        with it. Capping the list and scrolling inside the card fixed the
        height and broke the reading: a list you can only see a third of, in a
        box small enough to be mistaken for the end of the card.

        So the long tail gets the room it needs rather than a smaller box.
        The card stays exactly the size it is, the carousel never moves, and
        the full list is a page-sized panel that scrolls the way a page does.
      */}
      {category.skills.length > LEAD_COUNT ? (
        <SkillOverflow category={category} />
      ) : null}
    </Surface>
  );
}


/**
 * Every skill in a category, behind a button.
 *
 * The panel itself is `OverflowPanel`, shared with the tools list below it —
 * see there for why the long tail gets a page-sized panel rather than a
 * smaller box.
 */
function SkillOverflow({ category }: { category: SkillCategory }) {
  return (
    <OverflowPanel
      id={category.id}
      title={category.name}
      subtitle={`${category.skills.length} skills`}
      trigger={`Show all ${category.skills.length}`}
      fallbackTrigger={`${category.skills.length - LEAD_COUNT} more`}
      listLabel={`All ${category.name} skills`}
      fallback={
        <ul
          aria-label={`More ${category.name} skills`}
          className="flex flex-col gap-4"
        >
          {category.skills.slice(LEAD_COUNT).map((skill) => (
            <SkillRow key={skill.id} skill={skill} />
          ))}
        </ul>
      }
    >
      {/*
        Every skill, and the bars come with them — the panel is wide enough
        that they compare properly, which is the whole reason the rail exists.

        Columns rather than one long strip: a hundred skills in a single
        column is a kilometre of scrolling, and three columns of bars on a
        wide screen is roughly a screenful.
      */}
      <ul
        aria-label={`All ${category.name} skills`}
        className="grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {category.skills.map((skill) => (
          <SkillRow key={skill.id} skill={skill} />
        ))}
      </ul>
    </OverflowPanel>
  );
}

/**
 * One skill: its name, and a rail showing how well it is known.
 *
 * ## Why a full-width bar and not five dots
 *
 * This is the third shape this list has taken, and each change was the same
 * complaint — it did not look like anything. Pills with a meter inside wrapped
 * raggedly and every one was a different width. Rows with five dots aligned
 * properly but the dots sat on the text baseline and read as an ellipsis, not
 * a rating.
 *
 * A rail under the name is unambiguous: it is the width of the card, so two
 * skills are compared by looking at where the fill stops, and there is nothing
 * to mistake it for. It costs a second line per skill, which is why the card
 * leads with six and folds the rest.
 *
 * ## The bar is decoration; the sentence is the fact
 *
 * `aria-hidden` on the rail and a real phrase for assistive technology. A
 * length is not something a screen reader can convey, and it is not something
 * everyone can compare by eye.
 *
 * ## An unrated skill gets no rail
 *
 * Not an empty one. Null means the owner never rated it, and an empty track
 * says "zero out of five", which is a different and much less flattering
 * claim.
 */
function SkillRow({ skill }: { skill: SkillCategory["skills"][number] }) {
  // Clamped rather than trusted: the column is CHECKed at 1-5, but a meter is
  // the wrong place to discover that a constraint moved.
  const level =
    skill.proficiency === null
      ? null
      : Math.max(0, Math.min(5, Math.round(skill.proficiency)));

  return (
    <li
      /* The owner's example: a skill lights up under the pointer. Not
         interactive — there is nothing to click — so this is decoration, and
         the glow is the whole affordance rather than a promise of a
         destination. */
      className="glow-row -mx-2 flex flex-col gap-2 rounded-md px-2"
    >
      <span className="glow-title flex min-w-0 items-center gap-2 text-sm text-fg">
        {skill.image ? (
          <ContentImage image={skill.image} size={16} decorative />
        ) : null}
        <span className="truncate">{skill.name}</span>
        {level === null ? null : (
          <span className="sr-only">, {level} out of 5</span>
        )}
      </span>

      {level === null ? null : (
        <span
          aria-hidden="true"
          className="h-1 w-full overflow-hidden rounded-full bg-fg-muted/15"
        >
          {/*
            Width as a percentage of five, written inline because it is data
            rather than design: a Tailwind class per level would be five
            classes that mean one number.
          */}
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${(level / 5) * 100}%` }}
          />
        </span>
      )}
    </li>
  );
}
