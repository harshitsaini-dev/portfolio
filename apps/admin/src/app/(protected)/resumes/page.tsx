import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { MakeCurrentForm } from "@/components/resumes/make-current-form";

/**
 * Static, generic metadata.
 *
 * Deliberately NOT `generateMetadata` reading the rows. Phase 6 established
 * that route metadata is evaluated independently of the component, so
 * `withAdminPage` cannot protect it — a metadata function that read a record
 * would leak it to unauthenticated requests.
 */
export const metadata: Metadata = {
  title: "Résumés · Portfolio Admin",
};

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  // Ordering comes from the repository and is never re-sorted here.
  const resumes = await repos.resumes.list();
  const published = resumes.find((resume) => resume.isCurrent) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Operations
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Résumés
          </h1>
          {/*
            States the *effect* rather than the count. "Zero résumés are
            current" is a valid state, and it is the one an editor most needs
            told: the public download link simply is not there.
          */}
          <p className="mt-3 max-w-xl text-sm text-fg-muted">
            {published
              ? `The public site links to “${published.label}”.`
              : "Nothing is published, so the public site shows no résumé download. Publish one below."}
          </p>
          <p className="mt-2 max-w-xl text-sm text-fg-muted">
            Only one résumé can be published at a time — publishing another
            replaces it. Upload the PDF in{" "}
            <Link
              href="/media"
              className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
            >
              Media
            </Link>{" "}
            first, then attach it here.
          </p>
        </div>
        <Link
          href="/resumes/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          New résumé
        </Link>
      </div>

      {resumes.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-strong bg-surface p-10 text-center">
          <h2 className="text-base font-semibold text-fg">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
            A résumé points at a PDF in the media library and gives it a label.
            Publishing one adds a download link to the public site.
          </p>
          <Link
            href="/resumes/new"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
          >
            Add the first résumé
          </Link>
        </div>
      ) : (
        // `relative` is load-bearing alongside `overflow-x-auto`: the
        // `sr-only` labels here are absolutely positioned, and an absolutely
        // positioned element resolves against its nearest *positioned*
        // ancestor. Without it they escape the scroll container and widen the
        // document.
        <div className="relative mt-8 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              All résumés. At most one is published at a time.
            </caption>
            <thead>
              <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">
                  Label
                </th>
                <th scope="col" className="py-3 pr-4 font-semibold">
                  File
                </th>
                <th scope="col" className="py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {resumes.map((resume) => (
                <tr key={resume.id} className="border-b border-subtle">
                  <th scope="row" className="py-3 pr-4 font-medium text-fg">
                    {resume.label}
                    {resume.isCurrent ? (
                      <span className="ml-2 rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-medium text-accent">
                        Published
                      </span>
                    ) : null}
                    {resume.isVisible ? null : (
                      <span className="ml-2 rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted">
                        Hidden
                      </span>
                    )}
                  </th>
                  <td className="py-3 pr-4 text-fg-muted">
                    <a
                      href={`/media/${encodeURIComponent(resume.mediaAssetId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
                    >
                      Open PDF
                      <span className="sr-only">
                        {" "}
                        for {resume.label} — opens in a new tab
                      </span>
                    </a>
                  </td>
                  <td className="py-3 text-right">
                    {resume.isCurrent ? null : (
                      <MakeCurrentForm
                        resumeId={resume.id}
                        resumeLabel={resume.label}
                      />
                    )}
                    <Link
                      href={`/resumes/${resume.id}`}
                      className="ml-1 inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-muted"
                    >
                      Edit
                      <span className="sr-only"> {resume.label}</span>
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
