import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateSkillAction } from "@/lib/actions/skills";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { DeleteSkillForm } from "@/components/skills/delete-skill-form";
import { SkillForm } from "@/components/skills/skill-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the skill to show its name, and
 * route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it.
 */
export const metadata: Metadata = {
  title: "Edit skill · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const skill = await repos.skills.getSkillById(id);
    if (!skill) notFound();

    // Only to name the owning category in the UI. The category cannot be
    // changed here — see `SkillForm` for why that is a distinct operation.
    const category = await repos.skills.getById(skill.categoryId);

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
          <span className="text-fg">{skill.name}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit skill
        </h1>

        <SkillForm
          action={updateSkillAction}
          skillId={skill.id}
          categories={[]}
          categoryName={category?.name ?? "Unknown category"}
          submitLabel="Save changes"
          initialValues={{
            categoryId: skill.categoryId,
            name: skill.name,
            proficiency:
              skill.proficiency === null ? "" : String(skill.proficiency),
            position: skill.position,
            isVisible: skill.isVisible,
          }}
        />

        <section
          aria-labelledby="danger-zone"
          className="mt-14 rounded-lg border border-danger/40 bg-surface p-6"
        >
          <h2
            id="danger-zone"
            className="text-sm font-semibold uppercase tracking-wider text-fg"
          >
            Delete skill
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this skill. Its category and the other skills
            in it are not affected. This cannot be undone.
          </p>
          <DeleteSkillForm
            skillId={skill.id}
            skillLabel={`${skill.name} — ${category?.name ?? "Unknown category"}`}
          />
        </section>
      </div>
    );
  },
);
