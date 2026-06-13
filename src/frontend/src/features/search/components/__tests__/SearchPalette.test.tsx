import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { type GlobalSearchResponse } from '../../types'
import { SearchPalette } from '../SearchPalette'

const mockResponse: GlobalSearchResponse = {
  groups: [
    {
      type: 'model',
      totalCount: 2,
      items: [
        { type: 'model', id: 1, name: 'Barrel', matchedOn: 'name' },
        { type: 'model', id: 2, name: 'Barrel Stack', matchedOn: 'tag' },
      ],
    },
    {
      type: 'sound',
      totalCount: 1,
      items: [
        { type: 'sound', id: 9, name: 'Barrel Roll SFX', matchedOn: 'name' },
      ],
    },
  ],
}

jest.mock('../../api/searchApi', () => ({
  globalSearch: jest.fn(() => Promise.resolve(mockResponse)),
}))

function renderPalette(onSelectResult = jest.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <SearchPalette
        visible
        onClose={jest.fn()}
        onSelectResult={onSelectResult}
      />
    </QueryClientProvider>
  )
  return { onSelectResult }
}

describe('SearchPalette', () => {
  it('queries on input and renders grouped results with a tag badge', async () => {
    renderPalette()
    fireEvent.change(screen.getByTestId('search-palette-input'), {
      target: { value: 'barrel' },
    })

    await waitFor(() =>
      expect(screen.getAllByTestId('search-palette-result')).toHaveLength(3)
    )
    expect(screen.getByText('Models')).toBeInTheDocument()
    expect(screen.getByText('Sounds')).toBeInTheDocument()
    // The tag-matched model shows a 'tag' badge.
    expect(screen.getByText('tag')).toBeInTheDocument()
  })

  it('opens the keyboard-active result on Enter', async () => {
    const { onSelectResult } = renderPalette()
    const input = screen.getByTestId('search-palette-input')
    fireEvent.change(input, { target: { value: 'barrel' } })

    await waitFor(() =>
      expect(screen.getAllByTestId('search-palette-result')).toHaveLength(3)
    )

    // Arrow down once → second item, then Enter.
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelectResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, name: 'Barrel Stack' })
    )
  })
})
