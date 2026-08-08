import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { MediaEditForm } from "@/components/media/media-edit-form";

export const metadata: Metadata = {
  title: "Media Asset Details · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
  const repos = await getAdminRepositories();
  const asset = await repos.media.getById(id);

  if (!asset) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          Operations
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
          Asset Details & Alt Text
        </h1>
        <p className="mt-3 font-mono text-xs text-fg-muted">
          {asset.storageKey}
        </p>
      </div>

      <MediaEditForm asset={asset} />
    </div>
  );
});
