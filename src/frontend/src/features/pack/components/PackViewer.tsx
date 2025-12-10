import { useState, useEffect, useRef } from 'react'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { Dialog } from 'primereact/dialog'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { InputText } from 'primereact/inputtext'
import { Checkbox } from 'primereact/checkbox'
import ApiClient from '../../../services/ApiClient'
import {
  PackDto,
  Model,
  TextureSetDto,
  TextureType,
  SpriteDto,
} from '../../../types'
import { ThumbnailDisplay } from '../../thumbnail'
import { UploadableGrid } from '../../../shared/components'
import { useTabContext } from '../../../hooks/useTabContext'
import { useUploadProgress } from '../../../hooks/useUploadProgress'
import './PackViewer.css'

interface PackViewerProps {
  packId: number
}

export default function PackViewer({ packId }: PackViewerProps) {
  const [pack, setPack] = useState<PackDto | null>(null)
  const [models, setModels] = useState<Model[]>([])
  const [textureSets, setTextureSets] = useState<TextureSetDto[]>([])
  const [sprites, setSprites] = useState<SpriteDto[]>([])
  const [allModels, setAllModels] = useState<Model[]>([])
  const [allTextureSets, setAllTextureSets] = useState<TextureSetDto[]>([])
  const [allSprites, setAllSprites] = useState<SpriteDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModelDialog, setShowAddModelDialog] = useState(false)
  const [showAddTextureSetDialog, setShowAddTextureSetDialog] = useState(false)
  const [showAddSpriteDialog, setShowAddSpriteDialog] = useState(false)
  const [showSpriteModal, setShowSpriteModal] = useState(false)
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [textureSetSearchQuery, setTextureSetSearchQuery] = useState('')
  const [spriteSearchQuery, setSpriteSearchQuery] = useState('')
  const [selectedModelIds, setSelectedModelIds] = useState<number[]>([])
  const [selectedTextureSetIds, setSelectedTextureSetIds] = useState<number[]>(
    []
  )
  const [selectedSpriteIds, setSelectedSpriteIds] = useState<number[]>([])
  const [uploadingModel, setUploadingModel] = useState(false)
  const [uploadingTextureSet, setUploadingTextureSet] = useState(false)
  const [uploadingSprite, setUploadingSprite] = useState(false)
  const toast = useRef<Toast>(null)
  const modelContextMenu = useRef<ContextMenu>(null)
  const textureSetContextMenu = useRef<ContextMenu>(null)
  const spriteContextMenu = useRef<ContextMenu>(null)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [selectedTextureSet, setSelectedTextureSet] =
    useState<TextureSetDto | null>(null)
  const [selectedSprite, setSelectedSprite] = useState<SpriteDto | null>(null)
  const { openModelDetailsTab, openTextureSetDetailsTab } = useTabContext()
  const uploadProgressContext = useUploadProgress()

  useEffect(() => {
    loadPack()
    loadPackContent()
  }, [packId])

  const loadPack = async () => {
    try {
      const data = await ApiClient.getPackById(packId)
      setPack(data)
    } catch (error) {
      console.error('Failed to load pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load pack',
        life: 3000,
      })
    }
  }

  const loadPackContent = async () => {
    try {
      setLoading(true)
      const [modelsData, textureSetsData, spritesData] = await Promise.all([
        ApiClient.getModelsByPack(packId),
        ApiClient.getTextureSetsByPack(packId),
        ApiClient.getSpritesByPack(packId),
      ])
      setModels(modelsData)
      setTextureSets(textureSetsData)
      setSprites(spritesData)
    } catch (error) {
      console.error('Failed to load pack content:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load pack content',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableModels = async () => {
    try {
      const response = await ApiClient.getModels()
      // Filter out models already in this pack
      const modelIds = models.map(m => m.id)
      const available = response.filter(m => !modelIds.includes(m.id))
      setAllModels(available)
    } catch (error) {
      console.error('Failed to load models:', error)
    }
  }

  const loadAvailableTextureSets = async () => {
    try {
      const response = await ApiClient.getAllTextureSets()
      // Filter out texture sets already in this pack
      const textureSetIds = textureSets.map(ts => ts.id)
      const available = response.filter(ts => !textureSetIds.includes(ts.id))
      setAllTextureSets(available)
    } catch (error) {
      console.error('Failed to load texture sets:', error)
    }
  }

  const loadAvailableSprites = async () => {
    try {
      const response = await ApiClient.getAllSprites()
      // Filter out sprites already in this pack
      const spriteIds = sprites.map(s => s.id)
      const available = (response.sprites || []).filter(
        s => !spriteIds.includes(s.id)
      )
      setAllSprites(available)
    } catch (error) {
      console.error('Failed to load sprites:', error)
    }
  }

  const handleRemoveModel = async (modelId: number) => {
    try {
      await ApiClient.removeModelFromPack(packId, modelId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Model removed from pack',
        life: 3000,
      })
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to remove model:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to remove model from pack',
        life: 3000,
      })
    }
  }

  const handleRemoveTextureSet = async (textureSetId: number) => {
    try {
      await ApiClient.removeTextureSetFromPack(packId, textureSetId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set removed from pack',
        life: 3000,
      })
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to remove texture set:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to remove texture set from pack',
        life: 3000,
      })
    }
  }

  const handleRemoveSprite = async (spriteId: number) => {
    try {
      await ApiClient.removeSpriteFromPack(packId, spriteId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Sprite removed from pack',
        life: 3000,
      })
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to remove sprite:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to remove sprite from pack',
        life: 3000,
      })
    }
  }

  const handleAddModels = async () => {
    if (selectedModelIds.length === 0) return

    try {
      await Promise.all(
        selectedModelIds.map(modelId =>
          ApiClient.addModelToPack(packId, modelId)
        )
      )
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${selectedModelIds.length} model(s) added to pack`,
        life: 3000,
      })
      setShowAddModelDialog(false)
      setSelectedModelIds([])
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to add models:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add models to pack',
        life: 3000,
      })
    }
  }

  const handleAddTextureSets = async () => {
    if (selectedTextureSetIds.length === 0) return

    try {
      await Promise.all(
        selectedTextureSetIds.map(textureSetId =>
          ApiClient.addTextureSetToPack(packId, textureSetId)
        )
      )
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${selectedTextureSetIds.length} texture set(s) added to pack`,
        life: 3000,
      })
      setShowAddTextureSetDialog(false)
      setSelectedTextureSetIds([])
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to add texture sets:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add texture sets to pack',
        life: 3000,
      })
    }
  }

  const handleAddSprites = async () => {
    if (selectedSpriteIds.length === 0) return

    try {
      await Promise.all(
        selectedSpriteIds.map(spriteId =>
          ApiClient.addSpriteToPack(packId, spriteId)
        )
      )
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${selectedSpriteIds.length} sprite(s) added to pack`,
        life: 3000,
      })
      setShowAddSpriteDialog(false)
      setSelectedSpriteIds([])
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to add sprites:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add sprites to pack',
        life: 3000,
      })
    }
  }

  const handleModelUpload = async (files: File[]) => {
    if (files.length === 0) return

    try {
      setUploadingModel(true)

      let newCount = 0
      let existingCount = 0

      // Create batch for all uploads (even single files need batch tracking)
      const batchId = uploadProgressContext
        ? uploadProgressContext.createBatch()
        : undefined

      // Upload all files and add them to pack
      const uploadPromises = files.map(async file => {
        let uploadId: string | null = null
        try {
          // Track the upload with batchId
          uploadId =
            uploadProgressContext?.addUpload(file, 'model', batchId) || null

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 50)
          }

          const response = await ApiClient.uploadModel(file, { batchId })

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 75)
          }

          await ApiClient.addModelToPack(packId, response.id)

          // Count new vs existing models
          if (response.alreadyExists) {
            existingCount++
          } else {
            newCount++
          }

          // Complete upload
          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 100)
            uploadProgressContext.completeUpload(uploadId, response)
          }

          // Trigger thumbnail generation if not already exists
          if (!response.alreadyExists) {
            try {
              await ApiClient.regenerateThumbnail(response.id.toString())
            } catch (err) {
              console.warn('Failed to generate thumbnail:', err)
            }
          }
          return response
        } catch (error) {
          // Mark upload as failed
          if (uploadId && uploadProgressContext) {
            uploadProgressContext.failUpload(uploadId, error as Error)
          }
          throw error
        }
      })

      await Promise.all(uploadPromises)

      // Show appropriate success message
      let message = ''
      if (newCount > 0 && existingCount > 0) {
        message = `${newCount} new model(s) uploaded and ${existingCount} existing linked to pack`
      } else if (newCount > 0) {
        message = `${newCount} model(s) uploaded and added to pack`
      } else {
        message = `${existingCount} existing model(s) linked to pack`
      }

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: message,
        life: 3000,
      })
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to upload models:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to upload models',
        life: 3000,
      })
    } finally {
      setUploadingModel(false)
    }
  }

  const handleTextureUpload = async (files: File[]) => {
    if (files.length === 0) return

    try {
      setUploadingTextureSet(true)

      let newCount = 0

      // Create batch for all uploads (even single files need batch tracking)
      const batchId = uploadProgressContext
        ? uploadProgressContext.createBatch()
        : undefined

      // Upload all texture files and create/link texture sets to pack
      const uploadPromises = files.map(async file => {
        let uploadId: string | null = null
        try {
          // Track the upload with batchId
          uploadId =
            uploadProgressContext?.addUpload(file, 'texture', batchId) || null

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 30)
          }

          const setName = file.name.replace(/\.[^/.]+$/, '')

          // Use consolidated endpoint that handles file upload, texture set creation, and pack association
          const response = await ApiClient.addTextureToPackWithFile(
            packId,
            file,
            setName,
            1, // TextureType.Albedo (enum starts at 1)
            batchId
          )

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 100)
            uploadProgressContext.completeUpload(uploadId, response)
          }

          newCount++
          return response.textureSetId
        } catch (error) {
          // Mark upload as failed
          if (uploadId && uploadProgressContext) {
            uploadProgressContext.failUpload(uploadId, error as Error)
          }
          throw error
        }
      })

      await Promise.all(uploadPromises)

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${newCount} texture(s) uploaded and added to pack`,
        life: 3000,
      })
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to upload textures:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to upload textures',
        life: 3000,
      })
    } finally {
      setUploadingTextureSet(false)
    }
  }

  const handleModelDrop = (files: File[]) => {
    handleModelUpload(files)
  }

  const handleTextureDrop = (files: File[]) => {
    handleTextureUpload(files)
  }

  const handleSpriteUpload = async (files: File[]) => {
    if (files.length === 0) return

    try {
      setUploadingSprite(true)

      let newCount = 0

      // Create batch for all uploads
      const batchId = uploadProgressContext
        ? uploadProgressContext.createBatch()
        : undefined

      // Upload all sprite files and add them to pack
      const uploadPromises = files.map(async file => {
        let uploadId: string | null = null
        try {
          // Track the upload with batchId
          uploadId =
            uploadProgressContext?.addUpload(file, 'sprite', batchId) || null

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 30)
          }

          const spriteName = file.name.replace(/\.[^/.]+$/, '')

          // Create sprite with file
          const response = await ApiClient.createSpriteWithFile(file, {
            name: spriteName,
            batchId,
            packId,
          })

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 70)
          }

          // Add sprite to pack
          await ApiClient.addSpriteToPack(packId, response.spriteId)

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 100)
            uploadProgressContext.completeUpload(uploadId, response)
          }

          newCount++
          return response.spriteId
        } catch (error) {
          // Mark upload as failed
          if (uploadId && uploadProgressContext) {
            uploadProgressContext.failUpload(uploadId, error as Error)
          }
          throw error
        }
      })

      await Promise.all(uploadPromises)

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${newCount} sprite(s) uploaded and added to pack`,
        life: 3000,
      })
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to upload sprites:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to upload sprites',
        life: 3000,
      })
    } finally {
      setUploadingSprite(false)
    }
  }

  const handleSpriteDrop = (files: File[]) => {
    handleSpriteUpload(files)
  }

  const toggleModelSelection = (modelId: number) => {
    setSelectedModelIds(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    )
  }

  const toggleTextureSetSelection = (textureSetId: number) => {
    setSelectedTextureSetIds(prev =>
      prev.includes(textureSetId)
        ? prev.filter(id => id !== textureSetId)
        : [...prev, textureSetId]
    )
  }

  const toggleSpriteSelection = (spriteId: number) => {
    setSelectedSpriteIds(prev =>
      prev.includes(spriteId)
        ? prev.filter(id => id !== spriteId)
        : [...prev, spriteId]
    )
  }

  const getModelName = (model: Model) => {
    return model.files && model.files.length > 0
      ? model.files[0].originalFileName
      : model.name || `Model ${model.id}`
  }

  const getAlbedoTextureUrl = (textureSet: TextureSetDto) => {
    const albedo = textureSet.textures?.find(
      t => t.textureType === TextureType.Albedo
    )
    const diffuse = textureSet.textures?.find(
      t => t.textureType === TextureType.Diffuse
    )
    const texture = albedo || diffuse
    if (texture) {
      return ApiClient.getFileUrl(texture.fileId.toString())
    }
    return null
  }

  const getSpriteTypeName = (type: number): string => {
    switch (type) {
      case 1:
        return 'Static'
      case 2:
        return 'Sprite Sheet'
      case 3:
        return 'GIF'
      case 4:
        return 'APNG'
      case 5:
        return 'Animated WebP'
      default:
        return 'Unknown'
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const openSpriteModal = (sprite: SpriteDto) => {
    setSelectedSprite(sprite)
    setShowSpriteModal(true)
  }

  const handleDownloadSprite = async () => {
    if (!selectedSprite) return

    try {
      const url = ApiClient.getFileUrl(selectedSprite.fileId.toString())
      const response = await fetch(url)
      const blob = await response.blob()

      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      const extension = selectedSprite.fileName.split('.').pop() || 'png'
      link.download = `${selectedSprite.name}.${extension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    } catch (error) {
      console.error('Failed to download sprite:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to download sprite',
        life: 3000,
      })
    }
  }

  const modelContextMenuItems: MenuItem[] = [
    {
      label: 'Remove from pack',
      icon: 'pi pi-times',
      command: () => {
        if (selectedModel) {
          handleRemoveModel(selectedModel.id)
        }
      },
    },
  ]

  const textureSetContextMenuItems: MenuItem[] = [
    {
      label: 'Remove from pack',
      icon: 'pi pi-times',
      command: () => {
        if (selectedTextureSet) {
          handleRemoveTextureSet(selectedTextureSet.id)
        }
      },
    },
  ]

  const spriteContextMenuItems: MenuItem[] = [
    {
      label: 'Remove from pack',
      icon: 'pi pi-times',
      command: () => {
        if (selectedSprite) {
          handleRemoveSprite(selectedSprite.id)
        }
      },
    },
  ]

  const filteredAvailableModels = allModels.filter(model => {
    const modelName = getModelName(model).toLowerCase()
    return modelName.includes(modelSearchQuery.toLowerCase())
  })

  const filteredAvailableTextureSets = allTextureSets.filter(textureSet => {
    const name = textureSet.name.toLowerCase()
    return name.includes(textureSetSearchQuery.toLowerCase())
  })

  const filteredAvailableSprites = allSprites.filter(sprite => {
    const name = sprite.name.toLowerCase()
    return name.includes(spriteSearchQuery.toLowerCase())
  })

  if (!pack) {
    return <div>Loading...</div>
  }

  return (
    <div className="pack-viewer">
      <Toast ref={toast} />
      <ContextMenu model={modelContextMenuItems} ref={modelContextMenu} />
      <ContextMenu
        model={textureSetContextMenuItems}
        ref={textureSetContextMenu}
      />
      <ContextMenu model={spriteContextMenuItems} ref={spriteContextMenu} />

      <div className="pack-header">
        <div>
          <h2>{pack.name}</h2>
          {pack.description && (
            <p className="pack-description">{pack.description}</p>
          )}
        </div>
        <div className="pack-stats">
          <span>{pack.modelCount} models</span>
          <span>{pack.textureSetCount} texture sets</span>
          <span>{pack.spriteCount} sprites</span>
        </div>
      </div>

      <div className="pack-content">
        {/* Models Section */}
        <div className="pack-section">
          <h3>Models</h3>

          <UploadableGrid
            onFilesDropped={handleModelDrop}
            isUploading={uploadingModel}
            uploadMessage="Drop model files here to upload to pack"
            className="pack-grid-wrapper"
          >
            <div className="pack-grid">
              {models.map(model => (
                <div
                  key={model.id}
                  className="pack-card"
                  onClick={() => openModelDetailsTab(model.id, model.name)}
                  onContextMenu={e => {
                    e.preventDefault()
                    setSelectedModel(model)
                    modelContextMenu.current?.show(e)
                  }}
                >
                  <div className="pack-card-thumbnail">
                    <ThumbnailDisplay modelId={model.id} />
                    <div className="pack-card-overlay">
                      <span className="pack-card-name">
                        {getModelName(model)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {/* Add New Card */}
              <div
                className="pack-card pack-card-add"
                onClick={() => {
                  loadAvailableModels()
                  setModelSearchQuery('')
                  setSelectedModelIds([])
                  setShowAddModelDialog(true)
                }}
              >
                <div className="pack-card-add-content">
                  <i className="pi pi-plus" />
                  <span>Add Model</span>
                </div>
              </div>
            </div>
          </UploadableGrid>
        </div>

        {/* Texture Sets Section */}
        <div className="pack-section">
          <h3>Texture Sets</h3>

          <UploadableGrid
            onFilesDropped={handleTextureDrop}
            isUploading={uploadingTextureSet}
            uploadMessage="Drop texture files here to create and add to pack"
            className="pack-grid-wrapper"
          >
            <div className="pack-grid">
              {textureSets.map(textureSet => {
                const albedoUrl = getAlbedoTextureUrl(textureSet)
                return (
                  <div
                    key={textureSet.id}
                    className="pack-card"
                    onClick={() => openTextureSetDetailsTab(textureSet.id, textureSet.name)}
                    onContextMenu={e => {
                      e.preventDefault()
                      setSelectedTextureSet(textureSet)
                      textureSetContextMenu.current?.show(e)
                    }}
                  >
                    <div className="pack-card-thumbnail">
                      {albedoUrl ? (
                        <img
                          src={albedoUrl}
                          alt={textureSet.name}
                          className="pack-card-image"
                        />
                      ) : (
                        <div className="pack-card-placeholder">
                          <i className="pi pi-image" />
                          <span>No Preview</span>
                        </div>
                      )}
                      <div className="pack-card-overlay">
                        <span className="pack-card-name">
                          {textureSet.name}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {/* Add New Card */}
              <div
                className="pack-card pack-card-add"
                onClick={() => {
                  loadAvailableTextureSets()
                  setTextureSetSearchQuery('')
                  setSelectedTextureSetIds([])
                  setShowAddTextureSetDialog(true)
                }}
              >
                <div className="pack-card-add-content">
                  <i className="pi pi-plus" />
                  <span>Add Texture Set</span>
                </div>
              </div>
            </div>
          </UploadableGrid>
        </div>

        {/* Sprites Section */}
        <div className="pack-section">
          <h3>Sprites</h3>

          <UploadableGrid
            onFilesDropped={handleSpriteDrop}
            isUploading={uploadingSprite}
            uploadMessage="Drop image files here to create sprites and add to pack"
            className="pack-grid-wrapper"
          >
            <div className="pack-grid">
              {sprites.map(sprite => {
                const spriteUrl = ApiClient.getFileUrl(sprite.fileId.toString())
                return (
                  <div
                    key={sprite.id}
                    className="pack-card"
                    onClick={() => openSpriteModal(sprite)}
                    onContextMenu={e => {
                      e.preventDefault()
                      setSelectedSprite(sprite)
                      spriteContextMenu.current?.show(e)
                    }}
                  >
                    <div className="pack-card-thumbnail">
                      {spriteUrl ? (
                        <img
                          src={spriteUrl}
                          alt={sprite.name}
                          className="pack-card-image"
                        />
                      ) : (
                        <div className="pack-card-placeholder">
                          <i className="pi pi-image" />
                          <span>No Preview</span>
                        </div>
                      )}
                      <div className="pack-card-overlay">
                        <span className="pack-card-name">{sprite.name}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {/* Add New Card */}
              <div
                className="pack-card pack-card-add"
                onClick={() => {
                  loadAvailableSprites()
                  setSpriteSearchQuery('')
                  setSelectedSpriteIds([])
                  setShowAddSpriteDialog(true)
                }}
              >
                <div className="pack-card-add-content">
                  <i className="pi pi-plus" />
                  <span>Add Sprite</span>
                </div>
              </div>
            </div>
          </UploadableGrid>
        </div>
      </div>

      {/* Add Model Dialog */}
      <Dialog
        header="Add Models to Pack"
        visible={showAddModelDialog}
        style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
        onHide={() => {
          setShowAddModelDialog(false)
          setSelectedModelIds([])
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                setShowAddModelDialog(false)
                setSelectedModelIds([])
              }}
              className="p-button-text"
            />
            <Button
              label={`Add Selected (${selectedModelIds.length})`}
              icon="pi pi-check"
              onClick={handleAddModels}
              disabled={selectedModelIds.length === 0}
            />
          </div>
        }
      >
        <div className="add-dialog-content">
          <div className="search-bar">
            <i className="pi pi-search" />
            <InputText
              type="text"
              placeholder="Search models..."
              value={modelSearchQuery}
              onChange={e => setModelSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>
          <div className="pack-grid scrollable-grid">
            {filteredAvailableModels.map(model => {
              const isSelected = selectedModelIds.includes(model.id)
              return (
                <div
                  key={model.id}
                  className={`pack-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleModelSelection(model.id)}
                >
                  <div className="pack-card-checkbox">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleModelSelection(model.id)}
                    />
                  </div>
                  <div className="pack-card-thumbnail">
                    <ThumbnailDisplay modelId={model.id} />
                    <div className="pack-card-overlay">
                      <span className="pack-card-name">
                        {getModelName(model)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {filteredAvailableModels.length === 0 && (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No models available to add</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Add Texture Set Dialog */}
      <Dialog
        header="Add Texture Sets to Pack"
        visible={showAddTextureSetDialog}
        style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
        onHide={() => {
          setShowAddTextureSetDialog(false)
          setSelectedTextureSetIds([])
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                setShowAddTextureSetDialog(false)
                setSelectedTextureSetIds([])
              }}
              className="p-button-text"
            />
            <Button
              label={`Add Selected (${selectedTextureSetIds.length})`}
              icon="pi pi-check"
              onClick={handleAddTextureSets}
              disabled={selectedTextureSetIds.length === 0}
            />
          </div>
        }
      >
        <div className="add-dialog-content">
          <div className="search-bar">
            <i className="pi pi-search" />
            <InputText
              type="text"
              placeholder="Search texture sets..."
              value={textureSetSearchQuery}
              onChange={e => setTextureSetSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>
          <div className="pack-grid scrollable-grid">
            {filteredAvailableTextureSets.map(textureSet => {
              const albedoUrl = getAlbedoTextureUrl(textureSet)
              const isSelected = selectedTextureSetIds.includes(textureSet.id)
              return (
                <div
                  key={textureSet.id}
                  className={`pack-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleTextureSetSelection(textureSet.id)}
                >
                  <div className="pack-card-checkbox">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleTextureSetSelection(textureSet.id)}
                    />
                  </div>
                  <div className="pack-card-thumbnail">
                    {albedoUrl ? (
                      <img
                        src={albedoUrl}
                        alt={textureSet.name}
                        className="pack-card-image"
                      />
                    ) : (
                      <div className="pack-card-placeholder">
                        <i className="pi pi-image" />
                        <span>No Preview</span>
                      </div>
                    )}
                    <div className="pack-card-overlay">
                      <span className="pack-card-name">{textureSet.name}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {filteredAvailableTextureSets.length === 0 && (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No texture sets available to add</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Add Sprite Dialog */}
      <Dialog
        header="Add Sprites to Pack"
        visible={showAddSpriteDialog}
        style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
        onHide={() => {
          setShowAddSpriteDialog(false)
          setSelectedSpriteIds([])
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                setShowAddSpriteDialog(false)
                setSelectedSpriteIds([])
              }}
              className="p-button-text"
            />
            <Button
              label={`Add Selected (${selectedSpriteIds.length})`}
              icon="pi pi-check"
              onClick={handleAddSprites}
              disabled={selectedSpriteIds.length === 0}
            />
          </div>
        }
      >
        <div className="add-dialog-content">
          <div className="search-bar">
            <i className="pi pi-search" />
            <InputText
              type="text"
              placeholder="Search sprites..."
              value={spriteSearchQuery}
              onChange={e => setSpriteSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>
          <div className="pack-grid scrollable-grid">
            {filteredAvailableSprites.map(sprite => {
              const spriteUrl = ApiClient.getFileUrl(sprite.fileId.toString())
              const isSelected = selectedSpriteIds.includes(sprite.id)
              return (
                <div
                  key={sprite.id}
                  className={`pack-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSpriteSelection(sprite.id)}
                >
                  <div className="pack-card-checkbox">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleSpriteSelection(sprite.id)}
                    />
                  </div>
                  <div className="pack-card-thumbnail">
                    {spriteUrl ? (
                      <img
                        src={spriteUrl}
                        alt={sprite.name}
                        className="pack-card-image"
                      />
                    ) : (
                      <div className="pack-card-placeholder">
                        <i className="pi pi-image" />
                        <span>No Preview</span>
                      </div>
                    )}
                    <div className="pack-card-overlay">
                      <span className="pack-card-name">{sprite.name}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {filteredAvailableSprites.length === 0 && (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No sprites available to add</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Sprite Detail Modal */}
      <Dialog
        header={selectedSprite?.name || 'Sprite'}
        visible={showSpriteModal}
        onHide={() => setShowSpriteModal(false)}
        style={{ width: '600px' }}
        className="sprite-detail-modal"
      >
        {selectedSprite && (
          <div className="sprite-modal-content">
            <div className="sprite-modal-preview">
              <img
                src={ApiClient.getFileUrl(selectedSprite.fileId.toString())}
                alt={selectedSprite.name}
              />
            </div>
            <div className="sprite-modal-info">
              <div className="sprite-modal-details">
                <p>
                  <strong>Type:</strong>{' '}
                  {getSpriteTypeName(selectedSprite.spriteType)}
                </p>
                <p>
                  <strong>File:</strong> {selectedSprite.fileName}
                </p>
                <p>
                  <strong>Size:</strong>{' '}
                  {formatFileSize(selectedSprite.fileSizeBytes)}
                </p>
                <p>
                  <strong>Category:</strong>{' '}
                  {selectedSprite.categoryName || 'Unassigned'}
                </p>
              </div>
              <div className="sprite-modal-download">
                <Button
                  label="Download"
                  icon="pi pi-download"
                  onClick={handleDownloadSprite}
                  className="p-button-success w-full"
                />
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
