import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateTerminalLineAction } from "@/lib/actions/terminal-lines";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { DeleteTerminalLineForm } from "@/components/terminal-lines/delete-terminal-line-form";
import { TerminalLineForm } from "@/components/terminal-lines/terminal-line-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the row to show its text, and
 * route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it.
 */
export const metadata: Metadata = {
  title: "Edit terminal line · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const line = await repos.terminalLines.getById(id);
    if (!line) notFound();

    return (
      <div className="mx-auto w-full max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/terminal-lines"
            className="text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Terminal lines
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          {/* Truncated: a line can be 160 characters and a breadcrumb is not
              where anyone reads it. */}
          <span className="text-fg">
            {line.text.length > 40 ? `${line.text.slice(0, 40)}…` : line.text}
          </span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit terminal line
        </h1>

        <TerminalLineForm
          action={updateTerminalLineAction}
          lineId={line.id}
          submitLabel="Save changes"
          initialValues={{
            text: line.text,
            tone: line.tone,
            status: line.status ?? "",
            position: line.position,
            isVisible: line.isVisible,
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
            Delete line
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this line. Other lines are not affected. This
            cannot be undone — to stop the robot saying it without losing the
            wording, untick “Visible” above instead.
          </p>
          <DeleteTerminalLineForm lineId={line.id} lineText={line.text} />
        </section>
      </div>
    );
  },
);
