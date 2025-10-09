import { useState } from 'react'
import { Chip } from 'primereact/chip'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Button } from 'primereact/button'
import { getModelFileFormat } from '../../../utils/fileUtils'
import apiClient from '../../../services/ApiClient'

function ModelInfo({ model }) {
  const [tags, setTags] = useState(model.tags ? model.tags.split(', ').filter(t => t.trim()) : [])
  const [description, setDescription] = useState(model.description || '')
  const [newTag, setNewTag] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddTag()
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const tagsString = tags.join(', ')
      await apiClient.updateModelTags(model.id, tagsString, description)
      // Success - could show a toast notification here
    } catch (error) {
      console.error('Failed to save tags:', error)
      // Could show error toast here
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="info-section">
        <h3>Model Information</h3>
        <div className="info-grid">
          <div className="info-item">
            <label>ID:</label>
            <span>{model.id}</span>
          </div>
          <div className="info-item">
            <label>Created:</label>
            <span>{new Date(model.createdAt).toLocaleString()}</span>
          </div>
          <div className="info-item">
            <label>Modified:</label>
            <span>{new Date(model.updatedAt).toLocaleString()}</span>
          </div>
          <div className="info-item">
            <label>Format:</label>
            <span>{getModelFileFormat(model)}</span>
          </div>
        </div>
      </div>

      <div className="info-section">
        <h3>AI Classification</h3>
        
        <div className="tags-section" style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Tags:
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', minHeight: '2rem' }}>
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
              <span style={{ color: '#94a3b8', fontStyle: 'italic', alignSelf: 'center' }}>No tags yet</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <InputText
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Add new tag..."
              style={{ flex: 1 }}
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

        <div className="description-section" style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Description:
          </label>
          <InputTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter description with confidence metrics..."
            rows={3}
            style={{ width: '100%' }}
          />
        </div>

        <Button
          label={isSaving ? 'Saving...' : 'Save Changes'}
          icon="pi pi-save"
          onClick={handleSave}
          disabled={isSaving}
          style={{ width: '100%' }}
        />
      </div>

      <div className="info-section">
        <h3>TSL Rendering Features</h3>
        <ul className="feature-list">
          <li>✓ Real-time physically based rendering (PBR)</li>
          <li>✓ Dynamic lighting with shadow mapping</li>
          <li>✓ Material metalness and roughness controls</li>
          <li>✓ Environment mapping for reflections</li>
          <li>✓ Interactive orbit controls</li>
        </ul>
      </div>

      <div className="info-section">
        <h3>Controls</h3>
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
    </>
  )
}

export default ModelInfo
