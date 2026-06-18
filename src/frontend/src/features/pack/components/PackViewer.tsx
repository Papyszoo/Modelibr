import { useMemo } from 'react'

import {
  addEnvironmentMapToPack,
  addModelToPack,
  addScriptToPack,
  addSoundToPack,
  addSpriteToPack,
  addTextureSetToPack,
  addTextureToPackWithFile,
  getEnvironmentMapsByPack,
  getModelsByPack,
  getPackById,
  getScriptsByPack,
  getSoundsByPack,
  getSpritesByPack,
  getTextureSetsByPack,
  removeEnvironmentMapFromPack,
  removeModelFromPack,
  removeScriptFromPack,
  removeSoundFromPack,
  removeSpriteFromPack,
  removeTextureSetFromPack,
} from '@/features/pack/api/packApi'
import { ContainerViewer } from '@/shared/components/ContainerViewer'
import {
  type ContainerAdapter,
  type ContainerDto,
} from '@/shared/types/ContainerTypes'
import { type PackDetailDto } from '@/types'

import { PackDetailsPanel } from './PackDetailsPanel'

interface PackViewerProps {
  packId: number
  tabId?: string
}

function toContainerDto(pack: PackDetailDto): ContainerDto {
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    licenseType: pack.licenseType,
    url: pack.url,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    modelCount: pack.modelCount,
    globalMaterialCount: pack.globalMaterialCount,
    multiModelTextureCount: pack.multiModelTextureCount,
    spriteCount: pack.spriteCount,
    soundCount: pack.soundCount,
    scriptCount: pack.scriptCount ?? 0,
    environmentMapCount: pack.environmentMapCount ?? 0,
    isEmpty: pack.isEmpty,
    customThumbnailUrl: pack.customThumbnailUrl,
    models: pack.models,
    textureSets: pack.textureSets,
    sprites: pack.sprites,
    environmentMaps: pack.environmentMaps ?? [],
  }
}

export function PackViewer({ packId, tabId }: PackViewerProps) {
  const adapter = useMemo<ContainerAdapter>(
    () => ({
      type: 'pack',
      containerId: packId,
      label: 'Pack',
      cssPrefix: 'container',
      renderDetails: ({ container, refetchContainer, showToast }) => (
        <PackDetailsPanel
          pack={container as PackDetailDto}
          refetchContainer={refetchContainer}
          showToast={showToast}
        />
      ),
      loadContainer: async id => {
        const pack = await getPackById(id)
        return toContainerDto(pack)
      },
      loadModels: id => getModelsByPack(id),
      loadTextureSets: id => getTextureSetsByPack(id),
      loadSprites: id => getSpritesByPack(id),
      loadSounds: id => getSoundsByPack(id),
      loadScripts: id => getScriptsByPack(id),
      loadEnvironmentMaps: id => getEnvironmentMapsByPack(id),
      addModel: (cId, mId) => addModelToPack(cId, mId),
      removeModel: (cId, mId) => removeModelFromPack(cId, mId),
      addTextureSet: (cId, tsId) => addTextureSetToPack(cId, tsId),
      removeTextureSet: (cId, tsId) => removeTextureSetFromPack(cId, tsId),
      addSprite: (cId, sId) => addSpriteToPack(cId, sId),
      removeSprite: (cId, sId) => removeSpriteFromPack(cId, sId),
      addSound: (cId, sId) => addSoundToPack(cId, sId),
      removeSound: (cId, sId) => removeSoundFromPack(cId, sId),
      addScript: (cId, sId) => addScriptToPack(cId, sId),
      removeScript: (cId, sId) => removeScriptFromPack(cId, sId),
      addEnvironmentMap: (cId, environmentMapId) =>
        addEnvironmentMapToPack(cId, environmentMapId),
      removeEnvironmentMap: (cId, environmentMapId) =>
        removeEnvironmentMapFromPack(cId, environmentMapId),
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
      createScriptOptions: cId => ({ packId: cId }),
    }),
    [packId]
  )

  return <ContainerViewer adapter={adapter} tabId={tabId} />
}
