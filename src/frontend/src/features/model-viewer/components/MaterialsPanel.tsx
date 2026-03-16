import './MaterialsPanel.css'

import { Badge } from 'primereact/badge'
import { Button } from 'primereact/button'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Dropdown } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { setMainVariant } from '@/features/model-viewer/api/modelVersionApi'
import { useModelByIdQuery } from '@/features/model-viewer/api/queries'
import { useModelObject } from '@/features/model-viewer/hooks/useModelObject'
import {
  getFileUrl,
  setDefaultTextureSet,
} from '@/features/models/api/modelApi'
import { useTextureSetsByModelVersionQuery } from '@/features/texture-set/api/queries'
import { disassociateTextureSetFromModelVersion } from '@/features/texture-set/api/textureSetApi'
import { type TextureSetDto } from '@/types'
import { TextureType } from '@/features/texture-set/types'

import { TextureSetAssociationDialog } from './TextureSetAssociationDialog'

interface MaterialsPanelProps {
  modelId: string | null
  modelVersionId: number | null
  selectedVersion: {
    id: number
    defaultTextureSetId?: number
    materialNames?: string[]
    variantNames?: string[]
    mainVariantName?: string
    textureMappings?: Array<{
      materialName: string
      textureSetId: number
      variantName: string
    }>
  } | null
  selectedTextureSetId: number | null
  onTextureSetSelect: (textureSetId: number | null) => void
  onModelUpdated: () => void
  onVariantChange?: (variantName: string) => void
}

export function MaterialsPanel({
  modelId,
  modelVersionId,
  selectedVersion,
  selectedTextureSetId,
  onTextureSetSelect,
  onModelUpdated,
  onVariantChange,
}: MaterialsPanelProps) {
  const modelQuery = useModelByIdQuery({
    modelId: modelId ?? '',
    queryConfig: { enabled: !!modelId },
  })
  const model = modelQuery.data ?? null
  const numericModelId = modelId ? parseInt(modelId) : null

  const [selectedVariant, setSelectedVariant] = useState<string>('')
  const [settingMainVariant, setSettingMainVariant] = useState(false)
  const [linkDialogVisible, setLinkDialogVisible] = useState(false)
  const [_linkingMaterial, setLinkingMaterial] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState<string | null>(null)
  const [addingPreset, setAddingPreset] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [deletingPreset, setDeletingPreset] = useState(false)
  const [localPresets, setLocalPresets] = useState<string[]>([])
  const newPresetInputRef = useRef<HTMLInputElement>(null)

  // Sync selectedVariant to mainVariantName when version changes
  useEffect(() => {
    const mainVariant = selectedVersion?.mainVariantName ?? ''
    setSelectedVariant(mainVariant)
  }, [selectedVersion?.id, selectedVersion?.mainVariantName])

  // Reset local presets when switching to a different version
  useEffect(() => {
    setLocalPresets([])
  }, [selectedVersion?.id])

  const { modelObject } = useModelObject()

  const textureSetsQuery = useTextureSetsByModelVersionQuery({
    modelVersionId: modelVersionId ?? 0,
    queryConfig: {
      enabled: modelVersionId !== null,
    },
  })
  const textureSets: TextureSetDto[] = textureSetsQuery.data ?? []
  const loading = textureSetsQuery.isLoading || textureSetsQuery.isFetching

  const variantNames = selectedVersion?.variantNames ?? []
  const mainVariantName = selectedVersion?.mainVariantName ?? ''
  const rawMaterialNames = selectedVersion?.materialNames ?? []

  // Extract material names from the loaded 3D model as a fallback
  const runtimeMaterialNames = useMemo(() => {
    if (!modelObject) return []
    const names = new Set<string>()
    modelObject.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material]
        for (const mat of materials) {
          if (mat?.name) names.add(mat.name)
        }
      }
    })
    return Array.from(names)
  }, [modelObject])

  const textureMappings = selectedVersion?.textureMappings ?? []
  const defaultTextureSetId = selectedVersion?.defaultTextureSetId ?? null

  // Merge API material names with runtime ones, dedup, fallback to 'Default'
  const materialNames = useMemo(() => {
    const merged = new Set([...rawMaterialNames, ...runtimeMaterialNames])
    // Include 'Default' entry if there are mappings with empty materialName
    const hasEmptyMappings = textureMappings.some(m => m.materialName === '')
    if (hasEmptyMappings) merged.add('Default')
    return merged.size > 0 ? Array.from(merged) : ['Default']
  }, [rawMaterialNames, runtimeMaterialNames, textureMappings])

  const isMainVariant = selectedVariant === mainVariantName

  // Filter mappings for the current variant
  const currentVariantMappings = textureMappings.filter(
    m => m.variantName === selectedVariant
  )

  // Get ALL texture sets linked to a specific material in the current variant
  const getTextureSetsForMaterial = (materialName: string): TextureSetDto[] => {
    const mappings = currentVariantMappings.filter(
      m =>
        m.materialName === materialName ||
        (materialName === 'Default' && m.materialName === '')
    )
    return mappings
      .map(m => textureSets.find(ts => ts.id === m.textureSetId))
      .filter((ts): ts is TextureSetDto => ts != null)
  }

  const getPreviewUrl = (textureSet: TextureSetDto) => {
    const albedo = textureSet.textures?.find(
      t => t.textureType === TextureType.Albedo
    )
    const texture = albedo
    return texture ? getFileUrl(texture.fileId.toString()) : null
  }

  const handleVariantChange = (variantName: string) => {
    setSelectedVariant(variantName)
    // Defer the cross-component state update to avoid React Error #310:
    // PrimeReact Dropdown can call onChange synchronously during its own render
    // phase when the controlled value changes. Calling setState for a *different*
    // component (ModelViewer's selectedTextureSetId) during another component's render
    // triggers React's "Cannot update a component while rendering a different component"
    // invariant. queueMicrotask schedules the call after the current render cycle ends.
    queueMicrotask(() => onVariantChange?.(variantName))
  }

  const handleSetMainVariant = async () => {
    if (!modelVersionId || !modelId) return
    try {
      setSettingMainVariant(true)
      await setMainVariant(modelVersionId, selectedVariant)
      // Thumbnail regeneration is handled by the backend when setting main variant
      onModelUpdated()
    } catch (error) {
      console.error('Failed to set main variant:', error)
    } finally {
      setSettingMainVariant(false)
    }
  }

  const handleAddPreset = useCallback(() => {
    setAddingPreset(true)
    setNewPresetName('')
    setTimeout(() => newPresetInputRef.current?.focus(), 50)
  }, [])

  const handleConfirmAddPreset = useCallback(() => {
    const name = newPresetName.trim()
    if (!name) return
    // Track locally so it survives selection changes until backend knows about it
    setLocalPresets(prev => prev.includes(name) ? prev : [...prev, name])
    setSelectedVariant(name)
    onVariantChange?.(name)
    setAddingPreset(false)
    setNewPresetName('')
  }, [newPresetName, onVariantChange])

  const handleCancelAddPreset = useCallback(() => {
    setAddingPreset(false)
    setNewPresetName('')
  }, [])

  const handleDeletePreset = useCallback(() => {
    if (!modelVersionId || selectedVariant === '') return
    const presetName = selectedVariant
    confirmDialog({
      message: `Delete preset "${presetName}"? All material links for this preset will be removed.`,
      header: 'Delete Preset',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          setDeletingPreset(true)
          // Remove all mappings for this variant
          const mappingsToRemove = textureMappings.filter(
            m => m.variantName === presetName
          )
          for (const mapping of mappingsToRemove) {
            await disassociateTextureSetFromModelVersion(
              mapping.textureSetId,
              modelVersionId,
              mapping.materialName,
              presetName
            )
          }
          // Remove from local presets and switch back to Default
          setLocalPresets(prev => prev.filter(p => p !== presetName))
          setSelectedVariant('')
          onVariantChange?.('')
          await textureSetsQuery.refetch()
          onModelUpdated()
        } catch (error) {
          console.error('Failed to delete preset:', error)
        } finally {
          setDeletingPreset(false)
        }
      },
    })
  }, [
    modelVersionId,
    selectedVariant,
    textureMappings,
    textureSetsQuery,
    onModelUpdated,
    onVariantChange,
  ])

  const handleLinkTextureSet = (materialName?: string) => {
    setLinkingMaterial(materialName ?? null)
    setLinkDialogVisible(true)
  }

  const handleLinkDialogClose = () => {
    setLinkDialogVisible(false)
    void textureSetsQuery.refetch()
    onModelUpdated()
  }

  const handleUnlinkMaterial = async (
    materialName: string,
    textureSetId?: number
  ) => {
    if (!modelVersionId) return
    // Map 'Default' display name to '' for API calls
    const apiMaterialName = materialName === 'Default' ? '' : materialName
    const mapping = textureSetId
      ? currentVariantMappings.find(
          m =>
            m.textureSetId === textureSetId &&
            (m.materialName === apiMaterialName ||
              (materialName === 'Default' && m.materialName === ''))
        )
      : currentVariantMappings.find(
          m =>
            m.materialName === apiMaterialName ||
            (materialName === 'Default' && m.materialName === '')
        )
    if (!mapping) return

    try {
      setUnlinking(materialName)
      await disassociateTextureSetFromModelVersion(
        mapping.textureSetId,
        modelVersionId,
        mapping.materialName || undefined,
        selectedVariant || undefined
      )

      if (selectedVersion?.defaultTextureSetId === mapping.textureSetId) {
        const remainingTextureSets = textureSets.filter(
          ts => ts.id !== mapping.textureSetId
        )
        const newDefaultId =
          remainingTextureSets.length > 0 ? remainingTextureSets[0].id : null
        await setDefaultTextureSet(
          numericModelId!,
          newDefaultId,
          modelVersionId
        )
      }

      if (selectedTextureSetId === mapping.textureSetId) {
        onTextureSetSelect(null)
      }

      await textureSetsQuery.refetch()
      onModelUpdated()
    } catch (error) {
      console.error('Failed to unlink material:', error)
    } finally {
      setUnlinking(null)
    }
  }

  // Merge backend variant names with locally-created presets (dedup)
  const allPresetNames = useMemo(() => {
    const backendNames = variantNames.filter(v => v !== '')
    const merged = new Set([...backendNames, ...localPresets])
    return Array.from(merged).sort()
  }, [variantNames, localPresets])

  const variantOptions = [
    { label: 'Default', value: '' },
    ...allPresetNames.map(v => ({ label: v, value: v })),
  ]

  return (
    <div className="materials-panel" data-testid="materials-panel">
      <ConfirmDialog />

      {/* Preset selector — always visible */}
      <div className="materials-variant-section">
        <label className="materials-variant-label">Preset</label>
        <div className="materials-variant-controls">
          <Dropdown
            value={selectedVariant}
            options={variantOptions}
            optionLabel="label"
            optionValue="value"
            onChange={e => handleVariantChange(e.value)}
            className="materials-variant-dropdown"
            data-testid="variant-dropdown"
          />
          <Button
            icon="pi pi-plus"
            className="p-button-sm p-button-text"
            onClick={handleAddPreset}
            tooltip="Add Preset"
            tooltipOptions={{ position: 'top' }}
            size="small"
            data-testid="add-preset-btn"
          />
          {selectedVariant !== '' && (
            <Button
              icon="pi pi-trash"
              className="p-button-sm p-button-text p-button-danger"
              onClick={handleDeletePreset}
              loading={deletingPreset}
              tooltip="Delete Preset"
              tooltipOptions={{ position: 'top' }}
              size="small"
              data-testid="delete-preset-btn"
            />
          )}
        </div>
        <div className="materials-variant-main-row">
          {isMainVariant ? (
            <Badge value="Main" severity="success" />
          ) : (
            <Button
              label="Set as Main"
              className="p-button-sm p-button-outlined"
              onClick={handleSetMainVariant}
              loading={settingMainVariant}
              data-testid="set-main-variant-btn"
              size="small"
            />
          )}
        </div>
      </div>

      {/* Add preset inline form */}
      {addingPreset && (
        <div className="materials-preset-add-form">
          <InputText
            ref={newPresetInputRef}
            value={newPresetName}
            onChange={e => setNewPresetName(e.target.value)}
            placeholder="Preset name"
            className="materials-preset-input"
            onKeyDown={e => {
              if (e.key === 'Enter') handleConfirmAddPreset()
              if (e.key === 'Escape') handleCancelAddPreset()
            }}
            data-testid="new-preset-name-input"
          />
          <Button
            icon="pi pi-check"
            className="p-button-sm p-button-success p-button-text"
            onClick={handleConfirmAddPreset}
            disabled={!newPresetName.trim()}
            size="small"
            data-testid="confirm-preset-btn"
          />
          <Button
            icon="pi pi-times"
            className="p-button-sm p-button-text"
            onClick={handleCancelAddPreset}
            size="small"
          />
        </div>
      )}

      {/* Material list */}
      <div className="materials-list">
        {loading ? (
          <div className="materials-loading">
            <i className="pi pi-spin pi-spinner" />
            <p>Loading materials...</p>
          </div>
        ) : (
          materialNames.map(materialName => {
            const linkedSets = getTextureSetsForMaterial(materialName)

            return (
              <div key={materialName} className="materials-material-group">
                <div className="materials-item-header">
                  <span className="materials-item-name">{materialName}</span>
                  <Button
                    icon="pi pi-link"
                    label="Link Texture Set"
                    className="p-button-sm p-button-text"
                    onClick={() => handleLinkTextureSet(materialName)}
                    size="small"
                    data-testid={`link-ts-${materialName}`}
                  />
                </div>
                {linkedSets.map(linkedTs => {
                  const previewUrl = getPreviewUrl(linkedTs)
                  const isDefault = linkedTs.id === defaultTextureSetId
                  return (
                    <div
                      key={`${materialName}-${linkedTs.id}`}
                      className={`materials-item${isDefault ? ' materials-item-default' : ''}`}
                      data-testid={`material-item-${materialName}`}
                      data-texture-set={linkedTs.name}
                    >
                      {isDefault && (
                        <Badge
                          value="Default"
                          severity="info"
                          className="materials-badge"
                        />
                      )}
                      <div className="materials-item-linked">
                        <div
                          className="materials-item-preview"
                          onClick={() => onTextureSetSelect(linkedTs.id)}
                        >
                          {previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={linkedTs.name}
                              className="materials-preview-img"
                            />
                          ) : (
                            <i className="pi pi-image" />
                          )}
                        </div>
                        <div className="materials-item-info">
                          <span className="materials-ts-name">
                            {linkedTs.name}
                          </span>
                          <span className="materials-ts-meta">
                            {linkedTs.textureCount} texture
                            {linkedTs.textureCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <Button
                          icon="pi pi-times"
                          className="p-button-text p-button-sm p-button-danger"
                          onClick={() =>
                            handleUnlinkMaterial(materialName, linkedTs.id)
                          }
                          loading={unlinking === materialName}
                          tooltip="Unlink"
                          tooltipOptions={{ position: 'left' }}
                          size="small"
                        />
                      </div>
                    </div>
                  )
                })}
                {linkedSets.length === 0 && (
                  <div className="materials-empty">No texture sets linked</div>
                )}
              </div>
            )
          })
        )}
      </div>

      {model && modelVersionId && (
        <TextureSetAssociationDialog
          visible={linkDialogVisible}
          model={model}
          modelVersionId={modelVersionId}
          materialName={_linkingMaterial ?? undefined}
          variantName={selectedVariant || undefined}
          textureMappings={textureMappings}
          onHide={handleLinkDialogClose}
          onAssociationsChanged={handleLinkDialogClose}
        />
      )}
    </div>
  )
}
