import { useState, useRef, useEffect } from 'react'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import './TextureSetGrid.css'
import { TextureSetDto, TextureType, PackDto } from '../../../types'
import { ProgressBar } from 'primereact/progressbar'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'

interface TextureSetGridProps {
  textureSets: TextureSetDto[]
  loading?: boolean
  onTextureSetSelect: (textureSet: TextureSetDto) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}

export default function TextureSetGrid({
  textureSets,
  loading = false,
  onTextureSetSelect,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: TextureSetGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [packs, setPacks] = useState<PackDto[]>([])
  const [selectedTextureSet, setSelectedTextureSet] = useState<TextureSetDto | null>(null)
  const contextMenu = useRef<ContextMenu>(null)
  const toast = useRef<Toast>(null)

  useEffect(() => {
    loadPacks()
  }, [])

  const loadPacks = async () => {
    try {
      const data = await ApiClient.getAllPacks()
      setPacks(data)
    } catch (error) {
      console.error('Failed to load packs:', error)
    }
  }

  const handleAddToPack = async (packId: number) => {
    if (!selectedTextureSet) return
    
    try {
      await ApiClient.addTextureSetToPack(packId, selectedTextureSet.id)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set added to pack',
        life: 3000,
      })
    } catch (error) {
      console.error('Failed to add texture set to pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add texture set to pack',
        life: 3000,
      })
    }
  }

  const getAlbedoTextureUrl = (textureSet: TextureSetDto) => {
    // Find albedo texture first, then fallback to diffuse
    const albedo = textureSet.textures?.find(
      t => t.textureType === TextureType.Albedo
    )
    const diffuse = textureSet.textures?.find(
      t => t.textureType === TextureType.Diffuse
    )

    const texture = albedo || diffuse
    if (texture) {
      return ApiClient.getFileUrl(texture.fileId.toString())
    }
    return null
  }

  const filteredTextureSets = textureSets.filter(textureSet => {
    const name = textureSet.name.toLowerCase()
    return name.includes(searchQuery.toLowerCase())
  })

  const contextMenuItems: MenuItem[] = [
    {
      label: 'Add to pack',
      icon: 'pi pi-box',
      items: packs.length > 0 ? packs.map(pack => ({
        label: pack.name,
        command: () => handleAddToPack(pack.id),
      })) : [
        {
          label: 'No packs available',
          disabled: true,
        },
      ],
    },
  ]

  // Loading state
  if (loading) {
    return (
      <div className="texture-set-grid-loading">
        <ProgressBar mode="indeterminate" style={{ height: '6px' }} />
        <p>Loading texture sets...</p>
      </div>
    )
  }

  // Empty state (no texture sets at all)
  if (textureSets.length === 0) {
    return (
      <div
        className="texture-set-grid-empty"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
      >
        <i className="pi pi-images" />
        <h3>No Texture Sets</h3>
        <p>Drag and drop texture files here to create new sets</p>
        <p className="hint">
          Each file will create a new texture set with an albedo texture
        </p>
      </div>
    )
  }

  return (
    <div
      className="texture-set-grid-container"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <Toast ref={toast} />
      <ContextMenu model={contextMenuItems} ref={contextMenu} />
      
      {/* Search and filter bar */}
      <div className="texture-set-grid-controls">
        <div className="search-bar">
          <i className="pi pi-search" />
          <input
            type="text"
            placeholder="Search texture sets..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-bar">
          <span className="filter-placeholder">Filters (Coming Soon)</span>
        </div>
      </div>

      {/* Grid of texture set cards */}
      <div className="texture-set-grid">
        {filteredTextureSets.map(textureSet => {
          const albedoUrl = getAlbedoTextureUrl(textureSet)

          return (
            <div
              key={textureSet.id}
              className="texture-set-card"
              onClick={() => onTextureSetSelect(textureSet)}
              onContextMenu={(e) => {
                e.preventDefault()
                setSelectedTextureSet(textureSet)
                contextMenu.current?.show(e)
              }}
            >
              <div className="texture-set-card-thumbnail">
                {albedoUrl ? (
                  <img
                    src={albedoUrl}
                    alt={textureSet.name}
                    className="texture-set-image"
                  />
                ) : (
                  <div className="texture-set-placeholder">
                    <i className="pi pi-image" />
                    <span>No Preview</span>
                  </div>
                )}
                <div className="texture-set-card-overlay">
                  <span className="texture-set-card-name">
                    {textureSet.name}
                  </span>
                  <div className="texture-set-card-info">
                    <span className="texture-count">
                      <i className="pi pi-palette" />
                      {textureSet.textureCount || 0} texture
                      {textureSet.textureCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredTextureSets.length === 0 && (
        <div className="no-results">
          <i className="pi pi-search" />
          <p>No texture sets found matching "{searchQuery}"</p>
        </div>
      )}
    </div>
  )
}
