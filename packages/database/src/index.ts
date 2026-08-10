/**
 * `@portfolio/database` — the repository/data-access layer over Cloudflare D1.
 *
 * The boundary is:
 *
 *   application/server code
 *     → these repository interfaces
 *       → D1 repository implementations (private)
 *         → prepared statements (private)
 *           → D1
 *
 * Application code calls `createRepositories(env.DB)` and then only ever
 * touches typed repository methods. It never sees SQL, row shapes, or the
 * driver. There is deliberately **no** `executeRawSql()` escape hatch: the
 * moment one exists, SQL starts leaking into route handlers and components.
 *
 * This package depends on no framework — no React, no Next.js, no browser
 * or Node built-ins — so it runs unchanged on Cloudflare Workers/OpenNext.
 * The only thing it needs is something matching the `D1Like` contract.
 *
 * Query helpers, row decoders, and SQL builders are intentionally not
 * exported. The public surface is: the factory, the repository interfaces,
 * the error model, and the injectable runtime.
 */

// Composition — the one entry point for building the data layer.
export {
  createRepositories,
  type CreateRepositoriesOptions,
  type Repositories,
} from "./factory.ts";

// The minimal database contract a caller must satisfy.
export type { D1Like, D1PreparedStatement, D1Result } from "./d1.ts";

// Injectable clock/id generator, for deterministic tests.
export {
  defaultRuntime,
  systemClock,
  uuidV7,
  type Clock,
  type IdGenerator,
  type RepositoryRuntime,
} from "./runtime.ts";

// Error model — what callers switch on.
export {
  ConflictError,
  DatabaseError,
  DatabaseFailureError,
  InvalidPersistedDataError,
  NotFoundError,
  toDatabaseError,
  type DatabaseErrorCode,
} from "./errors.ts";

// Repository interfaces, for typing service layers and test doubles.
export type { ProfileRepository } from "./repositories/profile.ts";
export type { ProjectRepository } from "./repositories/projects.ts";
export type { TechnologyRepository } from "./repositories/technologies.ts";
export type { TimelineRepository } from "./repositories/timeline.ts";
export type { SkillsRepository } from "./repositories/skills.ts";
export type {
  MediaAssetRepository,
  ResumeRepository,
} from "./repositories/media.ts";
export type {
  SceneSettingsRepository,
  SiteSettingsRepository,
} from "./repositories/settings.ts";
export type { ContactMessageRepository } from "./repositories/contact-messages.ts";
export type {
  AnalyticsRepository,
  AnalyticsSummary,
  DailyCount,
  RankedCount,
} from "./repositories/analytics.ts";
export type {
  CertificationRepository,
  EducationRepository,
  RobotLineRepository,
  SectionRepository,
  SocialLinkRepository,
  ToolRepository,
} from "./repositories/content.ts";
export type {
  OrderedListOptions,
  OrderedRepository,
} from "./internal/ordered-repository.ts";
