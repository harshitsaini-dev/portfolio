import type { Metadata } from "next";

import { withAdminPage } from "@/lib/auth/protected-page";
import { MediaUploadForm } from "@/components/media/media-upload-form";

export const metadata: Metadata = {
  title: "Upload Media · Portfolio Admin",
};

export default withAdminPage(async () => {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          Operations
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
          Upload Media Asset
        </h1>
        <p className="mt-3 text-sm text-fg-muted">
          Upload an image or document asset. Input bytes are validated server-side by magic signatures.
        </p>
      </div>

      <MediaUploadForm />
    </div>
  );
});
