import { headers } from "next/headers";

import { AboutSection } from "@/components/about-section";
import { ContactSection } from "@/components/contact-section";
import { EducationSection } from "@/components/education-section";
import { ExperienceSection } from "@/components/experience-section";
import { Hero } from "@/components/hero";
import { NotesSection } from "@/components/notes-section";
import { TerminalSection } from "@/components/terminal-section";
import { ProjectsSection } from "@/components/projects-section";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PersonSchema } from "@/components/seo/person-schema";
import { getSiteOrigin } from "@/lib/site-origin";
import { PlaygroundSection } from "@/components/playground-section";
import { RobotSpeech } from "@/components/three/robot-speech";
import { RobotTerminal } from "@/components/three/robot-terminal";
import { HeroSceneMount } from "@/components/three/hero-scene-mount";
import { CustomCursor } from "@/components/ui/custom-cursor";
import { Preloader } from "@/components/ui/preloader";
import { SmoothScroll } from "@/components/ui/smooth-scroll";
import { SkillsSection } from "@/components/skills-section";
import { getPublishedNotes } from "@/lib/content/notes";
import { getSiteContent } from "@/lib/content/site-content";
import { buildTerminalData } from "@/lib/content/terminal-data";

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
  const [content, notes, origin, requestHeaders] = await Promise.all([
    getSiteContent(),
    // Read unconditionally rather than inside the section branch: it is one
    // more query against the same database in the same round of work, and
    // making it conditional would put a `await` inside the section map, which
    // would serialise the page behind whichever section happened to need it.
    getPublishedNotes(),
    getSiteOrigin(),
    headers(),
  ]);
  // Set by the middleware, and required for the structured data below to
  // survive the Content-Security-Policy.
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

  /**
   * Everything the terminal can print, taken from the CMS.
   *
   * Built by a shared function rather than inline, because `/terminal` renders
   * the same component and the two must answer identically — two copies of the
   * mapping would be two chances to disagree about what is true.
   */
  const terminalData = buildTerminalData(content);

  return (
    <>
      {/* Describes the person, not the page — see the component. Rendered
          first because it is metadata: it has no visual output and nothing
          below depends on where it sits. */}
      <PersonSchema content={content} origin={origin} nonce={nonce} />

      {/* First focusable element on the page, visible only when focused. */}
      <a
        href="#main-content"
        className="sr-only rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg focus:not-sr-only focus:absolute focus:left-5 focus:top-4 focus:z-30"
      >
        Skip to main content
      </a>

      {/*
        The 3D layer: fixed to the viewport, behind everything, decorative.
        It renders nothing until the browser has checked the CMS setting,
        reduced motion, screen size and WebGL — and nothing on this page waits
        for it, because every word below is server-rendered HTML.
      */}
      <HeroSceneMount config={content.scene} />

      {/*
        The robot's voice. Fixed at the foot of the viewport rather than
        chased after the figure: the figure moves continuously, and a panel
        of text that followed it would be unreadable. Only rendered when the
        scene is allowed, because it is the scene's narration.
      */}
      {content.scene.isEnabled ? (
        <>
          <RobotTerminal lines={content.terminalLines} />
          {/* The figure's own voice, as opposed to its log. Gated twice:
              on the scene, because the bubble is positioned from the figure's
              projected coordinates and has nothing to pin to without it, and
              on its own setting, because it is the most opinionated thing on
              the page and the owner may not always want it talking. */}
          {content.scene.isSpeechEnabled ? (
            <RobotSpeech lines={content.robotLines} />
          ) : null}
        </>
      ) : null}

      <CustomCursor />

      {/*
        The opening loader. Rendered last in the tree but painted over
        everything by z-index, so the page beneath is already server-rendered
        and readable — the curtain is visual only, and a browser that runs no
        JavaScript never sees it.
      */}
      <Preloader />
      <SmoothScroll />

      <SiteHeader siteName={content.siteName} navigation={content.navigation} />

      {/* `tabIndex={-1}` makes the skip-link target programmatically
          focusable. Without it, following `#main-content` moves the scroll
          position and (in some browsers) the sequential-focus starting
          point, but `document.activeElement` stays on `<body>` — so screen
          reader users are not moved to the main content and the behaviour
          is inconsistent across browsers. -1 keeps it out of the normal tab
          order; it is only reachable by activating the skip link. */}
      {/* Settles into place as the preloader lifts. See `motion.css`. */}
      <main id="main-content" tabIndex={-1} className="page-enter flex-1">
        <Hero
          profile={content.profile}
          contact={content.contact}
          socials={content.socials}
          resume={content.resume}
        />

        {/* Order comes from the CMS, not from this file. A section absent
            from the list was hidden by an editor, so it renders nothing —
            and because the navigation is derived from the same list, no link
            can point at a section that is not here. */}
        {content.sections.map((copy) => {
          switch (copy.key) {
            case "about":
              return (
                <AboutSection key={copy.key} copy={copy} profile={content.profile} />
              );
            case "projects":
              return (
                <ProjectsSection
                  key={copy.key}
                  copy={copy}
                  projects={content.projects}
                  socials={content.socials}
                />
              );
            case "notes":
              return (
                <NotesSection
                  key={copy.key}
                  copy={copy}
                  notes={notes}
                  socials={content.socials}
                />
              );
            case "experience":
              return (
                <ExperienceSection
                  key={copy.key}
                  copy={copy}
                  timeline={content.timeline}
                />
              );
            case "education":
              return (
                <EducationSection
                  key={copy.key}
                  copy={copy}
                  education={content.education}
                  certifications={content.certifications}
                />
              );
            case "skills":
              return (
                <SkillsSection
                  key={copy.key}
                  copy={copy}
                  skillCategories={content.skillCategories}
                  tools={content.tools}
                />
              );
            case "playground":
              return <PlaygroundSection key={copy.key} copy={copy} />;
            case "terminal":
              return (
                <TerminalSection
                  key={copy.key}
                  copy={copy}
                  data={terminalData}
                />
              );
            case "contact":
              return (
                <ContactSection key={copy.key} copy={copy} contact={content.contact} />
              );
          }
        })}
      </main>

      <SiteFooter
        siteName={content.siteName}
        note={content.footerNote}
        socials={content.socials}
      />
    </>
  );
}
