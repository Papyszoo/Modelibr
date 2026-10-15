import { type JSX, useEffect, useState } from 'react'

interface SettingNumberFieldProps {
  id: string
  label: string
  help?: string
  /** Shown under the help line, in the same style as the form fields. */
  defaultLabel?: string
  value: number
  min: number
  max: number
  disabled?: boolean
  saving?: boolean
  onCommit: (next: number) => void
}

/**
 * Immediate-save number field: the value is written when the field loses focus
 * (or Enter is pressed), never while typing. Out-of-range input reverts to the
 * stored value instead of saving something the server would reject.
 *
 * Enter is intercepted: these fields live inside the Settings form, and letting
 * Enter submit the form would trigger the shared Save footer instead.
 */
export function SettingNumberField({
  id,
  label,
  help,
  defaultLabel,
  value,
  min,
  max,
  disabled,
  saving,
  onCommit,
}: SettingNumberFieldProps): JSX.Element {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = (): void => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setDraft(String(value))
      return
    }
    if (parsed !== value) {
      onCommit(parsed)
    }
  }

  return (
    <div className="settings-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={draft}
        disabled={disabled || saving}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
      {help && <span className="settings-help">{help}</span>}
      {defaultLabel && <span className="settings-default">{defaultLabel}</span>}
    </div>
  )
}
