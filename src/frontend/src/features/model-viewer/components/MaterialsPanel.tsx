import './MaterialsPanel.css'

import { Badge } from 'primereact/badge'
import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { useMemo, useState } from 'react'
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
  // Track which material is being linked (used when opening link dialog from a specific material)
  const [_linkingMaterial, setLinkingMaterial] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState<string | null>(null)

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

  // Merge API material names with runtime ones, dedup, fallback to 'Default'
  const materialNames = useMemo(() => {
    const merged = new Set([...rawMaterialNames, ...runtimeMaterialNames])
    return merged.size > 0 ? Array.from(merged) : ['Default']
  }, [rawMaterialNames, runtimeMaterialNames])
  const textureMappings = selectedVersion?.textureMappings ?? []

  const isMainVariant = selectedVariant === mainVariantName

  // Filter mappings for the current variant
  const currentVariantMappings = textureMappings.filter(
    m => m.variantName === selectedVariant
  )

  // Get the texture set linked to a specific material in the current variant
  const getTextureSetForMaterial = (materialName: string) => {
    const mapping = currentVariantMappings.find(
      m => m.materialName === materialName
    )
    if (!mapping) return null
    return textureSets.find(ts => ts.id === mapping.textureSetId) ?? null
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
    onVariantChange?.(variantName)
  }

  const handleSetMainVariant = async () => {
    if (!modelVersionId) return
    try {
      setSettingMainVariant(true)
      await setMainVariant(modelVersionId, selectedVariant)
      onModelUpdated()
    } catch (error) {
      console.error('Failed to set main variant:', error)
    } finally {
      setSettingMainVariant(false)
    }
  }

  const handleLinkTextureSet = (materialName?: string) => {
    setLinkingMaterial(materialName ?? null)
    setLinkDialogVisible(true)
  }

  const handleLinkDialogClose = () => {
    setLinkDialogVisible(false)
    void textureSetsQuery.refetch()
    onModelUpdated()
  }

  const handleUnlinkMaterial = async (materialName: string) => {
    if (!modelVersionId) return
    const mapping = currentVariantMappings.find(
      m => m.materialName === materialName
    )
    if (!mapping) return

    try {
      setUnlinking(materialName)
      await disassociateTextureSetFromModelVersion(
        mapping.textureSetId,
        modelVersionId,
        materialName,
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

  // Variant dropdown options
  const variantOptions = [
    { label: 'Default', value: '' },
    ...variantNames.filter(v => v !== '').map(v => ({ label: v, value: v })),
  ]

  return (
    <div className="materials-panel" data-testid="materials-panel">
      {/* Preset selector */}
      {variantOptions.length > 1 && (
        <div className="materials-variant-section">
          <label className="materials-variant-label">Preset</label>
          <Dropdown
            value={selectedVariant}
            options={variantOptions}
            onChange={e => handleVariantChange(e.value)}
            className="materials-variant-dropdown"
            data-testid="variant-dropdown"
          />
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
            const linkedTs = getTextureSetForMaterial(materialName)
            const previewUrl = linkedTs ? getPreviewUrl(linkedTs) : null

            return (
              <div
                key={materialName}
                className="materials-item"
                data-testid={`material-item-${materialName}`}
              >
                <div className="materials-item-header">
                  <span className="materials-item-name">{materialName}</span>
                </div>
                {linkedTs ? (
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
                      <span className="materials-ts-name">{linkedTs.name}</span>
                      <span className="materials-ts-meta">
                        {linkedTs.textureCount} texture
                        {linkedTs.textureCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <Button
                      icon="pi pi-times"
                      className="p-button-text p-button-sm p-button-danger"
                      onClick={() => handleUnlinkMaterial(materialName)}
                      loading={unlinking === materialName}
                      tooltip="Unlink"
                      tooltipOptions={{ position: 'left' }}
                      size="small"
                    />
                  </div>
                ) : (
                  <Button
                    icon="pi pi-link"
                    label="Link Texture Set"
                    className="p-button-sm p-button-text"
                    onClick={() => handleLinkTextureSet(materialName)}
                    size="small"
                    data-testid={`link-ts-${materialName}`}
                  />
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
          onHide={handleLinkDialogClose}
          onAssociationsChanged={handleLinkDialogClose}
        />
      )}
    </div>
  )
}
