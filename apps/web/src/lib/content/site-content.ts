import "server-only";

/**
 * Builds the public site's content from the CMS.
 *
 * This is the seam the Phase 2 placeholder file always anticipated: the page
 * changes one import, and every section keeps rendering the same view models.
 *
 * ## Everything the visitor sees is filtered here, once
 *
 * Only visible rows, and only published projects. That filter belongs in one
 * place — a section component deciding for itself whether to render a hidden
 * row is how a draft ends up on the public site. The repositories already
 * accept `visibleOnly`, so the filter runs in SQL rather than in JavaScript
 * after the rows have already been read.
 *
 * ## An empty database is a valid state, not an error
 *
 * Nothing here throws because a table is empty. A portfolio with no
 * certifications yet is a portfolio with no certifications, and the sections
 * render their own empty states. The single exception is the profile: the
 * page needs a name and a heading for its `<h1>`, so a missing profile row
 * falls back to explicit "not set up yet" copy rather than rendering an empty
 * heading. That fallback is the one piece of hardcoded visitor-facing text in
 * this module, and it exists to describe the absence of content rather than
 * to stand in for it.
 *
 * ## Images
 *
 * An asset is only rendered when it has alt text. The admin requires alt text
 * on images, but the column is nullable for PDFs, and a row that predates that
 * rule would otherwise produce an `<img>` no screen reader could describe.
 * Dropping it is the accessible failure mode.
 */

import type {
  Certification as CertificationRow,
  SocialLink as SocialLinkRow,
  EducationEntry as EducationRow,
  MediaAsset,
  Profile as ProfileRow,
  Project as ProjectRow,
  Skill,
  SkillCategory as SkillCategoryRow,
  TimelineEntryWithHighlights,
  Tool as ToolRow,
} from "@portfolio/types";

import { getSiteRepositories } from "@/lib/db/binding";
import { resolveSections, type SectionCopy } from "@/lib/content/sections";
import type {
  Certification,
  ContentImage,
  ResumeLink,
  SocialProfile,
  EducationEntry,
  PlaceholderLink,
  Profile,
  Project,
  SiteContent,
  SkillCategory,
  TimelineEntry,
  Tool,
} from "@/data/types";

/**
 * The page's sections, resolved from the CMS.
 *
 * Exposed on the content object so the page can render them in order, and so
 * the navigation is derived from the same list rather than declared twice —
 * a nav item pointing at a hidden section is a link to nothing.
 */
export type { SectionCopy };

/**
 * Resolve a media reference into something renderable.
 *
 * Takes the already-loaded asset map rather than the id alone, so the page
 * issues one query for media instead of one per entity that has an icon.
 */
function toImage(
  assets: ReadonlyMap<string, MediaAsset>,
  id: string | null,
): ContentImage | null {
  if (!id) return null;
  const asset = assets.get(id);
  // No alt text means nothing a screen reader could announce. See the module
  // comment: dropping the image is the accessible failure mode.
  if (!asset?.altText) return null;
  return {
    id: asset.id,
    alt: asset.altText,
    width: asset.width,
    height: asset.height,
  };
}

/** Split stored prose into paragraphs on blank lines. */
function toParagraphs(bio: string | null): readonly string[] {
  if (!bio) return [];
  return bio
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * A display period from two optional dates.
 *
 * `periodLabel` wins whenever the editor wrote one — the schema carries it
 * precisely so a human can say "2024 – present" or "Summer 2023" instead of
 * having a date range formatted at them.
 */
function toPeriod(
  periodLabel: string | null,
  startedOn: string | null,
  endedOn: string | null,
): string {
  if (periodLabel) return periodLabel;
  const start = startedOn ? startedOn.slice(0, 4) : null;
  const end = endedOn ? endedOn.slice(0, 4) : null;
  if (start && end) return start === end ? start : `${start} – ${end}`;
  if (start) return `${start} – present`;
  if (end) return end;
  return "";
}

/** An action with a URL, or an explicit reason there is none. */
function toLink(
  url: string | null,
  label: string,
  reason: string,
): PlaceholderLink {
  return url
    ? { status: "available", href: url, label }
    : { status: "unavailable", label, reason };
}

function toProfile(
  row: ProfileRow | null,
  assets: ReadonlyMap<string, MediaAsset>,
  headlineAlternates: readonly { readonly text: string }[],
): Profile {
  if (!row) {
    // Describes the absence rather than inventing a persona. The admin's
    // profile editor is the fix, and this text says so implicitly by being
    // obviously unfinished rather than plausibly real.
    return {
      image: null,
      name: "Portfolio",
      xrayImage: null,
      role: "Not set up yet",
      roleAlternates: [],
      tagline: "This site has no profile yet. Add one from the admin CMS.",
      introduction: [],
      location: "",
      availability: "",
    };
  }

  return {
    image: toImage(assets, row.avatarMediaId),
    xrayImage: toImage(assets, row.xrayMediaId),
    name: row.fullName,
    role: row.headline,
    // Blank entries are dropped here rather than in the component: an empty
    // phrase would type nothing and read as the label vanishing.
    roleAlternates: headlineAlternates
      .map((alternate) => alternate.text.trim())
      .filter((text) => text.length > 0),
    tagline: row.tagline ?? "",
    introduction: toParagraphs(row.bio),
    location: row.location ?? "",
    availability: row.availability ?? "",
  };
}

function toProject(
  row: ProjectRow,
  technologyNames: readonly string[],
  repositoryUrl: string | null,
  liveUrl: string | null,
  assets: ReadonlyMap<string, MediaAsset>,
): Project {
  return {
    image: toImage(assets, row.iconMediaId),
    cover: toImage(assets, row.coverMediaId),
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    technologies: technologyNames,
    year: toPeriod(row.periodLabel, row.startedOn, row.completedOn),
    repository: toLink(repositoryUrl, "Source code", "No repository link yet"),
    liveSite: toLink(liveUrl, "Live site", "Not deployed yet"),
  };
}

function toTimelineEntry(
  row: TimelineEntryWithHighlights,
  assets: ReadonlyMap<string, MediaAsset>,
): TimelineEntry {
  return {
    image: toImage(assets, row.iconMediaId),
    id: row.id,
    role: row.role,
    organization: row.organization,
    period: toPeriod(row.periodLabel, row.startedOn, row.endedOn),
    summary: row.summary ?? "",
    highlights: row.highlights.map((highlight) => highlight.content),
  };
}

function toEducationEntry(
  row: EducationRow,
  assets: ReadonlyMap<string, MediaAsset>,
): EducationEntry {
  return {
    image: toImage(assets, row.iconMediaId),
    id: row.id,
    qualification: row.qualification,
    institution: row.institution,
    period: toPeriod(row.periodLabel, row.startedOn, row.endedOn),
    summary: row.summary ?? "",
  };
}

function toCertification(
  row: CertificationRow,
  assets: ReadonlyMap<string, MediaAsset>,
): Certification {
  return {
    image: toImage(assets, row.iconMediaId),
    id: row.id,
    title: row.title,
    issuer: row.issuer,
    issued: row.issuedOn ? row.issuedOn.slice(0, 4) : "",
    credential: toLink(
      row.credentialUrl,
      "View credential",
      "No public credential link",
    ),
  };
}

function toSkillCategory(
  row: SkillCategoryRow,
  skills: readonly Skill[],
  assets: ReadonlyMap<string, MediaAsset>,
): SkillCategory {
  return {
    image: toImage(assets, row.iconMediaId),
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    skills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      image: toImage(assets, skill.iconMediaId),
    })),
  };
}

/**
 * A social profile.
 *
 * The label is always rendered, even when a logo exists — an icon-only link
 * is unusable without sight, and ambiguous with it. The logo is decoration
 * beside the name, never a replacement for it.
 */
function toSocial(
  row: SocialLinkRow,
  assets: ReadonlyMap<string, MediaAsset>,
): SocialProfile {
  return {
    id: row.id,
    label: row.label,
    platform: row.platform,
    url: row.url,
    image: toImage(assets, row.iconMediaId),
  };
}

function toTool(row: ToolRow, assets: ReadonlyMap<string, MediaAsset>): Tool {
  return {
    image: toImage(assets, row.iconMediaId),
    id: row.id,
    name: row.name,
    purpose: row.purpose ?? "",
  };
}

/**
 * Read everything the home page renders.
 *
 * One call per aggregate, issued together: they are independent reads against
 * the same binding, and awaiting them in sequence would make the page's
 * latency the sum rather than the maximum. Unlike the admin's composition
 * boundary, there is no undisposed-proxy hazard here — every one of these
 * resolves through the same already-created binding.
 */
export async function getSiteContent(): Promise<SiteContent> {
  const repos = await getSiteRepositories();

  const [
    profileRow,
    projectRows,
    timelineRows,
    educationRows,
    certificationRows,
    categoryRows,
    toolRows,
    robotLineRows,
    terminalLineRows,
    headlineAlternateRows,
    sectionAlternates,
    mediaRows,
    sectionRows,
    socialRows,
    currentResume,
    settings,
    sceneSettings,
  ] = await Promise.all([
    repos.profile.get(),
    repos.projects.listWithRelations({ statuses: ["published"] }),
    repos.timeline.listWithHighlights({ visibleOnly: true }),
    repos.education.list({ visibleOnly: true }),
    repos.certifications.list({ visibleOnly: true }),
    repos.skills.listWithSkills({ visibleOnly: true }),
    repos.tools.list({ visibleOnly: true }),
    // Visible only: an unticked line means the robot should not say it.
    repos.robotLines.list({ visibleOnly: true }),
    // Visible only, same rule: an unticked line is one the editor has taken
    // out of the script without deleting it.
    //
    // The only read here allowed to fail without taking the page with it, and
    // it earned that the hard way: deploying this feature before migration
    // 0010 had been applied to the production database turned the whole
    // homepage into a 500, because a decorative console in the corner could
    // not find its table. A schema change and a deploy cannot land in the same
    // instant, and the panel is decoration — every word of real content is
    // elsewhere — so the gap degrades to an empty console instead of no site.
    //
    // Narrow on purpose: it wraps exactly one query, and the failure is
    // logged rather than swallowed. It is not a licence to make the other
    // reads optional. If the profile or the projects cannot be read, the page
    // genuinely has nothing to show and should say so loudly.
    repos.terminalLines.list({ visibleOnly: true }).catch((error: unknown) => {
      console.error("terminal lines unavailable, rendering an empty console", error);
      return [];
    }),
    // Visible only, for the same reason: an unticked alternate is one the
    // editor has taken out of the rotation without deleting it.
    repos.headlineAlternates.list({ visibleOnly: true }),
    // Every section's alternates in one query rather than one per section.
    repos.sections.listAlternates(),
    repos.media.list(),
    // Deliberately NOT `visibleOnly`. Sections are the one read here that
    // wants the hidden rows too: `resolveSections` has to tell "no row, so
    // use the default" apart from "a row that says hide this", and a
    // visible-only query collapses both into an absent row. Measured — with
    // the filter on, hiding a section in the CMS made it reappear with its
    // default title, because the resolver saw no override at all.
    repos.sections.list(),
    repos.socialLinks.list({ visibleOnly: true }),
    // The current résumé, if one is published. `null` is a valid state and
    // the UI simply omits the download.
    repos.resumes.getCurrent(),
    repos.siteSettings.get(),
    repos.sceneSettings.get(),
  ]);

  const assets = new Map(mediaRows.map((asset) => [asset.id, asset]));
  // A disabled contact section is dropped here rather than in the page, so
  // the navigation — which is derived from this same list — cannot keep a
  // link pointing at a section that is not rendered.
  // Alternates are attached to the rows rather than resolved separately, so
  // `resolveSections` keeps its single input and the defaults path stays
  // untouched — a section with no row has no alternates by construction.
  const sectionRowsWithAlternates = sectionRows.map((row) => {
    const alternates = sectionAlternates.get(row.id);
    return alternates
      ? {
          ...row,
          titleAlternates: alternates.title,
          eyebrowAlternates: alternates.eyebrow,
        }
      : row;
  });

  // The icon id becomes a real image here: this is the only module holding the
  // media map, which keeps `resolveSections` a pure function of its rows.
  const sections = resolveSections(sectionRowsWithAlternates)
    .map((section) => ({
      ...section,
      icon: section.iconMediaId ? toImage(assets, section.iconMediaId) : null,
    }))
    .filter(
    (section) => section.key !== "contact" || (settings?.isContactEnabled ?? true),
  );

  return {
    // The settings row owns the site's name once one exists. Before that
    // the profile's own name is the best answer available, and better than
    // the word "Portfolio".
    siteName: settings?.siteName || profileRow?.fullName || "Portfolio",
    siteDescription: settings?.siteDescription ?? null,
    // Absent settings mean the CMS has never been opened. The column's own
    // default is off, and a portfolio with no 3D is the shipped default
    // rather than a fallback, so the absent case matches it.
    scene: {
      isEnabled: sceneSettings?.isEnabled ?? false,
      isMobileEnabled: sceneSettings?.isMobileEnabled ?? false,
      isSpeechEnabled: sceneSettings?.isSpeechEnabled ?? true,
      maxPixelRatio: sceneSettings?.maxPixelRatio ?? 2,
    },
    theme: {
      defaultTheme: settings?.defaultTheme ?? "system",
      accentColor: settings?.accentColor ?? null,
      // Resolved from the already-loaded asset map, so this costs no extra
      // query. A reference to a deleted asset yields null and the site falls
      // back to the built-in icon rather than linking to nothing.
      favicon: (() => {
        const asset = settings?.faviconMediaId
          ? assets.get(settings.faviconMediaId)
          : undefined;
        if (!asset) return null;
        return {
          href: `/media/${encodeURIComponent(asset.id)}`,
          type: asset.contentType,
        };
      })(),
    },
    // Absent settings mean the CMS has never been opened, and a portfolio
    // with no way to make contact is the wrong default.
    isContactEnabled: settings?.isContactEnabled ?? true,
    socials: socialRows.map((row) => toSocial(row, assets)),
    // A résumé row can outlive its file only if the media service's ordering
    // failed, which it reports; guarding here keeps a broken link off the
    // page either way.
    resume:
      currentResume && currentResume.isVisible && assets.has(currentResume.mediaAssetId)
        ? ({
            label: currentResume.label,
            href: `/media/${encodeURIComponent(currentResume.mediaAssetId)}`,
          } satisfies ResumeLink)
        : null,
    sections,
    // Derived from the resolved sections, so a hidden section cannot leave a
    // navigation link pointing at markup that is not on the page.
    navigation: sections.map((section) => ({
      targetId: section.key,
      label: section.navLabel,
    })),
    profile: toProfile(profileRow, assets, headlineAlternateRows),
    projects: projectRows.map((project) =>
      toProject(
        project,
        project.technologies.map((technology) => technology.name),
        project.links.find((link) => link.kind === "repository")?.url ?? null,
        project.links.find((link) => link.kind === "live")?.url ?? null,
        assets,
      ),
    ),
    timeline: timelineRows.map((row) => toTimelineEntry(row, assets)),
    education: educationRows.map((row) => toEducationEntry(row, assets)),
    certifications: certificationRows.map((row) => toCertification(row, assets)),
    skillCategories: categoryRows.map((category) =>
      toSkillCategory(category, category.skills, assets),
    ),
    tools: toolRows.map((row) => toTool(row, assets)),
    // Plain strings: the public site needs nothing from these rows but
    // their text, and passing whole records would hand a decorative
    // component ids and timestamps it has no business knowing.
    robotLines: robotLineRows.map((row) => row.text),
    // Passed as structured lines, not formatted strings: the console colours
    // the prompt, the body and the status separately, which a single string
    // cannot express.
    terminalLines: terminalLineRows.map((row) => ({
      text: row.text,
      tone: row.tone,
      status: row.status,
    })),
    contact: {
      heading: "Get in touch",
      body: profileRow?.availability
        ? profileRow.availability
        : "Open to conversations about new work.",
      primaryAction: toLink(
        profileRow?.publicEmail ? `mailto:${profileRow.publicEmail}` : null,
        "Email",
        "No public email address yet",
      ),
      // Kept in the model because the view type still has the field, but the
      // contact section no longer renders it: the form below it *is* the way
      // to send a message now, and an inert button saying the same thing
      // beside a working form would be noise.
      secondaryAction: {
        status: "unavailable",
        label: "Send a message",
        reason: "Use the form below",
      },
    },
    // The editor's line wins. Falling back to a sentence composed from the
    // profile keeps every site that never opens the field looking exactly as
    // it did — the composed version was editorial copy living in this file,
    // which is what the settings column now replaces.
    footerNote:
      settings?.footerNote ||
      (profileRow?.fullName
        ? `Built and maintained by ${profileRow.fullName}.`
        : "Built with Next.js, Cloudflare D1 and R2."),
  };
}
