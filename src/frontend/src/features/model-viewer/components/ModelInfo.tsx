import './ModelInfo.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Chip } from 'primereact/chip'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { useEffect, useState } from 'react'

import { updateModelTags } from '@/features/models/api/modelApi'
import { getModelFileFormat } from '@/utils/fileUtils'

export function ModelInfo({ model, onModelUpdated }) {
  const [tags, setTags] = useState(
    model.tags ? model.tags.split(', ').filter(t => t.trim()) : []
  )
  const [description, setDescription] = useState(model.description || '')
  const [newTag, setNewTag] = useState('')
  const queryClient = useQueryClient()

  // Sync local state when the model prop updates (e.g. after React Query refetch)
  useEffect(() => {
    setTags(model.tags ? model.tags.split(', ').filter(t => t.trim()) : [])
    setDescription(model.description || '')
  }, [model.id, model.tags, model.description])

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

  return (
    <div className="model-info">
      <div className="model-info-section">
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
    </div>
  )
}
