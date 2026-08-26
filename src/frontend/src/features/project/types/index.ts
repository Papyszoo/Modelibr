export interface ProjectModelDto {
  id: number
  name: string
}

export interface ProjectTextureSetDto {
  id: number
  name: string
}

export interface ProjectSpriteDto {
  id: number
  name: string
}

export interface ProjectEnvironmentMapDto {
  id: number
  name: string
}

export interface ProjectDto {
  id: number
  name: string
  description?: string
  notes?: string
  createdAt: string
  updatedAt: string
  modelCount: number
  globalMaterialCount: number
  multiModelTextureCount: number
  spriteCount: number
  soundCount: number
  scriptCount: number
  environmentMapCount?: number
  isEmpty: boolean
  customThumbnailUrl?: string | null
  conceptImageCount: number
  models: ProjectModelDto[]
  textureSets: ProjectTextureSetDto[]
  sprites: ProjectSpriteDto[]
  environmentMaps?: ProjectEnvironmentMapDto[]
}

export interface ProjectConceptImageDto {
  fileId: number
  fileName: string
  previewUrl: string
  fileUrl: string
  sortOrder: number
}

export interface ProjectDetailDto extends ProjectDto {
  conceptImages: ProjectConceptImageDto[]
}

export interface GetAllProjectsResponse {
  projects: ProjectDto[]
}

export interface CreateProjectRequest {
  name: string
  description?: string
  notes?: string
}

export interface CreateProjectResponse {
  id: number
  name: string
  description?: string
  notes?: string
}

export interface UpdateProjectRequest {
  name: string
  description?: string
  notes?: string
}

// --- Profile (v0.6 prompt 13) ---

/** The five closed-ish dimensions a project's profile is made of. */
export type ProjectProfileDimension =
  | 'engine'
  | 'platform'
  | 'genre'
  | 'style'
  | 'perspective'

export interface ProjectProfileOptionDto {
  id: number
  dimension: string
  name: string
  isBuiltIn: boolean
  isHidden: boolean
  sortOrder: number
}

/** One assignment. `role` is only meaningful on the engine dimension. */
export interface ProjectProfileValueDto {
  optionId: number
  name: string
  role?: string | null
}

/** The fidelity budget as stored. Every field null means unconstrained. */
export interface ProjectBudgetDto {
  maxTrianglesPerAsset: number | null
  maxTextureSize: number | null
  targetSceneTriangles: number | null
  pixelsPerUnit: number | null
}

/**
 * What the selected platforms imply. A hint next to an empty field, never a
 * value: the tightest platform decides, and the user accepts it or does not.
 */
export interface ProjectBudgetSuggestionDto {
  maxTrianglesPerAsset: number
  maxTextureSize: number
  platform: string
  note: string
}

export interface ProjectWorldConventionDto {
  unitsPerMetre: number
  upAxis: string
  handedness: string
  isDefault: boolean
  engineConversions: string[]
  /** Where the selected engines disagree. Stated, never resolved. */
  conflicts: string[]
}

export interface ProjectStyleSignalsDto {
  maxTriangles: number | null
  maxTextureSize: number | null
  maxMaterials: number | null
  preferredUvStatus: string | null
  boostTokens: string[]
  penaltyTokens: string[]
  familyHint: string | null
  /** Styles the profile carries that search has no reading of. */
  unmappedStyles: string[]
}

export interface ProjectConceptImageBriefDto {
  fileId: number
  fileName: string
  url: string
  caption?: string | null
}

export interface ProjectSceneBriefDto {
  id: number
  name: string
  revision: number
  updatedAt: string
}

export interface ProjectAssetCountsDto {
  models: number
  textureSets: number
  sprites: number
  sounds: number
  scripts: number
  environmentMaps: number
  scenes: number
}

/**
 * The brief - verbatim what the agent is given about this project.
 *
 * The honesty feature: when the agent picks something odd, the user can read the
 * exact input that produced it rather than inferring it from the result.
 */
export interface ProjectBriefDto {
  id: number
  name: string
  description?: string | null
  notes?: string | null
  engines: ProjectProfileValueDto[]
  platforms: ProjectProfileValueDto[]
  genres: ProjectProfileValueDto[]
  styles: ProjectProfileValueDto[]
  perspectives: ProjectProfileValueDto[]
  budget: ProjectBudgetDto
  budgetSuggestion: ProjectBudgetSuggestionDto | null
  worldConvention: ProjectWorldConventionDto
  styleSignals: ProjectStyleSignalsDto
  paletteHex: string[]
  conceptImages: ProjectConceptImageBriefDto[]
  environmentMaps: { id: number; name: string }[]
  scenes: ProjectSceneBriefDto[]
  assetCounts: ProjectAssetCountsDto
  /** Plain-language lines the agent can act on without reading the structured fields. */
  guidance: string[]
}

export interface SetProjectProfileRequest {
  /** Dimension name → assignments. An omitted dimension is left alone; an empty list clears it. */
  dimensions?: Record<string, { optionId: number; role?: string | null }[]>
  settings?: {
    maxTrianglesPerAsset?: number | null
    maxTextureSize?: number | null
    targetSceneTriangles?: number | null
    pixelsPerUnit?: number | null
    unitsPerMetre?: number | null
    upAxis?: string | null
    handedness?: string | null
    paletteHex?: string[] | null
  }
}
