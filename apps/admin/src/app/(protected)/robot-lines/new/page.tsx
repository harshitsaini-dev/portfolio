import type { Metadata } from "next";
import Link from "next/link";

import { createRobotLineAction } from "@/lib/actions/robot-lines";
import { withAdminPage } from "@/lib/auth/protected-page";
import {
  emptyRobotLineValues,
  RobotLineForm,
} from "@/components/robot-lines/robot-line-form";

/** Static and generic — see the list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New robot line · Portfolio Admin",
};

export default withAdminPage(async () => {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/robot-lines"
          className="text-fg-muted transition-colors duration-150 hover:text-fg"
        >
          Robot lines
        </Link>
        <span aria-hidden="true" className="mx-2 text-fg-muted">
          /
        </span>
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New robot line
      </h1>

      <RobotLineForm
        action={createRobotLineAction}
        initialValues={emptyRobotLineValues}
        submitLabel="Create line"
      />
    </div>
  );
});
