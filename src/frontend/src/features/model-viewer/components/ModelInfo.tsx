import { useState } from 'react'
import { Chip } from 'primereact/chip'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'
import { getModelFileFormat } from '../../../utils/fileUtils'

function ModelInfo({ model }) {
  const [tags, setTags] = useState(model.tags ? model.tags.split(', ').filter(t => t.trim()) : [])
  const [newTag, setNewTag] = useState('')

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

      {(model.tags || model.description) && (
        <div className="info-section">
          <h3>AI Classification</h3>
          
          {model.tags && (
            <div className="tags-section" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Tags:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {tags.map((tag, index) => (
                  <Chip
                    key={index}
                    label={tag}
                    removable
                    onRemove={() => handleRemoveTag(tag)}
                    style={{ background: '#3b82f6', color: 'white' }}
                  />
                ))}
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
          )}

          {model.description && (
            <div className="description-section">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Description:
              </label>
              <p style={{ margin: 0, color: '#64748b', lineHeight: '1.5' }}>
                {model.description}
              </p>
            </div>
          )}
        </div>
      )}

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
