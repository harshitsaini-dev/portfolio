/**
 * The public OpenAPI document — the one unauthenticated URL under `/api/v1`.
 *
 * Public by design: it is how a developer or an AI agent learns the whole API
 * in one fetch. It describes shapes only — no content, no keys, nothing from
 * the database is read to build it — and every operation it lists still
 * demands an API key.
 */

import { buildOpenApiDocument } from "@/lib/api/openapi";
import { API_ROUTES, ENTITY_SCHEMAS } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const origin = new URL(request.url).origin;
  const document = buildOpenApiDocument(API_ROUTES, ENTITY_SCHEMAS, `${origin}/api/v1`);
  return new Response(JSON.stringify(document, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Public and identical for everyone, so a short cache is harmless.
      "cache-control": "public, max-age=300",
      // Readable from anywhere — including an agent's browser tool. Safe
      // because the document holds no data and no credential.
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}
