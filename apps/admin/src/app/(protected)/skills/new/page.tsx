import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createSkillAction } from "@/lib/actions/skills";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { emptySkillValues, SkillForm } from "@/components/skills/skill-form";

/** Static and generic — see the skills list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New skill · Portfolio Admin",
};

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  const categories = await repos.skills.list();

  // A skill cannot exist without a category, so there is nothing to render
  // here until one exists. Sending the editor where they can fix that beats
  // showing a form whose only outcome is a rejection.
  if (categories.length === 0) redirect("/skills/categories/new");

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
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New skill
      </h1>

      <SkillForm
        action={createSkillAction}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
        initialValues={emptySkillValues}
        submitLabel="Create skill"
      />
    </div>
  );
});
