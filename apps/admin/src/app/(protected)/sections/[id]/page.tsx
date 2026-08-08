import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateSectionAction } from "@/lib/actions/sections";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import { getAdminRepositories } from "@/lib/db/binding";
import { DeleteSectionForm } from "@/components/sections/delete-section-form";
import { SectionForm } from "@/components/sections/section-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the section to show its title,
 * and route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it.
 */
export const metadata: Metadata = {
  title: "Edit section · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const section = await repos.sections.getById(id);
    if (!section) notFound();

    const mediaOptions = await getMediaOptions();

    return (
      <div className="mx-auto w-full max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/sections"
            className="text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Sections
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          <span className="text-fg">{section.title}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit section
        </h1>

        <SectionForm
          action={updateSectionAction}
          sectionId={section.id}
          submitLabel="Save changes"
          initialValues={{
            iconMediaId: section.iconMediaId ?? "",
            key: section.key,
            title: section.title,
            subtitle: section.subtitle ?? "",
            eyebrow: section.eyebrow ?? "",
            position: section.position,
            isVisible: section.isVisible,
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
            Delete section
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this section. Other sections are not affected.
            This cannot be undone.
          </p>
          <DeleteSectionForm
            sectionId={section.id}
            sectionTitle={section.title}
            sectionKey={section.key}
          />
        </section>
      </div>
    );
  },
);
