import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Dialog } from 'primereact/dialog'
import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { Toast } from 'primereact/toast'
import { Message } from 'primereact/message'
import { TextureSetDto, TextureType, TextureChannel } from '@/types'
import {
  getTextureTypeLabel,
  isHeightRelatedType,
} from '../../../utils/textureTypeUtils'
import './dialogs.css'

// RGB dropdown options
type RgbOption = 'none' | 'albedo' | 'normal' | 'emissive' | 'split'

interface FileChannelMapping {
  fileId: number
  fileName: string
  rgbOption: RgbOption
  rChannel: TextureType | null
  gChannel: TextureType | null
  bChannel: TextureType | null
  aChannel: TextureType | null
}

interface ChannelMergeRequest {
  fileId: number
  mappings: Array<{
    channel: TextureChannel
    textureType: TextureType
  }>
}

interface MergeTextureSetDialogProps {
  visible: boolean
  sourceTextureSet: TextureSetDto | null
  targetTextureSet: TextureSetDto | null
  onHide: () => void
  onMerge: (requests: ChannelMergeRequest[]) => Promise<void>
}

// Grayscale texture types for R/G/B/A channels
const GRAYSCALE_TYPES = [
  TextureType.AO,
  TextureType.Roughness,
  TextureType.Metallic,
  TextureType.Height,
  TextureType.Displacement,
  TextureType.Bump,
  TextureType.Alpha,
]

// Alpha channel can also be used for Height-related types
const ALPHA_TYPES = [
  TextureType.Alpha,
  TextureType.Height,
  TextureType.Displacement,
  TextureType.Bump,
]

function MergeTextureSetDialog({
  visible,
  sourceTextureSet,
  targetTextureSet,
  onHide,
  onMerge,
}: MergeTextureSetDialogProps) {
  const [fileMappings, setFileMappings] = useState<FileChannelMapping[]>([])
  const [merging, setMerging] = useState(false)
  const toast = useRef<Toast>(null)

  // Initialize file mappings when dialog opens
  useEffect(() => {
    if (visible && sourceTextureSet) {
      // Get unique files from source textures
      const uniqueFiles = new Map<number, string>()
      sourceTextureSet.textures?.forEach(t => {
        if (t.fileId && !uniqueFiles.has(t.fileId)) {
          uniqueFiles.set(t.fileId, t.fileName || `File ${t.fileId}`)
        }
      })

      const mappings: FileChannelMapping[] = Array.from(
        uniqueFiles.entries()
      ).map(([fileId, fileName]) => ({
        fileId,
        fileName,
        rgbOption: 'none',
        rChannel: null,
        gChannel: null,
        bChannel: null,
        aChannel: null,
      }))
      setFileMappings(mappings)
    } else if (!visible) {
      setFileMappings([])
    }
  }, [visible, sourceTextureSet])

  // RGB dropdown options
  const rgbOptions = [
    { label: 'None', value: 'none' as RgbOption },
    { label: 'Albedo', value: 'albedo' as RgbOption },
    { label: 'Normal', value: 'normal' as RgbOption },
    { label: 'Emissive', value: 'emissive' as RgbOption },
    { label: 'Split Channels', value: 'split' as RgbOption },
  ]

  // Grayscale channel options
  const grayscaleOptions = [
    { label: 'None', value: null },
    ...GRAYSCALE_TYPES.map(t => ({ label: getTextureTypeLabel(t), value: t })),
  ]

  const alphaOptions = [
    { label: 'None', value: null },
    ...ALPHA_TYPES.map(t => ({ label: getTextureTypeLabel(t), value: t })),
  ]

  // Get all selected texture types across all files
  const getAllSelectedTypes = useCallback((): TextureType[] => {
    const types: TextureType[] = []
    fileMappings.forEach(fm => {
      if (fm.rgbOption === 'albedo') types.push(TextureType.Albedo)
      if (fm.rgbOption === 'normal') types.push(TextureType.Normal)
      if (fm.rgbOption === 'emissive') types.push(TextureType.Emissive)
      if (fm.rgbOption === 'split') {
        if (fm.rChannel) types.push(fm.rChannel)
        if (fm.gChannel) types.push(fm.gChannel)
        if (fm.bChannel) types.push(fm.bChannel)
      }
      if (fm.aChannel) types.push(fm.aChannel)
    })
    return types
  }, [fileMappings])

  // Check for conflicts with target set
  const overrideWarnings = useMemo(() => {
    if (!targetTextureSet) return []
    const existingTypes =
      targetTextureSet.textures?.map(t => t.textureType) || []
    const selectedTypes = getAllSelectedTypes()
    return selectedTypes.filter(t => existingTypes.includes(t))
  }, [targetTextureSet, getAllSelectedTypes])

  // Check Height exclusivity
  const heightConflict = useMemo(() => {
    const selectedTypes = getAllSelectedTypes()
    const targetHeightType = targetTextureSet?.textures?.find(t =>
      isHeightRelatedType(t.textureType)
    )?.textureType

    // Check if we're selecting multiple height types
    const selectedHeightTypes = selectedTypes.filter(t =>
      isHeightRelatedType(t)
    )
    if (selectedHeightTypes.length > 1) {
      return 'Cannot select multiple Height/Displacement/Bump types'
    }

    // Check if target already has a height type and we're adding a different one
    if (targetHeightType && selectedHeightTypes.length > 0) {
      const selectedHeight = selectedHeightTypes[0]
      if (selectedHeight !== targetHeightType) {
        return `Target already has ${getTextureTypeLabel(targetHeightType)}. Cannot add ${getTextureTypeLabel(selectedHeight)}.`
      }
    }

    return null
  }, [targetTextureSet, getAllSelectedTypes])

  const updateFileMapping = (
    fileId: number,
    updates: Partial<FileChannelMapping>
  ) => {
    setFileMappings(prev =>
      prev.map(fm => (fm.fileId === fileId ? { ...fm, ...updates } : fm))
    )
  }

  const handleMerge = async () => {
    if (heightConflict) {
      toast.current?.show({
        severity: 'error',
        summary: 'Validation Error',
        detail: heightConflict,
        life: 3000,
      })
      return
    }

    const requests: ChannelMergeRequest[] = []

    fileMappings.forEach(fm => {
      const mappings: ChannelMergeRequest['mappings'] = []

      if (fm.rgbOption === 'albedo') {
        mappings.push({
          channel: TextureChannel.RGB,
          textureType: TextureType.Albedo,
        })
      } else if (fm.rgbOption === 'normal') {
        mappings.push({
          channel: TextureChannel.RGB,
          textureType: TextureType.Normal,
        })
      } else if (fm.rgbOption === 'emissive') {
        mappings.push({
          channel: TextureChannel.RGB,
          textureType: TextureType.Emissive,
        })
      } else if (fm.rgbOption === 'split') {
        if (fm.rChannel)
          mappings.push({ channel: TextureChannel.R, textureType: fm.rChannel })
        if (fm.gChannel)
          mappings.push({ channel: TextureChannel.G, textureType: fm.gChannel })
        if (fm.bChannel)
          mappings.push({ channel: TextureChannel.B, textureType: fm.bChannel })
      }

      if (fm.aChannel) {
        mappings.push({ channel: TextureChannel.A, textureType: fm.aChannel })
      }

      if (mappings.length > 0) {
        requests.push({ fileId: fm.fileId, mappings })
      }
    })

    if (requests.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'No Mappings',
        detail: 'Please select at least one channel mapping',
        life: 3000,
      })
      return
    }

    try {
      setMerging(true)
      await onMerge(requests)
      onHide()
    } catch (error) {
      console.error('Failed to merge texture sets:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to merge texture sets',
        life: 3000,
      })
    } finally {
      setMerging(false)
    }
  }

  const footer = (
    <div>
      <Button
        label="Cancel"
        icon="pi pi-times"
        onClick={onHide}
        className="p-button-text"
        disabled={merging}
      />
      <Button
        label="Merge Textures"
        icon="pi pi-check"
        onClick={handleMerge}
        disabled={merging || !!heightConflict}
        loading={merging}
      />
    </div>
  )

  return (
    <>
      <Toast ref={toast} />
      <Dialog
        header={`Merge "${sourceTextureSet?.name}" into "${targetTextureSet?.name}"`}
        visible={visible}
        style={{ width: '600px' }}
        footer={footer}
        onHide={onHide}
        modal
      >
        <div className="merge-texture-set-dialog">
          {!sourceTextureSet || !targetTextureSet ? (
            <div className="merge-error">
              <p>Error: Unable to load texture set information.</p>
            </div>
          ) : (
            <>
              <p className="merge-description">
                Map channels from source files to texture types:
              </p>

              {fileMappings.map(fm => (
                <div key={fm.fileId} className="file-channel-mapping">
                  <div className="file-header">
                    <i className="pi pi-image" />
                    <span className="file-name">{fm.fileName}</span>
                  </div>

                  <div className="channel-row">
                    <label>RGB:</label>
                    <Dropdown
                      value={fm.rgbOption}
                      options={rgbOptions}
                      onChange={e =>
                        updateFileMapping(fm.fileId, {
                          rgbOption: e.value,
                          rChannel: null,
                          gChannel: null,
                          bChannel: null,
                        })
                      }
                      disabled={merging}
                      className="channel-dropdown"
                      data-testid={`rgb-dropdown-${fm.fileId}`}
                    />
                  </div>

                  {fm.rgbOption === 'split' && (
                    <div className="split-channels">
                      <div className="channel-row indent">
                        <label>R:</label>
                        <Dropdown
                          value={fm.rChannel}
                          options={grayscaleOptions}
                          onChange={e =>
                            updateFileMapping(fm.fileId, { rChannel: e.value })
                          }
                          disabled={merging}
                          className="channel-dropdown"
                          placeholder="None"
                        />
                      </div>
                      <div className="channel-row indent">
                        <label>G:</label>
                        <Dropdown
                          value={fm.gChannel}
                          options={grayscaleOptions}
                          onChange={e =>
                            updateFileMapping(fm.fileId, { gChannel: e.value })
                          }
                          disabled={merging}
                          className="channel-dropdown"
                          placeholder="None"
                        />
                      </div>
                      <div className="channel-row indent">
                        <label>B:</label>
                        <Dropdown
                          value={fm.bChannel}
                          options={grayscaleOptions}
                          onChange={e =>
                            updateFileMapping(fm.fileId, { bChannel: e.value })
                          }
                          disabled={merging}
                          className="channel-dropdown"
                          placeholder="None"
                        />
                      </div>
                    </div>
                  )}

                  <div className="channel-row">
                    <label>A:</label>
                    <Dropdown
                      value={fm.aChannel}
                      options={alphaOptions}
                      onChange={e =>
                        updateFileMapping(fm.fileId, { aChannel: e.value })
                      }
                      disabled={merging}
                      className="channel-dropdown"
                      placeholder="None"
                    />
                  </div>
                </div>
              ))}

              {overrideWarnings.length > 0 && (
                <Message
                  severity="warn"
                  text={`Will replace: ${overrideWarnings.map(t => getTextureTypeLabel(t)).join(', ')}`}
                  className="override-warning"
                />
              )}

              {heightConflict && (
                <Message
                  severity="error"
                  text={heightConflict}
                  className="height-conflict-error"
                />
              )}
            </>
          )}
        </div>
      </Dialog>
    </>
  )
}

export default MergeTextureSetDialog
