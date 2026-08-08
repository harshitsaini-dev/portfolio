import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateSkillCategoryAction } from "@/lib/actions/skills";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import { getAdminRepositories } from "@/lib/db/binding";
import { DeleteSkillCategoryForm } from "@/components/skills/delete-skill-category-form";
import { SkillCategoryForm } from "@/components/skills/skill-category-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the category to show its name,
 * and route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it.
 */
export const metadata: Metadata = {
  title: "Edit skill category · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const category = await repos.skills.getById(id);
    if (!category) notFound();

    const mediaOptions = await getMediaOptions();

    // The count drives what the delete affordance says. The authority is
    // still `ON DELETE RESTRICT` on the server.
    const skills = await repos.skills.listSkills(category.id);

    return (
      <div className="mx-auto w-full max-w-3xl">
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
          <Link
            href="/skills/categories"
            className="text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Categories
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          <span className="text-fg">{category.name}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit skill category
        </h1>

        <SkillCategoryForm
          action={updateSkillCategoryAction}
          categoryId={category.id}
          submitLabel="Save changes"
          initialValues={{
            iconMediaId: category.iconMediaId ?? "",
            name: category.name,
            slug: category.slug,
            description: category.description ?? "",
            position: category.position,
            isVisible: category.isVisible,
          }}
          mediaOptions={mediaOptions}
        />

        <section
          aria-labelledby="danger-zone"
          className="mt-14 rounded-lg border border-danger/40 bg-surface p-6"
        >
          <h2
            id="danger-zone"
            className="text-sm font-semibold uppercase tracking-wider text-fg"
          >
            Delete category
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            A category can only be deleted once it holds no skills. Skills are
            never deleted automatically when a category is removed.
          </p>
          <DeleteSkillCategoryForm
            categoryId={category.id}
            categoryName={category.name}
            skillCount={skills.length}
          />
        </section>
      </div>
    );
  },
);
