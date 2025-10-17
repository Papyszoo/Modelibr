import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import {
  Model,
  TextureSetDto,
  PackSummaryDto,
  TextureType,
} from '../../../types'
// eslint-disable-next-line no-restricted-imports -- Dialog needs direct API access
import ApiClient from '../../../services/ApiClient'
import './TextureSetAssociationDialog.css'

interface TextureSetAssociationDialogProps {
  visible: boolean
  model: Model
  onHide: () => void
  onAssociationsChanged: () => void
}

interface TextureSetAssociation {
  textureSet: TextureSetDto
  isAssociated: boolean
  originallyAssociated: boolean
}

function TextureSetAssociationDialog({
  visible,
  model,
  onHide,
  onAssociationsChanged,
}: TextureSetAssociationDialogProps) {
  const [textureSetAssociations, setTextureSetAssociations] = useState<
    TextureSetAssociation[]
  >([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPackIds, setSelectedPackIds] = useState<number[]>([])
  const [availablePacks, setAvailablePacks] = useState<PackSummaryDto[]>([])
  const toast = useRef<Toast>(null)

  useEffect(() => {
    if (visible) {
      loadTextureSets()
      loadPacks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only run when dialog becomes visible
  }, [visible])

  const loadPacks = async () => {
    try {
      const packs = await ApiClient.getAllPacks()
      setAvailablePacks(packs)
    } catch (error) {
      console.error('Failed to load packs:', error)
    }
  }

  const loadTextureSets = useCallback(async () => {
    try {
      setLoading(true)
      const allTextureSets = await ApiClient.getAllTextureSets()

      // Get currently associated texture set IDs
      const associatedTextureSetIds = new Set(
        model.textureSets?.map(ts => ts.id) || []
      )

      // Create association objects
      const associations: TextureSetAssociation[] = allTextureSets.map(
        textureSet => ({
          textureSet,
          isAssociated: associatedTextureSetIds.has(textureSet.id),
          originallyAssociated: associatedTextureSetIds.has(textureSet.id),
        })
      )

      setTextureSetAssociations(associations)
    } catch (error) {
      console.error('Failed to load texture sets:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load texture sets',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }, [model.textureSets])

  const handleToggleAssociation = (
    textureSetId: number,
    isAssociated: boolean
  ) => {
    setTextureSetAssociations(prev =>
      prev.map(assoc => {
        if (assoc.textureSet.id === textureSetId) {
          return {
            ...assoc,
            isAssociated,
          }
        }
        return assoc
      })
    )
  }

  const getChanges = () => {
    const toAssociate: TextureSetDto[] = []
    const toDisassociate: TextureSetDto[] = []

    textureSetAssociations.forEach(assoc => {
      if (assoc.isAssociated && !assoc.originallyAssociated) {
        toAssociate.push(assoc.textureSet)
      } else if (!assoc.isAssociated && assoc.originallyAssociated) {
        toDisassociate.push(assoc.textureSet)
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
      for (const textureSet of toAssociate) {
        await ApiClient.associateTextureSetWithModel(
          textureSet.id,
          parseInt(model.id)
        )
      }

      // Process disassociations
      for (const textureSet of toDisassociate) {
        await ApiClient.disassociateTextureSetFromModel(
          textureSet.id,
          parseInt(model.id)
        )
      }

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set associations updated successfully',
        life: 3000,
      })

      onAssociationsChanged()
    } catch (error) {
      console.error('Failed to update texture set associations:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update texture set associations',
        life: 3000,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset changes
    setTextureSetAssociations(prev =>
      prev.map(assoc => ({
        ...assoc,
        isAssociated: assoc.originallyAssociated,
      }))
    )
    setSearchQuery('')
    setSelectedPackIds([])
    onHide()
  }

  // Filter texture sets
  const filteredTextureSets = textureSetAssociations.filter(assoc => {
    const matchesSearch = assoc.textureSet.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase())

    const matchesPack =
      selectedPackIds.length === 0 ||
      (assoc.textureSet.packs &&
        assoc.textureSet.packs.some(pack => selectedPackIds.includes(pack.id)))

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
      header={`Link Texture Sets - "${model.name}"`}
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
              All Texture Sets ({filteredTextureSets.length})
            </h4>
            {filteredTextureSets.length === 0 ? (
              <div className="no-results">
                <i className="pi pi-inbox" />
                <p>No texture sets found</p>
              </div>
            ) : (
              <div className="texture-sets-card-grid">
                {filteredTextureSets.map(assoc => (
                  <TextureSetCard
                    key={assoc.textureSet.id}
                    textureSet={assoc.textureSet}
                    isAssociated={assoc.isAssociated}
                    onToggle={handleToggleAssociation}
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
  isAssociated: boolean
  onToggle: (textureSetId: number, isAssociated: boolean) => void
}

function TextureSetCard({
  textureSet,
  isAssociated,
  onToggle,
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
    ? ApiClient.getFileUrl(previewTexture.fileId.toString())
    : null

  return (
    <div
      className={`texture-set-association-card ${isAssociated ? 'selected' : ''}`}
      onClick={() => onToggle(textureSet.id, !isAssociated)}
    >
      <div className="texture-set-association-checkbox">
        <Checkbox checked={isAssociated} readOnly />
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

export default TextureSetAssociationDialog
