import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { useCallback } from 'react'

import { SetHeader } from '@/features/texture-set/dialogs/SetHeader'
import { SetStats } from '@/features/texture-set/dialogs/SetStats'
import type { QualityOption } from '@/features/texture-set/hooks/useTextureSetViewerData'
import { type TextureSetDto, TextureSetKind } from '@/types'

interface TextureSetViewerHeaderProps {
  textureSet: TextureSetDto
  onNameUpdate: (newName: string) => Promise<void>
  updating: boolean
  textureQuality: number
  onQualityChange: (value: number) => void
  qualityOptions: QualityOption[]
  availableSizes: Set<number>
  onGenerateProxy: (size: number) => void
  isGeneratingProxy: boolean
}

export function TextureSetViewerHeader({
  textureSet,
  onNameUpdate,
  updating,
  textureQuality,
  onQualityChange,
  qualityOptions,
  availableSizes,
  onGenerateProxy,
  isGeneratingProxy,
}: TextureSetViewerHeaderProps) {
  const handleQualityChange = useCallback(
    (value: number) => {
      if (value === 0 || availableSizes.has(value)) {
        onQualityChange(value)
      }
    },
    [availableSizes, onQualityChange]
  )

  const qualityItemTemplate = (option: QualityOption) => {
    const isAvailable = option.value === 0 || option.available
    if (isAvailable) {
      return <span>{option.label}</span>
    }
    return (
      <div className="quality-option-unavailable">
        <span className="quality-option-label-na">{option.label} (N/A)</span>
        <Button
          icon="pi pi-download"
          className="p-button-text p-button-sm quality-generate-btn"
          tooltip={`Generate ${option.value}px proxies`}
          tooltipOptions={{ position: 'left' }}
          loading={isGeneratingProxy}
          onClick={e => {
            e.stopPropagation()
            onGenerateProxy(option.value)
          }}
        />
      </div>
    )
  }

  return (
    <header className="set-viewer-header">
      <div className="set-overview">
        <div className="set-info">
          <SetHeader
            textureSet={textureSet}
            onNameUpdate={onNameUpdate}
            updating={updating}
          />
          <SetStats textureSet={textureSet} />
        </div>
        {textureSet.kind === TextureSetKind.Universal && (
          <div className="set-viewer-quality">
            <label className="quality-label">Texture Quality</label>
            <Dropdown
              value={textureQuality}
              options={qualityOptions}
              onChange={e => handleQualityChange(e.value)}
              itemTemplate={qualityItemTemplate}
              className="quality-dropdown-header"
            />
          </div>
        )}
      </div>
    </header>
  )
}
