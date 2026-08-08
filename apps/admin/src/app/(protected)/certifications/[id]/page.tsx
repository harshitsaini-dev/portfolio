import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateCertificationAction } from "@/lib/actions/certifications";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import { getAdminRepositories } from "@/lib/db/binding";
import { DeleteCertificationForm } from "@/components/certifications/delete-certification-form";
import { CertificationForm } from "@/components/certifications/certification-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the certification to show its
 * title, and route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it.
 */
export const metadata: Metadata = {
  title: "Edit certification · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const certification = await repos.certifications.getById(id);
    if (!certification) notFound();

    const mediaOptions = await getMediaOptions();

    return (
      <div className="mx-auto w-full max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/certifications"
            className="text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Certifications
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          <span className="text-fg">{certification.title}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit certification
        </h1>

        <CertificationForm
          action={updateCertificationAction}
          certificationId={certification.id}
          submitLabel="Save changes"
          initialValues={{
            iconMediaId: certification.iconMediaId ?? "",
            title: certification.title,
            issuer: certification.issuer,
            credentialId: certification.credentialId ?? "",
            credentialUrl: certification.credentialUrl ?? "",
            issuedOn: certification.issuedOn ?? "",
            expiresOn: certification.expiresOn ?? "",
            position: certification.position,
            isVisible: certification.isVisible,
          }}
          mediaOptions={mediaOptions}
        />

        <section
          aria-labelledby="danger-zone"
          className="mt-14 rounded-lg border border-danger/40 bg-surface p-6"
        >
          <h2
            id="danger-zone"
            className="text-sm font-semibold uppercase tracking-wider text-fg"
          >
            Delete certification
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this certification. Other certifications are
            not affected. This cannot be undone.
          </p>
          <DeleteCertificationForm
            certificationId={certification.id}
            certificationLabel={`${certification.title} — ${certification.issuer}`}
          />
        </section>
      </div>
    );
  },
);
