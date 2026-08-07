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

export default withAdminPage(async () => {
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

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Content
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Skills
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            {categories.length === 0
              ? "No skill categories yet."
              : `${skillCount} skill${skillCount === 1 ? "" : "s"} across ${categories.length} categor${categories.length === 1 ? "y" : "ies"}, in display order.`}
          </p>
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
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {categories.map((category) => (
            <section
              key={category.id}
              aria-labelledby={`category-${category.id}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2
                  id={`category-${category.id}`}
                  className="text-lg font-semibold text-fg"
                >
                  {category.name}
                  {category.isVisible ? null : (
                    <span className="ml-2 rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted">
                      Hidden
                    </span>
                  )}
                </h2>
                <p className="text-xs text-fg-muted">
                  Position {category.position} ·{" "}
                  <Link
                    href={`/skills/categories/${category.id}`}
                    className="text-accent transition-colors duration-150 hover:text-fg"
                  >
                    Edit category
                    <span className="sr-only"> {category.name}</span>
                  </Link>
                </p>
              </div>

              {category.skills.length === 0 ? (
                <p className="mt-3 rounded-md border border-dashed border-strong bg-surface px-4 py-5 text-sm text-fg-muted">
                  No skills in this category yet.
                </p>
              ) : (
                // `relative` is load-bearing alongside `overflow-x-auto`. The
                // `sr-only` labels in this table are absolutely positioned,
                // and an absolutely positioned element is laid out against
                // its nearest *positioned* ancestor — a non-positioned scroll
                // container does not contain it. Without `relative` they
                // resolve against the viewport from a cell that sits beyond
                // it, widening the document's scroll area even though the
                // table itself scrolls correctly.
                <div className="relative mt-3 overflow-x-auto">
                  <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Skills in {category.name}, ordered by display position
                    </caption>
                    <thead>
                      <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                        <th scope="col" className="py-3 pr-4 font-semibold">Skill</th>
                        <th scope="col" className="py-3 pr-4 font-semibold">Proficiency</th>
                        <th scope="col" className="py-3 pr-4 font-semibold">Position</th>
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
                          <td className="py-3 pr-4 text-fg-muted">
                            {skill.position}
                          </td>
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
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
});
