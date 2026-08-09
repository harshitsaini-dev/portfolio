/**
 * Phase 9 storage foundation: the object-storage contract, the pure upload
 * policy, the provider seam, and the in-memory fake.
 *
 * Five layers, all real:
 *
 *   1. **Pure policy** — byte-signature detection, the declared/sniffed
 *      agreement rule, size ceilings, and storage-key construction, exercised
 *      directly with hostile and malformed input.
 *   2. **The in-memory fake** — including its injected failures, which are
 *      what makes the media service's future compensation paths testable.
 *   3. **The provider seam** (`src/lib/storage/binding.ts`) — fail-closed
 *      behaviour and registration, against the real module.
 *   4. **A real local simulated R2**, created by Wrangler's
 *      `getPlatformProxy()` from a THROWAWAY config in a temp directory. This
 *      is what keeps the fake honest: every semantic the fake claims is first
 *      observed against real storage in the same run.
 *   5. **Static type compatibility** — Cloudflare's own `R2Bucket`, generated
 *      by Wrangler, must satisfy `ObjectStorage` and be a valid
 *      `AdminStorageProvider` return value, with no cast.
 *
 * No Cloudflare credentials, no network, no `--remote`, and **no real bucket**
 * — layer 4 simulates one locally in a temp directory and deletes it
 * afterwards. No committed configuration file is read or written.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPlatformProxy, experimental_generateTypes } from "wrangler";

import {
  CANONICAL_EXTENSIONS,
  DOCUMENT_CONTENT_TYPES,
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_UPLOAD_BYTES,
  MEDIA_CONTENT_TYPES,
  SNIFF_BYTE_LENGTH,
  STORAGE_KEY_PATTERN,
  STORAGE_NAMESPACES,
  buildStorageKey,
  detectContentType,
  evaluateUpload,
  isImageContentType,
  isMediaContentType,
  isValidStorageKey,
  maxBytesFor,
  uploadDeclarationSchema,
} from "@portfolio/schemas";
import { uuidV7 } from "@portfolio/database";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "..", "..");

/** Selects the workerd API surface for type generation only. Not a deployment setting. */
const COMPATIBILITY_DATE = "2026-08-01";

const failures = [];
let checks = 0;
let group = "";

function startGroup(name) {
  group = name;
  console.log(`\n${name}`);
}

function check(description, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${description}`);
  } else {
    console.log(`  FAIL  ${description}${detail ? ` — ${detail}` : ""}`);
    failures.push(`[${group}] ${description}`);
  }
}

function equal(description, actual, expected) {
  check(
    description,
    Object.is(actual, expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// ---------------------------------------------------------------------------
// Fixtures — minimal but genuinely well-formed headers.
// ---------------------------------------------------------------------------

function bytes(...values) {
  return Uint8Array.from(values);
}

/** `\x89PNG\r\n\x1a\n` plus the start of an IHDR chunk. */
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52);
/** SOI + APP0/JFIF. */
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01);
/** SOI + APP1/Exif — a different second marker, which must also be accepted. */
const JPEG_EXIF = bytes(0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00);
/** RIFF + 4-byte length + WEBP + VP8 chunk id. */
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20);
/** `%PDF-1.7`. */
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x0a);

/** `<svg xmlns=` — a real SVG header, which must be refused. */
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
/** `<?xml ` — the other common SVG opening. */
const SVG_XML = new TextEncoder().encode('<?xml version="1.0"?><svg></svg>');
/**
 * `GIF89a` plus a 1x1 logical screen descriptor — a valid image this
 * policy does not accept.
 *
 * The control bytes are written as JavaScript escapes, never as literal
 * bytes. Literal NULs here previously made Git classify this whole source
 * file as binary. The encoded VALUE is unchanged.
 */
const GIF = new TextEncoder().encode("GIF89a\x01\x00\x01\x00\x00\x00\x00");
/** `PK\x03\x04` — a ZIP, which is also how .docx/.xlsx begin. */
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0);
/** `MZ` — a Windows executable. */
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0);
/** `<!DOCTYPE html>` — active content by another route. */
const HTML = new TextEncoder().encode("<!DOCTYPE html><html><body>hi</body></html>");
/** A plausible-looking script. */
const JS = new TextEncoder().encode("#!/usr/bin/env node\nconsole.log(1)\n");

let workDir = null;
let platform = null;

try {
  // =========================================================================
  startGroup("Supported formats");

  equal("three image types are accepted", IMAGE_CONTENT_TYPES.length, 3);
  equal("one document type is accepted", DOCUMENT_CONTENT_TYPES.length, 1);
  equal("four types in total", MEDIA_CONTENT_TYPES.length, 4);
  check(
    "the allowlist is exactly PNG, JPEG, WebP, PDF",
    [...MEDIA_CONTENT_TYPES].sort().join(",") ===
      "application/pdf,image/jpeg,image/png,image/webp",
    MEDIA_CONTENT_TYPES.join(","),
  );

  // Negative controls: formats that must NOT be on the list. SVG heads this
  // list deliberately — it is the one a future contributor is most likely to
  // add "just for logos".
  for (const type of [
    "image/svg+xml",
    "image/gif",
    "image/avif",
    "image/bmp",
    "image/tiff",
    "text/html",
    "text/plain",
    "application/xml",
    "application/zip",
    "application/octet-stream",
    "application/x-msdownload",
    "application/msword",
    "video/mp4",
  ]) {
    check(`\`${type}\` is not an accepted type`, !isMediaContentType(type));
  }

  check("PNG is classified as an image", isImageContentType("image/png"));
  check("PDF is NOT classified as an image", !isImageContentType("application/pdf"));

  equal("PNG canonical extension", CANONICAL_EXTENSIONS["image/png"], "png");
  equal("JPEG canonical extension is `jpg`, not `jpeg`", CANONICAL_EXTENSIONS["image/jpeg"], "jpg");
  equal("WebP canonical extension", CANONICAL_EXTENSIONS["image/webp"], "webp");
  equal("PDF canonical extension", CANONICAL_EXTENSIONS["application/pdf"], "pdf");
  check(
    "every accepted type has a canonical extension",
    MEDIA_CONTENT_TYPES.every((type) => typeof CANONICAL_EXTENSIONS[type] === "string"),
  );
  check(
    "no canonical extension carries a leading dot",
    Object.values(CANONICAL_EXTENSIONS).every((ext) => !ext.startsWith(".")),
  );

  // =========================================================================
  startGroup("Byte-signature detection");

  equal("a PNG header is detected", detectContentType(PNG), "image/png");
  equal("a JFIF JPEG header is detected", detectContentType(JPEG), "image/jpeg");
  equal("an Exif JPEG header is detected too", detectContentType(JPEG_EXIF), "image/jpeg");
  equal("a WebP header is detected", detectContentType(WEBP), "image/webp");
  equal("a PDF header is detected", detectContentType(PDF), "application/pdf");

  // Unsupported and hostile content, all of which must come back `null`.
  equal("an SVG is not detected as anything", detectContentType(SVG), null);
  equal("an XML-prologue SVG is not detected either", detectContentType(SVG_XML), null);
  equal("a GIF is not detected", detectContentType(GIF), null);
  equal("a ZIP/office document is not detected", detectContentType(ZIP), null);
  equal("a Windows executable is not detected", detectContentType(EXE), null);
  equal("an HTML document is not detected", detectContentType(HTML), null);
  equal("a script is not detected", detectContentType(JS), null);
  equal("empty input is not detected", detectContentType(bytes()), null);
  equal("random noise is not detected", detectContentType(bytes(1, 2, 3, 4, 5, 6, 7, 8)), null);

  // Near-misses: the signature checks must be exact, not prefix-ish.
  equal(
    "a truncated PNG signature is rejected",
    detectContentType(bytes(0x89, 0x50, 0x4e, 0x47)),
    null,
  );
  equal(
    "PNG bytes with one wrong byte are rejected",
    detectContentType(bytes(0x89, 0x50, 0x4e, 0x48, 0x0d, 0x0a, 0x1a, 0x0a)),
    null,
  );
  equal(
    "`FF D8` alone is not enough to be a JPEG",
    detectContentType(bytes(0xff, 0xd8)),
    null,
  );
  equal(
    "`FF D8 00` is not a JPEG",
    detectContentType(bytes(0xff, 0xd8, 0x00, 0x00)),
    null,
  );
  equal(
    "RIFF without WEBP is rejected (a WAV, for instance)",
    detectContentType(bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45)),
    null,
  );
  equal(
    "`%PDF` without the trailing hyphen is rejected",
    detectContentType(bytes(0x25, 0x50, 0x44, 0x46, 0x00)),
    null,
  );
  equal(
    "a PDF signature not at offset 0 is rejected",
    detectContentType(bytes(0x0a, 0x25, 0x50, 0x44, 0x46, 0x2d, 0x31)),
    null,
  );

  // Detection must be bounded and independent of length.
  const paddedPng = new Uint8Array(4096);
  paddedPng.set(PNG, 0);
  equal("a long PNG is still detected from its head", detectContentType(paddedPng), "image/png");
  const lateSignature = new Uint8Array(4096);
  lateSignature.set(PNG, SNIFF_BYTE_LENGTH + 1);
  equal(
    "a signature beyond the sniff window is NOT detected",
    detectContentType(lateSignature),
    null,
  );
  equal("the sniff window is a fixed 16 bytes", SNIFF_BYTE_LENGTH, 16);

  // =========================================================================
  startGroup("Declared/sniffed agreement");

  const okPng = evaluateUpload({ declaredContentType: "image/png", bytes: PNG });
  check("a PNG declared as PNG is accepted", okPng.ok === true);
  equal("and reports the sniffed type", okPng.contentType, "image/png");
  equal("and the canonical extension", okPng.extension, "png");
  equal("and the byte size", okPng.byteSize, PNG.length);
  equal("and that it is an image", okPng.isImage, true);

  const okPdf = evaluateUpload({ declaredContentType: "application/pdf", bytes: PDF });
  check("a PDF declared as PDF is accepted", okPdf.ok === true);
  equal("and is not classified as an image", okPdf.isImage, false);

  // The core rule: bytes and declaration must agree, and disagreement is a
  // refusal rather than a silent correction.
  const spoofed = evaluateUpload({ declaredContentType: "image/png", bytes: PDF });
  check("a PDF declared as image/png is rejected", spoofed.ok === false);
  equal("with a mismatch reason", spoofed.reason, "type_mismatch");
  check(
    "and it is NOT silently rewritten to the sniffed type",
    spoofed.ok === false && !("contentType" in spoofed),
  );

  const spoofedOther = evaluateUpload({ declaredContentType: "application/pdf", bytes: PNG });
  equal("a PNG declared as a PDF is rejected too", spoofedOther.reason, "type_mismatch");
  equal(
    "a WebP declared as JPEG is rejected",
    evaluateUpload({ declaredContentType: "image/jpeg", bytes: WEBP }).reason,
    "type_mismatch",
  );

  // An unsupported declaration is refused before the bytes matter at all.
  const svgDeclared = evaluateUpload({ declaredContentType: "image/svg+xml", bytes: SVG });
  check("an SVG upload is rejected", svgDeclared.ok === false);
  equal("on the declared type, before sniffing", svgDeclared.reason, "unsupported_declared_type");
  equal(
    "an SVG smuggled under image/png is rejected on its content",
    evaluateUpload({ declaredContentType: "image/png", bytes: SVG }).reason,
    "unrecognised_content",
  );
  equal(
    "HTML smuggled under image/png is rejected on its content",
    evaluateUpload({ declaredContentType: "image/png", bytes: HTML }).reason,
    "unrecognised_content",
  );
  equal(
    "an executable smuggled under application/pdf is rejected on its content",
    evaluateUpload({ declaredContentType: "application/pdf", bytes: EXE }).reason,
    "unrecognised_content",
  );
  for (const type of ["image/gif", "image/avif", "application/zip", "text/html", ""]) {
    equal(
      `a declared \`${type || "(empty)"}\` is rejected`,
      evaluateUpload({ declaredContentType: type, bytes: PNG }).reason,
      "unsupported_declared_type",
    );
  }

  const emptyUpload = evaluateUpload({ declaredContentType: "image/png", bytes: bytes() });
  equal("an empty file is rejected", emptyUpload.reason, "empty");

  check(
    "no rejection message mentions storage, buckets, or SQL",
    [spoofed, svgDeclared, emptyUpload].every(
      (result) =>
        result.ok === false &&
        !/bucket|r2|cloudflare|sqlite|sql|stack|account/i.test(result.message),
    ),
  );

  // =========================================================================
  startGroup("Size policy");

  equal("the image ceiling is 5 MiB", MAX_IMAGE_BYTES, 5 * 1024 * 1024);
  equal("the PDF ceiling is 10 MiB", MAX_PDF_BYTES, 10 * 1024 * 1024);
  equal("the absolute ceiling is the larger of the two", MAX_UPLOAD_BYTES, MAX_PDF_BYTES);
  equal("images use the image ceiling", maxBytesFor("image/png"), MAX_IMAGE_BYTES);
  equal("JPEG uses the image ceiling", maxBytesFor("image/jpeg"), MAX_IMAGE_BYTES);
  equal("WebP uses the image ceiling", maxBytesFor("image/webp"), MAX_IMAGE_BYTES);
  equal("PDFs use the PDF ceiling", maxBytesFor("application/pdf"), MAX_PDF_BYTES);

  // Boundaries, using the declared-size path so this does not allocate 10 MB
  // per case. One real full-size buffer is exercised below.
  const atImageLimit = evaluateUpload({
    declaredContentType: "image/png",
    bytes: PNG,
    byteSize: MAX_IMAGE_BYTES,
  });
  check("an image of exactly the limit is accepted", atImageLimit.ok === true);
  equal("and reports that size", atImageLimit.byteSize, MAX_IMAGE_BYTES);
  check(
    "an image one byte under the limit is accepted",
    evaluateUpload({ declaredContentType: "image/png", bytes: PNG, byteSize: MAX_IMAGE_BYTES - 1 })
      .ok === true,
  );
  const overImage = evaluateUpload({
    declaredContentType: "image/png",
    bytes: PNG,
    byteSize: MAX_IMAGE_BYTES + 1,
  });
  check("an image one byte over the limit is rejected", overImage.ok === false);
  equal("with a size reason", overImage.reason, "too_large");

  check(
    "a PDF of exactly the PDF limit is accepted",
    evaluateUpload({ declaredContentType: "application/pdf", bytes: PDF, byteSize: MAX_PDF_BYTES })
      .ok === true,
  );
  check(
    "a PDF one byte under the PDF limit is accepted",
    evaluateUpload({
      declaredContentType: "application/pdf",
      bytes: PDF,
      byteSize: MAX_PDF_BYTES - 1,
    }).ok === true,
  );
  equal(
    "a PDF one byte over the PDF limit is rejected",
    evaluateUpload({
      declaredContentType: "application/pdf",
      bytes: PDF,
      byteSize: MAX_PDF_BYTES + 1,
    }).reason,
    "too_large",
  );

  // The ceiling follows the SNIFFED type, so a renamed file cannot borrow the
  // other format's allowance.
  equal(
    "an image cannot borrow the PDF ceiling by size alone",
    evaluateUpload({
      declaredContentType: "image/png",
      bytes: PNG,
      byteSize: MAX_PDF_BYTES,
    }).reason,
    "too_large",
  );
  equal(
    "zero declared bytes is rejected as empty, not as a size failure",
    evaluateUpload({ declaredContentType: "image/png", bytes: PNG, byteSize: 0 }).reason,
    "empty",
  );

  // One genuine full-size allocation, so the default (no `byteSize`) path is
  // exercised at the boundary rather than only the declared-size shortcut.
  const realSizedImage = new Uint8Array(MAX_IMAGE_BYTES);
  realSizedImage.set(PNG, 0);
  check(
    "a real 5 MiB PNG buffer is accepted at the boundary",
    evaluateUpload({ declaredContentType: "image/png", bytes: realSizedImage }).ok === true,
  );
  const realOversizeImage = new Uint8Array(MAX_IMAGE_BYTES + 1);
  realOversizeImage.set(PNG, 0);
  equal(
    "a real 5 MiB + 1 PNG buffer is rejected",
    evaluateUpload({ declaredContentType: "image/png", bytes: realOversizeImage }).reason,
    "too_large",
  );

  // The declaration schema refuses an oversized claim without reading bytes.
  check(
    "a valid declaration parses",
    uploadDeclarationSchema.safeParse({ declaredContentType: "image/png", byteSize: 1024 })
      .success,
  );
  check(
    "a declaration above the absolute ceiling is rejected",
    !uploadDeclarationSchema.safeParse({
      declaredContentType: "image/png",
      byteSize: MAX_UPLOAD_BYTES + 1,
    }).success,
  );
  check(
    "a negative declared size is rejected",
    !uploadDeclarationSchema.safeParse({ declaredContentType: "image/png", byteSize: -1 })
      .success,
  );
  check(
    "a fractional declared size is rejected",
    !uploadDeclarationSchema.safeParse({ declaredContentType: "image/png", byteSize: 1.5 })
      .success,
  );
  check(
    "an unknown field in a declaration is rejected",
    !uploadDeclarationSchema.safeParse({
      declaredContentType: "image/png",
      byteSize: 10,
      storageKey: "media/attacker.png",
    }).success,
  );

  // =========================================================================
  startGroup("Storage-key generation");

  equal("there are exactly two namespaces", STORAGE_NAMESPACES.length, 2);
  check(
    "they are `media` and `resumes`",
    [...STORAGE_NAMESPACES].sort().join(",") === "media,resumes",
  );

  const imageKey = buildStorageKey({
    namespace: "media",
    contentType: "image/png",
    id: uuidV7(),
  });
  const resumeKey = buildStorageKey({
    namespace: "resumes",
    contentType: "application/pdf",
    id: uuidV7(),
  });

  check("an image key is produced", typeof imageKey === "string" && imageKey.length > 0);
  check("an image key sits under the media namespace", imageKey.startsWith("media/"));
  check("an image key carries the canonical extension", imageKey.endsWith(".png"));
  check("a resume key sits under the resumes namespace", resumeKey.startsWith("resumes/"));
  check("a resume key carries the pdf extension", resumeKey.endsWith(".pdf"));
  check("the two namespaces are distinct prefixes", !resumeKey.startsWith("media/"));
  check("a generated key validates against the grammar", isValidStorageKey(imageKey));
  check("so does a resume key", isValidStorageKey(resumeKey));

  equal(
    "a JPEG key uses `.jpg`",
    buildStorageKey({ namespace: "media", contentType: "image/jpeg", id: uuidV7() }).endsWith(".jpg"),
    true,
  );
  check(
    "a JPEG key never uses `.jpeg`",
    !buildStorageKey({ namespace: "media", contentType: "image/jpeg", id: uuidV7() }).endsWith(".jpeg"),
  );
  check(
    "a WebP key uses `.webp`",
    buildStorageKey({ namespace: "media", contentType: "image/webp", id: uuidV7() }).endsWith(".webp"),
  );

  // Path safety, asserted over many generated keys rather than one.
  const sample = Array.from({ length: 500 }, () =>
    buildStorageKey({
      namespace: "media",
      contentType: "image/png",
      id: uuidV7(),
    }),
  );
  check("no generated key contains `..`", sample.every((key) => !key.includes("..")));
  check("no generated key contains a backslash", sample.every((key) => !key.includes("\\")));
  check("no generated key starts with a slash", sample.every((key) => !key.startsWith("/")));
  check("no generated key contains a double slash", sample.every((key) => !key.includes("//")));
  check(
    "every generated key has exactly one directory separator",
    sample.every((key) => key.split("/").length === 2),
  );
  check("no generated key contains whitespace", sample.every((key) => !/\s/.test(key)));
  check("no generated key contains a null byte", sample.every((key) => !key.includes("\0")));
  check(
    "no generated key contains a character needing URL escaping",
    sample.every((key) => encodeURI(key) === key),
  );
  check(
    "no generated key contains an uppercase character",
    sample.every((key) => key === key.toLowerCase()),
  );
  check("every generated key matches the grammar", sample.every(isValidStorageKey));
  equal("500 generated keys are all distinct", new Set(sample).size, 500);

  // The filename never reaches the key. This is the structural guarantee, so
  // it is asserted against input designed to escape if it ever were used.
  const hostileNames = [
    "../../etc/passwd",
    "..\\..\\windows\\system32\\config",
    "sh ell.png",
    "%2e%2e%2fescape.png",
    "nul.png",
    "file\u0000.png", // a genuine NUL, written escaped
    "Ünïcödé Ñame.png",
    "a".repeat(400) + ".png",
    "<script>alert(1)</script>.png",
    "'; DROP TABLE media_assets; --.png",
  ];
  // The escapes above must still evaluate to the characters they name. An
  // earlier revision held these as LITERAL control bytes, which made Git
  // classify this whole JavaScript file as binary; the repair replaced the
  // source representation only, and these assertions are what prove the
  // fixtures did not lose their teeth in the process. Escaping the source
  // and escaping the VALUE are different things, and only one of them is
  // wanted.
  const nulName = hostileNames.find((name) => name.includes("\u0000"));
  check("a hostile filename fixture is still present for the NUL case", Boolean(nulName));
  equal("and it still carries a real NUL character", nulName?.charCodeAt(4), 0);
  equal("which is one character, not the two-character text `\\0`", nulName?.length, 9);
  check(
    "the GIF fixture still encodes real NUL bytes",
    GIF.includes(0x00) && GIF.length === 13,
    `bytes: ${GIF.length}`,
  );
  equal("the GIF fixture still starts with `G`", GIF[0], 0x47);
  equal("and is still refused by the sniffer", detectContentType(GIF), null);

  // The other half of that repair: the SOURCE must stay text. The assertions
  // above prove the fixtures kept their teeth; this proves the file kept its
  // classification, which is the thing that actually broke.
  //
  // Deliberately two named files rather than a repository-wide walk. These
  // are the suites that legitimately need control-byte fixtures, so they are
  // the ones that can regress; scanning everything would be a lint system
  // wearing a test's clothes, and it would fail the moment a real binary
  // asset is added.
  for (const relative of [
    join("scripts", "storage-foundation-tests.mjs"),
    join("scripts", "media-service-tests.mjs"),
  ]) {
    const source = readFileSync(join(appRoot, relative));
    const nulCount = source.filter((byte) => byte === 0).length;
    equal(`\`${relative}\` contains zero literal NUL bytes`, nulCount, 0);
  }

  /** Escape to pure ASCII so CI logs stay text, whatever the locale. */
  const asciiLabel = (value) =>
    value
      .slice(0, 24)
      .replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

  for (const name of hostileNames) {
    // There is no parameter to pass it to — that IS the guarantee. The key is
    // built from the namespace, a generated id, and the sniffed type only.
    const key = buildStorageKey({
      namespace: "media",
      contentType: "image/png",
      id: uuidV7(),
    });
    check(
      `a key built alongside a hostile filename contains none of it (${asciiLabel(name)})`,
      isValidStorageKey(key) && !key.includes(name.slice(0, 6)) && !key.includes(".."),
    );
  }
  check(
    "`buildStorageKey` accepts no filename parameter at all",
    !/filename/i.test(readFileSync(join(repoRoot, "packages", "schemas", "src", "media.ts"), "utf8")
      .split("export function buildStorageKey")[1]
      .slice(0, 400)),
  );

  // A malformed id must fail loudly rather than produce a traversable key.
  for (const badId of ["../escape", "a/b", "..", "with space", "UPPER", "semi;colon", ""]) {
    let threw = false;
    try {
      buildStorageKey({ namespace: "media", contentType: "image/png", id: badId });
    } catch {
      threw = true;
    }
    check(`an unsafe id (\`${badId}\`) is refused rather than encoded`, threw);
  }

  // The validator must reject keys the generator could never produce.
  for (const badKey of [
    "media/../secret.png",
    "/media/x.png",
    "media\\x.png",
    "other/x.png",
    "media/x.svg",
    "media/x.exe",
    "media/x",
    "media//x.png",
    "media/x.png/y.png",
    "MEDIA/x.png",
    "",
  ]) {
    check(`\`${badKey || "(empty)"}\` is not a valid storage key`, !isValidStorageKey(badKey));
  }
  check(
    "the grammar pattern is anchored at both ends",
    STORAGE_KEY_PATTERN.source.startsWith("^") && STORAGE_KEY_PATTERN.source.endsWith("$"),
  );

  // =========================================================================
  startGroup("In-memory fake storage");

  const { createMemoryObjectStorage } = await import("../src/lib/storage/memory-storage.ts");
  const fake = createMemoryObjectStorage();

  equal("a fresh fake is empty", fake.size, 0);
  equal("and lists nothing", (await fake.list()).objects.length, 0);
  equal("a missing get returns null", await fake.get("media/nope.png"), null);
  equal("a missing head returns null", await fake.head("media/nope.png"), null);

  const putResult = await fake.put(imageKey, PNG, {
    httpMetadata: { contentType: "image/png" },
  });
  check("put reports the stored object", putResult !== null && putResult.key === imageKey);
  equal("put records the byte length", putResult.size, PNG.length);
  equal("the fake now holds one object", fake.size, 1);

  const fetched = await fake.get(imageKey);
  check("get returns a body for a stored key", fetched !== null);
  const roundTripped = new Uint8Array(await fetched.arrayBuffer());
  check(
    "the bytes round-trip identically",
    roundTripped.length === PNG.length && roundTripped.every((b, i) => b === PNG[i]),
  );
  equal("the content type round-trips", fake.contentTypeOf(imageKey), "image/png");
  const headed = await fake.head(imageKey);
  check("head returns metadata without a body", headed !== null && !("arrayBuffer" in headed));
  equal("head reports the same size", headed.size, PNG.length);

  // Stored bytes must be a copy — mutating the caller's buffer must not
  // change what is stored, because real storage holds no such reference.
  const mutable = Uint8Array.from(PNG);
  await fake.put("media/00000000-0000-7000-8000-000000000001.png", mutable);
  mutable[0] = 0x00;
  const afterMutation = new Uint8Array(
    await (await fake.get("media/00000000-0000-7000-8000-000000000001.png")).arrayBuffer(),
  );
  equal("mutating the source buffer does not change stored bytes", afterMutation[0], 0x89);

  // And the returned buffer must be a copy too.
  const firstRead = new Uint8Array(await (await fake.get(imageKey)).arrayBuffer());
  firstRead[0] = 0x00;
  const secondRead = new Uint8Array(await (await fake.get(imageKey)).arrayBuffer());
  equal("mutating a read buffer does not change stored bytes", secondRead[0], 0x89);

  await fake.put(resumeKey, PDF, { httpMetadata: { contentType: "application/pdf" } });
  const listedAll = await fake.list();
  equal("list reports every object", listedAll.objects.length, 3);
  check("list is not truncated when everything fits", listedAll.truncated === false);
  const listedMedia = await fake.list({ prefix: "media/" });
  equal("list honours a prefix", listedMedia.objects.length, 2);
  check(
    "a prefix listing excludes the other namespace",
    listedMedia.objects.every((object) => object.key.startsWith("media/")),
  );
  const listedPage = await fake.list({ prefix: "media/", limit: 1 });
  equal("list honours a limit", listedPage.objects.length, 1);
  check("and reports truncation", listedPage.truncated === true);
  check("and returns a cursor", typeof listedPage.cursor === "string");
  const listedRest = await fake.list({ prefix: "media/", cursor: listedPage.cursor });
  equal("the cursor continues the listing", listedRest.objects.length, 1);
  check("and does not repeat the first page", listedRest.objects[0].key !== listedPage.objects[0].key);

  // Overwrite semantics match real storage: silent replacement.
  await fake.put(resumeKey, PNG, { httpMetadata: { contentType: "image/png" } });
  equal("put overwrites an existing key without error", fake.size, 3);
  equal("and replaces the content type", fake.contentTypeOf(resumeKey), "image/png");

  await fake.delete(resumeKey);
  equal("delete removes the object", await fake.head(resumeKey), null);
  equal("and the count drops", fake.size, 2);
  let missingDeleteThrew = false;
  try {
    await fake.delete("media/never-existed.png");
  } catch {
    missingDeleteThrew = true;
  }
  check("deleting a missing key does NOT throw", !missingDeleteThrew);

  // Fault injection — the reason this fake exists.
  startGroup("In-memory fake fault injection");

  fake.failNext("put");
  let putFailed = false;
  try {
    await fake.put("media/00000000-0000-7000-8000-00000000000f.png", PNG);
  } catch {
    putFailed = true;
  }
  check("an injected put failure rejects", putFailed);
  equal(
    "and nothing was stored",
    await fake.head("media/00000000-0000-7000-8000-00000000000f.png"),
    null,
  );
  const afterFailedPut = await fake.put("media/00000000-0000-7000-8000-00000000000f.png", PNG);
  check("the fault is one-shot — the next put succeeds", afterFailedPut !== null);

  fake.failNext("delete");
  let deleteFailed = false;
  try {
    await fake.delete(imageKey);
  } catch {
    deleteFailed = true;
  }
  check("an injected delete failure rejects", deleteFailed);
  check("and the object survives", (await fake.head(imageKey)) !== null);
  await fake.delete(imageKey);
  equal("the next delete succeeds", await fake.head(imageKey), null);

  fake.failNext("get");
  let getFailed = false;
  try {
    await fake.get("media/00000000-0000-7000-8000-00000000000f.png");
  } catch {
    getFailed = true;
  }
  check("an injected get failure rejects", getFailed);

  fake.failNext("head");
  let headFailed = false;
  try {
    await fake.head("media/00000000-0000-7000-8000-00000000000f.png");
  } catch {
    headFailed = true;
  }
  check("an injected head failure rejects", headFailed);

  fake.failNext("list");
  let listFailed = false;
  try {
    await fake.list();
  } catch {
    listFailed = true;
  }
  check("an injected list failure rejects", listFailed);

  fake.failNext("put", new Error("custom failure"));
  let customMessage = "";
  try {
    await fake.put("media/00000000-0000-7000-8000-0000000000ff.png", PNG);
  } catch (error) {
    customMessage = error.message;
  }
  equal("a custom injected error is preserved", customMessage, "custom failure");

  fake.failNext("put");
  fake.clearFaults();
  check(
    "clearFaults disarms an armed fault",
    (await fake.put("media/00000000-0000-7000-8000-0000000000aa.png", PNG)) !== null,
  );

  // =========================================================================
  startGroup("Admin storage provider seam");

  const seam = await import("../src/lib/storage/binding.ts");
  check(
    "the module exports the expected seam",
    typeof seam.getAdminStorage === "function" &&
      typeof seam.setAdminStorageProvider === "function" &&
      typeof seam.clearAdminStorageProvider === "function" &&
      typeof seam.StorageUnavailableError === "function",
  );

  seam.clearAdminStorageProvider();
  check("no provider is registered to begin with", seam.hasAdminStorageProvider() === false);

  // **Production fails closed, and that is the half that matters.** Phase 9
  // slice 4 gave development a locally simulated bucket so the media CMS
  // could be built and browser-verified; production deliberately did NOT
  // change, because a development path reachable in production is how a
  // deployment quietly writes to the wrong bucket.
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  let unavailable = null;
  try {
    await seam.getAdminStorage();
  } catch (error) {
    unavailable = error;
  }
  check("with no provider in production, resolving fails closed", unavailable !== null);
  equal("with a StorageUnavailableError", unavailable?.name, "StorageUnavailableError");
  check(
    "the failure message names no bucket, account, or credential",
    typeof unavailable?.message === "string" &&
      !/bucket_name|account[_-]?id|access[_-]?key|secret|token|[0-9a-f]{32}/i.test(
        unavailable.message,
      ),
    unavailable?.message,
  );
  check(
    "and it says a provider must be registered",
    /setAdminStorageProvider/.test(unavailable?.message ?? ""),
  );
  check(
    "and it names the registrar that should have run",
    /instrumentation/.test(unavailable?.message ?? ""),
  );

  // The production branch must be keyed on NODE_ENV and nothing else, so a
  // repeated call cannot drift into the development path.
  let secondProductionAttempt = null;
  try {
    await seam.getAdminStorage();
  } catch (error) {
    secondProductionAttempt = error?.name;
  }
  equal(
    "a repeated production call fails closed the same way",
    secondProductionAttempt,
    "StorageUnavailableError",
  );

  // Development resolves the locally simulated bucket instead of throwing.
  // Exercised once, then disposed — an undisposed proxy leaves a workerd
  // process behind that wedges the next suite's migration step.
  process.env.NODE_ENV = "development";
  const devPlatform = await import("../src/lib/dev-platform.ts");
  let devStorage = null;
  let devError = null;
  try {
    devStorage = await seam.getAdminStorage();
  } catch (error) {
    devError = error;
  }
  check(
    "in development it does NOT fail closed",
    devError === null,
    String(devError?.message ?? ""),
  );
  check(
    "it resolves something satisfying the storage contract",
    devStorage !== null &&
      ["put", "get", "head", "delete", "list"].every(
        (method) => typeof devStorage[method] === "function",
      ),
  );
  await devPlatform.disposeDevPlatform();

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  // A registered provider is what the boundary uses.
  const injected = createMemoryObjectStorage();
  let providerConsulted = 0;
  seam.setAdminStorageProvider(async () => {
    providerConsulted += 1;
    return injected;
  });
  check("a provider can be registered", seam.hasAdminStorageProvider() === true);
  const resolved = await seam.getAdminStorage();
  check("the registered provider's storage is returned", resolved === injected);
  equal("and the provider was consulted exactly once", providerConsulted, 1);
  await seam.getAdminStorage();
  equal("each resolution consults the provider again", providerConsulted, 2);

  // A provider that throws must surface as the seam's own error type, with
  // the original preserved for the server log but not for the message.
  seam.setAdminStorageProvider(async () => {
    throw new Error("bucket portfolio-secret-name unreachable at account deadbeef");
  });
  let providerFailure = null;
  try {
    await seam.getAdminStorage();
  } catch (error) {
    providerFailure = error;
  }
  equal("a throwing provider yields StorageUnavailableError", providerFailure?.name, "StorageUnavailableError");
  check(
    "the raw provider message does not leak into the seam's message",
    !/portfolio-secret-name|deadbeef/.test(providerFailure?.message ?? ""),
    providerFailure?.message,
  );
  check(
    "but the original is preserved as `cause` for the server log",
    providerFailure?.cause instanceof Error &&
      /portfolio-secret-name/.test(providerFailure.cause.message),
  );

  // A provider that resolves nothing is a misconfiguration, not storage.
  seam.setAdminStorageProvider(async () => null);
  let nullProvider = null;
  try {
    await seam.getAdminStorage();
  } catch (error) {
    nullProvider = error;
  }
  equal("a provider resolving null fails closed", nullProvider?.name, "StorageUnavailableError");

  // Registration must not leak between tests.
  seam.clearAdminStorageProvider();
  check("clearing deregisters the provider", seam.hasAdminStorageProvider() === false);
  // Checked under production, where "no provider" is unambiguously a failure.
  // In development the seam would resolve the local bucket instead, which is
  // the intended behaviour and is asserted above.
  const envBeforeClear = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  let afterClear = null;
  try {
    await seam.getAdminStorage();
  } catch (error) {
    afterClear = error;
  }
  equal("and resolving fails closed again", afterClear?.name, "StorageUnavailableError");
  if (envBeforeClear === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = envBeforeClear;

  // =========================================================================
  startGroup("The fake is not production surface");

  // Nothing in the application may import the fake. Without this, it is one
  // careless import away from becoming a second storage backend that silently
  // discards everything on restart.
  const productionFiles = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
        productionFiles.push(full);
      }
    }
  })(join(appRoot, "src"));

  const importers = productionFiles.filter((file) => {
    if (file.endsWith(join("storage", "memory-storage.ts"))) return false;
    return /memory-storage/.test(readFileSync(file, "utf8"));
  });
  check(
    "no application source file imports the in-memory fake",
    importers.length === 0,
    importers.join(", "),
  );
  check("the scan actually looked at application sources", productionFiles.length > 20);
  check(
    "the fake documents that it is a test double",
    /Not a production implementation/i.test(
      readFileSync(join(appRoot, "src", "lib", "storage", "memory-storage.ts"), "utf8"),
    ),
  );

  // The seam must not read credentials from the environment. The chosen
  // architecture uses a binding, which carries none.
  const seamSource = readFileSync(join(appRoot, "src", "lib", "storage", "binding.ts"), "utf8");
  check(
    "the storage seam reads no R2 credential environment variables",
    !/R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2_ACCOUNT_ID|AWS_/.test(seamSource),
  );
  check(
    "the storage seam contains no hardcoded bucket name",
    !/bucket_name|bucketName\s*[:=]\s*["']/.test(seamSource),
  );

  // =========================================================================
  startGroup("Real local simulated R2 — contract behaviour");

  // A throwaway config in a temp directory: no committed file is read or
  // written, no bucket is created in Cloudflare, and nothing goes over the
  // network. This is what keeps the fake honest — every semantic asserted of
  // the fake above is observed here against real storage.
  workDir = mkdtempSync(join(tmpdir(), "portfolio-r2-foundation-"));
  const localConfigPath = join(workDir, "wrangler.localr2.json");
  writeFileSync(
    localConfigPath,
    JSON.stringify({
      name: "portfolio-r2-foundation-test",
      compatibility_date: COMPATIBILITY_DATE,
      r2_buckets: [{ binding: "MEDIA", bucket_name: "portfolio-media-local-test" }],
    }),
    "utf8",
  );

  platform = await getPlatformProxy({
    configPath: localConfigPath,
    persist: { path: join(workDir, "state") },
    remoteBindings: false,
  });
  const bucket = platform.env?.MEDIA;
  check("a local simulated R2 binding is available", Boolean(bucket));
  check(
    "it exposes exactly the operations the contract declares",
    ["put", "get", "head", "delete", "list"].every((method) => typeof bucket[method] === "function"),
  );

  const localKey = buildStorageKey({
    namespace: "media",
    contentType: "image/png",
    id: uuidV7(),
  });
  await bucket.put(localKey, PNG, { httpMetadata: { contentType: "image/png" } });
  const localHead = await bucket.head(localKey);
  check("a generated key is accepted verbatim by real R2", localHead !== null);
  equal("real R2 echoes the key unchanged", localHead?.key, localKey);
  equal("real R2 records the byte length", localHead?.size, PNG.length);
  equal(
    "real R2 records the content type",
    localHead?.httpMetadata?.contentType,
    "image/png",
  );

  const localBody = await bucket.get(localKey);
  const localBytes = new Uint8Array(await localBody.arrayBuffer());
  check(
    "bytes round-trip through real R2 identically",
    localBytes.length === PNG.length && localBytes.every((b, i) => b === PNG[i]),
  );

  // The three semantics the fake mirrors, observed rather than assumed.
  equal("real R2 returns null for a missing get", await bucket.get("media/absent.png"), null);
  equal("real R2 returns null for a missing head", await bucket.head("media/absent.png"), null);
  let realMissingDeleteThrew = false;
  try {
    await bucket.delete("media/absent.png");
  } catch {
    realMissingDeleteThrew = true;
  }
  check("real R2 does not throw deleting a missing key", !realMissingDeleteThrew);

  const localList = await bucket.list({ prefix: "media/" });
  check(
    "real R2 lists by prefix",
    localList.objects.some((object) => object.key === localKey),
  );
  check("and reports truncation as a boolean", typeof localList.truncated === "boolean");

  await bucket.delete(localKey);
  equal("real R2 delete removes the object", await bucket.head(localKey), null);

  // A résumé key must be equally acceptable.
  const localResumeKey = buildStorageKey({
    namespace: "resumes",
    contentType: "application/pdf",
    id: uuidV7(),
  });
  await bucket.put(localResumeKey, PDF, { httpMetadata: { contentType: "application/pdf" } });
  check("a resume key is accepted by real R2 too", (await bucket.head(localResumeKey)) !== null);
  const crossPrefix = await bucket.list({ prefix: "media/" });
  check(
    "and a media-prefix listing does not include it",
    !crossPrefix.objects.some((object) => object.key === localResumeKey),
  );
  await bucket.delete(localResumeKey);

  // The seam composes with a real binding, which is the whole point of it.
  seam.setAdminStorageProvider(async () => bucket);
  const composed = await seam.getAdminStorage();
  check("the seam resolves a real local R2 binding", composed === bucket);
  seam.clearAdminStorageProvider();

  // =========================================================================
  startGroup("Static type compatibility with Cloudflare's R2Bucket");

  // Runtime behaviour is proven above. This proves the separate compile-time
  // claim: Cloudflare's own `R2Bucket` satisfies `ObjectStorage`, so a future
  // deployment can register `env.MEDIA` with no cast.
  const typegenConfigPath = join(workDir, "wrangler.typegen.json");
  writeFileSync(
    typegenConfigPath,
    JSON.stringify(
      {
        name: "portfolio-r2-typecheck",
        compatibility_date: COMPATIBILITY_DATE,
        r2_buckets: [{ binding: "MEDIA", bucket_name: "portfolio-media-typecheck" }],
      },
      null,
      2,
    ),
    "utf8",
  );

  const generated = await experimental_generateTypes({
    config: typegenConfigPath,
    path: join(workDir, "worker-configuration.d.ts"),
    includeRuntime: true,
    includeEnv: true,
  });
  const typesPath = join(workDir, "worker-configuration.d.ts");
  const generatedContent = generated?.content ?? "";
  if (generatedContent) writeFileSync(typesPath, generatedContent, "utf8");

  check(
    "Wrangler generated Cloudflare runtime types",
    existsSync(typesPath) && generatedContent.length > 0,
  );
  check("the generated types declare R2Bucket", /\bR2Bucket\b/.test(generatedContent));
  check(
    "the generated env exposes the bucket binding",
    /MEDIA\s*:\s*R2Bucket/.test(generatedContent),
    "expected `MEDIA: R2Bucket` in the generated Env",
  );

  const assertionPath = join(workDir, "assert-r2-compatibility.ts");
  const typesSrc = join(repoRoot, "packages", "types", "src", "index.ts").replace(/\\/g, "/");
  writeFileSync(
    assertionPath,
    `/// <reference path="./worker-configuration.d.ts" />
import type { ObjectStorage } from "${typesSrc}";

// 1. Cloudflare's R2Bucket is assignable to our hand-written contract.
declare const cloudflareBucket: R2Bucket;
const asContract: ObjectStorage = cloudflareBucket;
void asContract;

// 2. A real Worker env binding satisfies the provider shape the admin seam
//    registers, with no cast — so deployment is a registration call.
interface WorkerEnv {
  MEDIA: R2Bucket;
}
declare const env: WorkerEnv;
type AdminStorageProvider = () => Promise<ObjectStorage>;
const provider: AdminStorageProvider = async () => env.MEDIA;
void provider;

// 3. The operations keep usable types through the contract.
async function probe(storage: ObjectStorage): Promise<number> {
  await storage.put("media/x.png", new Uint8Array([1]), {
    httpMetadata: { contentType: "image/png" },
  });
  const head = await storage.head("media/x.png");
  const body = await storage.get("media/x.png");
  const bytes = body ? await body.arrayBuffer() : new ArrayBuffer(0);
  await storage.delete("media/x.png");
  const listed = await storage.list({ prefix: "media/" });
  return (head?.size ?? 0) + bytes.byteLength + listed.objects.length;
}
void probe;
`,
    "utf8",
  );

  const tsconfigPath = join(workDir, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022"],
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          noUncheckedIndexedAccess: true,
          allowImportingTsExtensions: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
        },
        files: [assertionPath.replace(/\\/g, "/"), typesPath.replace(/\\/g, "/")],
      },
      null,
      2,
    ),
    "utf8",
  );

  const require = createRequire(import.meta.url);
  const tsManifestPath = require.resolve("typescript/package.json", {
    paths: [appRoot, repoRoot],
  });
  const tscBin = join(dirname(tsManifestPath), "bin", "tsc");
  const tscResult = spawnSync(process.execPath, [tscBin, "-p", tsconfigPath], {
    cwd: workDir,
    encoding: "utf8",
    shell: false,
  });
  const tscOutput = `${tscResult.stdout ?? ""}${tscResult.stderr ?? ""}`.trim();
  check(
    "Cloudflare `R2Bucket` satisfies `ObjectStorage` and composes as a provider without a cast",
    tscResult.status === 0,
    tscOutput.slice(0, 1500),
  );
} catch (error) {
  console.error(`\nStorage foundation tests aborted: ${error?.stack ?? error}`);
  failures.push(`unexpected error: ${error?.message ?? error}`);
} finally {
  if (platform) {
    await platform.dispose();
    console.log("\nDisposed the local R2 platform proxy.");
  }
  if (workDir && existsSync(workDir)) {
    rmSync(workDir, { recursive: true, force: true });
    console.log(`Removed temporary storage workspace: ${workDir}`);
  }
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Storage foundation tests passed.");
