/**
 * ApiClient Facade
 *
 * This class delegates all API calls to feature-colocated modules
 * following the bulletproof-react pattern. Each feature has its own
 * api/ directory with domain-specific functions.
 *
 * For new code, prefer importing directly from feature modules:
 *   import { getModels } from '@/features/models/api/modelApi'
 *
 * This facade exists for backward compatibility with existing imports.
 */
import { baseURL } from '@/lib/apiBase'

// Feature API modules
import * as modelApi from '@/features/models/api/modelApi'
import * as modelVersionApi from '@/features/model-viewer/api/modelVersionApi'
import * as thumbnailApi from '@/shared/thumbnail/api/thumbnailApi'
import * as textureSetApi from '@/features/texture-set/api/textureSetApi'
import * as packApi from '@/features/pack/api/packApi'
import * as projectApi from '@/features/project/api/projectApi'
import * as spriteApi from '@/features/sprite/api/spriteApi'
import * as soundApi from '@/features/sounds/api/soundApi'
import * as recycledApi from '@/features/recycled-files/api/recycledApi'
import * as stageApi from '@/features/stage-editor/api/stageApi'
import * as historyApi from '@/features/history/api/historyApi'
import * as settingsApi from '@/features/settings/api/settingsApi'

// Re-export types that were previously defined here
export type { UploadModelResponse } from '../features/models/api/modelApi'
export type { ThumbnailStatus } from '../shared/thumbnail/api/thumbnailApi'

class ApiClient {
  // Base
  getBaseURL(): string {
    return baseURL
  }

  // Model methods
  uploadModel = modelApi.uploadModel
  uploadFile = modelApi.uploadFile
  getModels = modelApi.getModels
  getModelsPaginated = modelApi.getModelsPaginated
  getModelById = modelApi.getModelById
  getModelFileUrl = modelApi.getModelFileUrl
  getFileUrl = modelApi.getFileUrl
  updateModelTags = modelApi.updateModelTags
  softDeleteModel = modelApi.softDeleteModel
  setDefaultTextureSet = modelApi.setDefaultTextureSet

  // Model Version methods
  getModelVersions = modelVersionApi.getModelVersions
  getModelVersion = modelVersionApi.getModelVersion
  createModelVersion = modelVersionApi.createModelVersion
  addFileToVersion = modelVersionApi.addFileToVersion
  getVersionFileUrl = modelVersionApi.getVersionFileUrl
  setActiveVersion = modelVersionApi.setActiveVersion
  softDeleteModelVersion = modelVersionApi.softDeleteModelVersion

  // Thumbnail methods
  getThumbnailStatus = thumbnailApi.getThumbnailStatus
  getVersionThumbnailStatus = thumbnailApi.getVersionThumbnailStatus
  getThumbnailUrl = thumbnailApi.getThumbnailUrl
  getVersionThumbnailUrl = thumbnailApi.getVersionThumbnailUrl
  getWaveformUrl = thumbnailApi.getWaveformUrl
  getThumbnailFile = thumbnailApi.getThumbnailFile
  regenerateThumbnail = thumbnailApi.regenerateThumbnail

  // TextureSet methods
  getAllTextureSets = textureSetApi.getAllTextureSets
  getTextureSetsPaginated = textureSetApi.getTextureSetsPaginated
  getTextureSetById = textureSetApi.getTextureSetById
  getTextureSetByFileId = textureSetApi.getTextureSetByFileId
  createTextureSet = textureSetApi.createTextureSet
  createTextureSetWithFile = textureSetApi.createTextureSetWithFile
  updateTextureSet = textureSetApi.updateTextureSet
  deleteTextureSet = textureSetApi.deleteTextureSet
  hardDeleteTextureSet = textureSetApi.hardDeleteTextureSet
  addTextureToSetEndpoint = textureSetApi.addTextureToSetEndpoint
  removeTextureFromSet = textureSetApi.removeTextureFromSet
  changeTextureType = textureSetApi.changeTextureType
  changeTextureChannel = textureSetApi.changeTextureChannel
  associateTextureSetWithModelVersion =
    textureSetApi.associateTextureSetWithModelVersion
  disassociateTextureSetFromModelVersion =
    textureSetApi.disassociateTextureSetFromModelVersion
  associateTextureSetWithAllModelVersions =
    textureSetApi.associateTextureSetWithAllModelVersions
  softDeleteTextureSet = textureSetApi.softDeleteTextureSet

  // Pack methods
  getAllPacks = packApi.getAllPacks
  getPackById = packApi.getPackById
  createPack = packApi.createPack
  updatePack = packApi.updatePack
  deletePack = packApi.deletePack
  addModelToPack = packApi.addModelToPack
  removeModelFromPack = packApi.removeModelFromPack
  addTextureSetToPack = packApi.addTextureSetToPack
  addTextureToPackWithFile = packApi.addTextureToPackWithFile
  removeTextureSetFromPack = packApi.removeTextureSetFromPack
  getModelsByPack = packApi.getModelsByPack
  getTextureSetsByPack = packApi.getTextureSetsByPack
  addSpriteToPack = packApi.addSpriteToPack
  removeSpriteFromPack = packApi.removeSpriteFromPack
  getSpritesByPack = packApi.getSpritesByPack
  addSoundToPack = packApi.addSoundToPack
  removeSoundFromPack = packApi.removeSoundFromPack
  getSoundsByPack = packApi.getSoundsByPack

  // Project methods
  getAllProjects = projectApi.getAllProjects
  getProjectById = projectApi.getProjectById
  createProject = projectApi.createProject
  updateProject = projectApi.updateProject
  deleteProject = projectApi.deleteProject
  addModelToProject = projectApi.addModelToProject
  removeModelFromProject = projectApi.removeModelFromProject
  addTextureSetToProject = projectApi.addTextureSetToProject
  addTextureToProjectWithFile = projectApi.addTextureToProjectWithFile
  removeTextureSetFromProject = projectApi.removeTextureSetFromProject
  getModelsByProject = projectApi.getModelsByProject
  getTextureSetsByProject = projectApi.getTextureSetsByProject
  addSpriteToProject = projectApi.addSpriteToProject
  removeSpriteFromProject = projectApi.removeSpriteFromProject
  getSpritesByProject = projectApi.getSpritesByProject
  addSoundToProject = projectApi.addSoundToProject
  removeSoundFromProject = projectApi.removeSoundFromProject
  getSoundsByProject = projectApi.getSoundsByProject

  // Sprite methods
  getAllSprites = spriteApi.getAllSprites
  getSpritesPaginated = spriteApi.getSpritesPaginated
  getSpriteById = spriteApi.getSpriteById
  createSpriteWithFile = spriteApi.createSpriteWithFile
  updateSprite = spriteApi.updateSprite
  softDeleteSprite = spriteApi.softDeleteSprite
  getAllSpriteCategories = spriteApi.getAllSpriteCategories
  createSpriteCategory = spriteApi.createSpriteCategory
  updateSpriteCategory = spriteApi.updateSpriteCategory
  deleteSpriteCategory = spriteApi.deleteSpriteCategory

  // Sound methods
  getAllSounds = soundApi.getAllSounds
  getSoundsPaginated = soundApi.getSoundsPaginated
  getSoundById = soundApi.getSoundById
  createSoundWithFile = soundApi.createSoundWithFile
  updateSound = soundApi.updateSound
  deleteSound = soundApi.deleteSound
  softDeleteSound = soundApi.softDeleteSound
  getAllSoundCategories = soundApi.getAllSoundCategories
  createSoundCategory = soundApi.createSoundCategory
  updateSoundCategory = soundApi.updateSoundCategory
  deleteSoundCategory = soundApi.deleteSoundCategory

  // Recycled Files methods
  getAllRecycledFiles = recycledApi.getAllRecycledFiles
  restoreEntity = recycledApi.restoreEntity
  getDeletePreview = recycledApi.getDeletePreview
  permanentlyDeleteEntity = recycledApi.permanentlyDeleteEntity

  // Stage methods
  createStage = stageApi.createStage
  getAllStages = stageApi.getAllStages
  getStageById = stageApi.getStageById
  updateStage = stageApi.updateStage

  // History methods
  getBatchUploadHistory = historyApi.getBatchUploadHistory

  // Settings methods
  getSettings = settingsApi.getSettings
  updateSettings = settingsApi.updateSettings
  refreshCache = settingsApi.refreshCache
}

export const apiClient = new ApiClient()
