import { useState, useEffect } from 'react'
import { Button } from 'primereact/button'
import { Model } from '../../../utils/fileUtils'
import { TextureSetDto } from '../../../types'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import FloatingWindow from '../../../components/FloatingWindow'
import TextureSetAssociationDialog from './TextureSetAssociationDialog'
import './TextureSetSelectorWindow.css'

interface TextureSetSelectorWindowProps {
  visible: boolean
  onClose: () => void
  side: 'left' | 'right'
  model: Model
  modelVersionId: number | null
  selectedVersion: { id: number; defaultTextureSetId?: number } | null
  selectedTextureSetId: number | null
  onTextureSetSelect: (textureSetId: number | null) => void
  onModelUpdated: () => void
}

function TextureSetSelectorWindow({
  visible,
  onClose,
  side,
  model,
  modelVersionId,
  selectedVersion,
  selectedTextureSetId,
  onTextureSetSelect,
  onModelUpdated,
}: TextureSetSelectorWindowProps) {
  const [textureSets, setTextureSets] = useState<TextureSetDto[]>([])
  const [loading, setLoading] = useState(false)
  const [settingDefault, setSettingDefault] = useState(false)
  const [linkDialogVisible, setLinkDialogVisible] = useState(false)
  const [unlinking, setUnlinking] = useState<number | null>(null)

  const loadTextureSets = async () => {
    if (!modelVersionId) {
      setTextureSets([])
      return
    }

    try {
      setLoading(true)
      // Get all texture sets and filter to those associated with this model version
      const allTextureSets = await ApiClient.getAllTextureSets()
      const filteredTextureSets = allTextureSets.filter(ts =>
        ts.associatedModels.some(m => m.modelVersionId === modelVersionId)
      )
      setTextureSets(filteredTextureSets)
    } catch (error) {
      console.error('Failed to load texture sets:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible && modelVersionId) {
      loadTextureSets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, modelVersionId])

  const handleSetDefault = async (textureSetId: number | null) => {
    if (!modelVersionId) {
      console.error('No model version ID available')
      return
    }
    try {
      setSettingDefault(true)
      await ApiClient.setDefaultTextureSet(parseInt(model.id), textureSetId, modelVersionId)
      // Refresh the model to show updated default
      onModelUpdated()
    } catch (error) {
      console.error('Failed to set default texture set:', error)
    } finally {
      setSettingDefault(false)
    }
  }

  const handleLinkDialogClose = () => {
    setLinkDialogVisible(false)
    // Refresh model data - texture sets will reload via useEffect when model updates
    onModelUpdated()
  }

  const handleUnlinkTextureSet = async (
    textureSetId: number,
    e: React.MouseEvent
  ) => {
    e.stopPropagation()
    if (!modelVersionId) {
      console.error('No model version ID available')
      return
    }
    try {
      setUnlinking(textureSetId)
      await ApiClient.disassociateTextureSetFromModelVersion(
        textureSetId,
        modelVersionId
      )

      // If this was the default texture set, clear or update the default
      if (selectedVersion?.defaultTextureSetId === textureSetId) {
        // Find another linked texture set to set as default, or clear if none
        const remainingTextureSets = textureSets.filter(
          ts => ts.id !== textureSetId
        )
        const newDefaultId =
          remainingTextureSets.length > 0 ? remainingTextureSets[0].id : null
        await ApiClient.setDefaultTextureSet(parseInt(model.id), newDefaultId, modelVersionId)
      }

      // If this was the selected texture set, clear selection
      if (selectedTextureSetId === textureSetId) {
        onTextureSetSelect(null)
      }

      // Refresh model data - texture sets will reload via useEffect when model updates
      onModelUpdated()
    } catch (error) {
      console.error('Failed to unlink texture set:', error)
    } finally {
      setUnlinking(null)
    }
  }

  const getPreviewUrl = (textureSet: TextureSetDto) => {
    const albedo = textureSet.textures?.find(t => t.textureType === 1) // Albedo
    const diffuse = textureSet.textures?.find(t => t.textureType === 7) // Diffuse
    const texture = albedo || diffuse
    return texture ? ApiClient.getFileUrl(texture.fileId.toString()) : null
  }

  return (
    <>
      <FloatingWindow
        visible={visible}
        onClose={onClose}
        title="Texture Sets"
        side={side}
        windowId="texture-sets"
      >
        <div className="tswindow-header">
          <Button
            icon="pi pi-link"
            label="Link Texture Sets"
            className="p-button-sm p-button-outlined"
            onClick={() => setLinkDialogVisible(true)}
            tooltip="Link texture sets to this model"
            style={{ marginBottom: '1rem' }}
          />
        </div>

        <div className="tswindow-content">
          {loading ? (
            <div className="tswindow-loading">
              <i className="pi pi-spin pi-spinner" />
              <p>Loading texture sets...</p>
            </div>
          ) : textureSets.length === 0 ? (
            <div className="tswindow-empty">
              <i className="pi pi-inbox" />
              <p>No texture sets linked to this model</p>
              <p className="tswindow-empty-hint">
                Link texture sets in the Model Information window
              </p>
            </div>
          ) : (
            <div className="tswindow-list">
              {/* None option */}
              <div
                className={`tswindow-item ${selectedTextureSetId === null ? 'tswindow-selected' : ''}`}
                onClick={() => onTextureSetSelect(null)}
              >
                <div className="tswindow-preview tswindow-no-texture">
                  <i className="pi pi-times" />
                </div>
                <div className="tswindow-info">
                  <div className="tswindow-name">No Texture</div>
                  <div className="tswindow-meta">
                    Use default material without textures
                  </div>
                </div>
                <div className="tswindow-actions">
                  {selectedTextureSetId === null && (
                    <i className="pi pi-check tswindow-icon-selected" />
                  )}
                </div>
              </div>

              {textureSets.map(textureSet => {
                const previewUrl = getPreviewUrl(textureSet)
                const isSelected = selectedTextureSetId === textureSet.id
                const isDefault = selectedVersion?.defaultTextureSetId === textureSet.id

                return (
                  <div
                    key={textureSet.id}
                    className={`tswindow-item ${isSelected ? 'tswindow-selected' : ''} ${isDefault ? 'tswindow-default' : ''}`}
                    onClick={() => onTextureSetSelect(textureSet.id)}
                  >
                    <div className="tswindow-preview">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={textureSet.name}
                          className="tswindow-preview-img"
                        />
                      ) : (
                        <i className="pi pi-image" />
                      )}
                    </div>
                    <div className="tswindow-info">
                      <div className="tswindow-name">{textureSet.name}</div>
                      <div className="tswindow-meta">
                        {textureSet.textureCount} texture
                        {textureSet.textureCount !== 1 ? 's' : ''}
                        {isDefault && (
                          <span className="tswindow-badge">Default</span>
                        )}
                      </div>
                    </div>
                    <div className="tswindow-actions">
                      {isSelected && (
                        <i className="pi pi-check tswindow-icon-selected" />
                      )}
                      {!isDefault && (
                        <Button
                          icon="pi pi-star"
                          className="p-button-text p-button-sm tswindow-btn-default"
                          onClick={e => {
                            e.stopPropagation()
                            handleSetDefault(textureSet.id)
                          }}
                          disabled={settingDefault}
                          tooltip="Set as default"
                          tooltipOptions={{ position: 'left' }}
                        />
                      )}
                      <Button
                        icon="pi pi-times"
                        className="p-button-text p-button-sm p-button-danger tswindow-btn-unlink"
                        onClick={e => handleUnlinkTextureSet(textureSet.id, e)}
                        disabled={unlinking === textureSet.id}
                        tooltip="Unlink texture set"
                        tooltipOptions={{ position: 'left' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </FloatingWindow>

      <TextureSetAssociationDialog
        visible={linkDialogVisible}
        model={model}
        modelVersionId={modelVersionId!}
        onHide={handleLinkDialogClose}
        onAssociationsChanged={handleLinkDialogClose}
      />
    </>
  )
}

export default TextureSetSelectorWindow
