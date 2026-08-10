import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateNoteAction } from "@/lib/actions/notes";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { getMediaOptions } from "@/lib/media/options";
import { DeleteNoteForm } from "@/components/notes/delete-note-form";
import { NoteForm } from "@/components/notes/note-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the row to show its title, and
 * route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it.
 */
export const metadata: Metadata = {
  title: "Edit note · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const [note, mediaOptions] = await Promise.all([
      repos.notes.getById(id),
      getMediaOptions(),
    ]);
    if (!note) notFound();

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
          <span className="text-fg">
            {note.title.length > 40 ? `${note.title.slice(0, 40)}…` : note.title}
          </span>
        </nav>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            Edit note
          </h1>
          {note.status === "published" ? (
            <a
              href={`/notes/${note.slug}`}
              className="text-sm text-fg-muted underline underline-offset-4 hover:text-fg"
            >
              View on the site
            </a>
          ) : null}
        </div>

        <NoteForm
          action={updateNoteAction}
          noteId={note.id}
          mediaOptions={mediaOptions}
          submitLabel="Save changes"
          initialValues={{
            slug: note.slug,
            title: note.title,
            summary: note.summary,
            body: note.body,
            status: note.status,
            publishedAt: note.publishedAt ?? "",
            coverMediaId: note.coverMediaId ?? "",
            tags: note.tags.join(", "),
            position: note.position,
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
            Delete note
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this note and everything written in it. This
            cannot be undone — to take it off the site while keeping the words,
            set its status to Archived above instead.
          </p>
          <DeleteNoteForm noteId={note.id} noteTitle={note.title} />
        </section>
      </div>
    );
  },
);
