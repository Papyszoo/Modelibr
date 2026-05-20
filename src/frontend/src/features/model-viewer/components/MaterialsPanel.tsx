import './MaterialsPanel.css'

import { useQueryClient } from '@tanstack/react-query'
import { Badge } from 'primereact/badge'
import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { ContextMenu } from 'primereact/contextmenu'
import { Dropdown } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import type { MenuItem } from 'primereact/menuitem'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import {
  addVariantName,
  removeVariantName,
  setMainVariant,
} from '@/features/model-viewer/api/modelVersionApi'
import { useModelByIdQuery } from '@/features/model-viewer/api/queries'
import { useModelObject } from '@/features/model-viewer/hooks/useModelObject'
import { getFilePreviewUrl } from '@/features/models/api/modelApi'
import { useTextureSetsByModelVersionQuery } from '@/features/texture-set/api/queries'
import {
  associateTextureSetWithModelVersion,
  createTextureSet,
  disassociateTextureSetFromModelVersion,
  getTextureSetById,
  updateTextureSetKind,
} from '@/features/texture-set/api/textureSetApi'
import { CreateTextureSetDialog } from '@/features/texture-set/dialogs/CreateTextureSetDialog'
import { TextureType } from '@/features/texture-set/types'
import { useTabContext } from '@/hooks/useTabContext'
import { type TextureSetDto, TextureSetKind } from '@/types'

import { TextureSetAssociationDialog } from './TextureSetAssociationDialog'

interface MaterialsPanelProps {
  modelId: string | null
  modelVersionId: number | null
  selectedVersion: {
    id: number
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

  const [selectedVariant, setSelectedVariant] = useState<string>('')
  const [settingMainVariant, setSettingMainVariant] = useState(false)
  const [linkDialogVisible, setLinkDialogVisible] = useState(false)
  const [_linkingMaterial, setLinkingMaterial] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState<string | null>(null)
  const [addingPreset, setAddingPreset] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [deletingPreset, setDeletingPreset] = useState(false)
  const newPresetInputRef = useRef<HTMLInputElement>(null)
  const [createSetDialogVisible, setCreateSetDialogVisible] = useState(false)
  const [creatingForMaterial, setCreatingForMaterial] = useState<string | null>(
    null
  )
  const [contextTextureSet, setContextTextureSet] =
    useState<TextureSetDto | null>(null)
  const [convertingId, setConvertingId] = useState<number | null>(null)
  const contextMenuRef = useRef<ContextMenu>(null)

  const queryClient = useQueryClient()
  const { openTextureSetDetailsTab } = useTabContext()

  // Sync selectedVariant to mainVariantName when version changes
  useEffect(() => {
    const mainVariant = selectedVersion?.mainVariantName ?? ''
    setSelectedVariant(mainVariant)
  }, [selectedVersion?.id, selectedVersion?.mainVariantName])

  const { modelObject } = useModelObject()

  const textureSetsQuery = useTextureSetsByModelVersionQuery({
    modelVersionId: modelVersionId ?? 0,
    queryConfig: {
      enabled: modelVersionId !== null,
    },
  })
  const textureSets: TextureSetDto[] = textureSetsQuery.data ?? []
  const loading = textureSetsQuery.isLoading || textureSetsQuery.isFetching

  // Memoize array/string fallbacks so the `?? []` doesn't produce a fresh
  // reference on every render and invalidate downstream useMemo dependencies.
  const variantNames = useMemo(
    () => selectedVersion?.variantNames ?? [],
    [selectedVersion?.variantNames]
  )
  const mainVariantName = selectedVersion?.mainVariantName ?? ''
  const rawMaterialNames = useMemo(
    () => selectedVersion?.materialNames ?? [],
    [selectedVersion?.materialNames]
  )

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

  const textureMappings = useMemo(
    () => selectedVersion?.textureMappings ?? [],
    [selectedVersion?.textureMappings]
  )

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
    // Use the server-generated preview URL (PNG) so non-browser-native formats
    // like TIFF render correctly in the materials panel.
    return texture ? getFilePreviewUrl(texture.fileId.toString()) : null
  }

  const handleVariantChange = (variantName: string) => {
    setSelectedVariant(variantName)
    onVariantChange?.(variantName)
  }

  const handleSetMainVariant = async () => {
    if (!modelVersionId || !modelId) return
    try {
      setSettingMainVariant(true)
      // '__embedded__' is a frontend sentinel — register it in the backend if not yet stored
      if (
        selectedVariant === '__embedded__' &&
        !variantNames.includes('__embedded__')
      ) {
        await addVariantName(modelVersionId, '__embedded__')
      }
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

  const handleConfirmAddPreset = useCallback(async () => {
    const name = newPresetName.trim()
    if (!name || !modelVersionId) return
    try {
      await addVariantName(modelVersionId, name)
      setSelectedVariant(name)
      onVariantChange?.(name)
      onModelUpdated()
    } catch (error) {
      console.error('Failed to add preset:', error)
    } finally {
      setAddingPreset(false)
      setNewPresetName('')
    }
  }, [newPresetName, modelVersionId, onVariantChange, onModelUpdated])

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
          await removeVariantName(modelVersionId, presetName)
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

  const handleOpenCreateSetDialog = (materialName: string) => {
    setCreatingForMaterial(materialName)
    setCreateSetDialogVisible(true)
  }

  const handleCloseCreateSetDialog = () => {
    setCreateSetDialogVisible(false)
    setCreatingForMaterial(null)
  }

  const handleCreateOwnedSet = async (name: string, kind: TextureSetKind) => {
    if (!modelVersionId || creatingForMaterial === null) return
    const created = await createTextureSet({ name, kind })
    const apiMaterialName =
      creatingForMaterial === 'Default' ? '' : creatingForMaterial
    await associateTextureSetWithModelVersion(
      created.id,
      modelVersionId,
      apiMaterialName,
      selectedVariant
    )
    await textureSetsQuery.refetch()
    onModelUpdated()
    openTextureSetDetailsTab(created.id, created.name)
    handleCloseCreateSetDialog()
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
        mapping.materialName,
        selectedVariant
      )

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

  // Apply a kind change and refresh every texture-set-derived query so the
  // Materials panel, link picker and texture set pages all stay in sync.
  const applyKindChange = useCallback(
    async (ts: TextureSetDto, kind: TextureSetKind, ownerModelId?: number) => {
      try {
        setConvertingId(ts.id)
        await updateTextureSetKind(ts.id, kind, ownerModelId)
        // Converting to Single Model unlinks the set from other models, so
        // refresh texture-set, model and version queries — any open model
        // viewer must drop the now-stale mapping from its 3D preview.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['textureSets'] }),
          queryClient.invalidateQueries({ queryKey: ['modelVersions'] }),
          queryClient.invalidateQueries({ queryKey: ['models'] }),
        ])
        onModelUpdated()
      } catch (error) {
        console.error('Failed to change texture set kind:', error)
      } finally {
        setConvertingId(null)
      }
    },
    [queryClient, onModelUpdated]
  )

  // Multi-Model → Single Model. Single-model sets belong to exactly one model,
  // so warn (and list) when other models would be unlinked by the conversion.
  const handleConvertToSingleModel = useCallback(
    async (ts: TextureSetDto) => {
      const currentModelId = Number(modelId)

      // The cached texture set may be stale — e.g. it was linked to another
      // model from a different panel since this list was loaded. Re-fetch so
      // the unlink warning reflects the set's actual associations.
      let associatedModels = ts.associatedModels
      try {
        const fresh = await getTextureSetById(ts.id)
        associatedModels = fresh.associatedModels
      } catch (error) {
        console.error('Failed to refresh texture set associations:', error)
      }

      const otherModels = Array.from(
        new Map(
          associatedModels
            .filter(m => m.id !== currentModelId)
            .map(m => [m.id, m.name])
        ).values()
      )

      if (otherModels.length > 0) {
        const label = otherModels.length === 1 ? 'model' : 'models'
        confirmDialog({
          header: 'Convert to Single Model Texture Set',
          message: `"${ts.name}" is also linked to ${otherModels.length} other ${label}: ${otherModels.join(', ')}.\n\nConverting it will unlink the texture set from ${otherModels.length === 1 ? 'that model' : 'those models'}. Continue?`,
          icon: 'pi pi-exclamation-triangle',
          acceptLabel: 'Convert & Unlink',
          rejectLabel: 'Cancel',
          acceptClassName: 'p-button-danger',
          accept: () =>
            applyKindChange(ts, TextureSetKind.ModelOwned, currentModelId),
        })
        return
      }

      applyKindChange(ts, TextureSetKind.ModelOwned, currentModelId)
    },
    [modelId, applyKindChange]
  )

  // Single Model → Multi-Model. No data is lost, so convert without a prompt.
  const handleConvertToMultiModel = useCallback(
    (ts: TextureSetDto) => {
      applyKindChange(ts, TextureSetKind.ModelSpecific)
    },
    [applyKindChange]
  )

  const contextMenuItems = useMemo<MenuItem[]>(() => {
    if (!contextTextureSet) return []
    if (contextTextureSet.kind === TextureSetKind.ModelSpecific) {
      return [
        {
          label: 'Convert to Single Model Texture Set',
          icon: 'pi pi-box',
          command: () => handleConvertToSingleModel(contextTextureSet),
        },
      ]
    }
    if (contextTextureSet.kind === TextureSetKind.ModelOwned) {
      return [
        {
          label: 'Convert to Multi-Model Texture Set',
          icon: 'pi pi-images',
          command: () => handleConvertToMultiModel(contextTextureSet),
        },
      ]
    }
    return []
  }, [contextTextureSet, handleConvertToSingleModel, handleConvertToMultiModel])

  // Use persisted variant names from backend (no longer need localPresets)
  // Filter out '' (Default) and '__embedded__' which are shown as fixed options
  const allPresetNames = useMemo(() => {
    return variantNames.filter(v => v !== '' && v !== '__embedded__').sort()
  }, [variantNames])

  const variantOptions = [
    { label: 'Default', value: '' },
    { label: 'Embedded', value: '__embedded__' },
    ...allPresetNames.map(v => ({ label: v, value: v })),
  ]

  const isEmbeddedPreset = selectedVariant === '__embedded__'

  return (
    <div className="materials-panel" data-testid="materials-panel">
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
          {selectedVariant !== '' && selectedVariant !== '__embedded__' && (
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
                  {!isEmbeddedPreset && (
                    <div className="materials-item-actions">
                      <Button
                        icon="pi pi-link"
                        className="p-button-sm p-button-text"
                        onClick={() => handleLinkTextureSet(materialName)}
                        tooltip="Link Texture Set"
                        tooltipOptions={{ position: 'top' }}
                        aria-label="Link Texture Set"
                        size="small"
                        data-testid={`link-ts-${materialName}`}
                      />
                      <Button
                        icon="pi pi-plus"
                        className="p-button-sm p-button-text"
                        onClick={() => handleOpenCreateSetDialog(materialName)}
                        tooltip="Add new texture set"
                        tooltipOptions={{ position: 'top' }}
                        aria-label="Add new texture set"
                        size="small"
                        data-testid={`add-ts-${materialName}`}
                      />
                      {linkedSets.length > 0 && (
                        <Button
                          icon="pi pi-times"
                          className="p-button-text p-button-sm p-button-danger"
                          onClick={() => handleUnlinkMaterial(materialName)}
                          loading={unlinking === materialName}
                          tooltip="Unlink"
                          tooltipOptions={{ position: 'top' }}
                          aria-label="Unlink"
                          size="small"
                          data-testid={`unlink-ts-${materialName}`}
                        />
                      )}
                    </div>
                  )}
                </div>
                {linkedSets.map(linkedTs => {
                  const previewUrl = getPreviewUrl(linkedTs)
                  const openSet = () => {
                    onTextureSetSelect(linkedTs.id)
                    openTextureSetDetailsTab(linkedTs.id, linkedTs.name)
                  }
                  const canConvert =
                    linkedTs.kind === TextureSetKind.ModelSpecific ||
                    linkedTs.kind === TextureSetKind.ModelOwned
                  return (
                    <div
                      key={`${materialName}-${linkedTs.id}`}
                      className="materials-item materials-item-clickable"
                      data-testid={`material-item-${materialName}-${linkedTs.id}`}
                      data-texture-set={linkedTs.name}
                      role="button"
                      tabIndex={0}
                      onClick={openSet}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openSet()
                        }
                      }}
                      onContextMenu={e => {
                        if (!canConvert || convertingId !== null) return
                        e.preventDefault()
                        setContextTextureSet(linkedTs)
                        contextMenuRef.current?.show(e)
                      }}
                      title={`Open ${linkedTs.name} in a new tab`}
                    >
                      <div className="materials-item-linked">
                        <div className="materials-item-preview">
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
                      </div>
                    </div>
                  )
                })}
                {linkedSets.length === 0 && isEmbeddedPreset && (
                  <div className="materials-empty">
                    <i
                      className="pi pi-box"
                      style={{ marginRight: '0.5rem' }}
                    />
                    Embedded
                  </div>
                )}
                {linkedSets.length === 0 && !isEmbeddedPreset && (
                  <div className="materials-empty">
                    <i
                      className="pi pi-link"
                      style={{ marginRight: '0.5rem' }}
                    />
                    No texture sets linked
                  </div>
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
          variantName={selectedVariant}
          textureMappings={textureMappings}
          onHide={handleLinkDialogClose}
          onAssociationsChanged={handleLinkDialogClose}
        />
      )}

      <CreateTextureSetDialog
        visible={createSetDialogVisible}
        onHide={handleCloseCreateSetDialog}
        onSubmit={handleCreateOwnedSet}
        lockedKind={TextureSetKind.ModelOwned}
        header={
          creatingForMaterial
            ? `New Texture Set — ${creatingForMaterial}`
            : 'New Texture Set'
        }
      />

      <ContextMenu
        ref={contextMenuRef}
        model={contextMenuItems}
        onHide={() => setContextTextureSet(null)}
      />
    </div>
  )
}
