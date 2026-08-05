import { AboutSection } from "@/components/about-section";
import { ContactSection } from "@/components/contact-section";
import { EducationSection } from "@/components/education-section";
import { ExperienceSection } from "@/components/experience-section";
import { Hero } from "@/components/hero";
import { ProjectsSection } from "@/components/projects-section";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SkillsSection } from "@/components/skills-section";
import { placeholderContent } from "@/data/placeholder-content";

/**
 * Phase 2 static portfolio page.
 *
 * Every section renders from `placeholderContent` — a single temporary data
 * source — so replacing it with the repository/data layer later is a change
 * of import, not a rewrite of the UI. This is a Server Component; nothing on
 * this page needs client-side JavaScript.
 */
export default function Home() {
  const content = placeholderContent;

  return (
    <>
      {/* First focusable element on the page, visible only when focused. */}
      <a
        href="#main-content"
        className="sr-only rounded-md bg-accent px-4 py-2 text-accent-contrast focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20"
      >
        Skip to main content
      </a>

      <SiteHeader siteName={content.siteName} navigation={content.navigation} />

      <main id="main-content" className="flex-1">
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
