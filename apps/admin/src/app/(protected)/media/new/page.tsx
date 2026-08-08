import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { uploadMediaAssetAction } from "@/lib/actions/media";
import { MediaUploadForm } from "@/components/media/media-upload-form";

/**
 * Static, generic metadata — never `generateMetadata`. Route metadata is
 * evaluated independently of the component, so `withAdminPage` cannot protect
 * it; a metadata function reading a record would leak it to unauthenticated
 * requests.
 */
export const metadata: Metadata = {
  title: "Upload file · Portfolio Admin",
};

export default withAdminPage(async () => {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Media
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
        Upload a file
      </h1>
      <p className="mt-3 text-sm text-fg-muted">
        Stored in object storage; only its metadata is kept in the database.
      </p>

      <MediaUploadForm action={uploadMediaAssetAction} />

      <p className="mt-10 text-sm">
        <Link
          href="/media"
          className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
        >
          Back to media
        </Link>
      </p>
    </div>
  );
});
