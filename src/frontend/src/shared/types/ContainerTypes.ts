import { Model } from '@/utils/fileUtils'
import { TextureSetDto } from '@/features/texture-set/types'
import { SpriteDto } from '@/features/sprite/types'
import { SoundDto } from '@/features/sounds/types'

// Unified container DTO - structurally identical to PackDto and ProjectDto
export interface ContainerDto {
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
  models: { id: number; name: string }[]
  textureSets: { id: number; name: string }[]
  sprites: { id: number; name: string }[]
}

export interface ContainerAdapter {
  type: 'pack' | 'project'
  containerId: number
  label: string // 'Pack' | 'Project'
  cssPrefix: string // 'container'

  // Data loading
  loadContainer: (id: number) => Promise<ContainerDto>
  loadModels: (id: number) => Promise<Model[]>
  loadTextureSets: (id: number) => Promise<TextureSetDto[]>
  loadSprites: (id: number) => Promise<SpriteDto[]>
  loadSounds: (id: number) => Promise<SoundDto[]>

  // Association mutations
  addModel: (containerId: number, modelId: number) => Promise<void>
  removeModel: (containerId: number, modelId: number) => Promise<void>
  addTextureSet: (containerId: number, tsId: number) => Promise<void>
  removeTextureSet: (containerId: number, tsId: number) => Promise<void>
  addSprite: (containerId: number, spriteId: number) => Promise<void>
  removeSprite: (containerId: number, spriteId: number) => Promise<void>
  addSound: (containerId: number, soundId: number) => Promise<void>
  removeSound: (containerId: number, soundId: number) => Promise<void>
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
