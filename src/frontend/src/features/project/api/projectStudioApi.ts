import { client } from '@/lib/apiBase'

export type ProjectLevelStatus =
  | 'planned'
  | 'in_progress'
  | 'review'
  | 'blocked'
  | 'done'

export interface ProjectLevelDto {
  id: number
  projectId: number
  name: string
  description: string | null
  productionStatus: ProjectLevelStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ProjectLevelRequest {
  name: string
  description?: string | null
  productionStatus?: ProjectLevelStatus
  sortOrder?: number
}

export interface ProductionNoteDto {
  id: number
  projectId: number
  levelId: number | null
  referenceImageId: number | null
  characterId: number | null
  title: string
  body: string
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export interface ProductionNoteRequest {
  levelId?: number | null
  referenceImageId?: number | null
  characterId?: number | null
  title: string
  body: string
  isPinned: boolean
}

export interface ProjectCharacterImageDto {
  id: number
  fileId: number | null
  fileName: string | null
  title: string | null
  caption: string | null
  previewUrl: string | null
  fileUrl: string | null
  sortOrder: number
}

export interface ProjectCharacterModelDto {
  id: number
  modelId: number | null
  modelName: string | null
  label: string | null
  sortOrder: number
}

export interface CharacterAbilityDto {
  id: number
  name: string
  description: string | null
  sortOrder: number
}

export interface CharacterVariantDto {
  id: number
  name: string
  description: string | null
  projectLevelId: number | null
  projectLevelName: string | null
  sortOrder: number
}

export interface ProjectCharacterDto {
  id: number
  projectId: number
  name: string
  description: string | null
  tags: string[]
  images: ProjectCharacterImageDto[]
  models: ProjectCharacterModelDto[]
  abilities: CharacterAbilityDto[]
  variants: CharacterVariantDto[]
  imageCount: number
  modelCount: number
  abilityCount: number
  variantCount: number
  createdAt: string
  updatedAt: string
}

export interface ProjectCharacterRequest {
  name: string
  description?: string | null
  tags?: string[]
}

export interface ProjectCharacterImageRequest {
  fileId: number
  title?: string | null
  caption?: string | null
  sortOrder?: number
}

/** The update route takes only the editable fields - the file never changes. */
export interface ProjectCharacterImageUpdateRequest {
  title?: string | null
  caption?: string | null
  sortOrder?: number
}

export interface ProjectCharacterModelRequest {
  modelId: number
  label?: string | null
  sortOrder?: number
}

/** The update route takes only the editable fields - the model never changes. */
export interface ProjectCharacterModelUpdateRequest {
  label?: string | null
  sortOrder?: number
}

export interface CharacterAbilityRequest {
  name: string
  description?: string | null
  sortOrder?: number
}

export interface CharacterVariantRequest {
  name: string
  description?: string | null
  projectLevelId?: number | null
  sortOrder?: number
}

export interface ProjectReferenceLinkDto {
  id: number
  targetType: 'level' | 'character'
  projectLevelId: number | null
  projectLevelName: string | null
  projectCharacterId: number | null
  projectCharacterName: string | null
}

/**
 * A reference image and what it is linked to. Mirrors the backend's
 * `ProjectReferenceDto` exactly - the single level-scope column it used to carry
 * became the `links` list when references could address several targets.
 */
export interface ProjectReferenceDto {
  id: number
  projectId: number
  title: string
  fileId: number
  fileName: string
  previewUrl: string
  fileUrl: string
  sortOrder: number
  links: ProjectReferenceLinkDto[]
  levelNames: string[]
  characterNames: string[]
}

export interface ProjectReferenceRequest {
  title?: string | null
}

export interface ProjectReferenceLinkRequest {
  projectLevelId?: number | null
  projectCharacterId?: number | null
}

export async function getProjectLevels(
  projectId: number
): Promise<ProjectLevelDto[]> {
  const response = await client.get<ProjectLevelDto[]>(
    `/projects/${projectId}/levels`
  )
  return response.data
}

export async function createProjectLevel(
  projectId: number,
  request: ProjectLevelRequest
): Promise<ProjectLevelDto> {
  const response = await client.post<ProjectLevelDto>(
    `/projects/${projectId}/levels`,
    request
  )
  return response.data
}

export async function updateProjectLevel(
  projectId: number,
  levelId: number,
  request: ProjectLevelRequest
): Promise<ProjectLevelDto> {
  const response = await client.put<ProjectLevelDto>(
    `/projects/${projectId}/levels/${levelId}`,
    request
  )
  return response.data
}

export async function deleteProjectLevel(
  projectId: number,
  levelId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/levels/${levelId}`)
}

export async function getProductionNotes(
  projectId: number,
  options: {
    levelId?: number
    referenceImageId?: number
    characterId?: number
    isPinned?: boolean
  } = {}
): Promise<ProductionNoteDto[]> {
  const params = new URLSearchParams()
  if (options.levelId !== undefined) {
    params.set('levelId', String(options.levelId))
  }
  if (options.referenceImageId !== undefined) {
    params.set('referenceImageId', String(options.referenceImageId))
  }
  if (options.characterId !== undefined) {
    params.set('characterId', String(options.characterId))
  }
  if (options.isPinned !== undefined) {
    params.set('isPinned', String(options.isPinned))
  }
  const query = params.toString()
  const response = await client.get<ProductionNoteDto[]>(
    `/projects/${projectId}/production-notes${query ? `?${query}` : ''}`
  )
  return response.data
}

export async function createProductionNote(
  projectId: number,
  request: ProductionNoteRequest
): Promise<ProductionNoteDto> {
  const response = await client.post<ProductionNoteDto>(
    `/projects/${projectId}/production-notes`,
    request
  )
  return response.data
}

export async function updateProductionNote(
  projectId: number,
  noteId: number,
  request: ProductionNoteRequest
): Promise<ProductionNoteDto> {
  const response = await client.put<ProductionNoteDto>(
    `/projects/${projectId}/production-notes/${noteId}`,
    request
  )
  return response.data
}

export async function deleteProductionNote(
  projectId: number,
  noteId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/production-notes/${noteId}`)
}

export async function getProjectReferences(
  projectId: number,
  options: { levelId?: number; characterId?: number } = {}
): Promise<ProjectReferenceDto[]> {
  const params = new URLSearchParams()
  if (options.levelId !== undefined)
    params.set('levelId', String(options.levelId))
  if (options.characterId !== undefined)
    params.set('characterId', String(options.characterId))
  const query = params.toString()
  const response = await client.get<ProjectReferenceDto[]>(
    `/projects/${projectId}/references${query ? `?${query}` : ''}`
  )
  return response.data
}

export async function updateProjectReference(
  projectId: number,
  referenceId: number,
  request: ProjectReferenceRequest
): Promise<ProjectReferenceDto> {
  const response = await client.put<ProjectReferenceDto>(
    `/projects/${projectId}/references/${referenceId}`,
    request
  )
  return response.data
}

export async function addProjectReferenceLink(
  projectId: number,
  referenceId: number,
  request: ProjectReferenceLinkRequest
): Promise<ProjectReferenceLinkDto> {
  const response = await client.post<ProjectReferenceLinkDto>(
    `/projects/${projectId}/references/${referenceId}/links`,
    request
  )
  return response.data
}

export async function removeProjectReferenceLink(
  projectId: number,
  referenceId: number,
  linkId: number
): Promise<void> {
  await client.delete(
    `/projects/${projectId}/references/${referenceId}/links/${linkId}`
  )
}

export async function getProjectCharacters(
  projectId: number
): Promise<ProjectCharacterDto[]> {
  const response = await client.get<ProjectCharacterDto[]>(
    `/projects/${projectId}/characters`
  )
  return response.data
}

export async function createProjectCharacter(
  projectId: number,
  request: ProjectCharacterRequest
): Promise<ProjectCharacterDto> {
  const response = await client.post<ProjectCharacterDto>(
    `/projects/${projectId}/characters`,
    request
  )
  return response.data
}

export async function updateProjectCharacter(
  projectId: number,
  characterId: number,
  request: ProjectCharacterRequest
): Promise<ProjectCharacterDto> {
  const response = await client.put<ProjectCharacterDto>(
    `/projects/${projectId}/characters/${characterId}`,
    request
  )
  return response.data
}

export async function deleteProjectCharacter(
  projectId: number,
  characterId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/characters/${characterId}`)
}

export async function addProjectCharacterImage(
  projectId: number,
  characterId: number,
  request: ProjectCharacterImageRequest
): Promise<ProjectCharacterImageDto> {
  const response = await client.post<ProjectCharacterImageDto>(
    `/projects/${projectId}/characters/${characterId}/images`,
    request
  )
  return response.data
}

export async function updateProjectCharacterImage(
  projectId: number,
  characterId: number,
  imageId: number,
  request: ProjectCharacterImageUpdateRequest
): Promise<ProjectCharacterImageDto> {
  const response = await client.put<ProjectCharacterImageDto>(
    `/projects/${projectId}/characters/${characterId}/images/${imageId}`,
    request
  )
  return response.data
}

export async function removeProjectCharacterImage(
  projectId: number,
  characterId: number,
  imageId: number
): Promise<void> {
  await client.delete(
    `/projects/${projectId}/characters/${characterId}/images/${imageId}`
  )
}

export async function addProjectCharacterModel(
  projectId: number,
  characterId: number,
  request: ProjectCharacterModelRequest
): Promise<ProjectCharacterModelDto> {
  const response = await client.post<ProjectCharacterModelDto>(
    `/projects/${projectId}/characters/${characterId}/models`,
    request
  )
  return response.data
}

export async function updateProjectCharacterModel(
  projectId: number,
  characterId: number,
  modelLinkId: number,
  request: ProjectCharacterModelUpdateRequest
): Promise<ProjectCharacterModelDto> {
  const response = await client.put<ProjectCharacterModelDto>(
    `/projects/${projectId}/characters/${characterId}/models/${modelLinkId}`,
    request
  )
  return response.data
}

export async function removeProjectCharacterModel(
  projectId: number,
  characterId: number,
  modelLinkId: number
): Promise<void> {
  await client.delete(
    `/projects/${projectId}/characters/${characterId}/models/${modelLinkId}`
  )
}

export async function addCharacterAbility(
  projectId: number,
  characterId: number,
  request: CharacterAbilityRequest
): Promise<CharacterAbilityDto> {
  const response = await client.post<CharacterAbilityDto>(
    `/projects/${projectId}/characters/${characterId}/abilities`,
    request
  )
  return response.data
}

export async function updateCharacterAbility(
  projectId: number,
  characterId: number,
  abilityId: number,
  request: CharacterAbilityRequest
): Promise<CharacterAbilityDto> {
  const response = await client.put<CharacterAbilityDto>(
    `/projects/${projectId}/characters/${characterId}/abilities/${abilityId}`,
    request
  )
  return response.data
}

export async function removeCharacterAbility(
  projectId: number,
  characterId: number,
  abilityId: number
): Promise<void> {
  await client.delete(
    `/projects/${projectId}/characters/${characterId}/abilities/${abilityId}`
  )
}

export async function addCharacterVariant(
  projectId: number,
  characterId: number,
  request: CharacterVariantRequest
): Promise<CharacterVariantDto> {
  const response = await client.post<CharacterVariantDto>(
    `/projects/${projectId}/characters/${characterId}/variants`,
    request
  )
  return response.data
}

export async function updateCharacterVariant(
  projectId: number,
  characterId: number,
  variantId: number,
  request: CharacterVariantRequest
): Promise<CharacterVariantDto> {
  const response = await client.put<CharacterVariantDto>(
    `/projects/${projectId}/characters/${characterId}/variants/${variantId}`,
    request
  )
  return response.data
}

export async function removeCharacterVariant(
  projectId: number,
  characterId: number,
  variantId: number
): Promise<void> {
  await client.delete(
    `/projects/${projectId}/characters/${characterId}/variants/${variantId}`
  )
}
