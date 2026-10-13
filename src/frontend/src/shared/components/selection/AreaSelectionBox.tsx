/**
 * The absolutely-positioned rectangle drawn while dragging a lasso selection.
 * The geometry math lives here once; the visual styling stays with the grid
 * that renders it (each grid passes its own class name).
 */
export function AreaSelectionBox({
  box,
  className,
}: {
  box: {
    startX: number
    startY: number
    currentX: number
    currentY: number
  }
  className: string
}) {
  return (
    <div
      className={className}
      style={{
        left: Math.min(box.startX, box.currentX),
        top: Math.min(box.startY, box.currentY),
        width: Math.abs(box.currentX - box.startX),
        height: Math.abs(box.currentY - box.startY),
      }}
    />
  )
}
