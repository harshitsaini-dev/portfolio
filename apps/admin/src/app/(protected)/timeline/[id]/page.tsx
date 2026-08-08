import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateTimelineEntryAction } from "@/lib/actions/timeline";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import { getAdminRepositories } from "@/lib/db/binding";
import { DeleteTimelineEntryForm } from "@/components/timeline/delete-timeline-entry-form";
import { TimelineForm } from "@/components/timeline/timeline-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the entry to show its role,
 * and route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it.
 */
export const metadata: Metadata = {
  title: "Edit experience entry · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const entry = await repos.timeline.getById(id);
    if (!entry) notFound();

    const mediaOptions = await getMediaOptions();

    // Highlights come from the aggregate's own accessor, already ordered by
    // position — the form then treats array order as the ordering.
    const highlights = await repos.timeline.listHighlights(entry.id);

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
          <span className="text-fg">{entry.role}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit experience entry
        </h1>

        <TimelineForm
          action={updateTimelineEntryAction}
          entryId={entry.id}
          submitLabel="Save changes"
          initialValues={{
            iconMediaId: entry.iconMediaId ?? "",
            role: entry.role,
            organization: entry.organization,
            summary: entry.summary ?? "",
            location: entry.location ?? "",
            periodLabel: entry.periodLabel ?? "",
            startedOn: entry.startedOn ?? "",
            endedOn: entry.endedOn ?? "",
            position: entry.position,
            isVisible: entry.isVisible,
            highlights: highlights.map((highlight) => highlight.content),
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
            Delete entry
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this entry and the highlights it owns. Other
            experience entries are not affected. This cannot be undone.
          </p>
          <DeleteTimelineEntryForm
            entryId={entry.id}
            entryLabel={`${entry.role} — ${entry.organization}`}
            highlightCount={highlights.length}
          />
        </section>
      </div>
    );
  },
);
