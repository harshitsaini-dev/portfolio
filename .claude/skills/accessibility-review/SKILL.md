---
name: accessibility-review
description: Use when building or reviewing any UI in apps/web or apps/admin. Covers responsive layout, semantic HTML, keyboard access, focus visibility, contrast, and reduced-motion requirements.
---

# Accessibility Review

All UI in `apps/web` and `apps/admin` must meet these baseline
requirements:

- **Responsive**: usable and legible from mobile (~375px) through desktop
  (1280px+) widths.
- **Semantic HTML**: use the correct element for the job (`<button>` for
  actions, `<nav>`, `<main>`, heading hierarchy, etc.) instead of generic
  `<div>`s with click handlers.
- **Keyboard access**: every interactive element must be reachable and
  operable via keyboard (Tab/Shift+Tab/Enter/Space), in a sensible order.
- **Focus visibility**: never remove focus outlines without providing an
  equally visible custom focus style.
- **Contrast**: text and interactive elements must meet WCAG AA contrast
  minimums in both light and dark presentation if both are supported.
- **Reduced motion**: any animation (including future Three.js/Motion
  work) must respect `prefers-reduced-motion` and offer a static/reduced
  fallback.
- **3D enhances, never replaces**: when 3D scenes are introduced in a
  future phase, all information and navigation they convey must remain
  available through accessible, non-3D UI. 3D is decorative/enhancing, not
  the only path to content or functionality.

Verify with real browser interaction (Playwright MCP) when available —
tab through the page and check focus visibility — rather than assuming
compliance from markup alone. See testing-playwright skill.
