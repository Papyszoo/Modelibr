import { useMemo } from 'react'
import { ContainerViewer } from '../../../shared/components/ContainerViewer'
import {
  ContainerAdapter,
  ContainerDto,
} from '../../../shared/types/ContainerTypes'
import ApiClient from '../../../services/ApiClient'
import { PackDto } from '../../../types'

interface PackViewerProps {
  packId: number
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

export default function PackViewer({ packId }: PackViewerProps) {
  const adapter = useMemo<ContainerAdapter>(
    () => ({
      type: 'pack',
      containerId: packId,
      label: 'Pack',
      cssPrefix: 'container',
      loadContainer: async id => {
        const pack = await ApiClient.getPackById(id)
        return toContainerDto(pack)
      },
      loadModels: id => ApiClient.getModelsByPack(id),
      loadTextureSets: id => ApiClient.getTextureSetsByPack(id),
      loadSprites: id => ApiClient.getSpritesByPack(id),
      loadSounds: id => ApiClient.getSoundsByPack(id),
      addModel: (cId, mId) => ApiClient.addModelToPack(cId, mId),
      removeModel: (cId, mId) => ApiClient.removeModelFromPack(cId, mId),
      addTextureSet: (cId, tsId) => ApiClient.addTextureSetToPack(cId, tsId),
      removeTextureSet: (cId, tsId) =>
        ApiClient.removeTextureSetFromPack(cId, tsId),
      addSprite: (cId, sId) => ApiClient.addSpriteToPack(cId, sId),
      removeSprite: (cId, sId) => ApiClient.removeSpriteFromPack(cId, sId),
      addSound: (cId, sId) => ApiClient.addSoundToPack(cId, sId),
      removeSound: (cId, sId) => ApiClient.removeSoundFromPack(cId, sId),
      uploadTextureWithFile: (
        cId,
        file,
        name,
        textureType,
        batchId,
        _uploadType
      ) =>
        ApiClient.addTextureToPackWithFile(
          cId,
          file,
          name,
          textureType,
          batchId
        ),
      createSpriteOptions: cId => ({ packId: cId }),
      createSoundOptions: cId => ({ packId: cId }),
    }),
    [packId]
  )

  return <ContainerViewer adapter={adapter} />
}
