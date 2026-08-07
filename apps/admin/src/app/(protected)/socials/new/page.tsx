import type { Metadata } from "next";
import Link from "next/link";

import { createSocialLinkAction } from "@/lib/actions/socials";
import { withAdminPage } from "@/lib/auth/protected-page";
import {
  emptySocialLinkValues,
  SocialLinkForm,
} from "@/components/socials/social-link-form";

/** Static and generic — see the list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New social link · Portfolio Admin",
};

export default withAdminPage(async () => {
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
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New social link
      </h1>

      <SocialLinkForm
        action={createSocialLinkAction}
        initialValues={emptySocialLinkValues}
        submitLabel="Create social link"
      />
    </div>
  );
});
