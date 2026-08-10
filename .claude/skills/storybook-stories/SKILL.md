---
name: storybook-stories
description: Modelibr Storybook conventions — story house style, the Design System / Gallery, light/dark theme globals, the storybook-visual baseline suite, and the screenshot loop agents must run before claiming any visual change works. Use when adding or editing *.stories.tsx, changing the gallery, or verifying that a styling change actually renders.
---

# Storybook & visual verification

## Agents verify by looking

Vite HMR makes the gallery the live view of the design system: with
`npm run design` running, any edit to `tokens.css`, a primitive, or its CSS
hot-reloads in the open browser in under a second — the user watches changes land
in real time.

**Never claim a styling change works without having seen it.** Builds passing is
not visual evidence. Screenshot the gallery (and any directly affected story)
after the change and read the image:

```js
// node --input-type=module -e "..." from src/frontend (Playwright is a dep)
// against `npm run design` (port 6006) or a served `build-storybook` output.
const page = await (await chromium.launch()).newPage()
await page.goto(
  'http://localhost:6006/iframe.html?id=design-system-gallery--dark&viewMode=story',
  { waitUntil: 'networkidle' }
)
await page.screenshot({ path: '<scratchpad>/gallery.png', fullPage: true })
```

Shoot both `--dark` and `--light`. This loop is what catches the PrimeReact
soft-fail bug classes in `primereact-traps` — it found two on the day the gallery
was built.

For **page-level** changes (migrating a page onto the design system), use the
before/after harness instead: `npm run design:snap -- --label before-x`, make the
change, `npm run design:snap -- --label after-x`, then
`npm run design:compare -- before-x after-x` and read the shots plus give the user
the compare HTML (`test-report/design-review/`). Every unification slice ships
with a before/after the user can review.

## Story conventions

- Every shared primitive ships a `*.stories.tsx` next to it (see
  `EmptyState.stories.tsx` for the house style: `Meta`/`StoryObj`,
  `title: 'Shared/<Area>/<Name>'`, `tags: ['autodocs']`).
- **Design System / Gallery** (`src/shared/design-system/`) renders all tokens +
  primitives on one page, with explicit `Dark` and `Light` stories — one snapshot
  shows the whole family, so a primitive that stops matching its siblings is
  visible at a glance. **Extend the gallery when adding a token or primitive.**
- Light/dark: the preview toolbar `theme` global swaps the Lara theme stylesheet
  exactly like the app's `useTheme` hook (managed `<link>` + `color-scheme`).
  Story-level `globals: { theme: 'light' }` pins a story to a mode (that's how the
  gallery variants work). Don't reintroduce a static theme import in
  `.storybook/preview.ts`.

## The storybook-visual suite

Screenshots **every story**. Run:
`npm run test:all -- --only=storybook-visual --yes --no-open`; baselines are
machine-local and gitignored, refresh with `npm run test-storybook:update`.

It is **non-gating and has rotted before** — AGENTS.md rule 10: grep it when
changing shared UI.

TRAPs learned when it was restored:

- The suite was fully dark for months because the loop-all-stories test gated each
  story on `#storybook-root` being *visible*, and a fixed-position or portal-only
  story (Layout/FloatingWindow) collapses that root to a 0-width box — aborting the
  run at story #1 so baselines could never regenerate. **Keep the
  `body.sb-show-main` gate** (Storybook's own ready signal; render errors flip to
  `sb-show-errordisplay`, so broken stories still fail).
- Scale the single test's timeout budget by story count — a default 30s dies a
  third of the way through the catalog.
- **Browser-side stories can't use jest.** A story calling `jest.spyOn` never
  worked; use the MSW story pattern. Stories rendering hooks that need providers
  need them wired in the story (TexturePreviewPanel shipped without a
  `QueryClientProvider`).
