import { type JSX } from 'react'

interface SettingToggleProps {
  id?: string
  label: string
  help?: string
  isOn: boolean
  disabled?: boolean
  saving?: boolean
  onChange: (next: boolean) => void
}

/**
 * Immediate-save toggle for key-value settings. Renders the exact markup of the
 * Settings page's form ToggleField (same classes, same look) so an
 * immediately-saved control sits next to a form-saved one without a visual seam.
 */
export function SettingToggle({
  id,
  label,
  help,
  isOn,
  disabled,
  saving,
  onChange,
}: SettingToggleProps): JSX.Element {
  const isDisabled = disabled || saving

  return (
    <div className="settings-field">
      <label className="settings-checkbox-label toggle-field">
        <input
          id={id}
          type="checkbox"
          className="toggle-field-input"
          checked={isOn}
          disabled={isDisabled}
          onChange={event => onChange(event.target.checked)}
        />
        <span className="toggle-field-text">
          <span className="toggle-field-label">{label}</span>
          {help && <span className="toggle-field-sub">{help}</span>}
        </span>
        <span
          className={`toggle-switch ${isOn ? 'on' : ''}`}
          aria-hidden="true"
        />
      </label>
    </div>
  )
}
