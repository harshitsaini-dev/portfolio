import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateToolAction } from "@/lib/actions/tools";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import { getAdminRepositories } from "@/lib/db/binding";
import { DeleteToolForm } from "@/components/tools/delete-tool-form";
import { ToolForm } from "@/components/tools/tool-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the tool to show its name, and
 * route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it.
 */
export const metadata: Metadata = {
  title: "Edit tool · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const tool = await repos.tools.getById(id);
    if (!tool) notFound();

    const mediaOptions = await getMediaOptions();

    return (
      <div className="mx-auto w-full max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/tools"
            className="text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Tools
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          <span className="text-fg">{tool.name}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit tool
        </h1>

        <ToolForm
          action={updateToolAction}
          toolId={tool.id}
          submitLabel="Save changes"
          initialValues={{
            iconMediaId: tool.iconMediaId ?? "",
            name: tool.name,
            purpose: tool.purpose ?? "",
            url: tool.url ?? "",
            position: tool.position,
            isVisible: tool.isVisible,
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
            Delete tool
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this tool. Other tools are not affected. This
            cannot be undone.
          </p>
          <DeleteToolForm toolId={tool.id} toolName={tool.name} />
        </section>
      </div>
    );
  },
);
