import type { Metadata } from "next";
import Link from "next/link";

import { createResumeAction } from "@/lib/actions/resumes";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getDocumentOptions } from "@/lib/media/options";
import {
  emptyResumeValues,
  ResumeForm,
} from "@/components/resumes/resume-form";

/** Static and generic — see the list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New résumé · Portfolio Admin",
};

export default withAdminPage(async () => {
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
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New résumé
      </h1>

      {/* Creating never publishes. Said here so the absence of a "current"
          control reads as a decision rather than as an oversight. */}
      <p className="mt-3 max-w-xl text-sm text-fg-muted">
        This adds a résumé without publishing it. Publish it from the list when
        you are ready — that is what puts the download on the public site.
      </p>

      <ResumeForm
        action={createResumeAction}
        initialValues={emptyResumeValues}
        submitLabel="Create résumé"
        documentOptions={documentOptions}
      />
    </div>
  );
});
