import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { MultiSelect } from 'primereact/multiselect'
import type { Model } from '@/utils/fileUtils'
import { TextureSetDto, PackSummaryDto } from '@/features/texture-set/types'
import { useTextureSets } from '@/features/texture-set/hooks/useTextureSets'
import { getModelVersions } from '@/features/model-viewer/api/modelVersionApi'
import { ThumbnailDisplay } from '@/shared/thumbnail'
import './dialogs.css'

interface ModelAssociationDialogProps {
  visible: boolean
  textureSet: TextureSetDto
  onHide: () => void
  onAssociationsChanged: () => void
}

interface ModelVersionAssociation {
  modelVersionId: number
  versionNumber: number
  isAssociated: boolean
  originallyAssociated: boolean
}

interface ModelAssociation {
  model: Model
  versions: ModelVersionAssociation[]
  selectedVersionIds: number[]
  originalVersionIds: number[]
  hasChanges: boolean
}

export function ModelAssociationDialog({
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
  const toast = useRef<Toast>(null)
  const textureSetsApi = useTextureSets()

  useEffect(() => {
    if (visible) {
      loadModels()
      loadPacks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only run when dialog becomes visible
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

      // Load versions for each model and build associations
      const associationsPromises = allModels.map(async model => {
        const versions = await getModelVersions(parseInt(model.id))

        // Get currently associated version IDs for this model
        const associatedVersions = textureSet.associatedModels
          .filter(m => m.id === parseInt(model.id))
          .map(m => m.modelVersionId)

        const versionAssociations: ModelVersionAssociation[] = versions.map(
          v => ({
            modelVersionId: v.id,
            versionNumber: v.versionNumber,
            isAssociated: associatedVersions.includes(v.id),
            originallyAssociated: associatedVersions.includes(v.id),
          })
        )

        // Get IDs of currently associated versions
        const selectedVersionIds = associatedVersions

        return {
          model,
          versions: versionAssociations,
          selectedVersionIds,
          originalVersionIds: [...associatedVersions],
          hasChanges: false,
        }
      })

      const associations = await Promise.all(associationsPromises)
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

  const handleVersionSelectionChange = (
    modelId: string,
    selectedIds: number[]
  ) => {
    setModelAssociations(prev =>
      prev.map(assoc => {
        if (assoc.model.id === modelId) {
          // Check if the selection has changed from original
          const hasChanges =
            selectedIds.length !== assoc.originalVersionIds.length ||
            !selectedIds.every(id => assoc.originalVersionIds.includes(id))

          return {
            ...assoc,
            selectedVersionIds: selectedIds,
            hasChanges,
          }
        }
        return assoc
      })
    )
  }

  const hasChanges = () => {
    return modelAssociations.some(assoc => assoc.hasChanges)
  }

  const handleSave = async () => {
    if (!hasChanges()) {
      onHide()
      return
    }

    try {
      setSaving(true)

      for (const assoc of modelAssociations) {
        if (!assoc.hasChanges) continue

        // Find versions to add and remove
        const versionsToAdd = assoc.selectedVersionIds.filter(
          id => !assoc.originalVersionIds.includes(id)
        )
        const versionsToRemove = assoc.originalVersionIds.filter(
          id => !assoc.selectedVersionIds.includes(id)
        )

        // Remove disassociated versions
        for (const versionId of versionsToRemove) {
          await textureSetsApi.disassociateTextureSetFromModelVersion(
            textureSet.id,
            versionId
          )
        }

        // Add newly associated versions
        for (const versionId of versionsToAdd) {
          await textureSetsApi.associateTextureSetWithModelVersion(
            textureSet.id,
            versionId
          )
        }
      }

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Model associations updated successfully',
        life: 3000,
      })

      onAssociationsChanged()
      onHide()
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
          <div className="association-section">
            <h4 className="section-header">
              <i className="pi pi-box" />
              All Models ({filteredModels.length})
            </h4>
            {filteredModels.length === 0 ? (
              <div className="no-results">
                <i className="pi pi-inbox" />
                <p>No models found</p>
              </div>
            ) : (
              <div className="models-card-grid">
                {filteredModels.map(assoc => (
                  <ModelCard
                    key={assoc.model.id}
                    model={assoc.model}
                    versions={assoc.versions}
                    selectedVersionIds={assoc.selectedVersionIds}
                    onVersionSelectionChange={handleVersionSelectionChange}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}

interface ModelCardProps {
  model: Model
  versions: ModelVersionAssociation[]
  selectedVersionIds: number[]
  onVersionSelectionChange: (modelId: string, selectedIds: number[]) => void
}

function ModelCard({
  model,
  versions,
  selectedVersionIds,
  onVersionSelectionChange,
}: ModelCardProps) {
  const versionOptions = versions.map(v => ({
    label: `Version ${v.versionNumber}`,
    value: v.modelVersionId,
  }))

  return (
    <div className="model-association-card">
      <div className="model-card-thumbnail">
        <ThumbnailDisplay modelId={model.id} />
        <div className="model-card-overlay">
          <span className="model-card-name">{model.name}</span>
        </div>
      </div>
      <div
        className="model-card-version-selector"
        style={{ padding: '0.5rem' }}
      >
        <MultiSelect
          value={selectedVersionIds}
          options={versionOptions}
          onChange={e => onVersionSelectionChange(model.id, e.value)}
          placeholder="Select versions"
          display="chip"
          style={{ width: '100%' }}
          panelStyle={{ zIndex: 1100 }}
          maxSelectedLabels={2}
        />
      </div>
    </div>
  )
}
