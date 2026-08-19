import { SkillsCarousel } from "@/components/skills-carousel";
import { OverflowPanel } from "@/components/ui/overflow-panel";
import { Section } from "@/components/section";
import type { SectionCopy } from "@/lib/content/sections";
import { ContentImage } from "@/components/ui/content-image";
import { type } from "@/components/ui/typography";
import type { SkillCategory, Tool } from "@/data/types";


/**
 * How many tools are printed before the rest are folded away.
 *
 * Twenty-four is two full columns on a wide screen and a scroll or so on a
 * phone — enough that a short list is never folded at all, and a floor on the
 * height of a long one.
 */
const TOOL_LEAD_COUNT = 24;

interface SkillsSectionProps {
  skillCategories: readonly SkillCategory[];
  tools: readonly Tool[];
  copy: SectionCopy;
}

/**
 * Skills and tools share one section: both answer "what does this person work
 * with", and separating them produced two thin sections with no meaningful
 * distinction for the reader. Each keeps its own `<h3>`.
 */
export function SkillsSection({
  skillCategories,
  tools,
  copy,
}: SkillsSectionProps) {
  return (
    <Section
      id={copy.key}
      eyebrow={copy.eyebrow}
      eyebrowAlternates={copy.eyebrowAlternates}
      title={copy.title}
      marker={copy.marker}
      icon={copy.icon}
      accent={copy.accent}
    >
      {skillCategories.length === 0 ? (
        <p className={type.bodySm}>No skills have been published yet.</p>
      ) : (
        /*
          The same 3D slideshow the projects use.

          A grid was right at four categories and wrong at fifteen: two per row
          made the section something to scroll through rather than see, and
          three per row made every card too narrow for a name and a rail. The
          carousel shows one category at a time with its neighbours behind it,
          so the section is the same height whether there are four or forty.

          It degrades to a plain grid on a phone, under reduced motion, and
          with JavaScript off — see `Carousel3D`. That fallback is the reason
          this is allowed to be a carousel at all: nothing is hidden behind a
          mechanism that might not run.
        */
        <SkillsCarousel categories={skillCategories} />
      )}

      {/*
        The tools.

        Three columns of rows was fine at nine and would be a wall at a
        hundred: the owner asked what happens then, which is the right
        question to ask before it happens rather than after.

        Two things keep it readable at that size. The rows are compact — a
        name, a logo and what it is for, on one line — so a hundred of them is
        a list rather than a page. And only the first two dozen are printed,
        with the rest behind the same native disclosure the skill cards use, so
        the section has a floor on its height no matter how long the list gets.
      */}
      <div className="mt-14">
        <h3 className={`flex items-center gap-2 ${type.minorHeading}`}>
          {/* Decorative: the heading text names the group. */}
          <span aria-hidden="true" className="text-base leading-none">
            {"\u{1F6E0}"}
          </span>
          Tools
          {tools.length > 0 ? (
            <span className="ml-1 font-mono text-xs font-normal text-fg-muted">
              {tools.length}
            </span>
          ) : null}
        </h3>

        {tools.length === 0 ? (
          <p className={`mt-4 ${type.bodySm}`}>
            No tools have been published yet.
          </p>
        ) : (
          <>
            <dl className="mt-6 grid gap-x-10 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {tools.slice(0, TOOL_LEAD_COUNT).map((tool) => (
                <ToolRow key={tool.id} tool={tool} />
              ))}
            </dl>

            {tools.length > TOOL_LEAD_COUNT ? (
              /* The same panel the skill categories use. A hundred tools
                 printed onto the page is a wall of them; a hundred in a panel
                 the size of the page is a list somebody can read. */
              <OverflowPanel
                id="tools"
                title="Tools"
                subtitle={`${tools.length} tools`}
                trigger={`Show all ${tools.length}`}
                fallbackTrigger={`${tools.length - TOOL_LEAD_COUNT} more tools`}
                listLabel="All tools"
                fallback={
                  <dl className="grid gap-x-10 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {tools.slice(TOOL_LEAD_COUNT).map((tool) => (
                      <ToolRow key={tool.id} tool={tool} />
                    ))}
                  </dl>
                }
              >
                <dl className="grid gap-x-10 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                  {tools.map((tool) => (
                    <ToolRow key={tool.id} tool={tool} />
                  ))}
                </dl>
              </OverflowPanel>
            ) : null}
          </>
        )}
      </div>
    </Section>
  );
}

/**
 * How well a skill is known, as five dots.
 *
 * ## Why it took this long to appear
 *
 * The CMS has collected a 1-5 rating since skills existed, and nothing on the
 * public site read it: the field saved, the column filled, and the page never
 * asked. Reported as "proficiency is in the admin but not on the portfolio",
 * which is the same class of defect as the section icons and the share image
 * before it — a field that saves is not a field that works.
 *
 * ## Dots rather than a number or a bar
 *
 * "4/5" invites the question a self-rating cannot answer — four out of five by
 * whose measure — and reads as a score. A bar at this size is three pixels of
 * fill nobody can compare. Five dots are countable at a glance and take the
 * width of two characters, which is what a pill can spare.
 *
 * ## The dots are decoration; the sentence is the fact
 *
 * `aria-hidden` on the dots and a real phrase for assistive technology. Five
 * bullet characters announced one by one would be noise, and shape alone is
 * not something everyone can count.
 */
/**
 * One tool: what it is, and what it is for.
 *
 * Extracted when the list grew a fold, so the two halves cannot drift apart.
 *
 * The purpose is allowed to disappear below `sm`. At a hundred tools on a
 * phone, "Docker · Local services" wraps to two lines each and the list
 * becomes six hundred pixels of secondary text; the name and the logo are
 * what somebody is scanning for.
 */
function ToolRow({ tool }: { tool: Tool }) {
  return (
    <div
      /* A row has no border to light up, so it takes the tinted variant
         instead. Padded on both sides of the text and given a minimum height,
         so the label sits centred between the rules rather than hugging the
         top — and so a row with a 24px icon is the same height as one
         without, which is what made neighbouring rows look misaligned when
         only the bottom was padded. */
      className="glow-row -mx-2 flex min-h-11 items-center justify-between gap-4 rounded-md border-b border-subtle px-2 py-1.5"
    >
      <dt className="glow-title flex min-w-0 items-center gap-3 text-sm font-medium text-fg">
        {tool.image ? (
          <ContentImage image={tool.image} size={20} decorative />
        ) : null}
        <span className="truncate">{tool.name}</span>
      </dt>
      <dd className={`hidden shrink-0 text-right sm:block ${type.fine}`}>
        {tool.purpose}
      </dd>
    </div>
  );
}
