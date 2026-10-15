import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import { NumberInput } from '../NumberInput'

function Harness({ initial = 1 }: { initial?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <NumberInput
      aria-label="Amount"
      value={value}
      min={0}
      max={10}
      onChange={setValue}
    />
  )
}

/** Shows the committed value beside the field so clamping is observable. */
function MinHarness({ initial = 1 }: { initial?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <NumberInput
        aria-label="Amount"
        value={value}
        min={0.1}
        max={10}
        onChange={setValue}
      />
      <output data-testid="amount-value">{value}</output>
    </>
  )
}

describe('NumberInput', () => {
  it('accepts a period decimal', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '1.5' },
    })
    expect(screen.getByLabelText('Amount')).toHaveValue('1.5')
  })

  it('accepts a comma decimal and normalizes the display', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '2,5' },
    })
    expect(screen.getByLabelText('Amount')).toHaveValue('2.5')
  })

  it('never renders a native number input (which drops the other separator)', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Amount')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Amount')).toHaveAttribute(
      'inputmode',
      'decimal'
    )
  })

  it('clamps to the min/max on blur', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Amount')
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.blur(input)
    expect(input).toHaveValue('10')
  })

  // Regression: the field used to clamp on every keystroke, so typing the
  // leading `0` of `0.5` with min={0.1} immediately emitted 0.1 and the value
  // could never be entered. Clamping must wait for commit (blur).
  it('does not clamp a half-typed value while typing (0.5 with min 0.1)', () => {
    render(<MinHarness />)
    const input = screen.getByLabelText('Amount')
    fireEvent.focus(input)

    fireEvent.change(input, { target: { value: '0' } })
    expect(screen.getByTestId('amount-value')).toHaveTextContent('0')

    fireEvent.change(input, { target: { value: '0.' } })
    fireEvent.change(input, { target: { value: '0.5' } })
    expect(screen.getByTestId('amount-value')).toHaveTextContent('0.5')

    fireEvent.blur(input)
    expect(input).toHaveValue('0.5')
    expect(screen.getByTestId('amount-value')).toHaveTextContent('0.5')
  })

  // Regression: the field must not depend on the browser locale. In a
  // comma-decimal browser "1.5" used to become "15" (the separator was dropped),
  // and vice versa; both separators must read as 1.5 everywhere. The locale is
  // set for real so a locale-dependent parser would fail the comma-locale cases.
  it.each([
    ['en-US', '1.5'],
    ['en-US', '1,5'],
    ['pl-PL', '1,5'],
    ['pl-PL', '1.5'],
  ])('reads both separators in %s: %s', (locale, typed) => {
    withLocale(locale, () => {
      render(<Harness />)
      fireEvent.change(screen.getByLabelText('Amount'), {
        target: { value: typed },
      })
      expect(screen.getByLabelText('Amount')).toHaveValue('1.5')
    })
  })

  describe('optional (allowEmpty) fields', () => {
    /** Optional min/max filter, like the list toolbars use. */
    function OptionalHarness() {
      const [value, setValue] = useState<number | null>(null)
      return (
        <>
          <NumberInput
            aria-label="Minimum"
            value={value}
            onChange={setValue}
            min={0}
            placeholder="Min"
            allowEmpty
          />
          <output data-testid="optional-value">{String(value)}</output>
        </>
      )
    }

    // Regression: optional numeric filters (triangle count, duration) were
    // PrimeReact InputNumbers; an emptied field must clear the filter (null),
    // not snap back to the previous number.
    it('commits null when the field is emptied and renders null as empty', () => {
      render(<OptionalHarness />)
      const input = screen.getByLabelText('Minimum')
      expect(input).toHaveValue('')

      fireEvent.change(input, { target: { value: '12' } })
      expect(screen.getByTestId('optional-value')).toHaveTextContent('12')

      fireEvent.change(input, { target: { value: '' } })
      expect(screen.getByTestId('optional-value')).toHaveTextContent('null')
      expect(input).toHaveValue('')
    })

    it('restores the old value when unparseable text is left on blur', () => {
      render(<OptionalHarness />)
      const input = screen.getByLabelText('Minimum')

      fireEvent.change(input, { target: { value: '5' } })
      fireEvent.change(input, { target: { value: 'abc' } })
      fireEvent.blur(input)

      expect(input).toHaveValue('5')
      expect(screen.getByTestId('optional-value')).toHaveTextContent('5')
    })
  })

  it('passes placeholder and disabled through to the input', () => {
    render(
      <NumberInput
        aria-label="Amount"
        value={3}
        onChange={() => {}}
        placeholder="Min"
        disabled
      />
    )
    expect(screen.getByLabelText('Amount')).toHaveAttribute(
      'placeholder',
      'Min'
    )
    expect(screen.getByLabelText('Amount')).toBeDisabled()
  })
})

/** Forces `navigator.language` for the duration of `run`. */
function withLocale(locale: string, run: () => void): void {
  Object.defineProperty(window.navigator, 'language', {
    value: locale,
    configurable: true,
  })
  try {
    run()
  } finally {
    delete (window.navigator as { language?: string }).language
  }
}
