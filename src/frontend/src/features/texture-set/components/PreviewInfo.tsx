import { TextureSetDto } from '../../../types'
import './PreviewInfo.css'

interface PreviewInfoProps {
  textureSet: TextureSetDto
  geometryType: string
}

function PreviewInfo({ textureSet, geometryType }: PreviewInfoProps) {
  const geometryNames: Record<string, string> = {
    box: 'Cube',
    sphere: 'Sphere',
    cylinder: 'Cylinder',
    torus: 'Torus',
  }

  return (
    <div className="preview-info-content">
      <div className="info-section">
        <h4 className="info-section-title">Preview Details</h4>

        <div className="info-item">
          <span className="info-item-label">Texture Set:</span>
          <span className="info-item-value">{textureSet.name}</span>
        </div>

        <div className="info-item">
          <span className="info-item-label">Geometry Type:</span>
          <span className="info-item-value">
            {geometryNames[geometryType] || geometryType}
          </span>
        </div>

        <div className="info-item">
          <span className="info-item-label">Textures Applied:</span>
          <span className="info-item-value highlight">
            {textureSet.textureCount}
          </span>
        </div>

        <div className="info-item">
          <span className="info-item-label">Set ID:</span>
          <span className="info-item-value">#{textureSet.id}</span>
        </div>
      </div>

      <div className="info-section">
        <h4 className="info-section-title">Applied Textures</h4>
        {textureSet.textures.length > 0 ? (
          <ul className="texture-list">
            {textureSet.textures.map(texture => (
              <li key={texture.id} className="texture-list-item">
                <i
                  className="pi pi-check-circle"
                  style={{ color: '#10b981' }}
                ></i>
                <span>{texture.textureType}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="no-textures">No textures applied</p>
        )}
      </div>
    </div>
  )
}

export default PreviewInfo
