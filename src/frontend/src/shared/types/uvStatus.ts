/**
 * How a model's UVs are laid out - the difference between something that can be baked to a
 * fresh texture set as it stands and something whose UVs have to be regenerated first.
 *
 * This is deliberately not the same question as "does it have UVs". A palette-atlas model -
 * most of a Synty POLYGON pack - has UVs, needs them, and renders correctly because of them;
 * the whole model just sits on a handful of texels of a texture it shares with hundreds of
 * others, so there is no room to bake anything new into it. `hasUvs` answers true for those
 * and tells you nothing useful.
 *
 * Kept in sync with `UvStatusClassifier` on the server, which is where the thresholds live.
 */
export const UV_STATUSES = [
  'unwrapped',
  'atlas_packed',
  'tiled',
  'partial',
  'no_uvs',
] as const

export type UvStatus = (typeof UV_STATUSES)[number]

export interface UvStatusOption {
  value: UvStatus
  label: string
  /** What the label means, shown under it - so the coverage bands are never guessed at. */
  description: string
}

/**
 * Ordered by how ready the model is to receive a bake, best first, so the list reads as a
 * scale rather than as an unordered set.
 */
export const UV_STATUS_OPTIONS: readonly UvStatusOption[] = [
  {
    value: 'unwrapped',
    label: 'Unwrapped',
    description: 'UVs cover 50-100% of their own space - ready to bake',
  },
  {
    value: 'atlas_packed',
    label: 'Shared atlas',
    description:
      'UVs exist but use under 50% - shares a palette texture, unwrap to bake',
  },
  {
    value: 'tiled',
    label: 'Tiled',
    description:
      'UVs run outside 0-1 (tiling texture or trim sheet) - cannot take a bake',
  },
  {
    value: 'partial',
    label: 'Partly unwrapped',
    description: 'Some meshes have UVs, some do not',
  },
  {
    value: 'no_uvs',
    label: 'No UVs',
    description: 'No mesh in the model has UVs at all',
  },
]

export function uvStatusLabel(status: UvStatus): string {
  return (
    UV_STATUS_OPTIONS.find(option => option.value === status)?.label ?? status
  )
}

export function isUvStatus(value: unknown): value is UvStatus {
  return (
    typeof value === 'string' &&
    (UV_STATUSES as readonly string[]).includes(value)
  )
}
