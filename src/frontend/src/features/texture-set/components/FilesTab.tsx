import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dropdown } from 'primereact/dropdown'
import { Toast } from 'primereact/toast'
import { Button } from 'primereact/button'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { TextureSetDto, TextureDto, TextureType, TextureChannel } from '@/types'
import { getTextureTypeLabel } from '@/utils/textureTypeUtils'
import { useTextureSets } from '@/features/texture-set/hooks/useTextureSets'
import { getFilePreviewUrl } from '@/features/models/api/modelApi'
import { softDeleteFile } from '@/features/models/api/modelApi'
import { TexturePreview } from './TexturePreview'
import './FilesTab.css'

interface FilesTabProps {
  textureSet: TextureSetDto
  onMappingChanged: (forceRefresh?: boolean) => void
}

interface FileMapping {
  fileId: number
  fileName: string
  rgbOption: 'none' | 'albedo' | 'normal' | 'emissive' | 'split'
  rChannel: TextureType | null
  gChannel: TextureType | null
  bChannel: TextureType | null
  aChannel: TextureType | null
  existingTextures: TextureDto[]
}

const rgbOptions = [
  { label: 'None', value: 'none' },
  { label: 'Albedo', value: 'albedo' },
  { label: 'Normal', value: 'normal' },
  { label: 'Emissive', value: 'emissive' },
  { label: 'Split Channels', value: 'split' },
]

const grayscaleTypeOptions = [
  { label: 'None', value: null },
  { label: 'AO', value: TextureType.AO },
  { label: 'Roughness', value: TextureType.Roughness },
  { label: 'Metallic', value: TextureType.Metallic },
  { label: 'Height', value: TextureType.Height },
  { label: 'Displacement', value: TextureType.Displacement },
  { label: 'Bump', value: TextureType.Bump },
  { label: 'Alpha', value: TextureType.Alpha },
]

const alphaTypeOptions = [
  { label: 'None', value: null },
  { label: 'Alpha', value: TextureType.Alpha },
  { label: 'Height', value: TextureType.Height },
  { label: 'Displacement', value: TextureType.Displacement },
  { label: 'Bump', value: TextureType.Bump },
]

function inferRgbOption(textures: TextureDto[]): FileMapping['rgbOption'] {
  // First check if we have any explicit split channels. This is strong signal.
  const hasSplit = textures.some(
    t =>
      t.sourceChannel === TextureChannel.R ||
      t.sourceChannel === TextureChannel.G ||
      t.sourceChannel === TextureChannel.B
  )

  if (hasSplit) {
    return 'split'
  }

  // If we have a placeholder "None" mapping on RGB channel, treat as split mode enabled
  // This happens when user explicitly switches to "Split Channels" without assigning specific maps yet
  const hasNoneMapping = textures.some(
    t =>
      t.sourceChannel === TextureChannel.RGB &&
      t.textureType === TextureType.SplitChannel
  )
  if (hasNoneMapping) return 'split'

  // Check for implicit split usage (common grayscale types)
  const hasGrayscale = textures.some(
    t =>
      t.textureType === TextureType.AO ||
      t.textureType === TextureType.Roughness ||
      t.textureType === TextureType.Metallic ||
      t.textureType === TextureType.Height ||
      t.textureType === TextureType.Displacement ||
      t.textureType === TextureType.Bump
  )

  if (hasGrayscale) {
    return 'split'
  }

  // If not split, check for full image types
  // We ignore sourceChannel here and trust the type if it's not split
  const albedo = textures.find(t => t.textureType === TextureType.Albedo)
  if (albedo) return 'albedo'

  const normal = textures.find(t => t.textureType === TextureType.Normal)
  if (normal) return 'normal'

  const emissive = textures.find(t => t.textureType === TextureType.Emissive)
  if (emissive) return 'emissive'

  return 'none'
}

function getChannelType(
  textures: TextureDto[],
  channel: TextureChannel
): TextureType | null {
  const texture = textures.find(t => t.sourceChannel === channel)
  if (texture) return texture.textureType

  // We rely strictly on explicit sourceChannel now.
  // Implicit guessing led to bugs where type assigned to Channel G appeared on Channel R.
  return null
  return null
}

function getTextureByChannel(
  textures: TextureDto[],
  channel: TextureChannel
): TextureDto | undefined {
  return textures.find(t => t.sourceChannel === channel)
}

export function FilesTab({ textureSet, onMappingChanged }: FilesTabProps) {
  const queryClient = useQueryClient()
  const [fileMappings, setFileMappings] = useState<FileMapping[]>([])
  const [rgbOptionOverrides, setRgbOptionOverrides] = useState<
    Record<number, string>
  >({})
  const toast = useRef<Toast>(null)
  const { changeTextureType, addTextureToSetEndpoint } = useTextureSets()

  const handleDeleteFile = (fileMapping: FileMapping) => {
    confirmDialog({
      message: `Are you sure you want to delete "${fileMapping.fileName}"? It will be moved to Recycled Files.`,
      header: 'Delete File',
      icon: 'pi pi-trash',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await softDeleteFile(fileMapping.fileId)
          await queryClient.invalidateQueries({ queryKey: ['recycledFiles'] })
          toast.current?.show({
            severity: 'success',
            summary: 'Deleted',
            detail: `${fileMapping.fileName} moved to Recycled Files`,
            life: 3000,
          })
          onMappingChanged(true)
        } catch (error) {
          console.error('Failed to delete file:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete file',
            life: 3000,
          })
        }
      },
    })
  }

  // Group textures by fileId and create mappings
  useEffect(() => {
    const fileMap = new Map<number, TextureDto[]>()

    textureSet.textures.forEach(texture => {
      const existing = fileMap.get(texture.fileId) || []
      existing.push(texture)
      fileMap.set(texture.fileId, existing)
    })

    const mappings: FileMapping[] = []
    fileMap.forEach((textures, fileId) => {
      const firstTexture = textures[0]
      mappings.push({
        fileId,
        fileName: firstTexture.fileName || `File ${fileId}`,
        rgbOption: rgbOptionOverrides[fileId] || inferRgbOption(textures),
        rChannel: getChannelType(textures, TextureChannel.R),
        gChannel: getChannelType(textures, TextureChannel.G),
        bChannel: getChannelType(textures, TextureChannel.B),
        aChannel: getChannelType(textures, TextureChannel.A),
        existingTextures: textures,
      })
    })

    setFileMappings(mappings)
  }, [textureSet, rgbOptionOverrides])

  const handleRgbOptionChange = async (
    fileMapping: FileMapping,
    newOption: string
  ) => {
    // Update local override immediately to show/hide controls
    setRgbOptionOverrides(prev => ({
      ...prev,
      [fileMapping.fileId]: newOption,
    }))

    // Handle cleanup of conflicting textures
    // Handle cleanup of conflicting textures
    if (newOption === 'split') {
      const rgbTexture = getTextureByChannel(
        fileMapping.existingTextures,
        TextureChannel.RGB
      )
      if (rgbTexture) {
        try {
          // Instead of removing, we set to "None" (placeholder) to keep the file linked to the set
          await changeTextureType(
            textureSet.id,
            rgbTexture.id,
            TextureType.SplitChannel
          )
          toast.current?.show({
            severity: 'info',
            summary: 'Mode Changed',
            detail:
              'Switched to Split Channels mode. RGB mapping reset to placeholder.',
            life: 2000,
          })
          onMappingChanged()
        } catch (error) {
          console.error('Failed to update RGB texture:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to switch mode',
            life: 3000,
          })
        }
      } else {
        toast.current?.show({
          severity: 'info',
          summary: 'Mode Changed',
          detail:
            'Switched to Split Channels mode. You can now map individual channels.',
          life: 2000,
        })
      }
    } else if (newOption === 'none') {
      // Remove all textures for this file
      // Logic for removing all not implemented yet to avoid accidental data loss without confirmation
    } else {
      // Switched to specific RGB type (Albedo, Normal, Emissive)
      let targetType: TextureType | null = null
      if (newOption === 'albedo') targetType = TextureType.Albedo
      else if (newOption === 'normal') targetType = TextureType.Normal
      else if (newOption === 'emissive') targetType = TextureType.Emissive

      if (targetType) {
        const rgbTexture = getTextureByChannel(
          fileMapping.existingTextures,
          TextureChannel.RGB
        )
        try {
          if (rgbTexture) {
            if (rgbTexture.textureType !== targetType) {
              await changeTextureType(textureSet.id, rgbTexture.id, targetType)
              onMappingChanged()
            }
          } else {
            // Create new RGB mapping
            await addTextureToSetEndpoint(textureSet.id, {
              fileId: fileMapping.fileId,
              textureType: Number(targetType),
              sourceChannel: Number(TextureChannel.RGB),
            })
            onMappingChanged()
          }
        } catch (error) {
          console.error('Failed to set RGB mapping:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to update mapping',
            life: 3000,
          })
        }
      }
    }
  }

  const handleTextureTypeChange = async (
    fileMapping: FileMapping,
    channel: TextureChannel,
    newTextureType: TextureType | null
  ) => {
    const texture = getTextureByChannel(fileMapping.existingTextures, channel)

    if (!texture) {
      // No texture for this channel yet - create one
      if (newTextureType !== null) {
        try {
          await addTextureToSetEndpoint(textureSet.id, {
            fileId: Number(fileMapping.fileId),
            textureType: Number(newTextureType),
            sourceChannel: Number(channel),
          })
          toast.current?.show({
            severity: 'success',
            summary: 'Created',
            detail: `Assigned ${getTextureTypeLabel(newTextureType)} to channel`,
            life: 2000,
          })
          onMappingChanged()
        } catch (error) {
          console.error('Failed to create texture mapping:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to create channel mapping',
            life: 3000,
          })
        }
      }
      return
    }

    // Texture exists for this channel
    if (newTextureType === null) {
      // User selected "None" - would need to delete the texture
      toast.current?.show({
        severity: 'info',
        summary: 'Info',
        detail:
          'Removing texture mappings is not yet implemented. Use the Texture Types tab to remove textures.',
        life: 4000,
      })
      return
    }

    // Don't make API call if type hasn't changed
    if (texture.textureType === newTextureType) {
      return
    }

    try {
      await changeTextureType(textureSet.id, texture.id, newTextureType)
      toast.current?.show({
        severity: 'success',
        summary: 'Updated',
        detail: `Changed to ${getTextureTypeLabel(newTextureType)}`,
        life: 2000,
      })
      onMappingChanged()
    } catch (error) {
      console.error('Failed to update texture type:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update texture type',
        life: 3000,
      })
    }
  }

  if (fileMappings.length === 0) {
    return (
      <div className="files-tab-empty">
        <i className="pi pi-image" />
        <p>No files in this texture set.</p>
        <p className="hint">Upload textures via the Texture Types tab.</p>
      </div>
    )
  }

  return (
    <div className="files-tab">
      <Toast ref={toast} />
      <ConfirmDialog />
      <div className="files-tab-header">
        <h3>Source Files</h3>
      </div>

      <div className="file-mapping-list">
        {fileMappings.map(fm => (
          <div
            key={fm.fileId}
            className="file-mapping-card"
            data-testid={`file-mapping-card-${fm.fileId}`}
          >
            <div className="file-preview-column">
              <div className="file-preview">
                <TexturePreview
                  src={getFilePreviewUrl(fm.fileId.toString())}
                  alt={fm.fileName}
                  fileName={fm.fileName}
                  className="file-preview-image"
                />
              </div>

              <Button
                icon="pi pi-trash"
                label="Delete"
                className="p-button-outlined p-button-danger p-button-sm file-delete-btn"
                onClick={() => handleDeleteFile(fm)}
                aria-label="Delete file"
                title="Delete file (move to Recycled Files)"
              />
            </div>

            <div className="file-info">
              <span className="file-name">{fm.fileName}</span>

              <div className="channel-row">
                <label>RGB:</label>
                <Dropdown
                  value={fm.rgbOption}
                  options={rgbOptions}
                  className="channel-dropdown"
                  onChange={e => handleRgbOptionChange(fm, e.value)}
                  data-testid={`channel-mapping-rgb-${fm.fileId}`}
                />
              </div>

              {fm.rgbOption === 'split' && (
                <div
                  className="split-channels"
                  data-testid={`split-channels-${fm.fileId}`}
                >
                  <div className="channel-row indent">
                    <label>R:</label>
                    <Dropdown
                      value={fm.rChannel}
                      options={grayscaleTypeOptions}
                      onChange={e =>
                        handleTextureTypeChange(fm, TextureChannel.R, e.value)
                      }
                      className="channel-dropdown"
                      placeholder="None"
                      data-testid={`channel-mapping-R-${fm.fileId}`}
                    />
                  </div>
                  <div className="channel-row indent">
                    <label>G:</label>
                    <Dropdown
                      value={fm.gChannel}
                      options={grayscaleTypeOptions}
                      onChange={e =>
                        handleTextureTypeChange(fm, TextureChannel.G, e.value)
                      }
                      className="channel-dropdown"
                      placeholder="None"
                      data-testid={`channel-mapping-G-${fm.fileId}`}
                    />
                  </div>
                  <div className="channel-row indent">
                    <label>B:</label>
                    <Dropdown
                      value={fm.bChannel}
                      options={grayscaleTypeOptions}
                      onChange={e =>
                        handleTextureTypeChange(fm, TextureChannel.B, e.value)
                      }
                      className="channel-dropdown"
                      placeholder="None"
                      data-testid={`channel-mapping-B-${fm.fileId}`}
                    />
                  </div>
                </div>
              )}

              {fm.aChannel && (
                <div className="channel-row">
                  <label>A:</label>
                  <Dropdown
                    value={fm.aChannel}
                    options={alphaTypeOptions}
                    onChange={e =>
                      handleTextureTypeChange(fm, TextureChannel.A, e.value)
                    }
                    className="channel-dropdown"
                    placeholder="None"
                    data-testid={`channel-mapping-A-${fm.fileId}`}
                  />
                </div>
              )}

              {/* Show what texture types are using this file */}
              <div className="file-textures">
                <span className="textures-label">Used as:</span>
                <span className="texture-types">
                  {fm.existingTextures
                    .filter(t => t.textureType !== TextureType.SplitChannel)
                    .map(t => getTextureTypeLabel(t.textureType))
                    .join(', ')}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
