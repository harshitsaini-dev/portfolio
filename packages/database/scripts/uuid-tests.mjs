/**
 * UUIDv7 verification.
 *
 * `uuidV7` is production infrastructure — every row id in the system comes
 * from it — and it is hand-written rather than taken from a package, so it
 * needs direct proof rather than incidental coverage from repository tests
 * that only check ids are distinct strings.
 *
 * Asserts the parts of RFC 9562 §5.7 that matter: canonical formatting, the
 * version nibble, the variant bits, exact big-endian encoding of the
 * 48-bit millisecond timestamp, and uniqueness within a single millisecond.
 */

import { uuidV7 } from "../src/runtime.ts";

const failures = [];
let checks = 0;

function check(description, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${description}`);
  } else {
    console.log(`  FAIL  ${description}${detail ? ` — ${detail}` : ""}`);
    failures.push(description);
  }
}

function equal(description, actual, expected) {
  check(
    description,
    Object.is(actual, expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

console.log("UUIDv7\n");

// ---- Format ---------------------------------------------------------------
const CANONICAL =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const sample = uuidV7();
check("canonical 8-4-4-4-12 lowercase hex format", CANONICAL.test(sample), sample);
equal("total length is 36 characters", sample.length, 36);

// ---- Version and variant --------------------------------------------------
equal("version nibble is 7", sample[14], "7");

const variantNibble = parseInt(sample[19], 16);
check(
  "RFC 9562 variant bits are 10xx (nibble in 8..b)",
  variantNibble >= 0x8 && variantNibble <= 0xb,
  `got '${sample[19]}'`,
);

// Hold across many samples, not just one lucky draw.
let formatHolds = true;
let versionHolds = true;
let variantHolds = true;
for (let i = 0; i < 1000; i += 1) {
  const id = uuidV7();
  if (!CANONICAL.test(id)) formatHolds = false;
  if (id[14] !== "7") versionHolds = false;
  const nibble = parseInt(id[19], 16);
  if (!(nibble >= 0x8 && nibble <= 0xb)) variantHolds = false;
}
check("format holds across 1000 samples", formatHolds);
check("version nibble holds across 1000 samples", versionHolds);
check("variant bits hold across 1000 samples", variantHolds);

// ---- Timestamp encoding ---------------------------------------------------
//
// The first 48 bits are the Unix millisecond timestamp, big-endian. With an
// injected timestamp the expected prefix is exact.
function timestampPrefix(millis) {
  return millis.toString(16).padStart(12, "0");
}

function extractPrefix(id) {
  return (id.slice(0, 8) + id.slice(9, 13)).toLowerCase();
}

const cases = [
  { label: "epoch zero", millis: 0 },
  { label: "a known date (2026-08-06T00:00:00Z)", millis: Date.UTC(2026, 7, 6) },
  { label: "a value with high bits set", millis: 0x0123456789ab },
  { label: "the maximum 48-bit value", millis: 0xffffffffffff },
];

for (const { label, millis } of cases) {
  const id = uuidV7(millis);
  equal(
    `timestamp encodes correctly — ${label}`,
    extractPrefix(id),
    timestampPrefix(millis),
  );
  check(`still valid format — ${label}`, CANONICAL.test(id), id);
  equal(`still version 7 — ${label}`, id[14], "7");
}

// Decoding the prefix back must recover the exact input.
const roundTripMillis = Date.UTC(2026, 0, 2, 3, 4, 5, 678);
const roundTripId = uuidV7(roundTripMillis);
equal(
  "timestamp round-trips through the id",
  parseInt(extractPrefix(roundTripId), 16),
  roundTripMillis,
);

// ---- Ordering -------------------------------------------------------------
const earlier = uuidV7(1_000_000_000_000);
const later = uuidV7(2_000_000_000_000);
check(
  "ids from later timestamps sort lexicographically after earlier ones",
  earlier < later,
  `${earlier} !< ${later}`,
);

// ---- Uniqueness within a single millisecond -------------------------------
//
// The 74 random bits after the timestamp are what keep same-millisecond ids
// apart; a collision here would mean rows silently overwriting each other.
const fixedMillis = Date.UTC(2026, 7, 6, 12, 0, 0, 0);
const sameMillisecond = new Set();
const SAME_MS_COUNT = 10_000;
for (let i = 0; i < SAME_MS_COUNT; i += 1) {
  sameMillisecond.add(uuidV7(fixedMillis));
}
equal(
  `${SAME_MS_COUNT} ids generated in the same millisecond are all distinct`,
  sameMillisecond.size,
  SAME_MS_COUNT,
);

const sharedPrefix = timestampPrefix(fixedMillis);
check(
  "same-millisecond ids share the timestamp prefix",
  [...sameMillisecond].every((id) => extractPrefix(id) === sharedPrefix),
);

// And without an injected timestamp, in a tight loop that will land inside
// one millisecond many times over.
const natural = new Set();
for (let i = 0; i < 20_000; i += 1) natural.add(uuidV7());
equal("20000 ids generated back-to-back are all distinct", natural.size, 20_000);

// ---- Randomness sanity ----------------------------------------------------
//
// A broken RNG (all zeroes, or a constant) would still pass the format
// checks above, so assert the random section actually varies.
const randomSections = new Set();
for (let i = 0; i < 500; i += 1) {
  randomSections.add(uuidV7(fixedMillis).slice(15));
}
check(
  "the random section varies across samples",
  randomSections.size >= 495,
  `only ${randomSections.size} distinct sections in 500 samples`,
);
check(
  "the random section is not all zeroes",
  ![...randomSections].some((section) => /^0+$/.test(section.replace(/-/g, ""))),
);

console.log(`\n${checks - failures.length}/${checks} checks passed`);

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("UUIDv7 tests passed.");
