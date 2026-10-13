import { useCallback, useEffect, useRef, useState } from 'react'

/** Modifier state of the click that toggled a selection control. */
export interface SelectionToggleModifiers {
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

export interface UseListSelectionOptions<T> {
  /**
   * Selectable ids in display order - the domain for shift ranges and
   * Select All. Memoize this array so the prune effect does not run needlessly.
   */
  orderedIds: T[]
  selectedIds: Set<T>
  onChange: (next: Set<T>) => void
  /**
   * Drop ids that are no longer visible (filter/search changed) so every list
   * behaves the same. Default true.
   */
  pruneToVisible?: boolean
  /**
   * Turn selection off entirely (e.g. an embedded grid shown without selection
   * controls). Also disables the Ctrl/Cmd+A shortcut. Default true.
   */
  enabled?: boolean
}

/**
 * True when a keystroke belongs to a text field rather than a list shortcut.
 * Same rule the scene editor's undo/redo chord uses.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable === true
  )
}

/**
 * Every mounted list registers here, and the one the user most recently
 * clicked or focused is remembered.
 *
 * Ctrl/Cmd+A fires once at the window, and the dock can show two panes side by
 * side (drag-to-split), so more than one list can be mounted at the same time.
 * The shortcut must target exactly one list, so it goes to the list the user
 * was last working in; a lone mounted list still answers without any click, as
 * it always did.
 */
const mountedLists = new Set<symbol>()
let lastInteractedList: symbol | null = null

/**
 * The one selection model for every asset list.
 *
 * - plain click / Ctrl+click toggles one item (the checkbox control),
 * - Shift+click adds the range from the last anchor to the clicked item,
 * - Ctrl/Cmd+A selects every visible item,
 * - Select All / Deselect All cover the toolbar buttons,
 * - stale ids are pruned when the visible set changes.
 *
 * The Ctrl/Cmd+A shortcut is a window keydown listener owned by this hook, the
 * same shape every other app shortcut uses. It is scoped to the single list the
 * user last interacted with (a pointer down or focus inside `containerRef`),
 * so a split dock with two mounted lists never selects in both. It is ignored
 * while a text field has focus, so it works without the grid container being
 * focusable.
 */
export function useListSelection<T>({
  orderedIds,
  selectedIds,
  onChange,
  pruneToVisible = true,
  enabled = true,
}: UseListSelectionOptions<T>) {
  const anchorRef = useRef<T | null>(null)
  // The list root, so pointer down / focus inside it can mark it as the list
  // the user is working in. Callers attach this to their root element.
  const containerRef = useRef<HTMLDivElement | null>(null)
  // A stable identity so the module-level registry can tell this mounted list
  // from the others.
  const [listId] = useState(() => Symbol('modelibr-list-selection'))

  const toggle = useCallback(
    (id: T, modifiers: SelectionToggleModifiers = {}) => {
      const next = new Set(selectedIds)

      if (modifiers.shiftKey && anchorRef.current !== null) {
        const anchorIndex = orderedIds.indexOf(anchorRef.current)
        const targetIndex = orderedIds.indexOf(id)
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [start, end] =
            anchorIndex <= targetIndex
              ? [anchorIndex, targetIndex]
              : [targetIndex, anchorIndex]
          for (let index = start; index <= end; index += 1) {
            next.add(orderedIds[index])
          }
          onChange(next)
          return
        }
      }

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      anchorRef.current = id
      onChange(next)
    },
    [orderedIds, selectedIds, onChange]
  )

  const selectAll = useCallback(() => {
    onChange(new Set(orderedIds))
  }, [orderedIds, onChange])

  const deselectAll = useCallback(() => {
    anchorRef.current = null
    onChange(new Set<T>())
  }, [onChange])

  const isSelectAllTarget = useCallback(() => {
    // A container that has left the DOM (its tab is no longer the visible one
    // in its pane) must not claim the shortcut.
    const container = containerRef.current
    if (container && !container.isConnected) return false
    if (lastInteractedList === listId) return true
    // With a single mounted list there is nothing to disambiguate.
    return mountedLists.size === 1 && mountedLists.has(listId)
  }, [listId])

  const handleSelectAllKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === 'a'
      ) {
        if (isTypingTarget(event.target)) return
        if (!isSelectAllTarget()) return
        event.preventDefault()
        onChange(new Set(orderedIds))
      }
    },
    [enabled, isSelectAllTarget, orderedIds, onChange]
  )

  // Ctrl/Cmd+A is a window shortcut, not a key on the grid container: the
  // container is a plain div with no tabindex, so it can never receive the key.
  // Registering it here also drops it as soon as this list's tab is gone.
  useEffect(() => {
    if (!enabled) return

    mountedLists.add(listId)
    window.addEventListener('keydown', handleSelectAllKeyDown)
    return () => {
      mountedLists.delete(listId)
      if (lastInteractedList === listId) lastInteractedList = null
      window.removeEventListener('keydown', handleSelectAllKeyDown)
    }
  }, [enabled, handleSelectAllKeyDown, listId])

  // A pointer down or a focus inside this list's container marks it as the list
  // the user is working in, so Ctrl/Cmd+A targets it and not the other pane's.
  useEffect(() => {
    if (!enabled) return

    const markInteracted = (event: Event) => {
      const container = containerRef.current
      const target = event.target
      if (!container || !(target instanceof Node)) return
      if (container.contains(target)) lastInteractedList = listId
    }

    // Capture, so a list that stops propagation on its own controls still wins.
    window.addEventListener('pointerdown', markInteracted, true)
    window.addEventListener('focusin', markInteracted, true)
    return () => {
      window.removeEventListener('pointerdown', markInteracted, true)
      window.removeEventListener('focusin', markInteracted, true)
    }
  }, [enabled, listId])

  useEffect(() => {
    if (!pruneToVisible) return

    const visible = new Set(orderedIds)
    const stale = [...selectedIds].filter(id => !visible.has(id))
    if (stale.length === 0) return

    if (anchorRef.current !== null && !visible.has(anchorRef.current)) {
      anchorRef.current = null
    }
    const next = new Set(selectedIds)
    for (const id of stale) next.delete(id)
    onChange(next)
  }, [orderedIds, selectedIds, onChange, pruneToVisible])

  return {
    toggle,
    selectAll,
    deselectAll,
    handleSelectAllKeyDown,
    containerRef,
  }
}
