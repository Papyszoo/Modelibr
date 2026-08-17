import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { client } from '@/lib/apiBase'
import { renderWithProviders } from '@/test/renderWithProviders'

import { type MaterialDto } from '../../api/materialApi'
import { MaterialList } from '../MaterialList'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockDelete = client.delete as jest.Mock

function materialDto(
  id: number,
  name: string,
  overrides: Partial<MaterialDto['parameters']> = {}
): MaterialDto {
  return {
    id,
    name,
    description: null,
    categoryId: null,
    categoryName: null,
    previewGeometryType: 'sphere',
    requiresUvs: false,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    parameters: {
      baseColorR: 0.5,
      baseColorG: 0.5,
      baseColorB: 0.5,
      baseColorA: 1,
      baseColorHex: '#808080',
      roughness: 0.5,
      metallic: 0,
      emissiveR: 0,
      emissiveG: 0,
      emissiveB: 0,
      normalScale: 1,
      occlusionStrength: 1,
      ior: 1.5,
      alphaMode: 'Opaque',
      alphaCutoff: 0.5,
      doubleSided: false,
      ...overrides,
    },
  }
}

const brass = materialDto(1, 'Brushed Brass', { metallic: 1, roughness: 0.35 })
const plaster = materialDto(2, 'Warm Plaster', { roughness: 0.95 })

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockImplementation((url: string) => {
    // Server-side name filtering: once a search is typed the server returns
    // only the match, which is what the page must render.
    if (url.includes('searchName=brass')) {
      return Promise.resolve({ data: { materials: [brass] } })
    }
    return Promise.resolve({ data: { materials: [brass, plaster] } })
  })
  mockPost.mockResolvedValue({ data: { id: 3, name: 'New material' } })
  mockDelete.mockResolvedValue({ data: null })
})

describe('MaterialList', () => {
  it('lists parameter materials with the finish derived from metallic', async () => {
    // `describeMaterial` reads metallic > 0.5 as metal. Inverting that
    // comparison would label brass a dielectric - a wrong but plausible-looking
    // tile subtitle that no type error would catch.
    renderWithProviders(<MaterialList />)

    expect(await screen.findByText('Brushed Brass')).toBeInTheDocument()
    expect(screen.getByText('Warm Plaster')).toBeInTheDocument()
    expect(screen.getByText(/metal · rough 0\.35/)).toBeInTheDocument()
    expect(screen.getByText(/dielectric · rough 0\.95/)).toBeInTheDocument()
  })

  it('sends the typed search to the server and renders the narrowed result', async () => {
    // The search must reach the query key. If it were held in local state
    // without feeding the query, the list would never change and this goes red.
    const user = userEvent.setup()
    renderWithProviders(<MaterialList />)
    await screen.findByText('Brushed Brass')

    await user.type(screen.getByPlaceholderText('Search materials...'), 'brass')

    await waitFor(() => {
      expect(screen.queryByText('Warm Plaster')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Brushed Brass')).toBeInTheDocument()
  })

  it('creates a material sending the hex colour and no float components', async () => {
    // The server treats baseColorHex as authoritative over baseColorR/G/B.
    // Sending both is a way to disagree with yourself, so the payload must
    // carry the hex alone - this is the regression that turns a picked colour
    // into a different one.
    const user = userEvent.setup()
    renderWithProviders(<MaterialList />)
    await screen.findByText('Brushed Brass')

    await user.click(screen.getByTestId('material-list-new'))
    await user.type(screen.getByTestId('material-name-input'), 'Rubber')
    await user.click(screen.getByTestId('material-editor-save'))

    await waitFor(() => expect(mockPost).toHaveBeenCalled())

    const [url, body] = mockPost.mock.calls.at(-1) as [
      string,
      { name: string; parameters: Record<string, unknown> },
    ]
    expect(url).toBe('/materials')
    expect(body.name).toBe('Rubber')
    expect(body.parameters.baseColorHex).toBeDefined()
    expect(body.parameters).not.toHaveProperty('baseColorR')
    expect(body.parameters).not.toHaveProperty('baseColorG')
    expect(body.parameters).not.toHaveProperty('baseColorB')
  })

  it('refetches the list after a create so the new material appears', async () => {
    // The invalidation check. A mutation that forgets to invalidate leaves the
    // grid showing stale data until the tab is reopened.
    const user = userEvent.setup()
    renderWithProviders(<MaterialList />)
    await screen.findByText('Brushed Brass')

    const rubber = materialDto(3, 'Rubber')
    mockGet.mockImplementation(() =>
      Promise.resolve({ data: { materials: [brass, plaster, rubber] } })
    )

    await user.click(screen.getByTestId('material-list-new'))
    await user.type(screen.getByTestId('material-name-input'), 'Rubber')
    await user.click(screen.getByTestId('material-editor-save'))

    expect(await screen.findByText('Rubber')).toBeInTheDocument()
  })

  it('will not save a material with a blank name', async () => {
    // A nameless material is unfindable in a grid keyed by name; the guard is
    // the only thing stopping one being created by pressing Create twice.
    const user = userEvent.setup()
    renderWithProviders(<MaterialList />)
    await screen.findByText('Brushed Brass')

    await user.click(screen.getByTestId('material-list-new'))
    expect(screen.getByTestId('material-editor-save')).toBeDisabled()

    await user.type(screen.getByTestId('material-name-input'), '   ')
    expect(screen.getByTestId('material-editor-save')).toBeDisabled()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('shows an error state with a working retry instead of an empty grid', async () => {
    // Rendering "No PBR materials yet" on a failed request tells the user their
    // library is empty. It must say the load failed, and recover on retry.
    const user = userEvent.setup()
    mockGet.mockRejectedValueOnce(new Error('offline'))
    renderWithProviders(<MaterialList />)

    const retry = await screen.findByRole('button', { name: /retry/i })
    expect(screen.queryByText('No PBR materials yet')).not.toBeInTheDocument()

    mockGet.mockImplementation(() =>
      Promise.resolve({ data: { materials: [brass] } })
    )
    await user.click(retry)

    expect(await screen.findByText('Brushed Brass')).toBeInTheDocument()
  })
})
