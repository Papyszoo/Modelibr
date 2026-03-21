import './TextureSetAssociationDialog.css'

import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { Toast } from 'primereact/toast'
import { useEffect, useRef, useState } from 'react'

import { getFileUrl } from '@/features/models/api/modelApi'
import { usePacksQuery } from '@/features/pack/api/queries'
import { useAllTextureSetsQuery } from '@/features/texture-set/api/queries'
import {
  associateTextureSetWithModelVersion,
  disassociateTextureSetFromModelVersion,
} from '@/features/texture-set/api/textureSetApi'
import {
  type PackSummaryDto,
  type TextureSetDto,
  TextureType,
} from '@/features/texture-set/types'
import type { Model } from '@/utils/fileUtils'

interface TextureSetAssociationDialogProps {
  visible: boolean
  model: Model
  modelVersionId: number
  materialName?: string
  variantName?: string
  textureMappings?: Array<{
    materialName: string
    textureSetId: number
    variantName: string
  }>
  onHide: () => void
  onAssociationsChanged: () => void
}

export function TextureSetAssociationDialog({
  visible,
  model: _model,
  modelVersionId,
  materialName,
  variantName,
  textureMappings,
  onHide,
  onAssociationsChanged,
}: TextureSetAssociationDialogProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [originalId, setOriginalId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPackIds, setSelectedPackIds] = useState<number[]>([])
  const toast = useRef<Toast>(null)
  const allTextureSetsQuery = useAllTextureSetsQuery({
    queryConfig: {
      enabled: visible,
    },
  })
  const packsQuery = usePacksQuery({
    queryConfig: {
      enabled: visible,
    },
  })
  const availablePacks: PackSummaryDto[] = packsQuery.data ?? []
  const loading =
    allTextureSetsQuery.isLoading ||
    allTextureSetsQuery.isFetching ||
    packsQuery.isLoading ||
    packsQuery.isFetching

  // Map display name "Default" to empty string for API/mapping comparison
  const apiMaterialName = materialName === 'Default' ? '' : (materialName ?? '')

  useEffect(() => {
    if (!visible || !allTextureSetsQuery.data) {
      return
    }

    // Find the texture set currently linked to THIS material in THIS variant
    let currentId: number | null = null
    if (textureMappings && textureMappings.length > 0) {
      const mapping = textureMappings.find(
        m =>
          m.variantName === (variantName ?? '') &&
          m.materialName === apiMaterialName
      )
      currentId = mapping?.textureSetId ?? null
    }

    setSelectedId(currentId)
    setOriginalId(currentId)
  }, [
    visible,
    allTextureSetsQuery.data,
    modelVersionId,
    textureMappings,
    variantName,
    apiMaterialName,
  ])

  useEffect(() => {
    if (!visible) {
      return
    }

    if (allTextureSetsQuery.error || packsQuery.error) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load texture sets',
        life: 3000,
      })
    }
  }, [visible, allTextureSetsQuery.error, packsQuery.error])

  const handleSelect = (textureSetId: number) => {
    // Toggle: clicking the already-selected item deselects it
    setSelectedId(prev => (prev === textureSetId ? null : textureSetId))
  }

  const hasChanges = selectedId !== originalId

  const handleSave = async () => {
    if (!hasChanges) {
      onHide()
      return
    }

    try {
      setSaving(true)

      // Disassociate the previously linked texture set (if any)
      if (originalId !== null) {
        await disassociateTextureSetFromModelVersion(
          originalId,
          modelVersionId,
          apiMaterialName,
          variantName ?? ''
        )
      }

      // Associate the newly selected texture set (if any)
      if (selectedId !== null) {
        await associateTextureSetWithModelVersion(
          selectedId,
          modelVersionId,
          apiMaterialName,
          variantName ?? ''
        )
      }

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set linked successfully',
        life: 3000,
      })

      onAssociationsChanged()
    } catch (error) {
      console.error('Failed to update texture set association:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update texture set association',
        life: 3000,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setSelectedId(originalId)
    setSearchQuery('')
    setSelectedPackIds([])
    onHide()
  }

  // Filter texture sets
  const allTextureSets = allTextureSetsQuery.data ?? []
  const filteredTextureSets = allTextureSets.filter(ts => {
    const matchesSearch = ts.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase())

    const matchesPack =
      selectedPackIds.length === 0 ||
      (ts.packs && ts.packs.some(pack => selectedPackIds.includes(pack.id)))

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
      header={`Link Texture Set — ${materialName ?? 'Material'}`}
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
            label={saving ? 'Saving...' : 'Save'}
            icon="pi pi-check"
            onClick={handleSave}
            disabled={!hasChanges || saving}
          />
        </div>
      }
      modal
      maximizable
      style={{ width: '85vw', maxWidth: '1400px', height: '80vh' }}
      className="texture-set-association-dialog"
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
              placeholder="Search texture sets..."
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
            <p>Loading texture sets...</p>
          </div>
        ) : (
          <div className="association-section">
            <h4 className="section-header">
              <i className="pi pi-image" />
              Texture Sets ({filteredTextureSets.length})
            </h4>
            {filteredTextureSets.length === 0 ? (
              <div className="no-results">
                <i className="pi pi-inbox" />
                <p>No texture sets found</p>
              </div>
            ) : (
              <div className="texture-sets-card-grid">
                {filteredTextureSets.map(ts => (
                  <TextureSetCard
                    key={ts.id}
                    textureSet={ts}
                    isSelected={ts.id === selectedId}
                    onSelect={handleSelect}
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

interface TextureSetCardProps {
  textureSet: TextureSetDto
  isSelected: boolean
  onSelect: (textureSetId: number) => void
}

function TextureSetCard({
  textureSet,
  isSelected,
  onSelect,
}: TextureSetCardProps) {
  // Get albedo or diffuse texture for preview
  const getPreviewTexture = () => {
    const albedo = textureSet.textures?.find(
      t => t.textureType === TextureType.Albedo
    )
    const diffuse = textureSet.textures?.find(
      t => t.textureType === TextureType.Diffuse
    )
    return albedo || diffuse
  }

  const previewTexture = getPreviewTexture()
  const previewUrl = previewTexture
    ? getFileUrl(previewTexture.fileId.toString())
    : null

  return (
    <div
      className={`texture-set-association-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(textureSet.id)}
    >
      <div className="texture-set-association-checkbox">
        <Checkbox checked={isSelected} readOnly />
      </div>
      <div className="texture-set-card-thumbnail">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={textureSet.name}
            className="texture-set-preview-image"
          />
        ) : (
          <div className="texture-set-placeholder">
            <i className="pi pi-image" />
          </div>
        )}
        <div className="texture-set-card-overlay">
          <span className="texture-set-card-name">{textureSet.name}</span>
          <span className="texture-set-card-info">
            {textureSet.textureCount} texture
            {textureSet.textureCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
