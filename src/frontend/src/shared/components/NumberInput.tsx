import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

import { formatDecimal, parseDecimalInput } from '@/shared/utils/number'

interface NumberInputBaseProps {
  min?: number
  max?: number
  step?: number
  className?: string
  id?: string
  placeholder?: string
  disabled?: boolean
  'aria-label'?: string
  'data-testid'?: string
}

export interface NumberInputProps extends NumberInputBaseProps {
  value: number
  onChange: (value: number) => void
  allowEmpty?: false
}

export interface NullableNumberInputProps extends NumberInputBaseProps {
  value: number | null
  onChange: (value: number | null) => void
  /** An emptied field commits `null` instead of snapping back to the old value. */
  allowEmpty: true
}

/**
 * A locale-proof numeric input.
 *
 * It renders a text field (`inputMode="decimal"`), not `type="number"`, so the
 * browser cannot mangle a typed decimal point: both `.` and `,` are accepted by
 * `parseDecimalInput` in every locale. PrimeReact `InputNumber` cannot do this:
 * it parses with the single decimal separator of the active locale and treats
 * the other as a grouping character, so no `locale` value accepts both. The raw
 * text is kept while the field is focused so intermediate states like `1.`
 * survive; it snaps back to the canonical value on blur. Arrow keys bump by
 * `step` (10x with Shift).
 *
 * `min`/`max` are applied on commit (blur and arrow keys), never per keystroke:
 * clamping while typing turns a leading `0` into `min` and makes values like
 * `0.5` with `min={0.1}` impossible to type.
 *
 * With `allowEmpty` the field models an optional filter/field: empty text
 * commits `null` (and `null` renders as an empty field).
 */
export function NumberInput(props: NullableNumberInputProps): ReactNode
export function NumberInput(props: NumberInputProps): ReactNode
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  className,
  id,
  placeholder,
  disabled,
  allowEmpty = false,
  ...aria
}: NumberInputProps | NullableNumberInputProps): ReactNode {
  const emit = onChange as (value: number | null) => void
  const [text, setText] = useState(() =>
    value === null ? '' : formatDecimal(value)
  )
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(value === null ? '' : formatDecimal(value))
  }, [value])

  const clamp = (next: number) =>
    Math.min(max ?? next, Math.max(min ?? next, next))

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    setText(raw)
    const parsed = parseDecimalInput(raw)
    if (parsed !== undefined) {
      // Commit what was typed, unclamped. Out-of-range values are pulled back
      // into range on blur below (and by the arrow keys), so a partially typed
      // number such as the leading `0` of `0.5` is not snapped to `min`
      // mid-keystroke.
      if (parsed !== value) emit(parsed)
    } else if (allowEmpty && raw.trim() === '' && value !== null) {
      emit(null)
    }
  }

  const commit = () => {
    focused.current = false

    // Only an explicitly emptied optional field clears the value; unparseable
    // text snaps back to the previous one.
    if (allowEmpty && text.trim() === '') {
      setText('')
      if (value !== null) emit(null)
      return
    }

    const parsed = parseDecimalInput(text)
    const next: number | null = parsed === undefined ? value : clamp(parsed)
    setText(next === null ? '' : formatDecimal(next))
    if (next !== value) emit(next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const base = parseDecimalInput(text) ?? value ?? 0
    const magnitude = step * (event.shiftKey ? 10 : 1)
    const next = clamp(
      base + (event.key === 'ArrowUp' ? magnitude : -magnitude)
    )
    setText(formatDecimal(next))
    emit(next)
  }

  return (
    <input
      {...aria}
      id={id}
      type="text"
      inputMode="decimal"
      className={className}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={commit}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  )
}
