import { useState, useEffect, useRef } from 'react'
import { Dropdown } from 'primereact/dropdown'
import { Toast } from 'primereact/toast'
import { TextureSetDto, TextureDto, TextureType, TextureChannel } from '../../../types'
import { getTextureTypeLabel } from '../../../utils/textureTypeUtils'
import { useTextureSets } from '../hooks/useTextureSets'
import './FilesTab.css'

interface FilesTabProps {
  textureSet: TextureSetDto
  onMappingChanged: () => void
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
  const rgbTexture = textures.find(t => t.sourceChannel === TextureChannel.RGB)
  if (rgbTexture) {
    switch (rgbTexture.textureType) {
      case TextureType.Albedo: return 'albedo'
      case TextureType.Normal: return 'normal'
      case TextureType.Emissive: return 'emissive'
    }
  }
  const hasR = textures.some(t => t.sourceChannel === TextureChannel.R)
  const hasG = textures.some(t => t.sourceChannel === TextureChannel.G)
  const hasB = textures.some(t => t.sourceChannel === TextureChannel.B)
  if (hasR || hasG || hasB) {
    return 'split'
  }
  return 'none'
}

function getChannelType(textures: TextureDto[], channel: TextureChannel): TextureType | null {
  const texture = textures.find(t => t.sourceChannel === channel)
  return texture?.textureType ?? null
}

function getTextureByChannel(textures: TextureDto[], channel: TextureChannel): TextureDto | undefined {
  return textures.find(t => t.sourceChannel === channel)
}

export default function FilesTab({ textureSet, onMappingChanged }: FilesTabProps) {
  const [fileMappings, setFileMappings] = useState<FileMapping[]>([])
  const toast = useRef<Toast>(null)
  const { changeTextureType } = useTextureSets()

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
        rgbOption: inferRgbOption(textures),
        rChannel: getChannelType(textures, TextureChannel.R),
        gChannel: getChannelType(textures, TextureChannel.G),
        bChannel: getChannelType(textures, TextureChannel.B),
        aChannel: getChannelType(textures, TextureChannel.A),
        existingTextures: textures,
      })
    })

    setFileMappings(mappings)
  }, [textureSet])

  const handleTextureTypeChange = async (
    fileMapping: FileMapping,
    channel: TextureChannel,
    newTextureType: TextureType | null
  ) => {
    const texture = getTextureByChannel(fileMapping.existingTextures, channel)
    
    if (!texture) {
      // No texture for this channel yet - would need to create one
      if (newTextureType !== null) {
        toast.current?.show({
          severity: 'info',
          summary: 'Info',
          detail: 'Creating new channel mappings is not yet implemented. Use the merge dialog to set up channel mappings.',
          life: 4000,
        })
      }
      return
    }

    if (newTextureType === null) {
      // User selected "None" - would need to delete the texture
      toast.current?.show({
        severity: 'info',
        summary: 'Info',
        detail: 'Removing texture mappings is not yet implemented. Use the Texture Types tab to remove textures.',
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
      <div className="files-tab-header">
        <h3>Source Files</h3>
      </div>

      <div className="file-mapping-list">
        {fileMappings.map(fm => (
          <div key={fm.fileId} className="file-mapping-card">
            <div className="file-preview">
              <img 
                src={`/api/files/${fm.fileId}/data`}
                alt={fm.fileName}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
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
                  onChange={e => {
                    // For now, show info about merge dialog
                    if (e.value !== fm.rgbOption) {
                      toast.current?.show({
                        severity: 'info',
                        summary: 'Info',
                        detail: 'To change RGB mode, use the merge dialog when combining texture sets.',
                        life: 4000,
                      })
                    }
                  }}
                />
              </div>

              {fm.rgbOption === 'split' && (
                <div className="split-channels">
                  <div className="channel-row indent">
                    <label>R:</label>
                    <Dropdown
                      value={fm.rChannel}
                      options={grayscaleTypeOptions}
                      onChange={e => handleTextureTypeChange(fm, TextureChannel.R, e.value)}
                      className="channel-dropdown"
                      placeholder="None"
                    />
                  </div>
                  <div className="channel-row indent">
                    <label>G:</label>
                    <Dropdown
                      value={fm.gChannel}
                      options={grayscaleTypeOptions}
                      onChange={e => handleTextureTypeChange(fm, TextureChannel.G, e.value)}
                      className="channel-dropdown"
                      placeholder="None"
                    />
                  </div>
                  <div className="channel-row indent">
                    <label>B:</label>
                    <Dropdown
                      value={fm.bChannel}
                      options={grayscaleTypeOptions}
                      onChange={e => handleTextureTypeChange(fm, TextureChannel.B, e.value)}
                      className="channel-dropdown"
                      placeholder="None"
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
                    onChange={e => handleTextureTypeChange(fm, TextureChannel.A, e.value)}
                    className="channel-dropdown"
                    placeholder="None"
                  />
                </div>
              )}

              {/* Show what texture types are using this file */}
              <div className="file-textures">
                <span className="textures-label">Used as:</span>
                <span className="texture-types">
                  {fm.existingTextures.map(t => getTextureTypeLabel(t.textureType)).join(', ')}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
