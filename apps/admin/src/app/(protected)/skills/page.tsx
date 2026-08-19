import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

/**
 * Static, generic metadata.
 *
 * Deliberately NOT `generateMetadata` reading skill data. Phase 6 established
 * that route metadata is evaluated independently of the component, so
 * `withAdminPage` cannot protect it — a metadata function that read a record
 * would leak it to unauthenticated requests.
 */
export const metadata: Metadata = {
  title: "Skills · Portfolio Admin",
};

/**
 * Declared rather than taken from `PageProps<"/skills">`, for the reason the
 * analytics route gives: Next generates its route-literal union during a
 * build, and a type that only resolves after the thing it describes has been
 * built is a poor dependency for the file that creates it.
 */
interface SkillsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type Categories = Awaited<
  ReturnType<
    Awaited<ReturnType<typeof getAdminRepositories>>["skills"]["listWithSkills"]
  >
>;

/**
 * Skills, one category at a time.
 *
 * ## Why this is two views rather than one long page
 *
 * It used to print every category with its full table underneath. At sixty
 * skills across twelve categories that is a page you navigate by scrolling and
 * remembering, and the owner said so: after adding a skill, comparing one
 * category with another meant hunting up and down.
 *
 * So the landing view is the categories — all of them visible at once — and
 * choosing one shows only its skills.
 *
 * ## Why the selection lives in the URL
 *
 * A `<details>` element would have been less code and would collapse again on
 * every round trip: add a skill, come back, and the category you were working
 * in is shut. `?category=` survives that, gives the back button something to
 * do, makes a category linkable, and keeps this a Server Component with no
 * client JavaScript at all.
 *
 * The id is validated by lookup rather than trusted: an unknown one falls back
 * to the category list instead of rendering an empty table for something that
 * does not exist.
 */
export default withAdminPage<SkillsPageProps>(async ({ props }) => {
  const params = await props.searchParams;
  const raw = params.category;
  const requested = Array.isArray(raw) ? raw[0] : raw;

  const repos = await getAdminRepositories();
  // Categories with their skills nested, in one extra query rather than N.
  // No visibility filter: the CMS list is the admin view and shows hidden
  // categories and skills too, badged rather than omitted. Ordering comes
  // from the repository (categories by position, skills by position within
  // each category) — never re-sorted here.
  const categories = await repos.skills.listWithSkills();
  const skillCount = categories.reduce(
    (total, category) => total + category.skills.length,
    0,
  );

  const selected = requested
    ? (categories.find((category) => category.id === requested) ?? null)
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Content
          </p>

          {selected ? (
            <>
              {/* The way back sits above the heading, where a breadcrumb goes,
                  so leaving a category is the first thing in the tab order
                  rather than something to hunt for after the table. */}
              <nav aria-label="Breadcrumb" className="mt-3 text-sm">
                <Link
                  href="/skills"
                  className="text-fg-muted underline underline-offset-4 transition-colors duration-150 hover:text-fg"
                >
                  All categories
                </Link>
                <span aria-hidden="true" className="mx-2 text-fg-muted">
                  /
                </span>
                <span className="text-fg">{selected.name}</span>
              </nav>

              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
                {selected.name}
                {selected.isVisible ? null : (
                  <span className="ml-3 rounded-full border border-subtle bg-surface-muted px-2 py-0.5 align-middle text-[0.6875rem] font-medium text-fg-muted">
                    Hidden
                  </span>
                )}
              </h1>

              <p className="mt-3 text-sm text-fg-muted">
                {selected.skills.length === 0
                  ? "No skills in this category yet."
                  : `${selected.skills.length} skill${selected.skills.length === 1 ? "" : "s"}, in display order.`}{" "}
                Position {selected.position} ·{" "}
                <Link
                  href={`/skills/categories/${selected.id}`}
                  className="text-accent transition-colors duration-150 hover:text-fg"
                >
                  Edit category
                  <span className="sr-only"> {selected.name}</span>
                </Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
                Skills
              </h1>
              <p className="mt-3 text-sm text-fg-muted">
                {categories.length === 0
                  ? "No skill categories yet."
                  : `${skillCount} skill${skillCount === 1 ? "" : "s"} across ${categories.length} categor${categories.length === 1 ? "y" : "ies"}. Choose a category to see its skills.`}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/skills/categories"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
          >
            Manage categories
          </Link>
          {categories.length > 0 ? (
            <Link
              href="/skills/new"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
            >
              New skill
            </Link>
          ) : null}
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-strong bg-surface p-10 text-center">
          <h2 className="text-base font-semibold text-fg">
            Start with a category
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
            Every skill belongs to a category, so there is nowhere to put one
            yet. Create a category first, then add skills to it.
          </p>
          <Link
            href="/skills/categories/new"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
          >
            Add the first category
          </Link>
        </div>
      ) : selected ? (
        <SkillTable category={selected} />
      ) : (
        <CategoryList categories={categories} />
      )}
    </div>
  );
});

/** The landing view: every category, and how much is in each. */
function CategoryList({ categories }: { categories: Categories }) {
  return (
    <ul className="mt-8 grid gap-3 sm:grid-cols-2">
      {categories.map((category) => (
        <li key={category.id}>
          {/*
            The whole card is the link, not a small "view" action in a corner:
            the row has one destination, and a target the width of the card is
            the difference between a list that is pleasant on a phone and one
            that is not.
          */}
          <Link
            href={`/skills?category=${category.id}`}
            className="flex h-full min-h-11 flex-col gap-1 rounded-lg border border-subtle bg-surface p-4 transition-colors duration-150 hover:border-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-fg">
                {category.name}
              </span>
              {category.isVisible ? null : (
                <span className="rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted">
                  Hidden
                </span>
              )}
            </span>
            <span className="text-sm text-fg-muted">
              {category.skills.length === 0
                ? "No skills yet"
                : `${category.skills.length} skill${category.skills.length === 1 ? "" : "s"}`}
              {" · position "}
              {category.position}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** One category's skills — the table the page used to print twelve of. */
function SkillTable({ category }: { category: Categories[number] }) {
  if (category.skills.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-dashed border-strong bg-surface p-10 text-center">
        <p className="text-sm text-fg-muted">No skills in this category yet.</p>
        <Link
          href="/skills/new"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          Add a skill
        </Link>
      </div>
    );
  }

  return (
    // `relative` is load-bearing alongside `overflow-x-auto`. The `sr-only`
    // labels in this table are absolutely positioned, and an absolutely
    // positioned element is laid out against its nearest *positioned*
    // ancestor — a non-positioned scroll container does not contain it.
    // Without `relative` they resolve against the viewport from a cell that
    // sits beyond it, widening the document's scroll area even though the
    // table itself scrolls correctly.
    <div className="relative mt-8 overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          Skills in {category.name}, ordered by display position
        </caption>
        <thead>
          <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
            <th scope="col" className="py-3 pr-4 font-semibold">
              Skill
            </th>
            <th scope="col" className="py-3 pr-4 font-semibold">
              Proficiency
            </th>
            <th scope="col" className="py-3 pr-4 font-semibold">
              Position
            </th>
            <th scope="col" className="py-3 font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {category.skills.map((skill) => (
            <tr key={skill.id} className="border-b border-subtle">
              <th scope="row" className="py-3 pr-4 font-medium text-fg">
                {skill.name}
                {skill.isVisible ? null : (
                  <span className="ml-2 rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted">
                    Hidden
                  </span>
                )}
              </th>
              <td className="py-3 pr-4 text-fg-muted">
                {skill.proficiency === null
                  ? "Not rated"
                  : `${skill.proficiency} / 5`}
              </td>
              <td className="py-3 pr-4 text-fg-muted">{skill.position}</td>
              <td className="py-3 text-right">
                <Link
                  href={`/skills/${skill.id}`}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-muted"
                >
                  Edit
                  <span className="sr-only"> {skill.name}</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
