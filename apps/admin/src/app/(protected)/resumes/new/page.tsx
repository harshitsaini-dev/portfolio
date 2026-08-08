import type { Metadata } from "next";

import { withAdminPage } from "@/lib/auth/protected-page";
import { ResumeUploadForm } from "@/components/resumes/resume-upload-form";

export const metadata: Metadata = {
  title: "Upload Résumé · Portfolio Admin",
};

export default withAdminPage(async () => {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Résumés
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
        Upload New Résumé
      </h1>
      <p className="mt-3 text-sm text-fg-muted">
        Upload a PDF résumé document. Setting it as current will update the public{" "}
        <code className="font-mono text-xs text-accent">/resume</code> link immediately.
      </p>

      <ResumeUploadForm />
    </div>
  );
});
