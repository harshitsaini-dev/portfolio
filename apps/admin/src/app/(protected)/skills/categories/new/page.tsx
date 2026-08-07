import type { Metadata } from "next";
import Link from "next/link";

import { createSkillCategoryAction } from "@/lib/actions/skills";
import { withAdminPage } from "@/lib/auth/protected-page";
import {
  emptySkillCategoryValues,
  SkillCategoryForm,
} from "@/components/skills/skill-category-form";

/** Static and generic — see the skills list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New skill category · Portfolio Admin",
};

export default withAdminPage(async () => {
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
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New skill category
      </h1>

      <SkillCategoryForm
        action={createSkillCategoryAction}
        initialValues={emptySkillCategoryValues}
        submitLabel="Create category"
      />
    </div>
  );
});
