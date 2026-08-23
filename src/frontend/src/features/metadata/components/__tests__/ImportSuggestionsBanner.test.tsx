import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '@/test/renderWithProviders'

import * as metadataApi from '../../api/metadataApi'
import type { ImportSuggestionItem } from '../../types'
import { ImportSuggestionsBanner } from '../ImportSuggestionsBanner'

jest.mock('../../api/metadataApi')

// setupTests mocks the whole apiBase module, so the asset-URL helper the row uses
// to show a thumbnail is not there. The rows care about the text, not the picture.
jest.mock('@/lib/apiBase', () => ({
  resolveApiAssetUrl: (url?: string | null) => url ?? null,
}))

const api = metadataApi as jest.Mocked<typeof metadataApi>

function suggestion(
  overrides: Partial<ImportSuggestionItem> = {}
): ImportSuggestionItem {
  return {
    modelId: 1,
    name: 'SM_Bld_Apartment_01',
    thumbnailUrl: null,
    thumbnailStatus: 'none',
    categoryId: 7,
    categoryName: 'Buildings',
    tags: ['Downtown'],
    sourceFolder: '/library/POLYGONCity/SourceFiles/Downtown',
    appliedAt: '2026-08-24T00:00:00Z',
    ...overrides,
  }
}

function queueOf(items: ImportSuggestionItem[], total = items.length) {
  return { total, page: 1, pageSize: 50, items }
}

beforeEach(() => {
  jest.clearAllMocks()
  api.reviewImportSuggestions.mockResolvedValue({
    reviewed: 1,
    categoriesCleared: 0,
    tagsRemoved: 0,
    remaining: 0,
  })
})

describe('ImportSuggestionsBanner', () => {
  /**
   * The banner is on the Models tab permanently. If an empty queue rendered a
   * strip, every user would pay for it every day for the few days a year they
   * import a library.
   */
  it('renders nothing while the review queue is empty', async () => {
    api.getImportSuggestions.mockResolvedValue(queueOf([]))

    const { container } = renderWithProviders(<ImportSuggestionsBanner />)

    await waitFor(() => expect(api.getImportSuggestions).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('announces how many assets are waiting', async () => {
    api.getImportSuggestions.mockResolvedValue(
      queueOf([suggestion(), suggestion({ modelId: 2 })], 42)
    )

    renderWithProviders(<ImportSuggestionsBanner />)

    // The total, not the page - the banner is about the whole queue and a page
    // holds fifty of a 1,700-model import.
    expect(
      await screen.findByText('42 assets were categorized automatically')
    ).toBeInTheDocument()
  })

  /**
   * "Keep all" sends no ids, which is what tells the server to settle everything
   * waiting. Sending the page's ids instead would silently leave the rest of a
   * large import in the queue after the user said they were happy with it.
   */
  it('keeps everything without naming ids', async () => {
    api.getImportSuggestions.mockResolvedValue(queueOf([suggestion()], 700))

    renderWithProviders(<ImportSuggestionsBanner />)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Keep all' })
    )

    await waitFor(() =>
      expect(api.reviewImportSuggestions).toHaveBeenCalledWith(true, undefined)
    )
  })

  it('opens the review list showing what was guessed and where from', async () => {
    api.getImportSuggestions.mockResolvedValue(queueOf([suggestion()]))

    renderWithProviders(<ImportSuggestionsBanner />)
    await userEvent.click(await screen.findByRole('button', { name: 'Review' }))

    expect(await screen.findByText('SM_Bld_Apartment_01')).toBeInTheDocument()
    expect(screen.getByText('Buildings')).toBeInTheDocument()
    expect(screen.getByText('Downtown')).toBeInTheDocument()
    // The evidence behind the tags. Without it a reviewer is being asked to
    // confirm a guess whose reasoning they cannot see.
    expect(
      screen.getByText('/library/POLYGONCity/SourceFiles/Downtown')
    ).toBeInTheDocument()
  })

  it('settles only the assets a reviewer picked out', async () => {
    api.getImportSuggestions.mockResolvedValue(
      queueOf([suggestion(), suggestion({ modelId: 2, name: 'oak_barrel' })])
    )

    renderWithProviders(<ImportSuggestionsBanner />)
    await userEvent.click(await screen.findByRole('button', { name: 'Review' }))
    await screen.findByText('oak_barrel')

    // PrimeReact renders its Checkbox as a styled div with a hidden input, so the
    // row is picked out by the label it is wired to rather than by role.
    await userEvent.click(screen.getByLabelText('SM_Bld_Apartment_01'))
    await userEvent.click(screen.getByRole('button', { name: 'Undo selected' }))

    // Selection exists so a reviewer can disagree with part of a batch - the
    // whole-queue action must not fire when they have picked rows.
    await waitFor(() =>
      expect(api.reviewImportSuggestions).toHaveBeenCalledWith(false, [1])
    )
  })
})
