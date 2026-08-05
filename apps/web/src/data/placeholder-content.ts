import type { SiteContent } from "./types";

/**
 * PHASE 2 PLACEHOLDER CONTENT — NOT REAL PORTFOLIO DATA.
 *
 * Every value below is neutral and fictional. There is no real person,
 * employer, institution, project, credential, email address, phone number,
 * or CV link here, and none may be added: real portfolio content is
 * admin-editable and belongs in the CMS, never in the repository.
 *
 * This file exists so Phase 2 can prove the page structure renders from a
 * single data source. It is deleted once the repository/data layer (Phase 5)
 * supplies content from D1.
 */
export const placeholderContent: SiteContent = {
  siteName: "Portfolio",

  navigation: [
    { targetId: "about", label: "About" },
    { targetId: "projects", label: "Projects" },
    { targetId: "experience", label: "Experience" },
    { targetId: "education", label: "Education" },
    { targetId: "skills", label: "Skills" },
    { targetId: "contact", label: "Contact" },
  ],

  profile: {
    name: "Placeholder Name",
    role: "Software Engineer",
    tagline: "Placeholder tagline describing the kind of work shown here.",
    introduction: [
      "This is placeholder introduction text used to establish the reading rhythm and line length of the about section. It is not a biography and will be replaced by CMS-managed content.",
      "A second paragraph exists so the layout is tested with more than a single block of prose at every supported width.",
    ],
    location: "Placeholder City",
    availability: "Placeholder availability status",
  },

  projects: [
    {
      slug: "placeholder-project-one",
      title: "Placeholder Project One",
      summary:
        "A short placeholder description sized to represent a realistic project summary of two or three lines without becoming filler text.",
      technologies: ["TypeScript", "Next.js", "Tailwind CSS"],
      year: "2025",
      repository: {
        status: "unavailable",
        label: "Source code",
        reason: "Project links are added in a later phase",
      },
      liveSite: {
        status: "unavailable",
        label: "Live site",
        reason: "Project links are added in a later phase",
      },
    },
    {
      slug: "placeholder-project-two",
      title: "Placeholder Project Two",
      summary:
        "A deliberately longer placeholder summary, so the card layout is exercised with uneven content lengths and the grid does not silently depend on every card being the same height.",
      technologies: ["React", "Node.js", "PostgreSQL", "Docker"],
      year: "2025",
      repository: {
        status: "unavailable",
        label: "Source code",
        reason: "Project links are added in a later phase",
      },
      liveSite: {
        status: "unavailable",
        label: "Live site",
        reason: "Project links are added in a later phase",
      },
    },
    {
      slug: "placeholder-project-three",
      title: "Placeholder Project Three",
      summary:
        "A brief placeholder summary.",
      technologies: ["Python", "FastAPI"],
      year: "2024",
      repository: {
        status: "unavailable",
        label: "Source code",
        reason: "Project links are added in a later phase",
      },
      liveSite: {
        status: "unavailable",
        label: "Live site",
        reason: "Project links are added in a later phase",
      },
    },
    {
      slug: "placeholder-project-four",
      title: "Placeholder Project Four",
      summary:
        "Another placeholder summary of moderate length, included so the projects grid is tested with an even number of cards as well as an odd one.",
      technologies: ["TypeScript", "Cloudflare Workers"],
      year: "2024",
      repository: {
        status: "unavailable",
        label: "Source code",
        reason: "Project links are added in a later phase",
      },
      liveSite: {
        status: "unavailable",
        label: "Live site",
        reason: "Project links are added in a later phase",
      },
    },
  ],

  timeline: [
    {
      id: "timeline-1",
      role: "Placeholder Senior Role",
      organization: "Placeholder Organization",
      period: "2024 — Present",
      summary:
        "Placeholder description of responsibilities, written at roughly the length a real entry would be.",
      highlights: [
        "Placeholder highlight describing a representative outcome.",
        "Placeholder highlight describing a second area of responsibility.",
      ],
    },
    {
      id: "timeline-2",
      role: "Placeholder Mid-Level Role",
      organization: "Placeholder Company",
      period: "2022 — 2024",
      summary: "Placeholder description of an earlier position.",
      highlights: ["Placeholder highlight for the earlier position."],
    },
    {
      id: "timeline-3",
      role: "Placeholder Junior Role",
      organization: "Placeholder Studio",
      period: "2021 — 2022",
      summary: "Placeholder description of a first position.",
      highlights: [],
    },
  ],

  education: [
    {
      id: "education-1",
      qualification: "Placeholder Degree",
      institution: "Placeholder University",
      period: "2017 — 2021",
      summary: "Placeholder description of the course of study.",
    },
    {
      id: "education-2",
      qualification: "Placeholder Secondary Qualification",
      institution: "Placeholder College",
      period: "2015 — 2017",
      summary: "Placeholder description of an earlier qualification.",
    },
  ],

  certifications: [
    {
      id: "certification-1",
      title: "Placeholder Certification",
      issuer: "Placeholder Issuing Body",
      issued: "2024",
      credential: {
        status: "unavailable",
        label: "Credential",
        reason: "Credential links are added in a later phase",
      },
    },
    {
      id: "certification-2",
      title: "Placeholder Cloud Certification",
      issuer: "Placeholder Cloud Provider",
      issued: "2023",
      credential: {
        status: "unavailable",
        label: "Credential",
        reason: "Credential links are added in a later phase",
      },
    },
  ],

  skillCategories: [
    {
      id: "skills-languages",
      name: "Languages",
      description: "Placeholder description of language experience.",
      skills: ["TypeScript", "JavaScript", "Python", "SQL"],
    },
    {
      id: "skills-frontend",
      name: "Frontend",
      description: "Placeholder description of frontend experience.",
      skills: ["React", "Next.js", "Tailwind CSS", "Accessibility"],
    },
    {
      id: "skills-backend",
      name: "Backend & data",
      description: "Placeholder description of backend experience.",
      skills: ["Node.js", "REST APIs", "Relational databases", "Caching"],
    },
  ],

  tools: [
    { id: "tool-1", name: "Git", purpose: "Version control" },
    { id: "tool-2", name: "VS Code", purpose: "Editor" },
    { id: "tool-3", name: "Figma", purpose: "Design handoff" },
    { id: "tool-4", name: "Docker", purpose: "Local environments" },
    { id: "tool-5", name: "GitHub Actions", purpose: "Continuous integration" },
    { id: "tool-6", name: "Playwright", purpose: "Browser testing" },
  ],

  contact: {
    heading: "Get in touch",
    body: "Placeholder call-to-action text. The contact form and inbox are built in a later phase, so no message can be sent from this page yet.",
    primaryAction: {
      status: "unavailable",
      label: "Send a message",
      reason: "The contact form is built in a later phase",
    },
    secondaryAction: {
      status: "unavailable",
      label: "Download résumé",
      reason: "Résumé uploads are handled in a later phase",
    },
  },

  footerNote:
    "Placeholder footer text. This site is an in-progress foundation; content shown is not real.",
};
