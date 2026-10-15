---
name: ui-primitives
description: Modelibr's shared UI primitive catalog with import paths (EmptyState, ListHeader, ListToolbar, AssetTile/AssetGrid, CategoryTreePanel, Dialog, TagInput), the standardize-first protocol to follow before building any new shared component, the card/categories visual identity, and the legacy list-page drift never to copy. Use when building or editing any React component under src/frontend. For raw CSS values use design-tokens.
---

# UI primitives & the standardize-first protocol

## Standardize first

- **Search before writing.** Check the catalog below, then grep `src/shared/` -
  the thing you need probably exists or almost exists.
- **Almost fits? Grow the primitive, don't fork it.** A new prop/slot on the
  shared component (e.g. `CategoryTreePanel.onCreateCategory`) beats a local
  copy; change it in its one home so every consumer inherits the improvement.
- **Nothing fits? STOP - propose the standard before implementing.** Bring a
  short design discussion, not a diff: an API sketch (props/slots), which
  existing screens would adopt it, and what it deliberately does NOT do. Get
  agreement, then build it with a story + gallery entry.
- **One-off truly local UI** (a layout div, a feature-specific panel) - build it
  in the feature; any second occurrence becomes a candidate for the rule above.

Fixing a bug in a pattern? Grep for the pattern's clones first - the same bug
usually lives in every copy.

## Primitive catalog - use these, don't hand-roll

Barrel: `@/shared/components` (feedback + layout + overlay re-exported).

| Need                      | Use                                                                                            | Never                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Empty list / no results   | `EmptyState` (variants `default`/`compact`, drop-target props)                                 | a new `.x-empty` class                    |
| Load failure              | `ErrorState` (`block`/`inline`, `onRetry`)                                                     | ad-hoc error divs                         |
| Loading                   | `LoadingState` (`block`/`inline`)                                                              | one-off spinners                          |
| Page/tab title row        | `ListHeader` (`page`=h1 / `tab`=h2, stats + actions slots)                                     | per-feature `*-list-header` CSS           |
| Search/filter/actions bar | `ListToolbar*` family (`@/shared/components/list-toolbar`)                                     | bespoke toolbar rows                      |
| Asset card + grid         | `AssetGrid`, `AssetTile`, `AssetTilePlaceholder`, `AddTile` (`@/shared/components/asset-tile`) | copying `.model-card` / `.sound-card` CSS |
| Modal                     | `Dialog` (overlay wrapper, sizes)                                                              | raw PrimeReact Dialog with custom chrome  |
| Tag editing               | `TagInput` (`@/shared/components/tags`)                                                        | new chip UIs                              |
| Card size control         | `CardWidthSlider`                                                                              | duplicate sliders                         |
| Category sidebar/filter   | `CategoryTreePanel` (`@/shared/components/categories`)                                         | per-page trees or re-styled copies        |

## Categories standard

The quiet `CategoryTreePanel` default - transparent background on the page
surface (**no** card frame), tight 0.3rem rows, hover = `--surface-hover`,
selection = primary _tint_ (`rgba(var(--primary-color-rgb), 0.12)` + 0.24
border), never solid primary. A `border-right` separates a sidebar from the
grid. `compact` prop = framed variant for dialogs only.

Management happens **in the tree** - an "All" bucket above "Unassigned", and
add/add-subcategory/rename/delete via the right-click context menu with an
inline name editor (no manager dialog, no toolbar button, no hover icons).
Wire via `onCreateCategory`/`onRenameCategory`/`onDeleteCategory`; sentinel ids

- `isRealCategoryId` live in `@/shared/types/categories` - **never send a
  sentinel id to the backend as a real categoryId**. Deleting recursively removes
  the branch; assets become uncategorized.

## Card identity

Encoded in `AssetTile.css` - change it there or nowhere: radius
`--mod-radius-lg`, shadow `--mod-shadow-sm`, hover lift
`--asset-card-hover-lift` (-4px) with `--mod-transition-fast`, name in the
bottom `--asset-card-overlay-gradient` overlay. TRAP - legacy cards drift three
ways (`scale(1.02)`/0.3s vs `translateY(-2px)`/0.2s vs the tile); when touching
one, migrate it to `AssetTile` rather than tuning its copy.

## Rules for shared components

Shared primitives stay **dumb and composable** - no asset-type awareness, no
data fetching; callers pass nodes/handlers. New shared UI goes in
`src/shared/components/` (never legacy root `src/components`). A primitive's
classes are styled in **its own** CSS file - never rely on another component's
stylesheet happening to be loaded. Dashed borders are only for `AddTile` and
active drag-over overlays - never a plain hover affordance.

## Known drift - grandfathered, not a template

The six list pages (`ModelList`, `SoundList`, `SpriteList`, `PackList`,
`ScriptList`, `TextureSetList`, plus `ProjectList`) predate the primitives: four
different header designs, h1-vs-h2 drift, per-feature empty states and cards.
**Never copy an existing `XList.tsx`/`XList.css` as a starting point.** When
editing one, swap the section you touch to the shared primitive. Still-pending:
Projects/Packs entry lists use the legacy `FilterPanel` + `CardWidthSlider`
instead of `ListToolbar`, and `ProjectList.css`/`PackList.css` are duplicates.
