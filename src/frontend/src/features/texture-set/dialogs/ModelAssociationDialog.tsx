import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { TextureSetDto, Model, PackSummaryDto } from '../../../types'
import { useTextureSets } from '../hooks/useTextureSets'
import ThumbnailDisplay from '../../thumbnail/components/ThumbnailDisplay'
import './dialogs.css'

interface ModelAssociationDialogProps {
  visible: boolean
  textureSet: TextureSetDto
  onHide: () => void
  onAssociationsChanged: () => void
}

interface ModelAssociation {
  model: Model
  isAssociated: boolean
  originallyAssociated: boolean
  recentlyUnlinked?: boolean
}

function ModelAssociationDialog({
  visible,
  textureSet,
  onHide,
  onAssociationsChanged,
}: ModelAssociationDialogProps) {
  const [modelAssociations, setModelAssociations] = useState<
    ModelAssociation[]
  >([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPackIds, setSelectedPackIds] = useState<number[]>([])
  const [availablePacks, setAvailablePacks] = useState<PackSummaryDto[]>([])
  const [recentlyUnlinkedIds, setRecentlyUnlinkedIds] = useState<Set<string>>(
    new Set()
  )
  const toast = useRef<Toast>(null)
  const textureSetsApi = useTextureSets()

  useEffect(() => {
    if (visible) {
      loadModels()
      loadPacks()
    }
  }, [visible])

  const loadPacks = async () => {
    // Get packs from texture set
    if (textureSet.packs && textureSet.packs.length > 0) {
      setAvailablePacks(textureSet.packs)
    }
  }

  const loadModels = useCallback(async () => {
    try {
      setLoading(true)
      const allModels = await textureSetsApi.getModels()

      // Get currently associated model IDs
      const associatedModelIds = new Set(
        textureSet.associatedModels.map(m => m.id)
      )

      // Create association objects
      const associations: ModelAssociation[] = allModels.map(model => ({
        model,
        isAssociated: associatedModelIds.has(parseInt(model.id)),
        originallyAssociated: associatedModelIds.has(parseInt(model.id)),
        recentlyUnlinked: false,
      }))

      setModelAssociations(associations)
    } catch (error) {
      console.error('Failed to load models:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load models',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }, [textureSetsApi, textureSet.associatedModels])

  const handleToggleAssociation = (modelId: string, isAssociated: boolean) => {
    setModelAssociations(prev =>
      prev.map(assoc => {
        if (assoc.model.id === modelId) {
          // Track recently unlinked
          if (assoc.originallyAssociated && !isAssociated) {
            setRecentlyUnlinkedIds(prev => new Set(prev).add(modelId))
          } else if (!isAssociated && assoc.originallyAssociated) {
            setRecentlyUnlinkedIds(prev => {
              const newSet = new Set(prev)
              newSet.delete(modelId)
              return newSet
            })
          }
          return { ...assoc, isAssociated, recentlyUnlinked: !isAssociated && assoc.originallyAssociated }
        }
        return assoc
      })
    )
  }

  const getChanges = () => {
    const toAssociate: Model[] = []
    const toDisassociate: Model[] = []

    modelAssociations.forEach(assoc => {
      if (assoc.isAssociated && !assoc.originallyAssociated) {
        toAssociate.push(assoc.model)
      } else if (!assoc.isAssociated && assoc.originallyAssociated) {
        toDisassociate.push(assoc.model)
      }
    })

    return { toAssociate, toDisassociate }
  }

  const hasChanges = () => {
    const { toAssociate, toDisassociate } = getChanges()
    return toAssociate.length > 0 || toDisassociate.length > 0
  }

  const handleSave = async () => {
    const { toAssociate, toDisassociate } = getChanges()

    if (!hasChanges()) {
      onHide()
      return
    }

    try {
      setSaving(true)

      // Process associations
      for (const model of toAssociate) {
        await textureSetsApi.associateTextureSetWithModel(
          textureSet.id,
          parseInt(model.id)
        )
      }

      // Process disassociations
      for (const model of toDisassociate) {
        await textureSetsApi.disassociateTextureSetFromModel(
          textureSet.id,
          parseInt(model.id)
        )
      }

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Model associations updated successfully',
        life: 3000,
      })

      // Clear recently unlinked
      setRecentlyUnlinkedIds(new Set())
      onAssociationsChanged()
    } catch (error) {
      console.error('Failed to update model associations:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update model associations',
        life: 3000,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset changes
    setModelAssociations(prev =>
      prev.map(assoc => ({
        ...assoc,
        isAssociated: assoc.originallyAssociated,
        recentlyUnlinked: false,
      }))
    )
    setRecentlyUnlinkedIds(new Set())
    setSearchQuery('')
    setSelectedPackIds([])
    onHide()
  }

  // Filter models
  const filteredModels = modelAssociations.filter(assoc => {
    const matchesSearch = assoc.model.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase())

    const matchesPack =
      selectedPackIds.length === 0 ||
      (assoc.model.packs &&
        assoc.model.packs.some(pack => selectedPackIds.includes(pack.id)))

    return matchesSearch && matchesPack
  })

  // Split into recently unlinked and others
  const recentlyUnlinkedModels = filteredModels.filter(
    assoc => assoc.recentlyUnlinked && recentlyUnlinkedIds.has(assoc.model.id)
  )
  const otherModels = filteredModels.filter(
    assoc => !assoc.recentlyUnlinked || !recentlyUnlinkedIds.has(assoc.model.id)
  )

  const handlePackFilterToggle = (packId: number) => {
    setSelectedPackIds(prev =>
      prev.includes(packId)
        ? prev.filter(id => id !== packId)
        : [...prev, packId]
    )
  }

  return (
    <Dialog
      header={`Link Models - "${textureSet.name}"`}
      visible={visible}
      onHide={handleCancel}
      footer={
        <div className="dialog-footer">
          <Button
            label="Cancel"
            icon="pi pi-times"
            onClick={handleCancel}
            className="p-button-text"
          />
          <Button
            label={saving ? 'Saving...' : 'Save Changes'}
            icon="pi pi-check"
            onClick={handleSave}
            disabled={!hasChanges() || saving}
          />
        </div>
      }
      modal
      maximizable
      style={{ width: '85vw', maxWidth: '1400px', height: '80vh' }}
      className="model-association-dialog"
    >
      <Toast ref={toast} />

      <div className="association-dialog-content">
        {/* Search and Filters */}
        <div className="association-search-bar">
          <div className="search-input-wrapper">
            <i className="pi pi-search" />
            <InputText
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className="search-input"
            />
          </div>

          {availablePacks.length > 0 && (
            <div className="pack-filters">
              <span className="filter-label">Filter by Pack:</span>
              {availablePacks.map(pack => (
                <div key={pack.id} className="pack-filter-item">
                  <Checkbox
                    inputId={`pack-${pack.id}`}
                    checked={selectedPackIds.includes(pack.id)}
                    onChange={() => handlePackFilterToggle(pack.id)}
                  />
                  <label htmlFor={`pack-${pack.id}`}>{pack.name}</label>
                </div>
              ))}
              {selectedPackIds.length > 0 && (
                <Button
                  label="Clear"
                  size="small"
                  text
                  onClick={() => setSelectedPackIds([])}
                />
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="association-loading">
            <i className="pi pi-spin pi-spinner" />
            <p>Loading models...</p>
          </div>
        ) : (
          <>
            {/* Recently Unlinked Section */}
            {recentlyUnlinkedModels.length > 0 && (
              <div className="association-section">
                <h4 className="section-header">
                  <i className="pi pi-history" />
                  Recently Unlinked ({recentlyUnlinkedModels.length})
                </h4>
                <div className="models-card-grid">
                  {recentlyUnlinkedModels.map(assoc => (
                    <ModelCard
                      key={assoc.model.id}
                      model={assoc.model}
                      isAssociated={assoc.isAssociated}
                      onToggle={handleToggleAssociation}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All Models Section */}
            <div className="association-section">
              <h4 className="section-header">
                <i className="pi pi-box" />
                All Models ({otherModels.length})
              </h4>
              {otherModels.length === 0 ? (
                <div className="no-results">
                  <i className="pi pi-inbox" />
                  <p>No models found</p>
                </div>
              ) : (
                <div className="models-card-grid">
                  {otherModels.map(assoc => (
                    <ModelCard
                      key={assoc.model.id}
                      model={assoc.model}
                      isAssociated={assoc.isAssociated}
                      onToggle={handleToggleAssociation}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

interface ModelCardProps {
  model: Model
  isAssociated: boolean
  onToggle: (modelId: string, isAssociated: boolean) => void
}

function ModelCard({ model, isAssociated, onToggle }: ModelCardProps) {
  return (
    <div
      className={`model-association-card ${isAssociated ? 'selected' : ''}`}
      onClick={() => onToggle(model.id, !isAssociated)}
    >
      <div className="model-association-checkbox">
        <Checkbox checked={isAssociated} readOnly />
      </div>
      <div className="model-card-thumbnail">
        <ThumbnailDisplay modelId={model.id} />
        <div className="model-card-overlay">
          <span className="model-card-name">{model.name}</span>
        </div>
      </div>
    </div>
  )
}

export default ModelAssociationDialog
