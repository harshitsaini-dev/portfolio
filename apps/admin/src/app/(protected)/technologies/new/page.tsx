import type { Metadata } from "next";
import Link from "next/link";

import { createTechnologyAction } from "@/lib/actions/technologies";
import { withAdminPage } from "@/lib/auth/protected-page";
import {
  emptyTechnologyValues,
  TechnologyForm,
} from "@/components/technologies/technology-form";

/** Static and generic — see the list route for why metadata never reads data. */
export const metadata: Metadata = {
  title: "New technology · Portfolio Admin",
};

export default withAdminPage(async () => {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/technologies"
          className="text-fg-muted transition-colors duration-150 hover:text-fg"
        >
          Technologies
        </Link>
        <span aria-hidden="true" className="mx-2 text-fg-muted">
          /
        </span>
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New technology
      </h1>
      <p className="mt-3 text-sm text-fg-muted">
        Technologies created here become available to tag on projects.
      </p>

      <TechnologyForm
        action={createTechnologyAction}
        initialValues={emptyTechnologyValues}
        submitLabel="Create technology"
      />
    </div>
  );
});
