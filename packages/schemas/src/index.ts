// Shared validation schemas.
//
// Phase 7 added the project mutation schemas. These validate UNTRUSTED
// input (forms, request bodies) and are a different concern from the row
// decoders in `@portfolio/database`, which validate data read back out of
// the database. Both apps consume these so input validation is never
// duplicated per app.
export * from "./projects.ts";
