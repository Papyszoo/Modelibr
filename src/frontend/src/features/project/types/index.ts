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
  textureSetCount: number
  spriteCount: number
  soundCount: number
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
