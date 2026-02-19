import { Slider } from 'primereact/slider'
import { InputSwitch } from 'primereact/inputswitch'
import { Dropdown } from 'primereact/dropdown'
import { SelectButton } from 'primereact/selectbutton'
import { GeometryType } from './GeometrySelector'
import { UvMappingMode } from '@/types'
import './PreviewSettings.css'

export interface PreviewSettingsType {
  type: GeometryType
  scale: number
  rotationSpeed: number
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
  // Tiling parameters (for Universal texture sets)
  tilingScaleX: number
  tilingScaleY: number
  // UV mapping mode (Standard = manual repeat, Physical = auto from geometry)
  uvMappingMode: UvMappingMode
  // Physical UV scale — world-space size of one texture tile
  uvScale: number
}

interface PreviewSettingsProps {
  settings: PreviewSettingsType
  onSettingsChange: (settings: PreviewSettingsType) => void
  showTilingControls?: boolean
}

export function PreviewSettings({
  settings,
  onSettingsChange,
  showTilingControls = false,
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
            <span className="setting-value">{settings.scale.toFixed(1)}x</span>
          </div>
        </div>

        <div className="setting-item">
          <label>Rotation Speed</label>
          <div className="setting-control">
            <Slider
              value={settings.rotationSpeed}
              onChange={e => handleChange('rotationSpeed', e.value as number)}
              min={0}
              max={0.05}
              step={0.001}
            />
            <span className="setting-value">
              {settings.rotationSpeed === 0
                ? 'Off'
                : settings.rotationSpeed.toFixed(3)}
            </span>
          </div>
        </div>

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

      {settings.type === 'box' && (
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

      {settings.type === 'sphere' && (
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

      {settings.type === 'cylinder' && (
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

      {settings.type === 'torus' && (
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
          <h4 className="settings-group-title">Tiling / UV Mapping</h4>

          <div className="setting-item">
            <label>UV Mode</label>
            <div className="setting-control">
              <SelectButton
                value={settings.uvMappingMode}
                onChange={e => {
                  if (e.value !== null && e.value !== undefined) {
                    handleChange('uvMappingMode', e.value as number)
                  }
                }}
                options={[
                  { label: 'Standard', value: UvMappingMode.Standard },
                  { label: 'Physical', value: UvMappingMode.Physical },
                ]}
                className="uv-mode-select"
              />
            </div>
          </div>

          {settings.uvMappingMode === UvMappingMode.Physical ? (
            <div className="setting-item">
              <label>Tile Size</label>
              <div className="setting-control">
                <Slider
                  value={settings.uvScale}
                  onChange={e => handleChange('uvScale', e.value as number)}
                  min={0.1}
                  max={5}
                  step={0.05}
                />
                <span className="setting-value">
                  {settings.uvScale.toFixed(2)}m
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="setting-item">
                <label>Tile X</label>
                <div className="setting-control">
                  <Slider
                    value={settings.tilingScaleX}
                    onChange={e =>
                      handleChange('tilingScaleX', e.value as number)
                    }
                    min={0.1}
                    max={10}
                    step={0.1}
                  />
                  <span className="setting-value">
                    {settings.tilingScaleX.toFixed(1)}x
                  </span>
                </div>
              </div>

              <div className="setting-item">
                <label>Tile Y</label>
                <div className="setting-control">
                  <Slider
                    value={settings.tilingScaleY}
                    onChange={e =>
                      handleChange('tilingScaleY', e.value as number)
                    }
                    min={0.1}
                    max={10}
                    step={0.1}
                  />
                  <span className="setting-value">
                    {settings.tilingScaleY.toFixed(1)}x
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
