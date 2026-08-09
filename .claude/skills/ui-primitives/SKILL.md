---
name: ui-primitives
description: Modelibr's shared UI primitive catalog with import paths (EmptyState, ListHeader, ListToolbar, AssetTile/AssetGrid, CategoryTreePanel, Dialog, TagInput), the standardize-first protocol to follow before building any new shared component, the card/categories visual identity, and the legacy list-page drift never to copy. Use when building or editing any React component under src/frontend. For raw CSS values use design-tokens.
---

# UI primitives & the standardize-first protocol

## Standardize first — discuss the component before building it

The core failure mode this project fights (user-stated, 2026-07-04): agents
**duplicate and reinvent instead of making a standard and using React's biggest
power — components.** Every hand-rolled empty state, drag handler, and category
UI in this codebase is that failure fossilized. The rule:

1. **Search before writing.** Check the catalog below, then grep `src/shared/` —
   the thing you need probably exists or almost exists.
2. **Almost fits? Grow the primitive, don't fork it.** A new prop/slot on the
   shared component (like `CategoryTreePanel.onCreateCategory` /
   `onRenameCategory` / `onDeleteCategory`) beats a local copy every time. Change
   it in its one home so every consumer inherits the improvement.
3. **Nothing fits? STOP — propose the standard before implementing.** Bring the
   user a short design discussion, not a diff:
   - the proposed component's API sketch (props/slots, one paragraph);
   - which **existing** screens would adopt it (a standard with one consumer is
     just a private component in a shared folder);
   - which **queued prompts** would reuse it — and which would strain or break it
     (e.g. does prompt 18's generic page consume this? does prompt 10's rigs type
     fit this card?);
   - what it deliberately does NOT do.

   Get agreement, then build it with a story + gallery entry.
4. **One-off truly local UI** (a layout div, a feature-specific panel) — build it
   in the feature, but any second occurrence anywhere makes it a candidate for
   rule 3.

Fixing a bug in a pattern? Grep for the pattern's clones first — the same bug
usually lives in every copy (a drop-affordance-on-hover bug was fixed in
ModelGrid and lived on in EnvironmentMapList for months).

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

## Categories standard (user-set, from the scripts page)

The quiet `CategoryTreePanel` default — transparent background sitting directly
on the page surface (**no** card frame or own background behind it), tight
0.3rem-padded rows, hover = `--surface-hover`, selection = primary *tint*
(`rgba(var(--primary-color-rgb), 0.12)` + 0.24 border), never solid primary. A
`border-right` separates a sidebar from the grid. `compact` prop = framed variant
for dialogs only.

Management (user-set, 2026-07-06): everything happens **in the tree** — an "All"
bucket above "Unassigned", and add/add-subcategory/rename/delete via the
right-click context menu with an inline name editor (no manager dialog, no
toolbar "Add Category" button, no hover icon buttons, no empty-state text). Wire
it via the panel's `onCreateCategory`/`onRenameCategory`/`onDeleteCategory` props;
sentinel ids + `isRealCategoryId` live in `@/shared/types/categories` — **never
send a sentinel id to the backend as a real categoryId** (upload-while-All bug
class). Deleting recursively removes the branch; assets become uncategorized
(backend `CategoryCommandHandlers.DeleteAsync`).

## Card identity

Encoded in `AssetTile.css` — change it there or nowhere: radius
`--mod-radius-lg`, shadow `--mod-shadow-sm`, hover lift
`--asset-card-hover-lift` (-4px) with `--mod-transition-fast`, name in the bottom
`--asset-card-overlay-gradient` overlay. TRAP — legacy cards drift three ways
(`scale(1.02)`/0.3s vs `translateY(-2px)`/0.2s vs the tile); when touching one,
migrate it to `AssetTile` rather than tuning its copy.

## Rules for shared components

Shared primitives stay **dumb and composable** — no asset-type awareness, no data
fetching; callers pass nodes/handlers. New shared UI goes in
`src/shared/components/` (never legacy root `src/components` — prompt 36). A
primitive's classes are styled in **its own** CSS file — never rely on another
component's stylesheet happening to be loaded (the gallery renders primitives in
isolation and exposes such leaks; ListToolbarSearchInput shipped one).

Dashed borders are only for `AddTile` and active drag-over overlays — never a
plain hover affordance.

## Known drift — grandfathered, not a template

The six list pages (`ModelList`, `SoundList`, `SpriteList`, `PackList`,
`ScriptList`, `TextureSetList`, plus `ProjectList`) predate the primitives: four
different header designs, h1-vs-h2 drift, per-feature empty states and cards.
This is queued debt (prompt 18 replaces them with a generic descriptor-driven
page; prompt 13 consolidates primitives). **Never copy an existing
`XList.tsx`/`XList.css` as a starting point.** When editing one, swap the section
you touch to the shared primitive.

Still-pending unification: Projects/Packs **entry lists** still use the legacy
`FilterPanel` + `CardWidthSlider` instead of `ListToolbar`, and
`ProjectList.css`/`PackList.css` are duplicates.
