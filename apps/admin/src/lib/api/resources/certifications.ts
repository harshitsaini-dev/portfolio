/**
 * `/certifications` — mirrors `lib/actions/certifications.ts`.
 *
 * The validated body goes to the repository as-is, exactly as the admin
 * does: the shared schema already is the repository's input shape.
 */

import { certificationCreateSchema, certificationUpdateSchema } from "@portfolio/schemas";

import { defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { entity, META, primitives } from "./schemas.ts";

const TAG = "Certifications";

const { str, nstr, int, bool } = primitives;

export const certificationSchemas: Record<string, JsonSchema> = {
  Certification: entity("A certification or credential.", {
    ...META,
    iconMediaId: nstr,
    title: str,
    issuer: str,
    credentialId: nstr,
    credentialUrl: { ...nstr, description: "http(s) URL where the credential can be verified." },
    issuedOn: { ...nstr, description: "YYYY-MM-DD" },
    expiresOn: { ...nstr, description: "YYYY-MM-DD; null if it does not expire." },
    position: int,
    isVisible: bool,
  }),
};

export const certificationRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/certifications",
    tag: TAG,
    operationId: "listCertifications",
    summary: "List certifications",
    description: "Every certification in display order (`position`). Hidden ones are included unless `visible=true`.",
    scope: "read",
    queryParams: [
      { name: "visible", description: "`true` to return only certifications shown on the public site.", enum: ["true", "false"] },
    ],
    returns: "Certifications.",
    response: listOf(ref("Certification")),
    async handler({ repos, query }) {
      return repos.certifications.list({ visibleOnly: query.get("visible") === "true" });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/certifications/{id}",
    tag: TAG,
    operationId: "getCertification",
    summary: "Get a certification",
    scope: "read",
    returns: "The certification.",
    response: ref("Certification"),
    async handler({ repos }, { id }) {
      const certification = await repos.certifications.getById(id!);
      if (!certification) throw notFound("Certification");
      return certification;
    },
  }),

  defineRoute({
    method: "POST",
    path: "/certifications",
    tag: TAG,
    operationId: "createCertification",
    summary: "Create a certification",
    description:
      "`expiresOn` must not precede `issuedOn`. `credentialUrl` must be http(s). `iconMediaId`, if given, must name an existing media asset (`GET /media`). Visible by default.",
    scope: "write",
    body: certificationCreateSchema,
    returns: "The created certification.",
    response: ref("Certification"),
    async handler({ repos }, _params, input) {
      return repos.certifications.create(input);
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/certifications/{id}",
    tag: TAG,
    operationId: "updateCertification",
    summary: "Update a certification",
    description: "Send only the fields to change; `null` clears a nullable field.",
    scope: "write",
    body: certificationUpdateSchema,
    returns: "The updated certification.",
    response: ref("Certification"),
    async handler({ repos }, { id }, input) {
      return repos.certifications.update(id!, input);
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/certifications/{id}",
    tag: TAG,
    operationId: "deleteCertification",
    summary: "Delete a certification",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.certifications.delete(id!))) throw notFound("Certification");
      return null;
    },
  }),
];
