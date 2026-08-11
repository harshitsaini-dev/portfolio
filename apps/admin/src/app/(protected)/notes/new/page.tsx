import type { Metadata } from "next";
import Link from "next/link";

import { createNoteAction } from "@/lib/actions/notes";
import { getSiteAccent } from "@/lib/site-accent";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import { emptyNoteValues, NoteForm } from "@/components/notes/note-form";

/** Static and generic — see the list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New note · Portfolio Admin",
};

export default withAdminPage(async () => {
  const mediaOptions = await getMediaOptions();
  const siteAccent = await getSiteAccent();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/notes"
          className="text-fg-muted transition-colors duration-150 hover:text-fg"
        >
          Notes
        </Link>
        <span aria-hidden="true" className="mx-2 text-fg-muted">
          /
        </span>
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New note
      </h1>

      <NoteForm
        siteAccent={siteAccent}
        action={createNoteAction}
        initialValues={emptyNoteValues}
        mediaOptions={mediaOptions}
        submitLabel="Create note"
      />
    </div>
  );
});
