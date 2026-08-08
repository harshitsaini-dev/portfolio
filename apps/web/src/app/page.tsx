import { AboutSection } from "@/components/about-section";
import { ContactSection } from "@/components/contact-section";
import { EducationSection } from "@/components/education-section";
import { ExperienceSection } from "@/components/experience-section";
import { Hero } from "@/components/hero";
import { ProjectsSection } from "@/components/projects-section";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SkillsSection } from "@/components/skills-section";
import { getSiteContent } from "@/lib/content/site-content";

/**
 * The public portfolio, rendered from the CMS.
 *
 * Every section still renders from a single content object, exactly as it did
 * when that object was a static fixture — the swap the Phase 2 file was
 * written to allow turned out to be one import, as intended.
 *
 * A Server Component, and it must stay one: `getSiteContent()` resolves a D1
 * binding, which has no business in a browser bundle.
 *
 * Rendered per request rather than at build time. The point of a CMS is that
 * an edit shows up without a deployment, and a statically prerendered page
 * would keep serving whatever the content was when it was built.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const content = await getSiteContent();

  return (
    <>
      {/* First focusable element on the page, visible only when focused. */}
      <a
        href="#main-content"
        className="sr-only rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg focus:not-sr-only focus:absolute focus:left-5 focus:top-4 focus:z-30"
      >
        Skip to main content
      </a>

      <SiteHeader siteName={content.siteName} navigation={content.navigation} />

      {/* `tabIndex={-1}` makes the skip-link target programmatically
          focusable. Without it, following `#main-content` moves the scroll
          position and (in some browsers) the sequential-focus starting
          point, but `document.activeElement` stays on `<body>` — so screen
          reader users are not moved to the main content and the behaviour
          is inconsistent across browsers. -1 keeps it out of the normal tab
          order; it is only reachable by activating the skip link. */}
      <main id="main-content" tabIndex={-1} className="flex-1">
        <Hero profile={content.profile} contact={content.contact} />
        <AboutSection profile={content.profile} />
        <ProjectsSection projects={content.projects} />
        <ExperienceSection timeline={content.timeline} />
        <EducationSection
          education={content.education}
          certifications={content.certifications}
        />
        <SkillsSection
          skillCategories={content.skillCategories}
          tools={content.tools}
        />
        <ContactSection contact={content.contact} />
      </main>

      <SiteFooter siteName={content.siteName} note={content.footerNote} />
    </>
  );
}
