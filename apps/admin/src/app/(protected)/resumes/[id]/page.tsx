import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateResumeAction } from "@/lib/actions/resumes";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { getDocumentOptions } from "@/lib/media/options";
import { DeleteResumeForm } from "@/components/resumes/delete-resume-form";
import { ResumeForm } from "@/components/resumes/resume-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the record to show its label,
 * and route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it.
 */
export const metadata: Metadata = {
  title: "Edit résumé · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const resume = await repos.resumes.getById(id);
    if (!resume) notFound();

    const documentOptions = await getDocumentOptions();

    return (
      <div className="mx-auto w-full max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/resumes"
            className="text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Résumés
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          <span className="text-fg">{resume.label}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit résumé
        </h1>

        {resume.isCurrent ? (
          <p className="mt-3 max-w-xl text-sm text-fg-muted">
            This is the published résumé — the public site links to it now, so
            changes here take effect immediately.
          </p>
        ) : null}

        <ResumeForm
          action={updateResumeAction}
          resumeId={resume.id}
          submitLabel="Save changes"
          initialValues={{
            label: resume.label,
            mediaAssetId: resume.mediaAssetId,
            isVisible: resume.isVisible,
          }}
          documentOptions={documentOptions}
        />

        <section
          aria-labelledby="danger-zone"
          className="mt-14 rounded-lg border border-danger/40 bg-surface p-6"
        >
          <h2
            id="danger-zone"
            className="text-sm font-semibold uppercase tracking-wider text-fg"
          >
            Delete résumé
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this record. To take the download off the site
            without losing it, untick “Visible” above instead.
          </p>
          <DeleteResumeForm
            resumeId={resume.id}
            resumeLabel={resume.label}
            isCurrent={resume.isCurrent}
          />
        </section>
      </div>
    );
  },
);
