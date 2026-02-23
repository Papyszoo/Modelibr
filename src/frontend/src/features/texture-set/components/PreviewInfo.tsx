import { TextureSetDto, TextureType } from '@/types'
import { getTextureTypeLabel } from '@/utils/textureTypeUtils'
import { Checkbox } from 'primereact/checkbox'
import { Slider } from 'primereact/slider'
import type { TextureStrengths } from './TexturedGeometry'
import './PreviewInfo.css'

interface PreviewInfoProps {
  textureSet: TextureSetDto
  geometryType: string
  disabledTextures: Set<string>
  textureStrengths: TextureStrengths
  onToggleTexture: (textureType: string) => void
  onStrengthChange: (textureType: string, value: number) => void
}

/** Texture types that have a meaningful strength/intensity control */
const STRENGTH_SUPPORTED = new Set([
  'Normal', 'AO', 'Emissive', 'Bump', 'Height', 'Displacement',
])

export function PreviewInfo({
  textureSet,
  geometryType,
  disabledTextures,
  textureStrengths,
  onToggleTexture,
  onStrengthChange,
}: PreviewInfoProps) {
  const geometryNames: Record<string, string> = {
    box: 'Cube',
    sphere: 'Sphere',
    cylinder: 'Cylinder',
    torus: 'Torus',
  }

  // Build the list of available textures with their type labels
  const availableTextures = textureSet.textures
    .filter(t => t.textureType !== TextureType.SplitChannel)
    .map(t => ({
      id: t.id,
      typeLabel: getTextureTypeLabel(t.textureType),
      typeKey: TextureType[t.textureType], // e.g. "Albedo", "Normal"
    }))

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
            {availableTextures.filter(t => !disabledTextures.has(t.typeKey)).length} / {availableTextures.length}
          </span>
        </div>
      </div>

      <div className="info-section">
        <h4 className="info-section-title">Applied Textures</h4>
        {availableTextures.length > 0 ? (
          <ul className="texture-list">
            {availableTextures.map(texture => {
              const isEnabled = !disabledTextures.has(texture.typeKey)
              const hasStrength = STRENGTH_SUPPORTED.has(texture.typeKey)
              const strength = textureStrengths[texture.typeKey] ?? 1
              return (
                <li
                  key={texture.id}
                  className={`texture-list-item ${!isEnabled ? 'texture-disabled' : ''}`}
                >
                  <div
                    className="texture-list-header"
                    onClick={() => onToggleTexture(texture.typeKey)}
                  >
                    <Checkbox
                      checked={isEnabled}
                      onChange={() => onToggleTexture(texture.typeKey)}
                      className="texture-checkbox"
                    />
                    <span>{texture.typeLabel}</span>
                    {hasStrength && isEnabled && (
                      <span className="texture-strength-value">
                        {Math.round(strength * 100)}%
                      </span>
                    )}
                  </div>
                  {hasStrength && isEnabled && (
                    <div
                      className="texture-strength-slider"
                      onClick={e => e.stopPropagation()}
                    >
                      <Slider
                        value={strength * 100}
                        onChange={e =>
                          onStrengthChange(
                            texture.typeKey,
                            (e.value as number) / 100
                          )
                        }
                        min={0}
                        max={100}
                        step={1}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="no-textures">No textures applied</p>
        )}
      </div>
    </div>
  )
}

