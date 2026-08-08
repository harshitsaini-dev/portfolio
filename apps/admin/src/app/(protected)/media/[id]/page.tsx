import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { updateMediaAssetAction } from "@/lib/actions/media";
import { MediaEditForm } from "@/components/media/media-edit-form";
import { MediaThumbnail } from "@/components/media/media-thumbnail";
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

      {/* The editor is about to describe this file, so showing it is the
          point. Decorative here: `label` is rendered as text beside it. */}
      <div className="mt-6 flex items-center gap-4">
        <MediaThumbnail
          id={asset.id}
          contentType={asset.contentType}
          alt=""
          size="lg"
        />
        <p className="min-w-0 break-words text-sm text-fg-muted">{label}</p>
      </div>

      <MediaEditForm
        action={updateMediaAssetAction}
        assetId={asset.id}
        contentType={asset.contentType}
        byteSize={asset.byteSize}
        initialAltText={asset.altText ?? ""}
      />

      <section
        aria-labelledby="danger-heading"
        className="mt-12 border-t border-subtle pt-8"
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
          className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
        >
          Back to media
        </Link>
      </p>
    </div>
  );
});
