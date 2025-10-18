import { useState, useRef, useEffect } from 'react'
import { Dialog } from 'primereact/dialog'
import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import './ModelGrid.css'
import { ThumbnailDisplay } from '../../thumbnail'
import { Model } from '../../../utils/fileUtils'
import ApiClient from '../../../services/ApiClient'
import { PackDto } from '../../../types'

interface ModelGridProps {
  models: Model[]
  onModelSelect: (model: Model) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}

export default function ModelGrid({
  models,
  onModelSelect,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: ModelGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [packs, setPacks] = useState<PackDto[]>([])
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [showPackDialog, setShowPackDialog] = useState(false)
  const contextMenu = useRef<ContextMenu>(null)
  const toast = useRef<Toast>(null)

  useEffect(() => {
    loadPacks()
  }, [])

  const loadPacks = async () => {
    try {
      const data = await ApiClient.getAllPacks()
      setPacks(data)
    } catch (error) {
      console.error('Failed to load packs:', error)
    }
  }

  const handleAddToPack = async (packId: number) => {
    if (!selectedModel) return

    try {
      await ApiClient.addModelToPack(packId, selectedModel.id)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Model added to pack',
        life: 3000,
      })
      setShowPackDialog(false)
    } catch (error) {
      console.error('Failed to add model to pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add model to pack',
        life: 3000,
      })
    }
  }

  const getModelName = (model: Model) => {
    // Use the model name, which doesn't include file extension
    return model.name || `Model ${model.id}`
  }

  const filteredModels = models.filter(model => {
    const modelName = getModelName(model).toLowerCase()
    return modelName.includes(searchQuery.toLowerCase())
  })

  const contextMenuItems: MenuItem[] = [
    {
      label: 'Add to pack',
      icon: 'pi pi-box',
      command: () => {
        loadPacks()
        setShowPackDialog(true)
      },
    },
  ]

  return (
    <div
      className="model-grid-container"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <Toast ref={toast} />
      <ContextMenu model={contextMenuItems} ref={contextMenu} />

      {/* Search and filter bar */}
      <div className="model-grid-controls">
        <div className="search-bar">
          <i className="pi pi-search" />
          <input
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-bar">
          <span className="filter-placeholder">Filters (Coming Soon)</span>
        </div>
      </div>

      {/* Grid of model cards */}
      <div className="model-grid">
        {filteredModels.map(model => (
          <div
            key={model.id}
            className="model-card"
            onClick={() => onModelSelect(model)}
            onContextMenu={e => {
              e.preventDefault()
              setSelectedModel(model)
              contextMenu.current?.show(e)
            }}
          >
            <div className="model-card-thumbnail">
              <ThumbnailDisplay modelId={model.id} />
              <div className="model-card-overlay">
                <span className="model-card-name">{getModelName(model)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredModels.length === 0 && (
        <div className="no-results">
          <i className="pi pi-search" />
          <p>No models found matching "{searchQuery}"</p>
        </div>
      )}

      {/* Add to Pack Dialog */}
      <Dialog
        header="Add to Pack"
        visible={showPackDialog}
        style={{ width: '500px' }}
        onHide={() => setShowPackDialog(false)}
      >
        <div className="pack-selection-dialog">
          <p>Select a pack to add this model to:</p>
          <div className="pack-list">
            {packs.map(pack => (
              <div
                key={pack.id}
                className="pack-item"
                onClick={() => handleAddToPack(pack.id)}
              >
                <i className="pi pi-box" />
                <div className="pack-item-content">
                  <span className="pack-item-name">{pack.name}</span>
                  {pack.description && (
                    <span className="pack-item-description">
                      {pack.description}
                    </span>
                  )}
                </div>
                <i className="pi pi-chevron-right" />
              </div>
            ))}
          </div>
          {packs.length === 0 && (
            <div className="no-packs">
              <i className="pi pi-inbox" />
              <p>No packs available. Create a pack first.</p>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  )
}
