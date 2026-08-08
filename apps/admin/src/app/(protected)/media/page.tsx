import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@portfolio/ui/components/button";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

export const metadata: Metadata = {
  title: "Media · Portfolio Admin",
};

/** Human-readable size. Bytes are exact; the display is not the record. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  // Ordering comes from the repository (newest first) and is never re-sorted
  // here — the same rule every other list page follows.
  const assets = await repos.media.list();

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Content
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Media
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            {assets.length === 0
              ? "No files yet."
              : `${assets.length} file${assets.length === 1 ? "" : "s"}, newest first.`}
          </p>
        </div>
        {/* First consumer of the shared shadcn Button. `asChild` keeps the
            rendered element an anchor, so client-side navigation and
            middle-click still work — a <button> wrapping a Link would not. */}
        <Button asChild>
          <Link href="/media/new">Upload file</Link>
        </Button>
      </div>

      {assets.length === 0 ? (
        <p className="mt-10 rounded-md border border-subtle bg-surface p-6 text-sm text-fg-muted">
          Nothing uploaded yet. Files added here can be attached to projects
          later.
        </p>
      ) : (
        /* `relative` matters: `sr-only` is absolutely positioned, and an
           absolutely positioned descendant escapes an unpositioned scroll
           container — which is what widened the page on mobile twice before.
           See docs/DECISIONS.md. */
        <div className="relative mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Uploaded media files, newest first
            </caption>
            <thead>
              <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-medium">
                  Description
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Type
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Size
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id} className="border-b border-subtle/60">
                  <td className="py-3 pr-4 align-top text-fg">
                    {asset.altText ?? (
                      <span className="text-fg-muted">
                        &mdash;
                        <span className="sr-only">No description</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 align-top text-fg-muted">
                    {asset.contentType}
                  </td>
                  <td className="py-3 pr-4 align-top text-fg-muted">
                    {formatBytes(asset.byteSize)}
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <Link
                      href={`/media/${asset.id}`}
                      className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
                    >
                      Edit
                      <span className="sr-only">
                        {` ${asset.altText ?? asset.contentType}`}
                      </span>
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
