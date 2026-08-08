import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

export const metadata: Metadata = {
  title: "Media · Portfolio Admin",
};

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  const mediaAssets = await repos.media.list();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Operations
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Media Library
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            {mediaAssets.length === 0
              ? "No media assets stored yet."
              : `${mediaAssets.length} asset${mediaAssets.length === 1 ? "" : "s"} stored in R2.`}
          </p>
        </div>
        <Link
          href="/media/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          Upload media
        </Link>
      </div>

      {mediaAssets.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-strong bg-surface p-10 text-center">
          <h2 className="text-base font-semibold text-fg">No media uploaded yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">
            Upload portfolio images or résumé documents. Uploaded files are stored in
            R2 object storage with metadata tracked in D1.
          </p>
          <Link
            href="/media/new"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
          >
            Upload your first asset
          </Link>
        </div>
      ) : (
        <div className="relative mt-8 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              All stored media assets and documents
            </caption>
            <thead>
              <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">Key / File</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Content Type</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Size</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Alt Text</th>
                <th scope="col" className="py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mediaAssets.map((asset) => (
                <tr key={asset.id} className="border-b border-subtle">
                  <th scope="row" className="py-3 pr-4 font-mono text-xs text-fg">
                    {asset.storageKey}
                  </th>
                  <td className="py-3 pr-4 text-fg-muted">
                    <span className="rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg">
                      {asset.contentType}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {formatByteSize(asset.byteSize)}
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {asset.altText ? (
                      <span className="line-clamp-1 max-w-[12rem]">{asset.altText}</span>
                    ) : (
                      <span className="italic text-fg-muted/60">None</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/media/${asset.id}`}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-muted"
                    >
                      Edit / Details
                      <span className="sr-only"> {asset.storageKey}</span>
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
