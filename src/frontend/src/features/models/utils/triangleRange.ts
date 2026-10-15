/**
 * An inverted triangle range (Min > Max) is impossible and must not be sent as
 * a query.
 *
 * Shared by the filter UI (which shows the inline error) and the data hook
 * (which drops it from the request) so the two cannot disagree about what
 * counts as inverted.
 */
export function isTriangleRangeInverted(
  minTriangleCount: number | null,
  maxTriangleCount: number | null
): boolean {
  return (
    minTriangleCount != null &&
    maxTriangleCount != null &&
    minTriangleCount > maxTriangleCount
  )
}
