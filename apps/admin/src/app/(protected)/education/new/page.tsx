import type { Metadata } from "next";
import Link from "next/link";

import { createEducationEntryAction } from "@/lib/actions/education";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import {
  emptyEducationValues,
  EducationForm,
} from "@/components/education/education-form";

/** Static and generic — see the list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New education entry · Portfolio Admin",
};

export default withAdminPage(async () => {
  const mediaOptions = await getMediaOptions();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/education"
          className="text-fg-muted transition-colors duration-150 hover:text-fg"
        >
          Education
        </Link>
        <span aria-hidden="true" className="mx-2 text-fg-muted">
          /
        </span>
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New education entry
      </h1>

      <EducationForm
        action={createEducationEntryAction}
        initialValues={emptyEducationValues}
        submitLabel="Create entry"
        mediaOptions={mediaOptions}
      />
    </div>
  );
});
