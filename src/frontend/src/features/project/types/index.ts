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

export interface ProjectDto {
  id: number
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  modelCount: number
  textureSetCount: number
  spriteCount: number
  soundCount: number
  isEmpty: boolean
  models: ProjectModelDto[]
  textureSets: ProjectTextureSetDto[]
  sprites: ProjectSpriteDto[]
}

export interface GetAllProjectsResponse {
  projects: ProjectDto[]
}

export interface CreateProjectRequest {
  name: string
  description?: string
}

export interface CreateProjectResponse {
  id: number
  name: string
  description?: string
}

export interface UpdateProjectRequest {
  name: string
  description?: string
}
