/**
 * Repository composition.
 *
 * The single way to build the data layer. Server code does:
 *
 *     const repos = createRepositories(env.DB);
 *
 * and nothing below this point knows about Next.js, Cloudflare deployment
 * config, or where the binding came from. There is no module-level database
 * handle: a Worker isolate can serve requests for different environments, so
 * a global would be both a correctness and an isolation hazard.
 */

import type { D1Like } from "./d1.ts";
import {
  createCertificationRepository,
  createEducationRepository,
  createSectionRepository,
  createSocialLinkRepository,
  createHeadlineAlternateRepository,
  createRobotLineRepository,
  createTerminalLineRepository,
  createToolRepository,
  type CertificationRepository,
  type EducationRepository,
  type SectionRepository,
  type SocialLinkRepository,
  type HeadlineAlternateRepository,
  type RobotLineRepository,
  type TerminalLineRepository,
  type ToolRepository,
} from "./repositories/content.ts";
import {
  createContactMessageRepository,
  type ContactMessageRepository,
} from "./repositories/contact-messages.ts";
import {
  createMediaAssetRepository,
  createResumeRepository,
  type MediaAssetRepository,
  type ResumeRepository,
} from "./repositories/media.ts";
import {
  createProfileRepository,
  type ProfileRepository,
} from "./repositories/profile.ts";
import {
  createProjectRepository,
  type ProjectRepository,
} from "./repositories/projects.ts";
import {
  createSceneSettingsRepository,
  createSiteSettingsRepository,
  type SceneSettingsRepository,
  type SiteSettingsRepository,
} from "./repositories/settings.ts";
import {
  createSkillsRepository,
  type SkillsRepository,
} from "./repositories/skills.ts";
import {
  createTechnologyRepository,
  type TechnologyRepository,
} from "./repositories/technologies.ts";
import {
  createTimelineRepository,
  type TimelineRepository,
} from "./repositories/timeline.ts";
import { defaultRuntime, type RepositoryRuntime } from "./runtime.ts";

export interface Repositories {
  readonly profile: ProfileRepository;
  readonly socialLinks: SocialLinkRepository;
  readonly media: MediaAssetRepository;
  readonly resumes: ResumeRepository;
  readonly projects: ProjectRepository;
  readonly technologies: TechnologyRepository;
  readonly timeline: TimelineRepository;
  readonly education: EducationRepository;
  readonly certifications: CertificationRepository;
  readonly skills: SkillsRepository;
  readonly tools: ToolRepository;
  /** The sentences the hero's robot says. */
  readonly robotLines: RobotLineRepository;
  /** The lines the hero's console prints. */
  readonly terminalLines: TerminalLineRepository;
  /** Alternative phrasings the hero headline cycles through. */
  readonly headlineAlternates: HeadlineAlternateRepository;
  readonly sections: SectionRepository;
  readonly siteSettings: SiteSettingsRepository;
  readonly sceneSettings: SceneSettingsRepository;
  readonly contactMessages: ContactMessageRepository;
}

export interface CreateRepositoriesOptions {
  /**
   * Override the clock and id generator. Intended for tests, which pin both
   * to get deterministic assertions. Production uses the defaults.
   */
  readonly runtime?: Partial<RepositoryRuntime>;
}

export function createRepositories(
  db: D1Like,
  options: CreateRepositoriesOptions = {},
): Repositories {
  const runtime: RepositoryRuntime = {
    now: options.runtime?.now ?? defaultRuntime.now,
    newId: options.runtime?.newId ?? defaultRuntime.newId,
  };

  return {
    profile: createProfileRepository(db, runtime),
    socialLinks: createSocialLinkRepository(db, runtime),
    media: createMediaAssetRepository(db, runtime),
    resumes: createResumeRepository(db, runtime),
    projects: createProjectRepository(db, runtime),
    technologies: createTechnologyRepository(db, runtime),
    timeline: createTimelineRepository(db, runtime),
    education: createEducationRepository(db, runtime),
    certifications: createCertificationRepository(db, runtime),
    skills: createSkillsRepository(db, runtime),
    tools: createToolRepository(db, runtime),
    headlineAlternates: createHeadlineAlternateRepository(db, runtime),
    robotLines: createRobotLineRepository(db, runtime),
    terminalLines: createTerminalLineRepository(db, runtime),
    sections: createSectionRepository(db, runtime),
    siteSettings: createSiteSettingsRepository(db, runtime),
    sceneSettings: createSceneSettingsRepository(db, runtime),
    contactMessages: createContactMessageRepository(db, runtime),
  };
}
