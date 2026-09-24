import type {
  ProjectBriefDto,
  ProjectProfileValueDto,
  SetProjectProfileRequest,
} from '@/types'

export type ProjectProfileDraft = Record<string, ProjectProfileValueDto[]>

export type ProjectProfileBudgetDraft = {
  maxTrianglesPerAsset: number | null
  maxTextureSize: number | null
  targetSceneTriangles: number | null
}

const PROFILE_DIMENSION_KEYS = [
  'engine',
  'platform',
  'genre',
  'style',
  'perspective',
] as const

/**
 * The v0.6 form edits only three budgets, but the profile API owns additional
 * production constraints. Round-trip those hidden values on every save. The
 * API treats null scalars as unchanged; visible values the user cleared are
 * sent through the explicit `clear` list. A default world convention stays
 * null so an effective default is not promoted to an explicit override.
 */
export function buildProjectProfilePatch(
  brief: ProjectBriefDto,
  draft: ProjectProfileDraft,
  budget: ProjectProfileBudgetDraft
): SetProjectProfileRequest {
  const world = brief.worldConvention
  const isDefaultWorld = world.isDefault
  const clearSettings = [
    ...(budget.maxTrianglesPerAsset === null ? ['maxTrianglesPerAsset'] : []),
    ...(budget.maxTextureSize === null ? ['maxTextureSize'] : []),
    ...(budget.targetSceneTriangles === null ? ['targetSceneTriangles'] : []),
  ]

  return {
    dimensions: Object.fromEntries(
      PROFILE_DIMENSION_KEYS.map(key => [
        key,
        (draft[key] ?? []).map(value => ({
          optionId: value.optionId,
          role: value.role ?? null,
        })),
      ])
    ),
    settings: {
      maxTrianglesPerAsset: budget.maxTrianglesPerAsset,
      maxTextureSize: budget.maxTextureSize,
      targetSceneTriangles: budget.targetSceneTriangles,
      pixelsPerUnit: brief.budget.pixelsPerUnit,
      unitsPerMetre: isDefaultWorld ? null : world.unitsPerMetre,
      upAxis: isDefaultWorld ? null : world.upAxis,
      handedness: isDefaultWorld ? null : world.handedness,
      paletteHex: [...brief.paletteHex],
      clear: clearSettings.length > 0 ? clearSettings : undefined,
    },
  }
}
