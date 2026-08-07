// Shared validation schemas.
//
// Phase 7 added the project mutation schemas; Phase 8 adds one module per
// entity alongside them. These validate UNTRUSTED input (forms, request
// bodies) and are a different concern from the row decoders in
// `@portfolio/database`, which validate data read back out of the database.
// Both apps consume these so input validation is never duplicated per app.
export * from "./certifications.ts";
export * from "./education.ts";
export * from "./profile.ts";
export * from "./projects.ts";
export * from "./skills.ts";
export * from "./technologies.ts";
export * from "./timeline.ts";
