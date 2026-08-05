---
name: threejs-performance
description: Reference for future Three.js/React Three Fiber 3D scene work. Not applicable to Phase 1A — use only if explicitly asked to start 3D implementation.
---

# Three.js / R3F Performance (Not Yet Implemented)

**Status: NOT YET IMPLEMENTED.** No Three.js, React Three Fiber (R3F), or
Motion dependency exists in this repository yet. This skill documents
guardrails for when that work begins in a future phase — it is not
authorization to add these dependencies now.

## Guardrails for the future 3D phase

- 3D scenes must enhance the portfolio, never gate access to core content
  or navigation — everything must remain reachable via accessible HTML/CSS
  (see accessibility-review skill).
- Respect `prefers-reduced-motion`: provide a static or significantly
  reduced-motion fallback scene/state.
- Lazy-load 3D scene code (dynamic import, client-only) so it never blocks
  or bloats the initial page load for users who don't interact with it.
- Dispose of Three.js resources (geometries, materials, textures, renderer)
  on unmount to avoid memory leaks across client-side navigation.
- Keep draw calls, triangle counts, and texture sizes deliberately modest;
  profile before adding visual complexity.
- Prefer instancing/shared materials over duplicating objects when a scene
  has repeated elements.
- Any 3D work must still pass lint/typecheck/build and real browser
  verification (Playwright MCP) before being considered done.
