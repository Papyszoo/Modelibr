import { useMemo } from 'react'
import { ContainerViewer } from '@/shared/components/ContainerViewer'
import { ContainerAdapter, ContainerDto } from '@/shared/types/ContainerTypes'
import { ProjectDto } from '@/types'
import {
  getProjectById,
  getModelsByProject,
  getTextureSetsByProject,
  getSpritesByProject,
  getSoundsByProject,
  addModelToProject,
  removeModelFromProject,
  addTextureSetToProject,
  removeTextureSetFromProject,
  addSpriteToProject,
  removeSpriteFromProject,
  addSoundToProject,
  removeSoundFromProject,
  addTextureToProjectWithFile,
} from '@/features/project/api/projectApi'

interface ProjectViewerProps {
  projectId: number
  tabId?: string
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

export function ProjectViewer({
  projectId,
  tabId,
}: ProjectViewerProps) {
  const adapter = useMemo<ContainerAdapter>(
    () => ({
      type: 'project',
      containerId: projectId,
      label: 'Project',
      cssPrefix: 'container',
      loadContainer: async id => {
        const project = await getProjectById(id)
        return toContainerDto(project)
      },
      loadModels: id => getModelsByProject(id),
      loadTextureSets: id => getTextureSetsByProject(id),
      loadSprites: id => getSpritesByProject(id),
      loadSounds: id => getSoundsByProject(id),
      addModel: (cId, mId) => addModelToProject(cId, mId),
      removeModel: (cId, mId) => removeModelFromProject(cId, mId),
      addTextureSet: (cId, tsId) => addTextureSetToProject(cId, tsId),
      removeTextureSet: (cId, tsId) => removeTextureSetFromProject(cId, tsId),
      addSprite: (cId, sId) => addSpriteToProject(cId, sId),
      removeSprite: (cId, sId) => removeSpriteFromProject(cId, sId),
      addSound: (cId, sId) => addSoundToProject(cId, sId),
      removeSound: (cId, sId) => removeSoundFromProject(cId, sId),
      uploadTextureWithFile: (
        cId,
        file,
        name,
        textureType,
        batchId,
        _uploadType
      ) => addTextureToProjectWithFile(cId, file, name, textureType, batchId),
      createSpriteOptions: cId => ({ projectId: cId }),
      createSoundOptions: cId => ({ projectId: cId }),
    }),
    [projectId]
  )

  return <ContainerViewer adapter={adapter} tabId={tabId} />
}
