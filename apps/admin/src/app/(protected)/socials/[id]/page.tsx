import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateSocialLinkAction } from "@/lib/actions/socials";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { DeleteSocialLinkForm } from "@/components/socials/delete-social-link-form";
import { SocialLinkForm } from "@/components/socials/social-link-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the link to show its label,
 * and route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it.
 */
export const metadata: Metadata = {
  title: "Edit social link · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const socialLink = await repos.socialLinks.getById(id);
    if (!socialLink) notFound();

    return (
      <div className="mx-auto w-full max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/socials"
            className="text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Social links
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          <span className="text-fg">{socialLink.label}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit social link
        </h1>

        <SocialLinkForm
          action={updateSocialLinkAction}
          socialLinkId={socialLink.id}
          submitLabel="Save changes"
          initialValues={{
            label: socialLink.label,
            platform: socialLink.platform,
            url: socialLink.url,
            position: socialLink.position,
            isVisible: socialLink.isVisible,
          }}
        />

        <section
          aria-labelledby="danger-zone"
          className="mt-14 rounded-lg border border-danger/40 bg-surface p-6"
        >
          <h2
            id="danger-zone"
            className="text-sm font-semibold uppercase tracking-wider text-fg"
          >
            Delete social link
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this social link. Other links are not
            affected. This cannot be undone.
          </p>
          <DeleteSocialLinkForm
            socialLinkId={socialLink.id}
            socialLinkLabel={`${socialLink.label} — ${socialLink.platform}`}
          />
        </section>
      </div>
    );
  },
);
