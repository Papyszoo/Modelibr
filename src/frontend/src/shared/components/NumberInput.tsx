import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

import { formatDecimal, parseDecimalInput } from '@/shared/utils/number'

export interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  id?: string
  'aria-label'?: string
  'data-testid'?: string
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
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  className,
  id,
  ...aria
}: NumberInputProps): ReactNode {
  const [text, setText] = useState(() => formatDecimal(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(formatDecimal(value))
  }, [value])

  const clamp = (next: number) =>
    Math.min(max ?? next, Math.max(min ?? next, next))

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    setText(raw)
    const parsed = parseDecimalInput(raw)
    // Commit what was typed, unclamped. Out-of-range values are pulled back into
    // range on blur below (and by the arrow keys), so a partially typed number
    // such as the leading `0` of `0.5` is not snapped to `min` mid-keystroke.
    if (parsed !== undefined && parsed !== value) onChange(parsed)
  }

  const commit = () => {
    focused.current = false
    const parsed = parseDecimalInput(text)
    const next = parsed === undefined ? value : clamp(parsed)
    setText(formatDecimal(next))
    if (next !== value) onChange(next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const base = parseDecimalInput(text) ?? value
    const magnitude = step * (event.shiftKey ? 10 : 1)
    const next = clamp(
      base + (event.key === 'ArrowUp' ? magnitude : -magnitude)
    )
    setText(formatDecimal(next))
    onChange(next)
  }

  return (
    <input
      {...aria}
      id={id}
      type="text"
      inputMode="decimal"
      className={className}
      value={text}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={commit}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  )
}
