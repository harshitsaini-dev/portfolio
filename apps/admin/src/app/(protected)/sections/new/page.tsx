import type { Metadata } from "next";
import Link from "next/link";

import { createSectionAction } from "@/lib/actions/sections";
import { getSiteAccent } from "@/lib/site-accent";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import {
  emptySectionValues,
  SectionForm,
} from "@/components/sections/section-form";

/** Static and generic — see the list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New section · Portfolio Admin",
};

export default withAdminPage(async () => {
  const mediaOptions = await getMediaOptions();
  const siteAccent = await getSiteAccent();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/sections"
          className="text-fg-muted transition-colors duration-150 hover:text-fg"
        >
          Sections
        </Link>
        <span aria-hidden="true" className="mx-2 text-fg-muted">
          /
        </span>
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New section
      </h1>
      <p className="mt-3 max-w-prose text-sm text-fg-muted">
        The key is set once here and cannot be changed afterwards — it is what
        the public site uses to map this section to a component.
      </p>

      <SectionForm
        siteAccent={siteAccent}
        action={createSectionAction}
        initialValues={emptySectionValues}
        submitLabel="Create section"
        mediaOptions={mediaOptions}
      />
    </div>
  );
});
