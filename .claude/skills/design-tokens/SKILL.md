---
name: design-tokens
description: Modelibr's --mod-* token vocabulary (color, spacing, radius, z-index, motion, type scale, breakpoints) and the density rules that keep the UI a dense desktop app rather than a website. Use when writing or editing any CSS, inline styles, or spacing/typography decisions under src/frontend. For picking a shared component use ui-primitives.
---

# Design tokens & density

Goal: **every page looks like part of the same application.** The Models tab is
the design identity other tabs follow. Mechanism: tokens instead of raw values
(here) plus shared primitives instead of per-feature copies (`ui-primitives`).
Historical code predates both — new/edited code must not add to the drift
(prompts 13/18/20 dismantle it).

## Density — this is an application, not a website

Modelibr is a dense desktop tool. The recurring agent failure mode is website
styling: hero-sized headers, generous section padding, nested "card in card in
padded page" framing. User-stated direction: *"no fireworks — only clean, useful
app"*. Concretely:

- Headers/toolbars: vertical padding ≤ `--mod-space-sm` (12px); the largest text
  in the whole app is 1.5rem (`--mod-text-2xl`) and there is deliberately no
  bigger token. Default UI text is `--mod-text-sm`.
- Page/section padding tops out at `--mod-space-md` (16px). `lg`+ spacing is for
  empty states and dialog chrome only — never anything that repeats.
- Don't stack padding: page pad + framed card + inner pad = wasted space (the
  scripts page shipped this way and was cut back — don't reintroduce).
- No decorative wrappers: content sits flat on `--surface-ground`; a 1px
  `--surface-border` separator beats a framed card almost always.

## Tokens — `src/shared/styles/tokens.css`

`--mod-*` variables layered on the PrimeReact Lara theme (light/dark both flow
through). Rules:

- **Color:** never hardcode hex/rgb in feature CSS or inline styles — use a
  `--mod-color-*` token; raw PrimeReact vars (`--surface-*`, `--text-color*`,
  `--primary-*`) are acceptable where no `--mod` alias exists. Exceptions
  (three.js scene colors = content, not chrome) get a comment. Sweep + lint gate
  is prompt 20; don't add to the pile.
- **Selection rings / hover tints:** `rgba(var(--primary-color-rgb), …)` — the
  triplet is defined in tokens.css; don't redefine it.
- **Spacing / radius / z-index / motion / shadows:** use the `--mod-space-*`,
  `--mod-radius-*`, `--mod-z-*`, `--mod-transition-*`, `--mod-shadow-*` scales.
  No new magic z-indexes.
- **Type scale:** `--mod-text-xs` (0.75) / `sm` (0.875, the default) / `md` (1) /
  `lg` (1.125) / `xl` (1.25, tab titles) / `2xl` (1.5, page-title ceiling — no
  3xl exists on purpose). TRAP — the codebase has eight ad-hoc "small" sizes
  (0.7/0.8/0.813/0.82/0.85/0.9…); never add another. Small text is `sm` or `xs`,
  full stop. Weights via `--mod-font-weight-*`.
- **Breakpoints:** CSS vars can't be used in `@media`; use the TS constants in
  `shared/styles/breakpoints.ts` for runtime checks and write media queries
  matching the documented `--mod-bp-*` values.

## See it live

`npm run design` (root or `src/frontend`) opens Storybook directly on **Design
System / Gallery** — the full token vocabulary and primitive set on one page; the
toolbar paintbrush switches light/dark for any story. **Extend the gallery when
adding a token.** Visual verification protocol lives in `storybook-stories`.

## Verify

`cd src/frontend && npm test && npm run lint && npm run format:check && npm run build`
plus the storybook-visual suite when shared styles moved.
