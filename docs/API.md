# Portfolio CMS — REST API

Everything the admin CMS can edit can also be read and written over HTTP, so
another project, a build script or an AI agent can manage portfolio content
without the admin UI.

- **Base URL:** `https://<admin-host>/api/v1` (locally: `http://localhost:3001/api/v1`)
- **Machine-readable reference (public, no key needed):** `GET /api/v1/openapi.json`
  — OpenAPI 3.0, generated from the same code that serves the API, with every
  endpoint, field, limit, permission and response shape.
- **Endpoints:** 130, across 20 groups (table at the end).

> **For AI agents:** fetch `/api/v1/openapi.json` first — it is the complete,
> authoritative contract. This page is the human guide around it.

## 1. Getting a key

1. Sign in to the admin and open **Operations → API keys**.
2. Name the key after where it will live ("blog build", "agent on laptop"),
   choose its permissions and an expiry, and click **Create key**.
3. Copy the key (`pfk_…`). **It is shown once.** Only its SHA-256 hash is
   stored, so it cannot be recovered — create a new one if it is lost.

Revoke a key from the same page; it stops working on the very next request.
Create one key per consumer so a leak can be revoked without breaking the rest.

### Permissions

| Permission | Allows |
| --- | --- |
| `read` | Every `GET` on CMS content — everything except the inbox |
| `write` | Every `POST`/`PUT`/`PATCH`/`DELETE` on CMS content. **Does not imply `read`.** |
| `inbox` | Read and manage contact-form messages. Separate because those are other people's names and email addresses. |

A typical "manage my portfolio" key has `read` + `write`. Give `inbox` only to
a consumer that genuinely needs the messages.

## 2. Authentication

Send the key as a bearer token on every request:

```http
Authorization: Bearer pfk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- Missing, malformed, unknown, revoked and expired keys all get the same
  `401 unauthorized` — the API does not say which.
- A valid key without the needed permission gets `403 insufficient_scope`.
- The admin's login session is **not** accepted here, and keys are not
  accepted by the admin UI. The two never mix, so a page on another site cannot
  make a signed-in owner's browser call the API.

**Keep keys server-side.** The API sends no CORS headers on purpose: a key in
browser JavaScript is a public key. Call it from a server, a build step, a
script, a CI job or an agent. (Only `openapi.json` is readable cross-origin.)

## 3. Quick start

```bash
export CMS=https://<admin-host>/api/v1
export KEY=pfk_...

# Read
curl -H "Authorization: Bearer $KEY" "$CMS/projects?status=published"

# Create
curl -X POST "$CMS/projects" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Weather CLI","slug":"weather-cli","summary":"A tiny forecast tool.","status":"published"}'

# Change one field
curl -X PATCH "$CMS/projects/<id>" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"isFeatured":true}'

# Delete
curl -X DELETE -H "Authorization: Bearer $KEY" "$CMS/projects/<id>"
```

### TypeScript / JavaScript (Node 18+, Deno, Bun, Workers)

```ts
const CMS = process.env.CMS_URL!; // https://<admin-host>/api/v1
const KEY = process.env.CMS_KEY!; // pfk_...

async function cms<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${CMS}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${KEY}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const json = await response.json();
  if (!response.ok) throw new Error(`${json.error.code}: ${json.error.message}`);
  return json.data as T;
}

const projects = await cms<{ id: string; title: string }[]>("GET", "/projects");
await cms("POST", "/notes", { slug: "hello", title: "Hello", summary: "First note." });
```

### Python

```python
import os, requests

CMS = os.environ["CMS_URL"]
session = requests.Session()
session.headers["Authorization"] = f"Bearer {os.environ['CMS_KEY']}"

projects = session.get(f"{CMS}/projects").json()["data"]
r = session.patch(f"{CMS}/projects/{projects[0]['id']}", json={"isFeatured": True})
r.raise_for_status()
```

## 4. Conventions

| | |
| --- | --- |
| Success | `{ "data": … }` — 200, or 201 for a create. `DELETE` is 204 with no body. |
| Failure | `{ "error": { "code", "message", "fields"? } }` |
| `POST` | Creates. Omitted optional fields take their defaults (e.g. projects start as `draft`). |
| `PATCH` | Changes **only the fields you send**. Omitted = untouched, `null` = clear a nullable field, `[]` = clear a list. Works on singletons too (`/profile`, `/settings/*`). |
| `PUT` | Replaces a whole thing: `PUT /profile` (omitted fields fall back to defaults), and whole lists such as `/headline-alternates` and `/sections/{id}/alternates`. |
| Unknown fields | **Rejected** with 422 — including `id`, `createdAt`, `updatedAt`, which the server owns. A typo never silently does nothing. |
| Ids | Opaque strings. Use the `id` from a response; never construct one. |
| Dates | `YYYY-MM-DD`. Timestamps are ISO 8601 UTC. |
| Ordering | Lists come back in display order (`position`). Change order by PATCHing `position`. |
| Pagination | None — a portfolio has tens of rows — except `GET /inbox` (`limit`, `offset`). |
| Body size | JSON up to 1 MB. Uploads: images ≤ 5 MB, PDFs ≤ 10 MB. |
| Caching | Responses are `no-store`. The public site picks up changes within about 60 s. |
| Filters | Several lists accept `?visible=true`; projects accept `?status=published,draft` and `?featured=true`; notes accept `?status=`. See the OpenAPI document per endpoint. |

### Errors

| HTTP | `code` | Meaning / what to do |
| --- | --- | --- |
| 400 | `invalid_json`, `bad_request` | Body is not JSON, or a query parameter is invalid |
| 401 | `unauthorized` | Missing / unknown / revoked / expired key |
| 403 | `insufficient_scope` | The key lacks the permission the endpoint names |
| 404 | `not_found` | No such endpoint or record |
| 405 | `method_not_allowed` | See the `Allow` header |
| 409 | `conflict`, `in_use` | Slug/key already taken; a referenced id does not exist; or the record is still in use (an image that is a project's cover, a category that still has skills) |
| 413 | `payload_too_large` | Body or file over the limit |
| 415 | `unsupported_media_type` | Send `application/json` (or `multipart/form-data` to `POST /media`) |
| 422 | `validation_failed` | `error.fields` maps each field path (e.g. `links.0.url`) to messages |
| 503 | `storage_unavailable` | File storage is not configured; uploads cannot run |
| 500 | `internal_error` | Server fault. Details are logged, never returned |

A 422 looks like:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Some fields are invalid.",
    "fields": { "slug": ["Lowercase letters, numbers and single hyphens only"] }
  }
}
```

## 5. Common workflows

### Add a project with a cover image and technologies

```bash
# 1. Upload the cover (alt text is required for images)
curl -X POST "$CMS/media" -H "Authorization: Bearer $KEY" \
  -F file=@cover.webp -F altText="Dashboard of the weather CLI"
# → { "data": { "id": "<mediaId>", "downloadUrl": "...", ... } }

# 2. Find (or create) the technologies
curl -H "Authorization: Bearer $KEY" "$CMS/technologies/by-slug/typescript"
curl -X POST "$CMS/technologies" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"name":"Rust","slug":"rust"}'

# 3. Create the project, referencing both
curl -X POST "$CMS/projects" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{
    "title": "Weather CLI",
    "slug": "weather-cli",
    "summary": "A tiny forecast tool.",
    "status": "published",
    "coverMediaId": "<mediaId>",
    "technologyIds": ["<techId>"],
    "links": [{ "label": "Source", "url": "https://github.com/you/weather-cli", "kind": "repository" }]
  }'
```

If a referenced technology or media id does not exist, the create is refused
with 409 and **nothing** is left behind.

### Upload a résumé and make it current

```bash
curl -X POST "$CMS/media" -H "Authorization: Bearer $KEY" -F file=@cv.pdf -F purpose=resumes
curl -X POST "$CMS/resumes" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"label":"CV 2026","mediaAssetId":"<pdfId>"}'
curl -X POST -H "Authorization: Bearer $KEY" "$CMS/resumes/<resumeId>/make-current"
```

Uploads accept PNG, JPEG, WebP and PDF, detected from the file's bytes (the
declared type is not trusted). The admin shrinks large images in the browser
before uploading; the API does not, so resize images yourself first.

### Sync a project from another repository's CI

`GET /projects/by-slug/{slug}` → if 404, `POST /projects`; otherwise
`PATCH /projects/{id}` with the fields your repository owns. Because PATCH only
touches what you send, CI can own `summary` and `links` while the owner keeps
editing everything else in the admin.

### Edit site settings without touching the rest

```bash
curl -X PATCH "$CMS/settings/site" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"accentColor":"#22c55e"}'
```

Only `accentColor` changes; the merged result is validated against the full
settings rules before it is saved.

### Reorder a collection

Every collection with a display order has `PUT …/order` (projects, timeline,
education, certifications, skill categories, skills within a category, tools,
social links, sections, robot lines, terminal lines, notes):

```bash
# Move two projects to the top; everything else keeps its order after them
curl -X PUT "$CMS/projects/order" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"ids":["<idA>","<idB>"]}'
```

The response is the whole collection in its new order, in the same shape as
the collection's `GET`. An id that is not in the collection is a 422 and
nothing moves.

### Edit one list without resending its parent

`GET`/`PUT /projects/{id}/links`, `/projects/{id}/technologies`,
`/projects/{id}/media` and `/timeline/{id}/highlights` read or replace one
child list. `PUT` replaces the list; `[]` clears it.

```bash
curl -X PUT "$CMS/timeline/<id>/highlights" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"highlights":[{"content":"Cut build time by 60%"},{"content":"Led a team of 4"}]}'
```

### Publish, unpublish, archive

`POST /projects/{id}/publish` (and `/unpublish`, `/archive`; the same for
`/notes/{id}/…`) — no body. The same as PATCHing `status`.

### Find, export, check your key

- `GET /search?q=weather&types=project,note` — substring search across all
  content, drafts included. Each hit has the `path` that reads the full record.
- `GET /export` — every collection in one response, each part exactly what its
  own `GET` returns. Contact messages only if the key has `inbox`.
- `GET /me` — the calling key's name, permissions and expiry. Works with any
  valid key; a good first call for an agent.
- `GET /media/{id}/file` — the stored bytes of any asset (as an attachment).
- `GET /inbox/stats` — message counts by status.

## 6. Using it from an AI agent

Give the agent three things:

1. The OpenAPI URL: `https://<admin-host>/api/v1/openapi.json`
2. A key with only the permissions the task needs (prefer `read` alone for
   research tasks; add `write` only when it should change content).
3. An instruction such as:

> Fetch the OpenAPI document at `<url>` and use it as the contract. Call `GET /me`
> first to learn what your key may do. Authenticate
> with `Authorization: Bearer <key>`. Use PATCH with only the fields you mean to
> change. On a 422, read `error.fields`, fix the request and retry. Never retry a
> 401 or 403 — report it.

Each operation in the document carries a `summary`, a `description` written
for this purpose, an `x-required-scope`, the full request schema (enums,
lengths, patterns, defaults) and the response schema.

## 7. Security model

- Keys are 256-bit random values prefixed `pfk_` (easy to spot in a leaked log
  or by a secret scanner). Only their SHA-256 is stored; the admin shows a
  12-character prefix to tell them apart.
- Every request is checked against the database, so revocation and expiry
  apply immediately, not after a cache expires.
- `last used` is recorded at most once a minute per key.
- Every request body is validated by the same shared Zod schemas the admin's
  forms use, and every write goes through the same repository layer. The API
  cannot store anything the admin would refuse.
- `openapi.json` is the only unauthenticated endpoint. It describes shapes, never
  content.
- No per-key rate limit. Keys are not guessable (256 bits); if a consumer
  misbehaves, revoke its key.

### If the admin is behind Cloudflare Access

Access sits in front of the whole Worker, so an API client without an Access
login is stopped before the API sees it. Either retire Access (the admin has its
own login now), or add an Access **Bypass** policy for the path `/api/v1/*` on
the admin application. Both are dashboard actions for the owner; the API's own
key check still applies either way.

## 8. Versioning

The path carries the version (`/api/v1`). Within v1, fields and endpoints may be
**added**; nothing is removed or renamed. Clients should ignore response fields
they do not know.

## 9. Endpoints

Paths are relative to `/api/v1`. The OpenAPI document has the fields of each.

### Meta

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/me` | `any` | Describe the calling API key |
| GET | `/search` | `read` | Search all content |
| GET | `/export` | `read` | Export everything |

### Inbox

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/inbox/stats` | `inbox` | Count messages by status |
| GET | `/inbox` | `inbox` | List contact messages |
| GET | `/inbox/{id}` | `inbox` | Get a contact message |
| PATCH | `/inbox/{id}` | `inbox` | Change a message's status |
| DELETE | `/inbox/{id}` | `inbox` | Delete a contact message |

### Profile

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/profile` | `read` | Get the profile |
| PUT | `/profile` | `write` | Replace the whole profile |
| PATCH | `/profile` | `write` | Update some profile fields |

### Headline alternates

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/headline-alternates` | `read` | List headline alternates |
| PUT | `/headline-alternates` | `write` | Replace the headline alternates |

### Projects

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/projects` | `read` | List projects |
| GET | `/projects/{id}` | `read` | Get a project |
| GET | `/projects/by-slug/{slug}` | `read` | Get a project by its slug |
| POST | `/projects` | `write` | Create a project |
| PATCH | `/projects/{id}` | `write` | Update a project |
| DELETE | `/projects/{id}` | `write` | Delete a project |
| GET | `/projects/{id}/links` | `read` | List a project's links |
| PUT | `/projects/{id}/links` | `write` | Replace a project's links |
| GET | `/projects/{id}/technologies` | `read` | List a project's technologies |
| PUT | `/projects/{id}/technologies` | `write` | Replace a project's technologies |
| GET | `/projects/{id}/media` | `read` | List a project's gallery |
| PUT | `/projects/{id}/media` | `write` | Replace a project's gallery |
| PUT | `/projects/order` | `write` | Reorder projects |
| POST | `/projects/{id}/publish` | `write` | Publish a project |
| POST | `/projects/{id}/unpublish` | `write` | Unpublish a project |
| POST | `/projects/{id}/archive` | `write` | Archive a project |

### Technologies

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/technologies` | `read` | List technologies |
| GET | `/technologies/usage` | `read` | Count projects per technology |
| GET | `/technologies/{id}` | `read` | Get a technology |
| GET | `/technologies/by-slug/{slug}` | `read` | Get a technology by its slug |
| POST | `/technologies` | `write` | Create a technology |
| PATCH | `/technologies/{id}` | `write` | Update a technology |
| DELETE | `/technologies/{id}` | `write` | Delete a technology |

### Timeline

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/timeline` | `read` | List timeline entries |
| GET | `/timeline/{id}` | `read` | Get a timeline entry |
| POST | `/timeline` | `write` | Create a timeline entry |
| PATCH | `/timeline/{id}` | `write` | Update a timeline entry |
| DELETE | `/timeline/{id}` | `write` | Delete a timeline entry |
| GET | `/timeline/{id}/highlights` | `read` | List a timeline entry's highlights |
| PUT | `/timeline/{id}/highlights` | `write` | Replace a timeline entry's highlights |
| PUT | `/timeline/order` | `write` | Reorder timeline entries |

### Education

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/education` | `read` | List education entries |
| GET | `/education/{id}` | `read` | Get an education entry |
| POST | `/education` | `write` | Create an education entry |
| PATCH | `/education/{id}` | `write` | Update an education entry |
| DELETE | `/education/{id}` | `write` | Delete an education entry |
| PUT | `/education/order` | `write` | Reorder education entries |

### Certifications

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/certifications` | `read` | List certifications |
| GET | `/certifications/{id}` | `read` | Get a certification |
| POST | `/certifications` | `write` | Create a certification |
| PATCH | `/certifications/{id}` | `write` | Update a certification |
| DELETE | `/certifications/{id}` | `write` | Delete a certification |
| PUT | `/certifications/order` | `write` | Reorder certifications |

### Skills

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/skill-categories` | `read` | List skill categories with their skills |
| GET | `/skill-categories/{id}` | `read` | Get a skill category with its skills |
| GET | `/skill-categories/{id}/skills` | `read` | List the skills in one category |
| POST | `/skill-categories` | `write` | Create a skill category |
| PATCH | `/skill-categories/{id}` | `write` | Update a skill category |
| DELETE | `/skill-categories/{id}` | `write` | Delete a skill category |
| GET | `/skills/{id}` | `read` | Get a skill |
| POST | `/skills` | `write` | Create a skill in a category |
| PATCH | `/skills/{id}` | `write` | Update a skill |
| DELETE | `/skills/{id}` | `write` | Delete a skill |
| PUT | `/skill-categories/order` | `write` | Reorder skill categories |
| PUT | `/skill-categories/{id}/skills/order` | `write` | Reorder skills in this category |
| GET | `/skills` | `read` | List skills (all categories) |

### Tools

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/tools` | `read` | List tools |
| GET | `/tools/{id}` | `read` | Get a tool |
| POST | `/tools` | `write` | Create a tool |
| PATCH | `/tools/{id}` | `write` | Update a tool |
| DELETE | `/tools/{id}` | `write` | Delete a tool |
| PUT | `/tools/order` | `write` | Reorder tools |

### Social links

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/social-links` | `read` | List social links |
| GET | `/social-links/{id}` | `read` | Get a social link |
| POST | `/social-links` | `write` | Create a social link |
| PATCH | `/social-links/{id}` | `write` | Update a social link |
| DELETE | `/social-links/{id}` | `write` | Delete a social link |
| PUT | `/social-links/order` | `write` | Reorder social links |

### Sections

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/sections` | `read` | List page sections |
| GET | `/sections/{id}` | `read` | Get a section |
| GET | `/sections/by-key/{key}` | `read` | Get a section by its key |
| POST | `/sections` | `write` | Create a section |
| PATCH | `/sections/{id}` | `write` | Update a section |
| PUT | `/sections/{id}/alternates` | `write` | Replace a section's title/eyebrow alternates |
| DELETE | `/sections/{id}` | `write` | Delete a section |
| GET | `/sections/{id}/alternates` | `read` | Get a section's title/eyebrow alternates |
| PUT | `/sections/order` | `write` | Reorder sections |

### Robot lines

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/robot-lines` | `read` | List robot lines |
| GET | `/robot-lines/{id}` | `read` | Get a robot line |
| POST | `/robot-lines` | `write` | Create a robot line |
| PATCH | `/robot-lines/{id}` | `write` | Update a robot line |
| DELETE | `/robot-lines/{id}` | `write` | Delete a robot line |
| PUT | `/robot-lines/order` | `write` | Reorder robot lines |

### Terminal lines

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/terminal-lines` | `read` | List terminal lines |
| GET | `/terminal-lines/{id}` | `read` | Get a terminal line |
| POST | `/terminal-lines` | `write` | Create a terminal line |
| PATCH | `/terminal-lines/{id}` | `write` | Update a terminal line |
| DELETE | `/terminal-lines/{id}` | `write` | Delete a terminal line |
| PUT | `/terminal-lines/order` | `write` | Reorder terminal lines |

### Notes

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/notes` | `read` | List notes |
| GET | `/notes/{id}` | `read` | Get a note |
| GET | `/notes/by-slug/{slug}` | `read` | Get a note by its slug |
| POST | `/notes` | `write` | Create a note |
| PATCH | `/notes/{id}` | `write` | Update a note |
| DELETE | `/notes/{id}` | `write` | Delete a note |
| PUT | `/notes/order` | `write` | Reorder notes |
| POST | `/notes/{id}/publish` | `write` | Publish a note |
| POST | `/notes/{id}/unpublish` | `write` | Unpublish a note |
| POST | `/notes/{id}/archive` | `write` | Archive a note |

### Media

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/media` | `read` | List media |
| GET | `/media/{id}` | `read` | Get a media asset |
| POST | `/media` | `write` | Upload a file |
| PATCH | `/media/{id}` | `write` | Update a media asset's alt text |
| DELETE | `/media/{id}` | `write` | Delete a media asset |
| GET | `/media/{id}/file` | `read` | Download a media file |

### Resumes

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/resumes` | `read` | List résumés |
| GET | `/resumes/current` | `read` | Get the current résumé |
| GET | `/resumes/{id}` | `read` | Get a résumé |
| POST | `/resumes` | `write` | Create a résumé |
| PATCH | `/resumes/{id}` | `write` | Update a résumé |
| POST | `/resumes/{id}/make-current` | `write` | Make a résumé the current one |
| DELETE | `/resumes/{id}` | `write` | Delete a résumé |

### Settings

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/settings/site` | `read` | Get site settings |
| PATCH | `/settings/site` | `write` | Update some site settings |
| GET | `/settings/scene` | `read` | Get 3D scene settings |
| PATCH | `/settings/scene` | `write` | Update some 3D scene settings |

### Analytics

| Method | Path | Permission | What it does |
| --- | --- | --- | --- |
| GET | `/analytics` | `read` | Page-view summary |
