import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { client } from '@/lib/apiBase'
import { renderWithProviders } from '@/test/renderWithProviders'

import { type MaterialDto } from '../../api/materialApi'
import { MaterialList } from '../MaterialList'

// Effects previews mount a WebGL canvas; this flow test is about the request
// the editor sends, not what the preview draws.
jest.mock('../MaterialEffectPreview', () => ({
  MaterialEffectPreview: () => <div data-testid="material-effect-preview" />,
}))

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockPut = client.put as jest.Mock
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
  mockPut.mockResolvedValue({ data: brass })
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

  // Regression: right-click on a material card went straight to a delete
  // confirm. Materials are recycled (soft-deleted), so the card menu must offer
  // Recycle with an Undo restore - never a destructive confirm. This mirrors
  // the model card menu.
  it('recycles from the context menu without a confirm and offers Undo', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MaterialList />)
    await screen.findByText('Brushed Brass')

    fireEvent.contextMenu(screen.getAllByTestId('material-tile')[0])

    expect(
      screen.queryByTestId('material-delete-confirm')
    ).not.toBeInTheDocument()

    await user.click(await screen.findByText('Recycle'))
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/materials/1'))

    // The success toast carries an Undo affordance; pressing it restores the
    // material from the recycle bin instead of leaving the user to find it.
    await user.click(await screen.findByTestId('material-recycle-undo'))
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/recycled/material/1/restore')
    )
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

  it('confirms a saved material with a success toast', async () => {
    // Regression: the editor closed silently after a save, so a save could not
    // be told apart from a cancel.
    const user = userEvent.setup()
    renderWithProviders(<MaterialList />)
    await screen.findByText('Brushed Brass')

    await user.click(screen.getByTestId('material-list-new'))
    await user.type(screen.getByTestId('material-name-input'), 'Rubber')
    await user.click(screen.getByTestId('material-editor-save'))

    expect(await screen.findByText('Material created')).toBeInTheDocument()
  })

  it('does not clear a material&apos;s effects when saving the editor', async () => {
    // Effects are edited elsewhere; the update request must omit them rather
    // than send effects: null, which the server would read as "remove".
    const jelly = materialDto(1, 'Wobbly Jelly')
    jelly.effects = {
      version: 1,
      effects: [{ type: 'rim', color: '#ffffff', power: 3, intensity: 1 }],
    }
    mockGet.mockResolvedValue({ data: { materials: [jelly] } })

    const user = userEvent.setup()
    renderWithProviders(<MaterialList />)
    await screen.findByText('Wobbly Jelly')

    await user.click(screen.getByTestId('material-tile'))
    await user.click(screen.getByTestId('material-editor-save'))

    await waitFor(() => expect(mockPut).toHaveBeenCalled())

    const [url, body] = mockPut.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ]
    expect(url).toBe('/materials/1')
    expect(body).not.toHaveProperty('effects')
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

function dropdownPanel(): HTMLElement {
  // PrimeReact keeps a closed panel mounted until its exit transition ends, so
  // the open one is the most recently appended. Take the last.
  const panels = document.querySelectorAll('.p-dropdown-panel')
  const panel = panels[panels.length - 1]
  if (!panel) throw new Error('dropdown panel not open')
  return panel as HTMLElement
}

const jellyDocument = {
  version: 1 as const,
  effects: [
    {
      type: 'jelly_wobble' as const,
      amplitude: 0.03,
      frequency: 1.5,
      waveScale: 4,
      seed: 0,
    },
  ],
}

describe('MaterialList effects editor', () => {
  it('offers only the effect types not already present, and shows preview inputs with effects', async () => {
    // The add-effect list is a set of four one-shot types; re-offering one that
    // is already in the document would let the user build an invalid document.
    const wobbly = materialDto(1, 'Wobbly Jelly')
    wobbly.effects = jellyDocument
    mockGet.mockResolvedValue({ data: { materials: [wobbly] } })

    const user = userEvent.setup()
    renderWithProviders(<MaterialList />)
    await screen.findByText('Wobbly Jelly')
    await user.click(screen.getByTestId('material-tile'))

    expect(screen.getByTestId('material-preview-inputs')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('material-add-effect'))
    const panel = dropdownPanel()
    expect(within(panel).queryByText('Jelly wobble')).not.toBeInTheDocument()
    expect(within(panel).getByText('Rim glow')).toBeInTheDocument()
    expect(within(panel).getByText('Translucency')).toBeInTheDocument()
    expect(within(panel).getByText('Emission pulse')).toBeInTheDocument()
  })

  it('sends the full effects document when an effect is added, edited and driven', async () => {
    // The changed case: the payload must carry the whole document, including
    // the edited param and the driver binding, or the edit is silently lost.
    const user = userEvent.setup()
    renderWithProviders(<MaterialList />)
    await screen.findByText('Brushed Brass')
    await user.click(screen.getAllByTestId('material-tile')[0])

    expect(
      screen.queryByTestId('material-preview-inputs')
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('material-add-effect'))
    fireEvent.click(within(dropdownPanel()).getByText('Jelly wobble'))

    // One keyboard step on amplitude: 0.03 + 0.005.
    fireEvent.keyDown(
      within(screen.getByTestId('effect-jelly_wobble-amplitude-row')).getByRole(
        'slider'
      ),
      { key: 'ArrowRight' }
    )

    // Bind amplitude to speed. A fresh binding must carry a scale that already
    // moves the param: (0.5 - 0) * 0.5 / 20 = 0.0125.
    fireEvent.click(screen.getByTestId('effect-jelly_wobble-amplitude-driver'))
    fireEvent.click(within(dropdownPanel()).getByText('Speed'))
    expect(
      screen.getByTestId('effect-jelly_wobble-amplitude-scale')
    ).toHaveValue('0.0125')

    // Then set the per-unit scale by hand.
    fireEvent.change(
      screen.getByTestId('effect-jelly_wobble-amplitude-scale'),
      { target: { value: '0.02' } }
    )

    expect(screen.getByTestId('material-preview-inputs')).toBeInTheDocument()

    await user.click(screen.getByTestId('material-editor-save'))
    await waitFor(() => expect(mockPut).toHaveBeenCalled())

    const [, body] = mockPut.mock.calls.at(-1) as [
      string,
      {
        effects?: {
          version: number
          effects: Array<{
            type: string
            amplitude: number
            drivers?: Record<string, { input: string; scale: number }>
          }>
        }
        clearEffects?: boolean
      },
    ]

    expect(body).not.toHaveProperty('clearEffects')
    expect(body.effects?.version).toBe(1)
    const effects = body.effects?.effects ?? []
    expect(effects).toHaveLength(1)
    expect(effects[0].type).toBe('jelly_wobble')
    expect(effects[0].amplitude).toBeCloseTo(0.035)
    expect(effects[0].drivers?.amplitude).toEqual({
      input: 'speed',
      scale: 0.02,
    })
  })

  it('sends clearEffects when every stored effect is removed', async () => {
    // The cleared case: removing all the effects a material had is a delete,
    // not an "empty document" that leaves the stored shader in place.
    const wobbly = materialDto(1, 'Wobbly Jelly')
    wobbly.effects = jellyDocument
    mockGet.mockResolvedValue({ data: { materials: [wobbly] } })

    const user = userEvent.setup()
    renderWithProviders(<MaterialList />)
    await screen.findByText('Wobbly Jelly')
    await user.click(screen.getByTestId('material-tile'))

    await user.click(screen.getByTestId('material-effect-jelly_wobble-remove'))
    await user.click(screen.getByTestId('material-editor-save'))

    await waitFor(() => expect(mockPut).toHaveBeenCalled())
    const [, body] = mockPut.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ]
    expect(body.clearEffects).toBe(true)
    expect(body).not.toHaveProperty('effects')
  })
})
