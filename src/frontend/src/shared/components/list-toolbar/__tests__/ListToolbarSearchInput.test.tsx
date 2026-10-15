import { fireEvent, render, screen } from '@testing-library/react'

import { ListToolbarSearchInput } from '../ListToolbar'

describe('ListToolbarSearchInput', () => {
  it('clears the query from the inline clear button', () => {
    const onChange = jest.fn()
    render(<ListToolbarSearchInput value="castle" onChange={onChange} />)

    fireEvent.click(screen.getByTestId('search-clear'))

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('shows no clear button when the query is empty', () => {
    render(<ListToolbarSearchInput value="" onChange={jest.fn()} />)
    expect(screen.queryByTestId('search-clear')).not.toBeInTheDocument()
  })
})
