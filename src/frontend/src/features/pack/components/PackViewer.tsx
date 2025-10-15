import { useState, useEffect, useRef } from 'react'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { Dialog } from 'primereact/dialog'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { InputText } from 'primereact/inputtext'
import { Checkbox } from 'primereact/checkbox'
import ApiClient from '../../../services/ApiClient'
import { PackDto, Model, TextureSetDto, TextureType } from '../../../types'
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
  const [allModels, setAllModels] = useState<Model[]>([])
  const [allTextureSets, setAllTextureSets] = useState<TextureSetDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModelDialog, setShowAddModelDialog] = useState(false)
  const [showAddTextureSetDialog, setShowAddTextureSetDialog] = useState(false)
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [textureSetSearchQuery, setTextureSetSearchQuery] = useState('')
  const [selectedModelIds, setSelectedModelIds] = useState<number[]>([])
  const [selectedTextureSetIds, setSelectedTextureSetIds] = useState<number[]>(
    []
  )
  const [uploadingModel, setUploadingModel] = useState(false)
  const [uploadingTextureSet, setUploadingTextureSet] = useState(false)
  const toast = useRef<Toast>(null)
  const modelContextMenu = useRef<ContextMenu>(null)
  const textureSetContextMenu = useRef<ContextMenu>(null)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [selectedTextureSet, setSelectedTextureSet] =
    useState<TextureSetDto | null>(null)
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
      const [modelsData, textureSetsData] = await Promise.all([
        ApiClient.getModelsByPack(packId),
        ApiClient.getTextureSetsByPack(packId),
      ])
      setModels(modelsData)
      setTextureSets(textureSetsData)
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
            0, // TextureType.Albedo
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

  const filteredAvailableModels = allModels.filter(model => {
    const modelName = getModelName(model).toLowerCase()
    return modelName.includes(modelSearchQuery.toLowerCase())
  })

  const filteredAvailableTextureSets = allTextureSets.filter(textureSet => {
    const name = textureSet.name.toLowerCase()
    return name.includes(textureSetSearchQuery.toLowerCase())
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
                  onClick={() => openModelDetailsTab(model)}
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
                    onClick={() => openTextureSetDetailsTab(textureSet)}
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
    </div>
  )
}
