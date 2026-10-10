import { useEffect } from 'react'

/**
 * Dismisses a PrimeReact tooltip on press.
 *
 * Tooltips hide on `mouseleave`, which never fires when a button is clicked and
 * the pointer stays put - so the tooltip froze over the page until the user
 * happened to move the mouse away. Closing it on `pointerdown` (capture, before
 * any component handler) matches the usual "press dismisses the hint" feel.
 */
export function useDismissTooltipsOnPress(): void {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null
      const host = target?.closest?.('[data-pr-tooltip]')
      host?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])
}
