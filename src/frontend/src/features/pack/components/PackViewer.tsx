import { useState, useEffect, useRef } from 'react'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { Dialog } from 'primereact/dialog'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { InputText } from 'primereact/inputtext'
import ApiClient from '../../../services/ApiClient'
import { PackDto, Model, TextureSetDto, TextureType } from '../../../types'
import { ThumbnailDisplay } from '../../thumbnail'
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
  const toast = useRef<Toast>(null)
  const modelContextMenu = useRef<ContextMenu>(null)
  const textureSetContextMenu = useRef<ContextMenu>(null)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [selectedTextureSet, setSelectedTextureSet] = useState<TextureSetDto | null>(null)

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

  const handleAddModel = async (modelId: number) => {
    try {
      await ApiClient.addModelToPack(packId, modelId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Model added to pack',
        life: 3000,
      })
      setShowAddModelDialog(false)
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to add model:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add model to pack',
        life: 3000,
      })
    }
  }

  const handleAddTextureSet = async (textureSetId: number) => {
    try {
      await ApiClient.addTextureSetToPack(packId, textureSetId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set added to pack',
        life: 3000,
      })
      setShowAddTextureSetDialog(false)
      loadPackContent()
      loadPack()
    } catch (error) {
      console.error('Failed to add texture set:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add texture set to pack',
        life: 3000,
      })
    }
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
      <ContextMenu model={textureSetContextMenuItems} ref={textureSetContextMenu} />
      
      <div className="pack-header">
        <div>
          <h2>{pack.name}</h2>
          {pack.description && <p className="pack-description">{pack.description}</p>}
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
          <div className="pack-grid">
            {models.map(model => (
              <div
                key={model.id}
                className="pack-card"
                onContextMenu={(e) => {
                  e.preventDefault()
                  setSelectedModel(model)
                  modelContextMenu.current?.show(e)
                }}
              >
                <div className="pack-card-thumbnail">
                  <ThumbnailDisplay modelId={model.id} />
                  <div className="pack-card-overlay">
                    <span className="pack-card-name">{getModelName(model)}</span>
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
                setShowAddModelDialog(true)
              }}
            >
              <div className="pack-card-add-content">
                <i className="pi pi-plus" />
                <span>Add Model</span>
              </div>
            </div>
          </div>
        </div>

        {/* Texture Sets Section */}
        <div className="pack-section">
          <h3>Texture Sets</h3>
          <div className="pack-grid">
            {textureSets.map(textureSet => {
              const albedoUrl = getAlbedoTextureUrl(textureSet)
              return (
                <div
                  key={textureSet.id}
                  className="pack-card"
                  onContextMenu={(e) => {
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
                      <span className="pack-card-name">{textureSet.name}</span>
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
                setShowAddTextureSetDialog(true)
              }}
            >
              <div className="pack-card-add-content">
                <i className="pi pi-plus" />
                <span>Add Texture Set</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Model Dialog */}
      <Dialog
        header="Add Model to Pack"
        visible={showAddModelDialog}
        style={{ width: '80vw', maxWidth: '1200px' }}
        onHide={() => setShowAddModelDialog(false)}
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
          <div className="pack-grid">
            {filteredAvailableModels.map(model => (
              <div
                key={model.id}
                className="pack-card"
                onClick={() => handleAddModel(model.id)}
              >
                <div className="pack-card-thumbnail">
                  <ThumbnailDisplay modelId={model.id} />
                  <div className="pack-card-overlay">
                    <span className="pack-card-name">{getModelName(model)}</span>
                  </div>
                </div>
              </div>
            ))}
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
        header="Add Texture Set to Pack"
        visible={showAddTextureSetDialog}
        style={{ width: '80vw', maxWidth: '1200px' }}
        onHide={() => setShowAddTextureSetDialog(false)}
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
          <div className="pack-grid">
            {filteredAvailableTextureSets.map(textureSet => {
              const albedoUrl = getAlbedoTextureUrl(textureSet)
              return (
                <div
                  key={textureSet.id}
                  className="pack-card"
                  onClick={() => handleAddTextureSet(textureSet.id)}
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
