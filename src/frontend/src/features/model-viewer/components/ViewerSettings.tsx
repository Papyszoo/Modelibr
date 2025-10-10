import { Slider } from 'primereact/slider'
import { InputSwitch } from 'primereact/inputswitch'
import { Dropdown } from 'primereact/dropdown'
import { useState, useEffect } from 'react'
// eslint-disable-next-line no-restricted-imports
import ApiClient, { EnvironmentDto } from '../../../services/ApiClient'
import './ViewerSettings.css'

export interface ViewerSettingsType {
  orbitSpeed: number
  zoomSpeed: number
  panSpeed: number
  modelRotationSpeed: number
  showShadows: boolean
  environmentId?: number
}

interface ViewerSettingsProps {
  settings: ViewerSettingsType
  onSettingsChange: (settings: ViewerSettingsType) => void
}

function ViewerSettings({ settings, onSettingsChange }: ViewerSettingsProps) {
  const [environments, setEnvironments] = useState<EnvironmentDto[]>([])
  const [isLoadingEnvironments, setIsLoadingEnvironments] = useState(true)

  useEffect(() => {
    const fetchEnvironments = async () => {
      try {
        const envs = await ApiClient.getEnvironments()
        setEnvironments(envs)
      } catch (error) {
        console.error('Failed to load environments:', error)
      } finally {
        setIsLoadingEnvironments(false)
      }
    }
    fetchEnvironments()
  }, [])

  const handleChange = (
    key: keyof ViewerSettingsType,
    value: number | boolean
  ) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    })
  }

  return (
    <div className="viewer-settings">
      <div className="settings-group">
        <h4 className="settings-group-title">Environment</h4>

        <div className="setting-item">
          <label>Scene Environment</label>
          <div className="setting-control">
            <Dropdown
              value={settings.environmentId}
              options={environments.map(env => ({
                label: env.isDefault ? `${env.name} (Default)` : env.name,
                value: env.id
              }))}
              onChange={e => handleChange('environmentId', e.value as number)}
              placeholder={isLoadingEnvironments ? 'Loading...' : 'Select environment'}
              disabled={isLoadingEnvironments}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h4 className="settings-group-title">Control Settings</h4>

        <div className="setting-item">
          <label>Orbit Speed</label>
          <div className="setting-control">
            <Slider
              value={settings.orbitSpeed}
              onChange={e => handleChange('orbitSpeed', e.value as number)}
              min={0.1}
              max={2}
              step={0.1}
            />
            <span className="setting-value">
              {settings.orbitSpeed.toFixed(1)}x
            </span>
          </div>
        </div>

        <div className="setting-item">
          <label>Zoom Speed</label>
          <div className="setting-control">
            <Slider
              value={settings.zoomSpeed}
              onChange={e => handleChange('zoomSpeed', e.value as number)}
              min={0.1}
              max={2}
              step={0.1}
            />
            <span className="setting-value">
              {settings.zoomSpeed.toFixed(1)}x
            </span>
          </div>
        </div>

        <div className="setting-item">
          <label>Pan Speed</label>
          <div className="setting-control">
            <Slider
              value={settings.panSpeed}
              onChange={e => handleChange('panSpeed', e.value as number)}
              min={0.1}
              max={2}
              step={0.1}
            />
            <span className="setting-value">
              {settings.panSpeed.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h4 className="settings-group-title">Display Settings</h4>

        <div className="setting-item">
          <label>Model Rotation Speed</label>
          <div className="setting-control">
            <Slider
              value={settings.modelRotationSpeed}
              onChange={e =>
                handleChange('modelRotationSpeed', e.value as number)
              }
              min={0}
              max={0.02}
              step={0.001}
            />
            <span className="setting-value">
              {settings.modelRotationSpeed === 0
                ? 'Off'
                : settings.modelRotationSpeed.toFixed(3)}
            </span>
          </div>
        </div>

        <div className="setting-item">
          <label>Show Shadows</label>
          <div className="setting-control">
            <InputSwitch
              checked={settings.showShadows}
              onChange={e => handleChange('showShadows', e.value as boolean)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ViewerSettings
