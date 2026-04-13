import { type ReactNode } from 'react'

import { type EnvironmentMapDto } from '@/features/environment-map/types'
import { type SoundDto } from '@/features/sounds/types'
import { type SpriteDto } from '@/features/sprite/types'
import { type TextureSetDto } from '@/features/texture-set/types'
import { type Model } from '@/utils/fileUtils'

export interface ContainerConceptImage {
  fileId: number
  fileName: string
  previewUrl: string
  fileUrl: string
  sortOrder: number
}

// Unified container DTO - structurally identical to PackDto and ProjectDto
export interface ContainerDto {
  id: number
  name: string
  description?: string
  notes?: string
  licenseType?: string
  url?: string
  createdAt: string
  updatedAt: string
  modelCount: number
  textureSetCount: number
  spriteCount: number
  soundCount: number
  environmentMapCount?: number
  isEmpty: boolean
  customThumbnailUrl?: string | null
  conceptImageCount?: number
  conceptImages?: ContainerConceptImage[]
  models: { id: number; name: string }[]
  textureSets: { id: number; name: string }[]
  sprites: { id: number; name: string }[]
  environmentMaps?: { id: number; name: string }[]
}

export interface ContainerDetailsRenderProps {
  container: ContainerDto
  refetchContainer: () => Promise<void>
  showToast: (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }) => void
}

export interface ContainerAdapter {
  type: 'pack' | 'project'
  containerId: number
  label: string // 'Pack' | 'Project'
  cssPrefix: string // 'container'
  renderDetails?: (props: ContainerDetailsRenderProps) => ReactNode

  // Data loading
  loadContainer: (id: number) => Promise<ContainerDto>
  loadModels: (id: number) => Promise<Model[]>
  loadTextureSets: (id: number) => Promise<TextureSetDto[]>
  loadSprites: (id: number) => Promise<SpriteDto[]>
  loadSounds: (id: number) => Promise<SoundDto[]>
  loadEnvironmentMaps: (id: number) => Promise<EnvironmentMapDto[]>

  // Association mutations
  addModel: (containerId: number, modelId: number) => Promise<void>
  removeModel: (containerId: number, modelId: number) => Promise<void>
  addTextureSet: (containerId: number, tsId: number) => Promise<void>
  removeTextureSet: (containerId: number, tsId: number) => Promise<void>
  addSprite: (containerId: number, spriteId: number) => Promise<void>
  removeSprite: (containerId: number, spriteId: number) => Promise<void>
  addSound: (containerId: number, soundId: number) => Promise<void>
  removeSound: (containerId: number, soundId: number) => Promise<void>
  addEnvironmentMap: (
    containerId: number,
    environmentMapId: number
  ) => Promise<void>
  removeEnvironmentMap: (
    containerId: number,
    environmentMapId: number
  ) => Promise<void>
  uploadTextureWithFile: (
    containerId: number,
    file: File,
    name: string,
    textureType: number,
    batchId?: string,
    uploadType?: string
  ) => Promise<{ textureSetId: number }>
  createSpriteOptions: (containerId: number) => {
    packId?: number
    projectId?: number
  }
  createSoundOptions: (containerId: number) => {
    packId?: number
    projectId?: number
  }
}
