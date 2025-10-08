import { Slider } from 'primereact/slider'
import { InputSwitch } from 'primereact/inputswitch'
import './ViewerSettings.css'

export interface ViewerSettingsType {
  cameraDistance: number
  orbitSpeed: number
  zoomSpeed: number
  panSpeed: number
  lockCamera: boolean
}

interface ViewerSettingsProps {
  settings: ViewerSettingsType
  onSettingsChange: (settings: ViewerSettingsType) => void
}

function ViewerSettings({ settings, onSettingsChange }: ViewerSettingsProps) {
  const handleChange = (key: keyof ViewerSettingsType, value: number) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    })
  }

  return (
    <div className="viewer-settings">
      <div className="setting-item">
        <label>Camera Distance</label>
        <div className="setting-control">
          <Slider
            value={settings.cameraDistance}
            onChange={e => handleChange('cameraDistance', e.value as number)}
            min={1}
            max={5}
            step={0.1}
          />
          <span className="setting-value">
            {settings.cameraDistance.toFixed(1)}
          </span>
        </div>
      </div>

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
          <span className="setting-value">{settings.panSpeed.toFixed(1)}x</span>
        </div>
      </div>

      <div className="setting-item">
        <label>Lock Camera Position</label>
        <div className="setting-control">
          <InputSwitch
            checked={settings.lockCamera}
            onChange={e => handleChange('lockCamera', e.value ? 1 : 0)}
          />
          <span className="setting-description">
            Prevent camera from auto-adjusting when windows open/close
          </span>
        </div>
      </div>

      <div className="settings-hint">
        <i className="pi pi-info-circle"></i>
        <span>Adjust these settings to customize your viewing experience</span>
      </div>
    </div>
  )
}

export default ViewerSettings
