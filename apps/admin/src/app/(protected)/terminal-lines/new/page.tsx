import type { Metadata } from "next";
import Link from "next/link";

import { createTerminalLineAction } from "@/lib/actions/terminal-lines";
import { withAdminPage } from "@/lib/auth/protected-page";
import {
  emptyTerminalLineValues,
  TerminalLineForm,
} from "@/components/terminal-lines/terminal-line-form";

/** Static and generic — see the list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New terminal line · Portfolio Admin",
};

export default withAdminPage(async () => {
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
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New terminal line
      </h1>

      <TerminalLineForm
        action={createTerminalLineAction}
        initialValues={emptyTerminalLineValues}
        submitLabel="Create line"
      />
    </div>
  );
});
