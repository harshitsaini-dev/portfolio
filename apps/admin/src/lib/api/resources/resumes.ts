/**
 * `/resumes` — mirrors `lib/actions/resumes.ts`.
 *
 * A résumé is a label pointing at an uploaded PDF in the media library, plus
 * two flags: `isVisible` (offered on the site at all) and `isCurrent` (the
 * one the site links to; exactly one at a time, set with `make-current`).
 *
 * ## One check the admin action does not make
 *
 * The admin only *offers* PDFs in its picker, so its action never sees
 * anything else. An API caller can send any id, so this module checks on the
 * server that `mediaAssetId` names an existing PDF and answers 422 otherwise —
 * the same rule the admin enforces through its UI, enforced where an API
 * needs it.
 */

import type { Repositories } from "@portfolio/database";
import { resumeCreateSchema, resumeUpdateSchema } from "@portfolio/schemas";

import { ApiError, defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { entity, META, primitives } from "./schemas.ts";

const TAG = "Resumes";

const { str, bool } = primitives;

export const resumeSchemas: Record<string, JsonSchema> = {
  Resume: entity("A résumé: a label and the uploaded PDF it serves.", {
    ...META,
    label: str,
    mediaAssetId: { ...str, description: "Id of a PDF in the media library." },
    isCurrent: { ...bool, description: "The résumé the site links to. Exactly one at a time." },
    isVisible: bool,
  }),
};

async function requirePdf(repos: Repositories, mediaAssetId: string): Promise<void> {
  const asset = await repos.media.getById(mediaAssetId);
  if (!asset || asset.contentType !== "application/pdf") {
    throw new ApiError(422, "validation_failed", "Some fields are invalid.", {
      mediaAssetId: ["Must be the id of an uploaded PDF (see GET /media)."],
    });
  }
}

export const resumeRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/resumes",
    tag: TAG,
    operationId: "listResumes",
    summary: "List résumés",
    scope: "read",
    returns: "Résumés.",
    response: listOf(ref("Resume")),
    async handler({ repos }) {
      return repos.resumes.list();
    },
  }),

  defineRoute({
    method: "GET",
    path: "/resumes/current",
    tag: TAG,
    operationId: "getCurrentResume",
    summary: "Get the current résumé",
    description: "The one the site links to, or `null` when none is current.",
    scope: "read",
    returns: "The current résumé, or null.",
    response: { allOf: [ref("Resume")], nullable: true },
    async handler({ repos }) {
      return repos.resumes.getCurrent();
    },
  }),

  defineRoute({
    method: "GET",
    path: "/resumes/{id}",
    tag: TAG,
    operationId: "getResume",
    summary: "Get a résumé",
    scope: "read",
    returns: "The résumé.",
    response: ref("Resume"),
    async handler({ repos }, { id }) {
      const resume = await repos.resumes.getById(id!);
      if (!resume) throw notFound("Résumé");
      return resume;
    },
  }),

  defineRoute({
    method: "POST",
    path: "/resumes",
    tag: TAG,
    operationId: "createResume",
    summary: "Create a résumé",
    description:
      "Upload the PDF first with `POST /media`, then send its id as `mediaAssetId`. A new résumé is not current — call `POST /resumes/{id}/make-current` to make the site link to it.",
    scope: "write",
    body: resumeCreateSchema,
    returns: "The created résumé.",
    response: ref("Resume"),
    async handler({ repos }, _params, input) {
      await requirePdf(repos, input.mediaAssetId);
      return repos.resumes.create(input);
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/resumes/{id}",
    tag: TAG,
    operationId: "updateResume",
    summary: "Update a résumé",
    description: "Send only the fields to change. `isCurrent` is not set here — use `make-current`.",
    scope: "write",
    body: resumeUpdateSchema,
    returns: "The updated résumé.",
    response: ref("Resume"),
    async handler({ repos }, { id }, input) {
      if (input.mediaAssetId !== undefined) await requirePdf(repos, input.mediaAssetId);
      return repos.resumes.update(id!, input);
    },
  }),

  defineRoute({
    method: "POST",
    path: "/resumes/{id}/make-current",
    tag: TAG,
    operationId: "makeResumeCurrent",
    summary: "Make a résumé the current one",
    description: "The site links to this résumé from now on; every other résumé stops being current. No body.",
    scope: "write",
    successStatus: 200,
    returns: "The résumé, now current.",
    response: ref("Resume"),
    async handler({ repos }, { id }) {
      return repos.resumes.makeCurrent(id!);
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/resumes/{id}",
    tag: TAG,
    operationId: "deleteResume",
    summary: "Delete a résumé",
    description: "Removes the résumé only; its PDF stays in the media library (delete it with `DELETE /media/{id}` afterwards if wanted).",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.resumes.delete(id!))) throw notFound("Résumé");
      return null;
    },
  }),
];
