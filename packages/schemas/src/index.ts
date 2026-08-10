// Shared validation schemas.
//
// Phase 7 added the project mutation schemas; Phase 8 adds one module per
// entity alongside them. These validate UNTRUSTED input (forms, request
// bodies) and are a different concern from the row decoders in
// `@portfolio/database`, which validate data read back out of the database.
// Both apps consume these so input validation is never duplicated per app.
export * from "./contact.ts";
export * from "./certifications.ts";
export * from "./education.ts";
// Phase 9: the untrusted-BINARY boundary — upload policy, byte-signature
// detection, and the storage-key grammar. Pure, and deliberately here rather
// than in the admin app so the future media service, its tests, and any
// public delivery route all agree on one policy.
export * from "./media.ts";
export * from "./profile.ts";
export * from "./projects.ts";
export * from "./sections.ts";
export * from "./settings.ts";
export * from "./skills.ts";
export * from "./socials.ts";
export * from "./technologies.ts";
export * from "./timeline.ts";
export * from "./robot-lines.ts";
export * from "./terminal-lines.ts";
export * from "./analytics.ts";
export * from "./notes.ts";
export * from "./resumes.ts";
export * from "./tools.ts";
