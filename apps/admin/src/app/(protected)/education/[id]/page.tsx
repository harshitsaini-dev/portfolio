import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateEducationEntryAction } from "@/lib/actions/education";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { DeleteEducationEntryForm } from "@/components/education/delete-education-entry-form";
import { EducationForm } from "@/components/education/education-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the entry to show its
 * qualification, and route metadata is evaluated independently of the
 * component, so `withAdminPage` could not protect it.
 */
export const metadata: Metadata = {
  title: "Edit education entry · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const entry = await repos.education.getById(id);
    if (!entry) notFound();

    return (
      <div className="mx-auto w-full max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/education"
            className="text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Education
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          <span className="text-fg">{entry.qualification}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit education entry
        </h1>

        <EducationForm
          action={updateEducationEntryAction}
          entryId={entry.id}
          submitLabel="Save changes"
          initialValues={{
            qualification: entry.qualification,
            institution: entry.institution,
            fieldOfStudy: entry.fieldOfStudy ?? "",
            summary: entry.summary ?? "",
            periodLabel: entry.periodLabel ?? "",
            startedOn: entry.startedOn ?? "",
            endedOn: entry.endedOn ?? "",
            position: entry.position,
            isVisible: entry.isVisible,
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
            Delete entry
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this education entry. Other entries are not
            affected. This cannot be undone.
          </p>
          <DeleteEducationEntryForm
            entryId={entry.id}
            entryLabel={`${entry.qualification} — ${entry.institution}`}
          />
        </section>
      </div>
    );
  },
);
