import { useMemo } from 'react'
import { ContainerViewer } from '../../../shared/components/ContainerViewer'
import {
  ContainerAdapter,
  ContainerDto,
} from '../../../shared/types/ContainerTypes'
import ApiClient from '../../../services/ApiClient'
import { ProjectDto } from '../../../types'

interface ProjectViewerProps {
  projectId: number
}

function toContainerDto(project: ProjectDto): ContainerDto {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    modelCount: project.modelCount,
    textureSetCount: project.textureSetCount,
    spriteCount: project.spriteCount,
    soundCount: project.soundCount,
    isEmpty: project.isEmpty,
    models: project.models,
    textureSets: project.textureSets,
    sprites: project.sprites,
  }
}

export default function ProjectViewer({ projectId }: ProjectViewerProps) {
  const adapter = useMemo<ContainerAdapter>(
    () => ({
      type: 'project',
      containerId: projectId,
      label: 'Project',
      cssPrefix: 'container',
      loadContainer: async id => {
        const project = await ApiClient.getProjectById(id)
        return toContainerDto(project)
      },
      loadModels: id => ApiClient.getModelsByProject(id),
      loadTextureSets: id => ApiClient.getTextureSetsByProject(id),
      loadSprites: id => ApiClient.getSpritesByProject(id),
      loadSounds: id => ApiClient.getSoundsByProject(id),
      addModel: (cId, mId) => ApiClient.addModelToProject(cId, mId),
      removeModel: (cId, mId) => ApiClient.removeModelFromProject(cId, mId),
      addTextureSet: (cId, tsId) => ApiClient.addTextureSetToProject(cId, tsId),
      removeTextureSet: (cId, tsId) =>
        ApiClient.removeTextureSetFromProject(cId, tsId),
      addSprite: (cId, sId) => ApiClient.addSpriteToProject(cId, sId),
      removeSprite: (cId, sId) => ApiClient.removeSpriteFromProject(cId, sId),
      addSound: (cId, sId) => ApiClient.addSoundToProject(cId, sId),
      removeSound: (cId, sId) => ApiClient.removeSoundFromProject(cId, sId),
      uploadTextureWithFile: (
        cId,
        file,
        name,
        textureType,
        batchId,
        _uploadType
      ) =>
        ApiClient.addTextureToProjectWithFile(
          cId,
          file,
          name,
          textureType,
          batchId
        ),
      createSpriteOptions: cId => ({ projectId: cId }),
      createSoundOptions: cId => ({ projectId: cId }),
    }),
    [projectId]
  )

  return <ContainerViewer adapter={adapter} />
}
