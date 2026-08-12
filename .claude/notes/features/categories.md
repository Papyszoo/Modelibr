# Category sidebar - the standard, and the traps it taught

Shipped 2026-07-06/10 across **all six** asset types. Prompt 18's generic
`AssetLibraryPage` should consume this standard.

## The standard

All category management moved **into** the shared `CategoryTreePanel`:

- **Right-click context menu** - "Add category" on background/buckets;
  "Add subcategory / Rename / Delete" on a node.
- **Inline name editor in the tree** (Enter or blur commits, Escape cancels).
- **"All" bucket** above Unassigned (sentinel `ALL_CATEGORIES_ID = -2`), now the
  default view. The "No categories yet." empty state and the `renderNodeActions`
  prop were removed.
- **Single-select** (multi-category filtering was dropped, user-approved). Other
  toolbar filters stay and combine with the one active category.
- **Categories toolbar toggle** (pi-folder `ListToolbarButton`, default open) plus
  a **"1" filter badge** whenever a real category or Unassigned is active - so a
  filtered list is obvious when the sidebar is collapsed.
- Backend `CategoryCommandHandlers.DeleteAsync` does a **recursive branch delete**,
  children-first. Asset FKs are `SetNull`, so assets become uncategorized - the
  confirm dialog spells out subcategory and asset counts. Demo MSW mirrors this.
- Legacy `*CategoryManagerDialog`s are fully removed - management is
  sidebar-tree-only everywhere.
- Six `use*CategoryMutations` clones were collapsed into one shared factory in
  `src/frontend/src/shared/hooks/`.

**Why:** the user found the manager dialog + parent dropdown confusing and wanted
everything doable in the tree.

## Per-type specifics

- **Models** - sidebar shows only when `!isContainerContext` (the standalone
  Models tab, not embedded pack/project/texture grids); cards are `draggable` only
  there.
- **Texture sets** - categories stay **per-kind**; `createTextureSetCategory`
  needs `kind` in the request. Universal and ModelSpecific never mix; moves skip
  `ModelOwned`.
- **Env maps** - cards became draggable (they weren't).
- Category scoping is **server-side** for models/textures/env-maps (a single
  `categoryIds` element when real, an `uncategorized` param for the Unassigned
  bucket). Sidebar count badges are true totals from `Get*CategoryCountsQuery` +
  `GetCategoryAssetCountsAsync` + `/…-categories/counts` endpoints. Sounds,
  scripts and sprites still count client-side - pre-existing debt, not extended.

## Traps worth remembering

1. **Sentinel ids must never reach the backend as `categoryId`.** Guard with
   `isRealCategoryId` from `@/shared/types/categories`. Upload hooks broke when the
   default view became All (-2); only e2e caught it.
2. **PrimeReact `Tree` `expandedKeys` without `onToggle` ignores prop updates after
   mount.** Documented in the `primereact-traps` skill.
3. **E2E category rows must be exact-matched.** `filter({ hasText })` is a
   substring match - "Test Category" matched "Assign Test Category" and renamed the
   wrong row. Use
   `filter({ has: page.getByText(name, { exact: true }) })`.
4. **Move mutations must PRESERVE tags and description.**
   `updateModelTags` / `updateEnvironmentMapMetadata` / `updateTextureSet` replace
   the full set.
5. **`vite build` does NOT typecheck**, and the repo has ~180 pre-existing tsc
   errors - `tsc --noEmit` is only useful *relative to a baseline*. Sprites got
   folded into this work because the panel's API change would otherwise have
   broken them silently.

## The big one: any list → sidebar+main refactor moves the scroll container

The `<sidebar> + <main>` split (a) narrows the VirtuosoGrid to fewer columns so
cards past the first rows virtualize out, and (b) **moves the scroll container**
from the outer list shell to `*-list-main` (`customScrollParent` / `overflow:auto`
now live there). Page objects scrolling the OLD outer selector silently scrolled a
non-scrolling element - 9 scenarios broke from this one cause.

Fix: shared helper `tests/e2e/helpers/reveal-virtualized-card.ts` scrolls
`.model-grid-main` / `.texture-set-list-main` / `.environment-map-list-main` until
the card is in the DOM. **Update every e2e virtualization scroll to target the
inner `*-main`.**

## E2E lessons from four verification rounds

Each round was found only by a *wider* run than the last:

- **Round 1 (`--no-deps` isolated):** the scroll-container class above.
- **Round 2 (isolated runs missed it):** after an upload, the floating **"File
  Uploads" progress window** (`.upload-progress-window`, dismiss via
  `UploadProgressPage.closeWindowIfVisible()`) overlays the grid, and the narrower
  sidebar-open layout shifts cards **under** the centred panel. A dblclick or
  right-click behind it is never actionable and hangs to the 90 s timeout - the
  symptom is `toBeVisible` passing while the click never resolves. **Any
  upload→click-a-card flow must dismiss the panel first.**
- **Round 3 (full `run-e2e.js`, 268 passed / 2 failed):** (a) a Given verified its
  card by id with no reveal while its siblings narrowed by name → added
  scroll-reveal; (b) **dock tab-dedup** - once the first model viewer is open, its
  `frameloop=always` canvas starves the main thread under software WebGL, so
  Playwright's actionability wait on the second dblclick never resolves. Fix =
  `dblclick({ force: true })`, turning a hard failure into a retry-recoverable
  flake. The residual is the app-side starvation (prompt 48), not the sidebar.
- **Round 4 (green):** the **reveal-before-load** trap - a scroll-reveal running
  right after `reload()` scrolled a still-loading list, found nothing, and the list
  settled at top. Fix = `narrowVirtualisedList(uniqueName)` like the sibling
  Givens (it waits for the count label to settle = loaded).

Final: setup/chromium/serial/slow = 254 passed, 0 failed, 3 flaky (all `@slow`
software-WebGL); later review round reached **270 passed / 0 flaky**.

**Meta-lesson: run the full `run-e2e.js` before claiming e2e green.** See
[[../testing/flakiness.md]].

## Storybook visual suite restored in the same push (prompt 51)

The suite had been **fully dark**: the loop-all-stories test gated each story on
`#storybook-root` being *visible*, and `Layout/FloatingWindow` (fixed-position
child → root collapses to a 0-width box) aborted the run at story #1, so baselines
could never regenerate.

Fix = gate on **`body.sb-show-main`** (Storybook's own ready signal; render errors
flip to `sb-show-errordisplay`, so broken stories still fail) and scale the single
test's budget by story count. The restored gate exposed two genuinely broken
stories: `TexturePreviewPanel` (no `QueryClientProvider`) and `ThumbnailDisplay`
(called `jest.spyOn` **in the browser** - it never worked; rewritten onto the MSW
story pattern).

139 baselines generated; baselines are **gitignored** (machine-local, per the
no-committed-binaries rule).

**TRAP for future stories:** any fixed-position or portal-only story breaks a
root-box readiness gate - keep the `sb-show-main` gate. And browser-side stories
can't use jest; use MSW handlers.

Related: [[../testing/flakiness.md]]
