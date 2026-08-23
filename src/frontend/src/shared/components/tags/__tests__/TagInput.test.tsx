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

  it('refuses a value outside a closed vocabulary rather than storing it', () => {
    // The field stores an option id. A free-text name has nothing the server can
    // keep, so accepting it silently would put a value in the field that does
    // not exist.
    const onChange = jest.fn()
    const onCreateOption = jest.fn()
    render(
      <TagInput
        value={[]}
        onChange={onChange}
        options={['Low Poly', 'Realistic']}
        allowCustom={false}
        onCreateOption={onCreateOption}
        inputTestId="tag-in"
      />
    )

    const input = screen.getByTestId('tag-in')
    fireEvent.change(input, { target: { value: 'Voxel' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith([])
    expect(onCreateOption).not.toHaveBeenCalled()
  })

  it('hands an unknown value to onCreateOption when custom values are allowed', () => {
    const onChange = jest.fn()
    const onCreateOption = jest.fn()
    render(
      <TagInput
        value={[]}
        onChange={onChange}
        options={['Low Poly']}
        allowCustom
        onCreateOption={onCreateOption}
        inputTestId="tag-in"
      />
    )

    const input = screen.getByTestId('tag-in')
    fireEvent.change(input, { target: { value: 'Voxel' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCreateOption).toHaveBeenCalledWith('Voxel')
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("stores a vocabulary value under the vocabulary's own spelling", () => {
    // Otherwise "low poly" and "Low Poly" become two different answers to one
    // question, and only one of them matches anything.
    const onChange = jest.fn()
    render(
      <TagInput
        value={[]}
        onChange={onChange}
        options={['Low Poly']}
        inputTestId="tag-in"
      />
    )

    const input = screen.getByTestId('tag-in')
    fireEvent.change(input, { target: { value: 'low poly' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(['Low Poly'])
  })

  it('offers the whole closed vocabulary rather than the first few', () => {
    // A vocabulary the user cannot see all of is one they will type a near-miss
    // into.
    const options = Array.from({ length: 12 }, (_, index) => `Style ${index}`)
    render(
      <TagInput
        value={[]}
        onChange={jest.fn()}
        options={options}
        inputTestId="tag-in"
      />
    )

    for (const name of options) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })
})
