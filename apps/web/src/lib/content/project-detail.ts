import "server-only";

/**
 * Loads one project's case-study page.
 *
 * Separate from `site-content.ts` because it answers a different question and
 * pays a different cost. The home page needs a little about every published
 * project; this needs everything about one, including its media gallery,
 * which no card ever shows.
 *
 * ## Unpublished means "does not exist"
 *
 * A draft or archived project returns `null`, and the route turns that into a
 * 404 — not a 403, and not a page saying "this project is not published".
 * Either of those confirms the slug exists, which is exactly what a draft is
 * meant not to reveal. It is the same rule the home page's list follows, and
 * it is worth stating because the list and the detail page are two separate
 * places that could disagree.
 */

import type { MediaAsset, ProjectLink } from "@portfolio/types";

import { getSiteRepositories } from "@/lib/db/binding";
import type { ContentImage } from "@/data/types";

export interface ProjectGalleryItem {
  readonly image: ContentImage;
  readonly caption: string | null;
}

export interface ProjectDetail {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  /** Long-form prose, split into paragraphs. Empty when none was written. */
  readonly description: readonly string[];
  readonly period: string;
  readonly technologies: readonly string[];
  /** The large image at the head of the page. */
  readonly cover: ContentImage | null;
  readonly links: readonly { label: string; url: string }[];
  readonly gallery: readonly ProjectGalleryItem[];
}

/** Split stored prose into paragraphs on blank lines. */
function toParagraphs(value: string | null): readonly string[] {
  if (!value) return [];
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/** A display period, preferring the editor's own label. */
function toPeriod(
  periodLabel: string | null,
  startedOn: string | null,
  completedOn: string | null,
): string {
  if (periodLabel) return periodLabel;
  const start = startedOn ? startedOn.slice(0, 4) : null;
  const end = completedOn ? completedOn.slice(0, 4) : null;
  if (start && end) return start === end ? start : `${start} – ${end}`;
  if (start) return `${start} – present`;
  if (end) return end;
  return "";
}

/**
 * An asset becomes renderable only with alt text.
 *
 * Same rule as the home page, and the same reason: the column is nullable
 * because PDFs need it to be, so a row can exist that no screen reader could
 * describe. Dropping it is the accessible failure mode.
 */
function toImage(asset: MediaAsset | undefined): ContentImage | null {
  if (!asset?.altText) return null;
  return {
    id: asset.id,
    alt: asset.altText,
    width: asset.width,
    height: asset.height,
  };
}

/**
 * A link's visitor-facing label.
 *
 * The editor's label wins. `kind` is the fallback rather than the source,
 * because "Source code" reads better than "repository" and the editor may
 * have had a reason to say something else entirely.
 */
const KIND_LABELS: Record<string, string> = {
  repository: "Source code",
  live: "Live site",
  case_study: "Case study",
  documentation: "Documentation",
};

function toLinkLabel(link: ProjectLink): string {
  return link.label.trim() || KIND_LABELS[link.kind] || "Open link";
}

/**
 * Every published project's slug and last-changed time, for the sitemap.
 *
 * Deliberately not `getProjectDetail` in a loop: the sitemap needs two fields
 * per project and that function reads every project's media to build a page.
 * The status filter is applied by the repository, so this cannot disagree with
 * what the project page will serve — a sitemap advertising a draft would
 * publish a URL that answers 404.
 */
export async function getPublishedProjectSlugs(): Promise<
  readonly { readonly slug: string; readonly updatedAt: Date }[]
> {
  const repos = await getSiteRepositories();
  const projects = await repos.projects.list({ statuses: ["published"] });
  return projects.map((project) => ({
    slug: project.slug,
    updatedAt: new Date(project.updatedAt),
  }));
}

/** Returns `null` for a slug that is missing, draft or archived. */
export async function getProjectDetail(
  slug: string,
): Promise<ProjectDetail | null> {
  const repos = await getSiteRepositories();
  const project = await repos.projects.getBySlugWithRelations(slug);

  // The publication check lives here, next to the read, rather than in the
  // route. A caller that forgets it would serve a draft.
  if (!project || project.status !== "published") return null;

  // One media read covering the cover and every gallery item, rather than one
  // per image.
  const wantedIds = new Set<string>();
  if (project.coverMediaId) wantedIds.add(project.coverMediaId);
  for (const item of project.media) wantedIds.add(item.mediaAssetId);

  const assets = new Map<string, MediaAsset>();
  if (wantedIds.size > 0) {
    for (const asset of await repos.media.list()) {
      if (wantedIds.has(asset.id)) assets.set(asset.id, asset);
    }
  }

  return {
    slug: project.slug,
    title: project.title,
    summary: project.summary,
    description: toParagraphs(project.description),
    period: toPeriod(project.periodLabel, project.startedOn, project.completedOn),
    technologies: project.technologies.map((technology) => technology.name),
    cover: toImage(
      project.coverMediaId ? assets.get(project.coverMediaId) : undefined,
    ),
    links: project.links.map((link) => ({
      label: toLinkLabel(link),
      url: link.url,
    })),
    gallery: project.media
      .map((item) => ({
        image: toImage(assets.get(item.mediaAssetId)),
        caption: item.caption,
      }))
      // Undescribed images are dropped above; drop their captions with them
      // rather than rendering a caption for an image that is not there.
      .filter((item): item is ProjectGalleryItem => item.image !== null),
  };
}

/** Every published slug, for `generateStaticParams` and for link building. */
export async function listPublishedProjectSlugs(): Promise<string[]> {
  const repos = await getSiteRepositories();
  const projects = await repos.projects.list({ statuses: ["published"] });
  return projects.map((project) => project.slug);
}
