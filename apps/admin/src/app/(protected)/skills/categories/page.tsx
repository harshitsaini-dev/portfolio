import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

/** Static and generic — see the skills list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "Skill categories · Portfolio Admin",
};

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  // Nested read rather than a plain list: the skill count per category is
  // what makes the delete affordance honest, and it comes from the same
  // single extra query.
  const categories = await repos.skills.listWithSkills();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/skills"
          className="text-fg-muted transition-colors duration-150 hover:text-fg"
        >
          Skills
        </Link>
        <span aria-hidden="true" className="mx-2 text-fg-muted">
          /
        </span>
        <span className="text-fg">Categories</span>
      </nav>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            Skill categories
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            {categories.length === 0
              ? "No categories yet."
              : `${categories.length} categor${categories.length === 1 ? "y" : "ies"}, in display order.`}
          </p>
        </div>
        <Link
          href="/skills/categories/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          New category
        </Link>
      </div>

      {categories.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-strong bg-surface p-10 text-center">
          <h2 className="text-base font-semibold text-fg">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
            Categories group skills on the public site. Hidden ones stay listed
            here but not on the site.
          </p>
          <Link
            href="/skills/categories/new"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
          >
            Add the first category
          </Link>
        </div>
      ) : (
        // `relative` alongside `overflow-x-auto` — see the skills list route.
        <div className="relative mt-8 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              All skill categories, ordered by display position
            </caption>
            <thead>
              <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">Name</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Slug</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Description</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Skills</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Position</th>
                <th scope="col" className="py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-b border-subtle">
                  <th scope="row" className="py-3 pr-4 font-medium text-fg">
                    {category.name}
                    {category.isVisible ? null : (
                      <span className="ml-2 rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted">
                        Hidden
                      </span>
                    )}
                  </th>
                  <td className="py-3 pr-4 font-mono text-xs text-fg-muted">
                    {category.slug}
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {category.description ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {category.skills.length}
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {category.position}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/skills/categories/${category.id}`}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-muted"
                    >
                      Edit
                      <span className="sr-only"> {category.name}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
