import type { Metadata } from "next";
import Link from "next/link";

import { createToolAction } from "@/lib/actions/tools";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import { emptyToolValues, ToolForm } from "@/components/tools/tool-form";

/** Static and generic — see the list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New tool · Portfolio Admin",
};

export default withAdminPage(async () => {
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
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New tool
      </h1>

      <ToolForm
        action={createToolAction}
        initialValues={emptyToolValues}
        submitLabel="Create tool"
        mediaOptions={mediaOptions}
      />
    </div>
  );
});
