import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { updateMediaAssetAction } from "@/lib/actions/media";
import { MediaEditForm } from "@/components/media/media-edit-form";
import { DeleteMediaForm } from "@/components/media/delete-media-form";

/**
 * Static, generic metadata — never `generateMetadata` reading the asset.
 * Route metadata evaluates independently of the component, so
 * `withAdminPage` cannot protect it.
 */
export const metadata: Metadata = {
  title: "Edit file · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(async ({
  props,
}) => {
  const { id } = await props.params;
  const repos = await getAdminRepositories();
  const asset = await repos.media.getById(id);
  if (!asset) notFound();

  const label = asset.altText ?? asset.contentType;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Media
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
        Edit file
      </h1>

      <MediaEditForm
        action={updateMediaAssetAction}
        assetId={asset.id}
        contentType={asset.contentType}
        byteSize={asset.byteSize}
        initialAltText={asset.altText ?? ""}
      />

      <section
        aria-labelledby="danger-heading"
        className="mt-12 border-t border-border pt-8"
      >
        <h2
          id="danger-heading"
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Delete
        </h2>
        <DeleteMediaForm assetId={asset.id} label={label} />
      </section>

      <p className="mt-10 text-sm">
        <Link
          href="/media"
          className="text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Back to media
        </Link>
      </p>
    </div>
  );
});
