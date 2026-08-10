/**
 * The three console filter must hide exactly one message and nothing else.
 *
 * This is the assertion the workaround stands or falls on. Suppressing a
 * dependency's deprecation notice is defensible; suppressing three's warnings
 * in general is not, because the next one might be about something this code
 * does wrong. So the test drives three's own `warn`/`error` and checks what
 * reaches the console.
 *
 * Written against the real module and the real `three`, not a mock of either:
 * a mock would prove that the code I wrote does what I wrote, which is not the
 * question.
 */

import { error, warn } from "three";

import { silenceKnownThreeWarning } from "../src/components/three/silence-known-three-warning.ts";

let failures = 0;

function check(label, condition) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failures += 1;
}

/** Runs `body` with the console captured, and returns what it emitted. */
function capture(body) {
  const seen = [];
  const original = { warn: console.warn, error: console.error, log: console.log };
  console.warn = (...args) => seen.push(["warn", args]);
  console.error = (...args) => seen.push(["error", args]);
  console.log = (...args) => seen.push(["log", args]);
  try {
    body();
  } finally {
    Object.assign(console, original);
  }
  return seen;
}

console.log("three console filter");

silenceKnownThreeWarning();

// 1. The one message it exists to hide.
const silenced = capture(() => {
  warn("Clock: This module has been deprecated. Please use THREE.Timer instead.");
});
check("the Clock deprecation is not printed", silenced.length === 0);

// 2. Any other three warning must still arrive, at warning level, intact.
const passedThrough = capture(() => {
  warn("WebGLRenderer: a real problem with this page");
});
check("an unrelated three warning is still printed", passedThrough.length === 1);
check(
  "and at warning level",
  passedThrough[0]?.[0] === "warn",
);
check(
  "and keeps three's own prefix and text",
  String(passedThrough[0]?.[1]?.[0] ?? "").includes(
    "THREE.WebGLRenderer: a real problem with this page",
  ),
);

// 3. Errors are never touched. A filter that downgraded or dropped one would
//    be far worse than the warning it was installed to hide.
const errors = capture(() => {
  error("WebGLRenderer: context lost");
});
check("a three error is still printed", errors.length === 1);
check("and at error level", errors[0]?.[0] === "error");

// 4. A near miss must not be swallowed. The match is exact for this reason:
//    the next deprecation should be seen, not inherited by this workaround.
const nearMiss = capture(() => {
  warn("Timer: This module has been deprecated. Please use something else instead.");
});
check("a different deprecation is still printed", nearMiss.length === 1);

// 5. Installing twice must not chain one handler into the other.
silenceKnownThreeWarning();
const afterSecondInstall = capture(() => {
  warn("WebGLRenderer: a real problem with this page");
});
check(
  "installing twice prints the message once, not twice",
  afterSecondInstall.length === 1,
);

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log("\nall passed");
