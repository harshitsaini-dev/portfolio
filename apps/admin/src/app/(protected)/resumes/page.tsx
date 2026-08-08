import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { ResumeList } from "@/components/resumes/resume-list";

export const metadata: Metadata = {
  title: "Résumés · Portfolio Admin",
};

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  const resumes = await repos.resumes.list();
  const mediaAssets = await repos.media.list();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Content
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Résumés & CVs
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            {resumes.length === 0
              ? "No résumé versions uploaded yet."
              : `${resumes.length} version${resumes.length === 1 ? "" : "s"} stored.`}
          </p>
        </div>
        <Link
          href="/resumes/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          Upload résumé PDF
        </Link>
      </div>

      {resumes.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-strong bg-surface p-10 text-center">
          <h2 className="text-base font-semibold text-fg">
            No résumé uploaded yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">
            Upload your official résumé or CV in PDF format. The current active résumé
            is served at the stable public <code className="font-mono text-xs">/resume</code> URL.
          </p>
          <Link
            href="/resumes/new"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
          >
            Upload your first résumé
          </Link>
        </div>
      ) : (
        <ResumeList resumes={resumes} mediaAssets={mediaAssets} />
      )}
    </div>
  );
});
