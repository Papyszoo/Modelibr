import { useMemo } from 'react'

import {
  addModelToPack,
  addSoundToPack,
  addSpriteToPack,
  addTextureSetToPack,
  addTextureToPackWithFile,
  getModelsByPack,
  getPackById,
  getSoundsByPack,
  getSpritesByPack,
  getTextureSetsByPack,
  removeModelFromPack,
  removeSoundFromPack,
  removeSpriteFromPack,
  removeTextureSetFromPack,
} from '@/features/pack/api/packApi'
import { ContainerViewer } from '@/shared/components/ContainerViewer'
import {
  type ContainerAdapter,
  type ContainerDto,
} from '@/shared/types/ContainerTypes'
import { type PackDto } from '@/types'

interface PackViewerProps {
  packId: number
  tabId?: string
}

function toContainerDto(pack: PackDto): ContainerDto {
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    modelCount: pack.modelCount,
    textureSetCount: pack.textureSetCount,
    spriteCount: pack.spriteCount,
    soundCount: pack.soundCount,
    isEmpty: pack.isEmpty,
    models: pack.models,
    textureSets: pack.textureSets,
    sprites: pack.sprites,
  }
}

export function PackViewer({ packId, tabId }: PackViewerProps) {
  const adapter = useMemo<ContainerAdapter>(
    () => ({
      type: 'pack',
      containerId: packId,
      label: 'Pack',
      cssPrefix: 'container',
      loadContainer: async id => {
        const pack = await getPackById(id)
        return toContainerDto(pack)
      },
      loadModels: id => getModelsByPack(id),
      loadTextureSets: id => getTextureSetsByPack(id),
      loadSprites: id => getSpritesByPack(id),
      loadSounds: id => getSoundsByPack(id),
      addModel: (cId, mId) => addModelToPack(cId, mId),
      removeModel: (cId, mId) => removeModelFromPack(cId, mId),
      addTextureSet: (cId, tsId) => addTextureSetToPack(cId, tsId),
      removeTextureSet: (cId, tsId) => removeTextureSetFromPack(cId, tsId),
      addSprite: (cId, sId) => addSpriteToPack(cId, sId),
      removeSprite: (cId, sId) => removeSpriteFromPack(cId, sId),
      addSound: (cId, sId) => addSoundToPack(cId, sId),
      removeSound: (cId, sId) => removeSoundFromPack(cId, sId),
      uploadTextureWithFile: (
        cId,
        file,
        name,
        textureType,
        batchId,
        _uploadType
      ) => addTextureToPackWithFile(cId, file, name, textureType, batchId),
      createSpriteOptions: cId => ({ packId: cId }),
      createSoundOptions: cId => ({ packId: cId }),
    }),
    [packId]
  )

  return <ContainerViewer adapter={adapter} tabId={tabId} />
}
