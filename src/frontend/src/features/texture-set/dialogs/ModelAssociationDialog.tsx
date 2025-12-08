import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { Dropdown } from 'primereact/dropdown'
import { TextureSetDto, Model, PackSummaryDto, ModelVersionDto } from '../../../types'
import { useTextureSets } from '../hooks/useTextureSets'
import ApiClient from '../../../services/ApiClient'
import ThumbnailDisplay from '../../thumbnail/components/ThumbnailDisplay'
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
  selectedVersionOption: 'specific' | 'all' | null
  selectedVersionId: number | null
  hasChanges: boolean
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
      const associationsPromises = allModels.map(async (model) => {
        const versions = await ApiClient.getModelVersions(parseInt(model.id))
        
        // Get currently associated version IDs for this model
        const associatedVersions = textureSet.associatedModels
          .filter(m => m.id === parseInt(model.id))
          .map(m => m.modelVersionId)
        
        const versionAssociations: ModelVersionAssociation[] = versions.map(v => ({
          modelVersionId: v.id,
          versionNumber: v.versionNumber,
          isAssociated: associatedVersions.includes(v.id),
          originallyAssociated: associatedVersions.includes(v.id),
        }))
        
        const hasAnyAssociated = versionAssociations.some(v => v.isAssociated)
        
        return {
          model,
          versions: versionAssociations,
          selectedVersionOption: hasAnyAssociated ? ('specific' as const) : null,
          selectedVersionId: hasAnyAssociated ? versionAssociations.find(v => v.isAssociated)?.modelVersionId || null : null,
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

  const handleVersionOptionChange = (modelId: string, option: 'specific' | 'all' | null, versionId: number | null) => {
    setModelAssociations(prev =>
      prev.map(assoc => {
        if (assoc.model.id === modelId) {
          return {
            ...assoc,
            selectedVersionOption: option,
            selectedVersionId: versionId,
            hasChanges: true,
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

        // First, disassociate all current associations for this model
        for (const version of assoc.versions) {
          if (version.originallyAssociated) {
            await textureSetsApi.disassociateTextureSetFromModelVersion(
              textureSet.id,
              version.modelVersionId
            )
          }
        }

        // Then add new associations
        if (assoc.selectedVersionOption === 'all') {
          await textureSetsApi.associateTextureSetWithAllModelVersions(
            textureSet.id,
            parseInt(assoc.model.id)
          )
        } else if (assoc.selectedVersionOption === 'specific' && assoc.selectedVersionId) {
          await textureSetsApi.associateTextureSetWithModelVersion(
            textureSet.id,
            assoc.selectedVersionId
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
                    selectedVersionOption={assoc.selectedVersionOption}
                    selectedVersionId={assoc.selectedVersionId}
                    onVersionOptionChange={handleVersionOptionChange}
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
  selectedVersionOption: 'specific' | 'all' | null
  selectedVersionId: number | null
  onVersionOptionChange: (modelId: string, option: 'specific' | 'all' | null, versionId: number | null) => void
}

function ModelCard({ model, versions, selectedVersionOption, selectedVersionId, onVersionOptionChange }: ModelCardProps) {
  const versionOptions = [
    { label: 'Not linked', value: null },
    { label: 'All versions', value: 'all' },
    ...versions.map(v => ({
      label: `Version ${v.versionNumber}`,
      value: v.modelVersionId
    }))
  ]

  const dropdownValue = selectedVersionOption === 'all' ? 'all' : selectedVersionId

  return (
    <div className="model-association-card">
      <div className="model-card-thumbnail">
        <ThumbnailDisplay modelId={model.id} />
        <div className="model-card-overlay">
          <span className="model-card-name">{model.name}</span>
        </div>
      </div>
      <div className="model-card-version-selector" style={{ padding: '0.5rem' }}>
        <Dropdown
          value={dropdownValue}
          options={versionOptions}
          onChange={(e) => {
            if (e.value === null) {
              onVersionOptionChange(model.id, null, null)
            } else if (e.value === 'all') {
              onVersionOptionChange(model.id, 'all', null)
            } else {
              onVersionOptionChange(model.id, 'specific', e.value as number)
            }
          }}
          placeholder="Select version"
          style={{ width: '100%' }}
        />
      </div>
    </div>
  )
}

export default ModelAssociationDialog
