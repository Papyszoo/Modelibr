import './PreviewSettings.css'

import { Dropdown } from 'primereact/dropdown'
import { InputSwitch } from 'primereact/inputswitch'
import { Slider } from 'primereact/slider'

import { type GeometryType } from './GeometrySelector'

export interface PreviewSettingsType {
  type: GeometryType
  scale: number
  wireframe: boolean
  // Cube parameters
  cubeSize: number
  // Sphere parameters
  sphereRadius: number
  sphereSegments: number
  // Cylinder parameters
  cylinderRadius: number
  cylinderHeight: number
  // Torus parameters
  torusRadius: number
  torusTube: number
  // UV Scale — direct texture repeat multiplier
  uvScale: number
  // Texture quality: 0 = Original, 256/512/1024/2048 = proxy size
  textureQuality: number
}

interface PreviewSettingsProps {
  settings: PreviewSettingsType
  onSettingsChange: (settings: PreviewSettingsType) => void
  showTilingControls?: boolean
  /** When true, shows only Geometry Type, UV Scale, and Wireframe (hides Scale, Rotation Speed, per-geometry params) */
  isGlobalMaterial?: boolean
}

export function PreviewSettings({
  settings,
  onSettingsChange,
  showTilingControls = false,
  isGlobalMaterial = false,
}: PreviewSettingsProps) {
  const handleChange = (
    key: keyof PreviewSettingsType,
    value: number | boolean | GeometryType
  ) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    })
  }

  const geometryOptions = [
    { label: 'Plane', value: 'plane' as GeometryType },
    { label: 'Cube', value: 'box' as GeometryType },
    { label: 'Sphere', value: 'sphere' as GeometryType },
    { label: 'Cylinder', value: 'cylinder' as GeometryType },
    { label: 'Torus', value: 'torus' as GeometryType },
  ]

  return (
    <div className="preview-settings">
      <div className="settings-group">
        <h4 className="settings-group-title">Geometry</h4>

        <div className="setting-item">
          <label>Geometry Type</label>
          <div className="setting-control">
            <Dropdown
              value={settings.type}
              options={geometryOptions}
              onChange={e => handleChange('type', e.value)}
              className="geometry-dropdown"
            />
          </div>
        </div>

        {!isGlobalMaterial && (
          <div className="setting-item">
            <label>Scale</label>
            <div className="setting-control">
              <Slider
                value={settings.scale}
                onChange={e => handleChange('scale', e.value as number)}
                min={0.5}
                max={3}
                step={0.1}
              />
              <span className="setting-value">
                {settings.scale.toFixed(1)}x
              </span>
            </div>
          </div>
        )}

        <div className="setting-item">
          <label>Wireframe</label>
          <div className="setting-control">
            <InputSwitch
              checked={settings.wireframe}
              onChange={e => handleChange('wireframe', e.value as boolean)}
            />
          </div>
        </div>
      </div>

      {/* Per-geometry parameter sliders — hidden for Global Materials (Bounds auto-fits) */}
      {!isGlobalMaterial && settings.type === 'box' && (
        <div className="settings-group">
          <h4 className="settings-group-title">Cube Parameters</h4>

          <div className="setting-item">
            <label>Cube Size</label>
            <div className="setting-control">
              <Slider
                value={settings.cubeSize}
                onChange={e => handleChange('cubeSize', e.value as number)}
                min={0.5}
                max={4}
                step={0.1}
              />
              <span className="setting-value">
                {settings.cubeSize.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      )}

      {!isGlobalMaterial && settings.type === 'sphere' && (
        <div className="settings-group">
          <h4 className="settings-group-title">Sphere Parameters</h4>

          <div className="setting-item">
            <label>Sphere Radius</label>
            <div className="setting-control">
              <Slider
                value={settings.sphereRadius}
                onChange={e => handleChange('sphereRadius', e.value as number)}
                min={0.5}
                max={3}
                step={0.1}
              />
              <span className="setting-value">
                {settings.sphereRadius.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="setting-item">
            <label>Sphere Segments</label>
            <div className="setting-control">
              <Slider
                value={settings.sphereSegments}
                onChange={e =>
                  handleChange('sphereSegments', e.value as number)
                }
                min={8}
                max={128}
                step={8}
              />
              <span className="setting-value">{settings.sphereSegments}</span>
            </div>
          </div>
        </div>
      )}

      {!isGlobalMaterial && settings.type === 'cylinder' && (
        <div className="settings-group">
          <h4 className="settings-group-title">Cylinder Parameters</h4>

          <div className="setting-item">
            <label>Cylinder Radius</label>
            <div className="setting-control">
              <Slider
                value={settings.cylinderRadius}
                onChange={e =>
                  handleChange('cylinderRadius', e.value as number)
                }
                min={0.3}
                max={2}
                step={0.1}
              />
              <span className="setting-value">
                {settings.cylinderRadius.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="setting-item">
            <label>Cylinder Height</label>
            <div className="setting-control">
              <Slider
                value={settings.cylinderHeight}
                onChange={e =>
                  handleChange('cylinderHeight', e.value as number)
                }
                min={0.5}
                max={4}
                step={0.1}
              />
              <span className="setting-value">
                {settings.cylinderHeight.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      )}

      {!isGlobalMaterial && settings.type === 'torus' && (
        <div className="settings-group">
          <h4 className="settings-group-title">Torus Parameters</h4>

          <div className="setting-item">
            <label>Torus Radius</label>
            <div className="setting-control">
              <Slider
                value={settings.torusRadius}
                onChange={e => handleChange('torusRadius', e.value as number)}
                min={0.5}
                max={2}
                step={0.1}
              />
              <span className="setting-value">
                {settings.torusRadius.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="setting-item">
            <label>Tube Thickness</label>
            <div className="setting-control">
              <Slider
                value={settings.torusTube}
                onChange={e => handleChange('torusTube', e.value as number)}
                min={0.1}
                max={0.8}
                step={0.05}
              />
              <span className="setting-value">
                {settings.torusTube.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {showTilingControls && (
        <div className="settings-group">
          <h4 className="settings-group-title">UV Scale</h4>

          <div className="setting-item">
            <label>Scale</label>
            <div className="setting-control">
              <Slider
                value={settings.uvScale}
                onChange={e => handleChange('uvScale', e.value as number)}
                min={0.1}
                max={10}
                step={0.1}
              />
              <span className="setting-value">
                {settings.uvScale.toFixed(1)}x
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
