import type { Metadata } from "next";
import Link from "next/link";

import { createTimelineEntryAction } from "@/lib/actions/timeline";
import { withAdminPage } from "@/lib/auth/protected-page";
import {
  emptyTimelineValues,
  TimelineForm,
} from "@/components/timeline/timeline-form";

/** Static and generic — see the list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New experience entry · Portfolio Admin",
};

export default withAdminPage(async () => {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/timeline"
          className="text-fg-muted transition-colors duration-150 hover:text-fg"
        >
          Experience
        </Link>
        <span aria-hidden="true" className="mx-2 text-fg-muted">
          /
        </span>
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New experience entry
      </h1>

      <TimelineForm
        action={createTimelineEntryAction}
        initialValues={emptyTimelineValues}
        submitLabel="Create entry"
      />
    </div>
  );
});
