import { useState, useRef, useEffect } from 'react'
import { Dialog } from 'primereact/dialog'
import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import { MultiSelect } from 'primereact/multiselect'
import './ModelGrid.css'
import { ThumbnailDisplay } from '../../thumbnail'
import { Model } from '../../../utils/fileUtils'
import ApiClient from '../../../services/ApiClient'
import { PackDto, ProjectDto } from '../../../types'
import {
  openInFileExplorer,
  copyPathToClipboard,
} from '../../../utils/webdavUtils'
import CardWidthSlider from '../../../shared/components/CardWidthSlider'
import { useCardWidthStore } from '../../../stores/cardWidthStore'

interface ModelGridProps {
  models: Model[]
  onModelSelect: (model: Model) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onModelRecycled?: (modelId: number) => void
  packs?: PackDto[]
  projects?: ProjectDto[]
  selectedPackIds?: number[]
  selectedProjectIds?: number[]
  onPackFilterChange?: (packIds: number[]) => void
  onProjectFilterChange?: (projectIds: number[]) => void
}

export default function ModelGrid({
  models,
  onModelSelect,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onModelRecycled,
  packs = [],
  projects = [],
  selectedPackIds = [],
  selectedProjectIds = [],
  onPackFilterChange,
  onProjectFilterChange,
}: ModelGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenuPacks, setContextMenuPacks] = useState<PackDto[]>([])
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [showPackDialog, setShowPackDialog] = useState(false)
  const contextMenu = useRef<ContextMenu>(null)
  const toast = useRef<Toast>(null)

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.models

  useEffect(() => {
    // Load packs for context menu if not provided via props
    if (packs.length === 0) {
      loadContextMenuPacks()
    } else {
      setContextMenuPacks(packs)
    }
  }, [packs])

  const loadContextMenuPacks = async () => {
    try {
      const data = await ApiClient.getAllPacks()
      setContextMenuPacks(data)
    } catch (error) {
      console.error('Failed to load packs:', error)
    }
  }
  const handleAddToPack = async (packId: number) => {
    if (!selectedModel) return

    try {
      await ApiClient.addModelToPack(packId, Number(selectedModel.id))
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

  const handleSoftDelete = async () => {
    if (!selectedModel) return

    try {
      await ApiClient.softDeleteModel(Number(selectedModel.id))
      toast.current?.show({
        severity: 'success',
        summary: 'Recycled',
        detail: 'Model moved to recycled files',
        life: 3000,
      })
      // Call the callback to remove the model from the list without making a new request
      if (onModelRecycled) {
        onModelRecycled(Number(selectedModel.id))
      }
    } catch (error) {
      console.error('Failed to recycle model:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to recycle model',
        life: 3000,
      })
    }
  }

  const getModelName = (model: Model) => {
    // Use model name first, fallback to first file's name without extension
    if (model.name) {
      return model.name
    }
    if (model.files && model.files.length > 0) {
      return model.files[0].originalFileName
    }
    return `Model ${model.id}`
  }

  const handleShowInFolder = async () => {
    if (!selectedModel) return

    const modelName = getModelName(selectedModel)
    const virtualPath = `Models/${modelName}`
    const result = await openInFileExplorer(virtualPath)

    toast.current?.show({
      severity: result.success ? 'info' : 'warn',
      summary: result.success ? 'Opening' : 'Note',
      detail: result.message,
      life: 4000,
    })
  }

  const handleCopyPath = async () => {
    if (!selectedModel) return

    const modelName = getModelName(selectedModel)
    const virtualPath = `Models/${modelName}`
    const result = await copyPathToClipboard(virtualPath)

    toast.current?.show({
      severity: result.success ? 'success' : 'error',
      summary: result.success ? 'Copied' : 'Failed',
      detail: result.success
        ? `Path copied: ${result.path}`
        : 'Failed to copy path to clipboard',
      life: 3000,
    })
  }

  const filteredModels = models.filter(model => {
    const modelName = getModelName(model).toLowerCase()
    return modelName.includes(searchQuery.toLowerCase())
  })

  const contextMenuItems: MenuItem[] = [
    {
      label: 'Show in Folder',
      icon: 'pi pi-folder-open',
      command: () => {
        handleShowInFolder()
      },
    },
    {
      label: 'Copy Folder Path',
      icon: 'pi pi-copy',
      command: () => {
        handleCopyPath()
      },
    },
    {
      separator: true,
    },
    {
      label: 'Add to pack',
      icon: 'pi pi-box',
      command: () => {
        loadContextMenuPacks()
        setShowPackDialog(true)
      },
    },
    {
      label: 'Recycle',
      icon: 'pi pi-trash',
      command: () => {
        handleSoftDelete()
      },
    },
  ]

  // Build options for multiselect
  const packOptions = packs.map(pack => ({
    label: pack.name,
    value: pack.id,
  }))

  const projectOptions = projects.map(project => ({
    label: project.name,
    value: project.id,
  }))

  const hasFilters = packs.length > 0 || projects.length > 0
  const hasActiveFilters =
    selectedPackIds.length > 0 || selectedProjectIds.length > 0

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
          {hasFilters ? (
            <>
              {packs.length > 0 && (
                <MultiSelect
                  value={selectedPackIds}
                  options={packOptions}
                  onChange={e => onPackFilterChange?.(e.value || [])}
                  placeholder="Filter by Packs"
                  className="filter-multiselect"
                  display="chip"
                  showClear
                  filter
                  filterPlaceholder="Search packs..."
                />
              )}
              {projects.length > 0 && (
                <MultiSelect
                  value={selectedProjectIds}
                  options={projectOptions}
                  onChange={e => onProjectFilterChange?.(e.value || [])}
                  placeholder="Filter by Projects"
                  className="filter-multiselect"
                  display="chip"
                  showClear
                  filter
                  filterPlaceholder="Search projects..."
                />
              )}
              {hasActiveFilters && (
                <Button
                  icon="pi pi-times"
                  className="p-button-text p-button-sm clear-filters-btn"
                  tooltip="Clear all filters"
                  tooltipOptions={{ position: 'bottom' }}
                  onClick={() => {
                    onPackFilterChange?.([])
                    onProjectFilterChange?.([])
                  }}
                />
              )}
            </>
          ) : (
            <span className="filter-placeholder">
              No packs or projects to filter by
            </span>
          )}
          <CardWidthSlider
            value={cardWidth}
            min={120}
            max={400}
            onChange={width => setCardWidth('models', width)}
          />
        </div>
      </div>

      {/* Grid of model cards */}
      <div
        className="model-grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
        }}
      >
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
              <ThumbnailDisplay modelId={model.id} modelName={model.name} />
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
            {contextMenuPacks.map(pack => (
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
          {contextMenuPacks.length === 0 && (
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
