import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useRef,
  useState,
} from 'react'

export interface AreaSelectionBox {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

export interface UseGridAreaSelectionOptions<T> {
  /** Turn the lasso off entirely (e.g. a scoped/embedded grid). */
  enabled?: boolean
  /**
   * Cards are matched by this selector: a mousedown on one never starts the
   * lasso (HTML5 card drag owns it), and the same selector finds the cards
   * inside the surface on mouseup.
   */
  cardSelector: string
  /** Read a selectable id out of a card; return null to skip it. */
  getCardId: (card: HTMLElement) => T | null
  /** Called on mouseup with the lasso result (only when it is not empty). */
  onSelect: (ids: Set<T>) => void
}

/**
 * The one drag-a-rectangle (lasso) selection for every asset grid.
 *
 * Works for both grid layouts in the app: a surface that scrolls itself
 * (sounds, sprites - fixed rect, content scrolls) and a surface that scrolls
 * with a parent (models, texture sets, environment maps - the live rect
 * already carries the scroll). Coordinates are taken in the surface's content
 * space by adding the surface's own scroll offset, which is 0 in the second
 * case and exactly the missing term in the first.
 */
export function useGridAreaSelection<T>({
  enabled = true,
  cardSelector,
  getCardId,
  onSelect,
}: UseGridAreaSelectionOptions<T>) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [isAreaSelecting, setIsAreaSelecting] = useState(false)
  const [selectionBox, setSelectionBox] = useState<AreaSelectionBox | null>(
    null
  )

  const contentPoint = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current
    if (!surface) return null
    const rect = surface.getBoundingClientRect()
    return {
      x: event.clientX - rect.left + surface.scrollLeft,
      y: event.clientY - rect.top + surface.scrollTop,
    }
  }, [])

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!enabled || event.button !== 0) return
      const target = event.target as HTMLElement
      if (target.closest(cardSelector)) return

      const point = contentPoint(event)
      if (!point) return

      setIsAreaSelecting(true)
      setSelectionBox({
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
      })
    },
    [cardSelector, contentPoint, enabled]
  )

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!isAreaSelecting) return
      const point = contentPoint(event)
      if (!point) return

      setSelectionBox(previous =>
        previous ? { ...previous, currentX: point.x, currentY: point.y } : null
      )
    },
    [contentPoint, isAreaSelecting]
  )

  const handleMouseUp = useCallback(() => {
    const surface = surfaceRef.current

    if (enabled && isAreaSelecting && selectionBox && surface) {
      const rect = surface.getBoundingClientRect()
      const left = Math.min(selectionBox.startX, selectionBox.currentX)
      const top = Math.min(selectionBox.startY, selectionBox.currentY)
      const right = Math.max(selectionBox.startX, selectionBox.currentX)
      const bottom = Math.max(selectionBox.startY, selectionBox.currentY)

      const next = new Set<T>()
      surface.querySelectorAll<HTMLElement>(cardSelector).forEach(card => {
        const cardRect = card.getBoundingClientRect()
        const cardLeft = cardRect.left - rect.left + surface.scrollLeft
        const cardTop = cardRect.top - rect.top + surface.scrollTop
        const intersects =
          cardLeft + cardRect.width >= left &&
          cardLeft <= right &&
          cardTop + cardRect.height >= top &&
          cardTop <= bottom
        if (!intersects) return

        const id = getCardId(card)
        if (id !== null) next.add(id)
      })

      if (next.size > 0) onSelect(next)
    }

    setIsAreaSelecting(false)
    setSelectionBox(null)
  }, [
    cardSelector,
    enabled,
    getCardId,
    isAreaSelecting,
    onSelect,
    selectionBox,
  ])

  return {
    surfaceRef,
    isAreaSelecting,
    selectionBox,
    surfaceProps: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
    },
  }
}
