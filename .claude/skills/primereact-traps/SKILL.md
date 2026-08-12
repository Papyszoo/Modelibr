---
name: primereact-traps
description: PrimeReact components that fail soft in Modelibr - wrong-shape props render fine with the state feature silently dead (Tree selectionKeys/expandedKeys, p-disabled class instead of aria-disabled, body-portalled overlays). Use when a selection, highlight, disabled, or expanded state doesn't render, or when adding/editing any PrimeReact Tree, Dropdown, Dialog, or Menubar usage.
---

# PrimeReact traps (visual state that silently doesn't render)

PrimeReact fails soft: a prop of the wrong *shape* renders fine with the state
feature dead - no error, and in some cases no type failure either.

## Known cases

- **`Tree selectionMode="single"` takes `selectionKeys` as a string** (the key) -
  the `{ key: true }` map is only for multiple/checkbox modes. Passing the map
  means selection never highlights. Shipped bug, found by the gallery.
- **`Tree expandedKeys` without `onToggle` is uncontrolled after mount** - the
  prop seeds internal state once and later updates are ignored, so a node that
  gains its first child stays collapsed no matter what you pass. Provide
  `onToggle` (fully controlled) when expansion must react to data. Found by e2e:
  the category inline-create placeholder never showed under a childless parent;
  jsdom tests missed it because their parent already had a child.
- **Disabled state renders as the `p-disabled` class**, not `aria-disabled` or a
  `disabled` attribute. This bit the e2e suite: `saveEditor()` waited for
  `aria-disabled="true"` on a menubar Save item and timed out even though the save
  had completed. Assert `toHaveClass(/p-disabled/)`.
- **Overlay components (Dropdown panels, Dialogs, toasts) portal to
  `document.body`** - styling them via a parent's CSS scope silently misses, and
  tests must query them off `document`, not the component subtree. See
  `frontend-test-authoring` for the testing side and `e2e-authoring` for the
  selector side (`.p-*` classes are the accepted exception there).

## How to work

When a selection / highlight / disabled / expanded state doesn't show, **suspect
the prop shape first**, and verify the state visually in the gallery - that is
what it is for (see `storybook-stories`).

**Found a new one? Add it to this list in the same session.**
