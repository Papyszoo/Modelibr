---
name: design-system
description: Modelibr design system — the --mod-* token vocabulary, the shared primitive catalog (feedback states, ListHeader, ListToolbar, asset tiles) with import paths, the card/page visual identity rules, Storybook gallery + light/dark themes, and the known drift to never copy. Use when styling anything, writing CSS, building or editing UI components, or adding Storybook stories under src/frontend.
---

# Design system

Goal: **every page looks like part of the same application.** The Models tab
is the design identity other tabs follow. The mechanism is (1) tokens instead
of raw values, (2) shared primitives instead of per-feature copies. Both
exist; historical code predates them — new/edited code must not add to the
drift (prompts 13/18/20 dismantle it).

## Standardize first — discuss the component before building it

The core failure mode this project fights (user-stated, 2026-07-04): agents
**duplicate and reinvent instead of making a standard and using React's
biggest power — components.** Every hand-rolled empty state, drag handler,
and category UI in this codebase is that failure fossilized. The rule:

1. **Search before writing.** Check the primitive catalog below, then grep
   `src/shared/` — the thing you need probably exists or almost exists.
2. **Almost fits? Grow the primitive, don't fork it.** A new prop/slot on
   the shared component (like `CategoryTreePanel.onCreateCategory` /
   `onRenameCategory` / `onDeleteCategory`) beats a local copy every time.
   Change it in its one home so every consumer inherits the improvement.
3. **Nothing fits? STOP — propose the standard before implementing.**
   Bring the user a short design discussion, not a diff:
   - the proposed component's API sketch (props/slots, one paragraph);
   - which **existing** screens would adopt it (a standard with one
     consumer is just a private component in a shared folder);
   - which **queued prompts** (`.claude/prompts/`) would reuse it — and
     which would strain or break it (e.g. does prompt 18's generic page
     consume this? does prompt 10's rigs type fit this card?);
   - what it deliberately does NOT do.
   Get agreement, then build it with a story + gallery entry.
4. **One-off truly local UI** (a layout div, a feature-specific panel) —
   build it in the feature, but any second occurrence anywhere makes it a
   candidate for rule 3.

Fixing a bug in a pattern? Grep for the pattern's clones first — the same
bug usually lives in every copy (a drop-affordance-on-hover bug was fixed
in ModelGrid and lived on in EnvironmentMapList for months).

## Density — this is an application, not a website

Modelibr is a dense desktop tool. The recurring agent failure mode is
website styling: hero-sized headers, generous section padding, nested
"card in card in padded page" framing. User-stated direction: *"no
fireworks — only clean, useful app"*. Concretely:

- Headers/toolbars: vertical padding ≤ `--mod-space-sm` (12px); the largest
  text in the whole app is 1.5rem (`--mod-text-2xl`) and there is
  deliberately no bigger token. Default UI text is `--mod-text-sm`.
- Page/section padding tops out at `--mod-space-md` (16px). `lg`+ spacing is
  for empty states and dialog chrome only — never anything that repeats.
- Don't stack padding: page pad + framed card + inner pad = wasted space
  (the scripts page shipped this way and was cut back — don't reintroduce).
- No decorative wrappers: content sits flat on `--surface-ground`; a
  1px `--surface-border` separator beats a framed card almost always.

See it live: `npm run design` (root or `src/frontend`) opens Storybook
directly on **Design System / Gallery** — the full token vocabulary and
primitive set on one page; the toolbar paintbrush switches light/dark for
any story.

## Live design loop — agents verify by looking

Vite HMR makes the gallery the live view of the design system: with
`npm run design` running, any edit to `tokens.css`, a primitive, or its CSS
hot-reloads in the open browser in under a second — the user watches changes
land in real time.

**Agent rule: never claim a styling change works without having seen it.**
Builds passing is not visual evidence. Screenshot the gallery (and any
directly affected story) after the change and read the image:

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

Shoot both `--dark` and `--light`. This loop is what catches the bug classes
below — it found both on the day the gallery was built.

For **page-level** changes (migrating a page onto the design system), use the
before/after harness instead: `npm run design:snap -- --label before-x`,
make the change, `npm run design:snap -- --label after-x`, then
`npm run design:compare -- before-x after-x` and read the shots plus give
the user the compare HTML (`test-report/design-review/`). Every unification
slice ships with a before/after the user can review.

## Tokens — `src/shared/styles/tokens.css`

`--mod-*` variables layered on the PrimeReact Lara theme (light/dark both
flow through). Rules:

- **Color:** never hardcode hex/rgb in feature CSS or inline styles — use a
  `--mod-color-*` token; raw PrimeReact vars (`--surface-*`, `--text-color*`,
  `--primary-*`) are acceptable where no `--mod` alias exists. Exceptions
  (three.js scene colors = content, not chrome) get a comment. Sweep + lint
  gate is prompt 20; don't add to the pile.
- **Selection rings / hover tints:** `rgba(var(--primary-color-rgb), …)` —
  the triplet is defined in tokens.css; don't redefine it.
- **Spacing / radius / z-index / motion / shadows:** use the `--mod-space-*`,
  `--mod-radius-*`, `--mod-z-*`, `--mod-transition-*`, `--mod-shadow-*`
  scales. No new magic z-indexes.
- **Type scale:** `--mod-text-xs` (0.75) / `sm` (0.875, the default) / `md`
  (1) / `lg` (1.125) / `xl` (1.25, tab titles) / `2xl` (1.5, page-title
  ceiling — no 3xl exists on purpose). TRAP — the codebase has eight ad-hoc
  "small" sizes (0.7/0.8/0.813/0.82/0.85/0.9…); never add another. Small
  text is `sm` or `xs`, full stop. Weights via `--mod-font-weight-*`.
- **Breakpoints:** CSS vars can't be used in `@media`; use the TS constants
  in `shared/styles/breakpoints.ts` for runtime checks and write media
  queries matching the documented `--mod-bp-*` values.

## Primitive catalog — use these, don't hand-roll

Barrel: `@/shared/components` (feedback + layout + overlay re-exported).

| Need | Use | Never |
|---|---|---|
| Empty list / no results | `EmptyState` (variants `default`/`compact`, drop-target props) | a new `.x-empty` class — 19 hand-rolled variants exist; that's the disease |
| Load failure | `ErrorState` (`block`/`inline`, `onRetry`) | ad-hoc error divs |
| Loading | `LoadingState` (`block`/`inline`) | one-off spinners |
| Page/tab title row | `ListHeader` (`page`=h1 / `tab`=h2, stats + actions slots) | per-feature `*-list-header` CSS |
| Search/filter/actions bar | `ListToolbar*` family (`@/shared/components/list-toolbar`) | bespoke toolbar rows |
| Asset card + grid | `AssetGrid`, `AssetTile`, `AssetTilePlaceholder`, `AddTile` (`@/shared/components/asset-tile`) | copying `.model-card` / `.sound-card` CSS |
| Modal | `Dialog` (overlay wrapper, sizes) | raw PrimeReact Dialog with custom chrome |
| Tag editing | `TagInput` (`@/shared/components/tags`) | new chip UIs |
| Card size control | `CardWidthSlider` | duplicate sliders |
| Category sidebar/filter | `CategoryTreePanel` (`@/shared/components/categories`) | per-page trees or re-styled copies |

**Categories standard** (user-set, from the scripts page): the quiet
`CategoryTreePanel` default — transparent background sitting directly on the
page surface (**no** card frame or own background behind it), tight
0.3rem-padded rows, hover = `--surface-hover`, selection = primary *tint*
(`rgba(var(--primary-color-rgb), 0.12)` + 0.24 border), never solid primary.
A `border-right` separates a sidebar from the grid. `compact` prop = framed
variant for dialogs only. Management (user-set, 2026-07-06): everything
happens **in the tree** — an "All" bucket above "Unassigned", and
add/add-subcategory/rename/delete via the right-click context menu with an
inline name editor (no manager dialog, no toolbar "Add Category" button, no
hover icon buttons, no empty-state text). Wire it via the panel's
`onCreateCategory`/`onRenameCategory`/`onDeleteCategory` props; sentinel ids
+ `isRealCategoryId` live in `@/shared/types/categories` — never send a
sentinel id to the backend as a real categoryId (upload-while-All bug
class). Deleting recursively removes the branch; assets become
uncategorized (backend `CategoryCommandHandlers.DeleteAsync`).

**Card identity** (encoded in `AssetTile.css` — change it there or nowhere):
radius `--mod-radius-lg`, shadow `--mod-shadow-sm`, hover lift
`--asset-card-hover-lift` (-4px) with `--mod-transition-fast`, name in the
bottom `--asset-card-overlay-gradient` overlay. TRAP — legacy cards drift
three ways (`scale(1.02)`/0.3s vs `translateY(-2px)`/0.2s vs the tile); when
touching one, migrate it to `AssetTile` rather than tuning its copy.

Shared primitives stay **dumb and composable** — no asset-type awareness, no
data fetching; callers pass nodes/handlers. New shared UI goes in
`src/shared/components/` (never legacy root `src/components` — prompt 36).
A primitive's classes are styled in **its own** CSS file — never rely on
another component's stylesheet happening to be loaded (the gallery renders
primitives in isolation and exposes such leaks; ListToolbarSearchInput
shipped one).

## Known drift — grandfathered, not a template

The six list pages (`ModelList`, `SoundList`, `SpriteList`, `PackList`,
`ScriptList`, `TextureSetList`, plus `ProjectList`) predate the primitives:
four different header designs, h1-vs-h2 drift, per-feature empty states and
cards. This is queued debt (prompt 18 replaces them with a generic
descriptor-driven page; prompt 13 consolidates primitives). **Never copy an
existing `XList.tsx`/`XList.css` as a starting point.** When editing one,
swap the section you touch to the shared primitive.

## Storybook — the visual contract

- Every shared primitive ships a `*.stories.tsx` next to it (see
  `EmptyState.stories.tsx` for the house style: `Meta`/`StoryObj`, `title:
  'Shared/<Area>/<Name>'`, `tags: ['autodocs']`).
- **Design System / Gallery** (`src/shared/design-system/`) renders all
  tokens + primitives on one page, with explicit `Dark` and `Light` stories —
  one snapshot shows the whole family, so a primitive that stops matching its
  siblings is visible at a glance. **Extend the gallery when adding a token
  or primitive.**
- Light/dark: the preview toolbar `theme` global swaps the Lara theme
  stylesheet exactly like the app's `useTheme` hook (managed `<link>` +
  `color-scheme`). Story-level `globals: { theme: 'light' }` pins a story to
  a mode (that's how the gallery variants work). Don't reintroduce a static
  theme import in `.storybook/preview.ts`.
- The `storybook-visual` suite screenshots **every story** (run:
  `npm run test:all -- --only=storybook-visual --yes --no-open`; baselines
  are machine-local, refresh with `npm run test-storybook:update`). It is
  non-gating and has rotted before — CLAUDE.md rule 10: grep it when
  changing shared UI.

## PrimeReact traps (visual state that silently doesn't render)

PrimeReact fails soft: a prop of the wrong *shape* renders fine with the
state feature dead — no error, no type failure in some cases. Known cases:

- `Tree selectionMode="single"` takes `selectionKeys` as a **string** (the
  key) — the `{ key: true }` map is only for multiple/checkbox modes; passing
  it means selection never highlights (shipped bug, found by the gallery).
- `Tree expandedKeys` without `onToggle` is **uncontrolled after mount** —
  the prop seeds internal state once and later updates are ignored, so a
  node that gains its first child stays collapsed no matter what you pass.
  Provide `onToggle` (fully controlled) when expansion must react to data
  (found by e2e: the category inline-create placeholder never showed under
  a childless parent; jsdom tests missed it because their parent already
  had a child).
- Disabled state renders as the `p-disabled` **class**, not
  `aria-disabled`/`disabled` attributes (known from the e2e suite).
- Overlay components (Dropdown panels, Dialogs) portal to `document.body` —
  styling them via a parent's CSS scope silently misses (see
  `frontend-test-authoring` for the testing side).

When a selection/highlight/disabled/expanded state doesn't show: suspect the
prop shape first, and verify the state visually in the gallery — that's what
it's for. Found a new one? Add it to this list in the same session.

## Verify

`cd src/frontend && npm test && npm run lint && npm run format:check && npm run build`
plus the storybook-visual suite when shared styles/primitives moved — and
the screenshot loop above for anything visual.
