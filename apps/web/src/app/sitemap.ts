/**
 * The sitemap, generated from the database.
 *
 * ## Why it is dynamic
 *
 * Next renders `sitemap.ts` at build time by default, which would freeze the
 * project list into the bundle: publishing a project from the CMS would add a
 * page the sitemap never mentions until the next deploy. The whole point of
 * this site is that content changes without one.
 *
 * `force-dynamic` costs a database read per request from a crawler, which is a
 * handful of requests a day. Being wrong about which pages exist costs a page
 * not being indexed, which is the thing a sitemap exists to prevent.
 *
 * ## Only published projects
 *
 * `getPublishedProjectSlugs` filters to `published`, the same rule the project
 * page enforces by 404-ing anything else. A sitemap listing a draft would
 * advertise a URL that answers 404 — worse than not listing it, because it
 * teaches a crawler the site lies about what it has.
 */

import type { MetadataRoute } from "next";

import { getPublishedProjectSlugs } from "@/lib/content/project-detail";
import { getSiteOrigin } from "@/lib/site-origin";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [origin, projects] = await Promise.all([
    getSiteOrigin(),
    getPublishedProjectSlugs(),
  ]);

  return [
    {
      url: `${origin}/`,
      // The home page changes whenever any content does, which is most of the
      // reasons anything here changes at all.
      changeFrequency: "weekly",
      priority: 1,
    },
    ...projects.map((project) => ({
      url: `${origin}/projects/${project.slug}`,
      // The row's own timestamp, not the time this file ran. `lastModified`
      // is a claim about the content, and stamping every entry with "now" on
      // every crawl is a claim that everything just changed — which teaches a
      // crawler to stop believing the field.
      lastModified: project.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
