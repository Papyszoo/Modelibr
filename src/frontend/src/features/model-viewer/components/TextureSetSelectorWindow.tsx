import { useState, useEffect } from 'react'
import { Sidebar } from 'primereact/sidebar'
import { Button } from 'primereact/button'
import { Model } from '../../../utils/fileUtils'
import { TextureSetDto } from '../../../types'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import './TextureSetSelectorWindow.css'

interface TextureSetSelectorWindowProps {
  visible: boolean
  onClose: () => void
  side: 'left' | 'right'
  model: Model
  selectedTextureSetId: number | null
  onTextureSetSelect: (textureSetId: number | null) => void
}

function TextureSetSelectorWindow({
  visible,
  onClose,
  side,
  model,
  selectedTextureSetId,
  onTextureSetSelect,
}: TextureSetSelectorWindowProps) {
  const [textureSets, setTextureSets] = useState<TextureSetDto[]>([])
  const [loading, setLoading] = useState(false)
  const [settingDefault, setSettingDefault] = useState(false)

  const loadTextureSets = async () => {
    if (!model.textureSets || model.textureSets.length === 0) {
      setTextureSets([])
      return
    }

    try {
      setLoading(true)
      const allTextureSets = await ApiClient.getAllTextureSets()
      // Filter to only show texture sets associated with this model
      const modelTextureSetIds = new Set(model.textureSets.map(ts => ts.id))
      const filteredTextureSets = allTextureSets.filter(ts =>
        modelTextureSetIds.has(ts.id)
      )
      setTextureSets(filteredTextureSets)
    } catch (error) {
      console.error('Failed to load texture sets:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible && model.textureSets) {
      loadTextureSets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, model.textureSets])

  const handleSetDefault = async (textureSetId: number | null) => {
    try {
      setSettingDefault(true)
      await ApiClient.setDefaultTextureSet(parseInt(model.id), textureSetId)
      // The model will be refetched by parent component
    } catch (error) {
      console.error('Failed to set default texture set:', error)
    } finally {
      setSettingDefault(false)
    }
  }

  const getPreviewUrl = (textureSet: TextureSetDto) => {
    const albedo = textureSet.textures?.find(t => t.textureType === 1) // Albedo
    const diffuse = textureSet.textures?.find(t => t.textureType === 7) // Diffuse
    const texture = albedo || diffuse
    return texture ? ApiClient.getFileUrl(texture.fileId.toString()) : null
  }

  const positionClass = side === 'left' ? 'p-sidebar-left' : 'p-sidebar-right'

  return (
    <Sidebar
      visible={visible}
      onHide={onClose}
      position={side}
      className={`texture-set-selector-window ${positionClass}`}
      style={{ width: '400px' }}
    >
      <div className="sidebar-header">
        <h3>
          <i className="pi pi-image" style={{ marginRight: '0.5rem' }} />
          Texture Sets
        </h3>
      </div>

      <div className="sidebar-content">
        {loading ? (
          <div className="loading-state">
            <i className="pi pi-spin pi-spinner" />
            <p>Loading texture sets...</p>
          </div>
        ) : textureSets.length === 0 ? (
          <div className="empty-state">
            <i className="pi pi-inbox" />
            <p>No texture sets linked to this model</p>
            <p className="hint">
              Link texture sets in the Model Information window
            </p>
          </div>
        ) : (
          <div className="texture-set-list">
            {/* None option */}
            <div
              className={`texture-set-item ${selectedTextureSetId === null ? 'selected' : ''}`}
              onClick={() => onTextureSetSelect(null)}
            >
              <div className="texture-set-preview no-texture">
                <i className="pi pi-times" />
              </div>
              <div className="texture-set-info">
                <div className="texture-set-name">No Texture</div>
                <div className="texture-set-meta">Default material</div>
              </div>
              <div className="texture-set-actions">
                {selectedTextureSetId === null && (
                  <i className="pi pi-check selected-icon" />
                )}
              </div>
            </div>

            {textureSets.map(textureSet => {
              const previewUrl = getPreviewUrl(textureSet)
              const isSelected = selectedTextureSetId === textureSet.id
              const isDefault = model.defaultTextureSetId === textureSet.id

              return (
                <div
                  key={textureSet.id}
                  className={`texture-set-item ${isSelected ? 'selected' : ''} ${isDefault ? 'is-default' : ''}`}
                  onClick={() => onTextureSetSelect(textureSet.id)}
                >
                  <div className="texture-set-preview">
                    {previewUrl ? (
                      <img src={previewUrl} alt={textureSet.name} />
                    ) : (
                      <i className="pi pi-image" />
                    )}
                  </div>
                  <div className="texture-set-info">
                    <div className="texture-set-name">
                      {textureSet.name}
                      {isDefault && (
                        <span className="default-badge">DEFAULT</span>
                      )}
                    </div>
                    <div className="texture-set-meta">
                      {textureSet.textureCount} texture
                      {textureSet.textureCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="texture-set-actions">
                    {isSelected && <i className="pi pi-check selected-icon" />}
                    {!isDefault && (
                      <Button
                        icon="pi pi-star"
                        className="p-button-text p-button-sm set-default-btn"
                        onClick={e => {
                          e.stopPropagation()
                          handleSetDefault(textureSet.id)
                        }}
                        disabled={settingDefault}
                        tooltip="Set as default"
                        tooltipOptions={{ position: 'left' }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Sidebar>
  )
}

export default TextureSetSelectorWindow
