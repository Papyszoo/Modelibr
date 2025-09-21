import { getModelFileFormat } from '../utils/fileUtils'

function ModelInfo({ model }) {
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
          <li><strong>Mouse:</strong> Rotate view</li>
          <li><strong>Scroll:</strong> Zoom in/out</li>
          <li><strong>Right-click + drag:</strong> Pan view</li>
        </ul>
      </div>
    </>
  )
}

export default ModelInfo