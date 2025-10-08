import { Slider } from 'primereact/slider'
import './ViewerSettings.css'

export interface ViewerSettingsType {
  orbitSpeed: number
  zoomSpeed: number
  panSpeed: number
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
    </div>
  )
}

export default ViewerSettings
