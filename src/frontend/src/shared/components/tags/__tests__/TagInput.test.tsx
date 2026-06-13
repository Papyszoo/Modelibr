import { fireEvent, render, screen } from '@testing-library/react'

import { TagInput } from '../TagInput'

describe('TagInput', () => {
  it('adds a tag on Enter and emits the new list', () => {
    const onChange = jest.fn()
    render(<TagInput value={[]} onChange={onChange} inputTestId="tag-in" />)

    const input = screen.getByTestId('tag-in')
    fireEvent.change(input, { target: { value: 'medieval' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(['medieval'])
  })

  it('does not add a duplicate (case-insensitive)', () => {
    const onChange = jest.fn()
    render(
      <TagInput value={['Wood']} onChange={onChange} inputTestId="tag-in" />
    )

    const input = screen.getByTestId('tag-in')
    fireEvent.change(input, { target: { value: 'wood' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // No change emitted because "wood" duplicates the existing "Wood".
    expect(onChange).toHaveBeenCalledWith(['Wood'])
  })

  it('offers vocabulary suggestions not already selected and adds on click', () => {
    const onChange = jest.fn()
    render(
      <TagInput
        value={['wood']}
        onChange={onChange}
        suggestions={['wood', 'metal', 'stone']}
        inputTestId="tag-in"
      />
    )

    // "wood" is already selected, so it should not be suggested.
    expect(
      screen.queryByRole('button', { name: 'wood' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'metal' }))
    expect(onChange).toHaveBeenCalledWith(['wood', 'metal'])
  })
})
