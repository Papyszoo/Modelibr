import { useState } from 'react'
import { Chip } from 'primereact/chip'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Button } from 'primereact/button'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getModelFileFormat } from '@/utils/fileUtils'
import { updateModelTags } from '@/features/models/api/modelApi'
import { disassociateTextureSetFromModelVersion } from '@/features/texture-set/api/textureSetApi'
import { TextureSetAssociationDialog } from './TextureSetAssociationDialog'
import './ModelInfo.css'

export function ModelInfo({ model, onModelUpdated }) {
  const [tags, setTags] = useState(
    model.tags ? model.tags.split(', ').filter(t => t.trim()) : []
  )
  const [description, setDescription] = useState(model.description || '')
  const [newTag, setNewTag] = useState('')
  const [showTextureSetDialog, setShowTextureSetDialog] = useState(false)
  const queryClient = useQueryClient()

  const invalidateModelQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['models'] })
    queryClient.invalidateQueries({
      queryKey: ['models', 'detail', String(model.id)],
    })
  }

  const saveModelInfoMutation = useMutation({
    mutationFn: async ({
      tagsString,
      desc,
    }: {
      tagsString: string
      desc: string
    }) => updateModelTags(model.id, tagsString, desc),
    onSuccess: () => {
      invalidateModelQueries()
      if (onModelUpdated) {
        onModelUpdated()
      }
    },
    onError: error => {
      console.error('Failed to save tags:', error)
    },
  })

  const removeTextureSetMutation = useMutation({
    mutationFn: async (textureSetId: number) => {
      const activeVersionId = model.activeVersionId
      if (!activeVersionId) {
        throw new Error('Model has no active version')
      }
      await disassociateTextureSetFromModelVersion(
        textureSetId,
        activeVersionId
      )
    },
    onSuccess: () => {
      invalidateModelQueries()
      if (onModelUpdated) {
        onModelUpdated()
      }
    },
    onError: error => {
      console.error('Failed to remove texture set:', error)
    },
  })

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const handleRemoveTag = tagToRemove => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleKeyPress = e => {
    if (e.key === 'Enter') {
      handleAddTag()
    }
  }

  const handleSave = () => {
    const tagsString = tags.join(', ')
    saveModelInfoMutation.mutate({ tagsString, desc: description })
  }

  const handleRemoveTextureSet = (textureSetId: number) => {
    removeTextureSetMutation.mutate(textureSetId)
  }

  return (
    <div className="model-info">
      <div className="model-info-section">
        <h3 className="model-info-title">Model Information</h3>
        <div className="model-info-grid">
          <div className="model-info-item">
            <label>ID:</label>
            <span>{model.id}</span>
          </div>
          <div className="model-info-item">
            <label>Created:</label>
            <span>{new Date(model.createdAt).toLocaleString()}</span>
          </div>
          <div className="model-info-item">
            <label>Modified:</label>
            <span>{new Date(model.updatedAt).toLocaleString()}</span>
          </div>
          <div className="model-info-item">
            <label>Format:</label>
            <span>{getModelFileFormat(model)}</span>
          </div>
        </div>
      </div>

      <div className="model-info-section">
        <h3 className="model-info-title">Tags &amp; Description</h3>

        <div className="tags-section">
          <label className="field-label">Tags:</label>
          <div className="tags-container">
            {tags.length > 0 ? (
              tags.map((tag, index) => (
                <Chip
                  key={index}
                  label={tag}
                  removable
                  onRemove={() => handleRemoveTag(tag)}
                  style={{ background: '#3b82f6', color: 'white' }}
                />
              ))
            ) : (
              <span className="empty-state-text">No tags yet</span>
            )}
          </div>
          <div className="tag-input-group">
            <InputText
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Add new tag..."
              className="tag-input"
            />
            <Button
              label="Add"
              icon="pi pi-plus"
              onClick={handleAddTag}
              disabled={!newTag.trim()}
              size="small"
            />
          </div>
        </div>

        <div className="description-section">
          <label className="field-label">Description:</label>
          <InputTextarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Enter description..."
            rows={3}
            className="description-textarea"
          />
        </div>

        <Button
          label={saveModelInfoMutation.isPending ? 'Saving...' : 'Save Changes'}
          icon="pi pi-save"
          onClick={handleSave}
          disabled={saveModelInfoMutation.isPending}
          className="save-button"
        />
      </div>

      <div className="model-info-section">
        <h3 className="model-info-title">Linked Texture Sets</h3>
        <div className="texture-sets-section">
          <div className="tags-container">
            {model.textureSets && model.textureSets.length > 0 ? (
              model.textureSets.map(textureSet => (
                <Chip
                  key={textureSet.id}
                  label={textureSet.name}
                  removable
                  onRemove={() => handleRemoveTextureSet(textureSet.id)}
                  icon="pi pi-image"
                  style={{ background: '#8b5cf6', color: 'white' }}
                />
              ))
            ) : (
              <span className="empty-state-text">No texture sets linked</span>
            )}
          </div>
          <Button
            label="Link Texture Sets"
            icon="pi pi-link"
            onClick={() => setShowTextureSetDialog(true)}
            className="link-button"
            size="small"
          />
        </div>
      </div>

      <div className="model-info-section">
        <h3 className="model-info-title">Controls</h3>
        <ul className="controls-list">
          <li>
            <strong>Mouse:</strong> Rotate view
          </li>
          <li>
            <strong>Scroll:</strong> Zoom in/out
          </li>
          <li>
            <strong>Right-click + drag:</strong> Pan view
          </li>
        </ul>
      </div>

      {showTextureSetDialog && (
        <TextureSetAssociationDialog
          visible={showTextureSetDialog}
          model={model}
          onHide={() => setShowTextureSetDialog(false)}
          onAssociationsChanged={() => {
            setShowTextureSetDialog(false)
            if (onModelUpdated) {
              onModelUpdated()
            }
          }}
        />
      )}
    </div>
  )
}

