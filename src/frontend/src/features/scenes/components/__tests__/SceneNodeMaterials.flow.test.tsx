import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { MaterialLibraryEntryDto } from '@/features/materials/api/materialApi'
import { client } from '@/lib/apiBase'
import { renderWithProviders } from '@/test/renderWithProviders'

import type { SceneNode } from '../../types'
import { SceneNodeMaterials } from '../SceneNodeMaterials'

const mockGet = client.get as jest.Mock

function node(overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: 'sofa',
    name: 'Sofa',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    asset: { assetType: 'Model', assetId: 12, versionId: 34 },
    visible: true,
    ...overrides,
  }
}

const brass: MaterialLibraryEntryDto = {
  kind: 'Material',
  id: 7,
  name: 'Brushed Brass',
  description: null,
  categoryId: null,
  categoryName: null,
  requiresUvs: false,
  previewGeometryType: 'sphere',
  hasThumbnail: false,
  tiling: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  parameters: {
    baseColorR: 0.5,
    baseColorG: 0.4,
    baseColorB: 0.1,
    baseColorA: 1,
    baseColorHex: '#b5892a',
    roughness: 0.35,
    metallic: 1,
    emissiveR: 0,
    emissiveG: 0,
    emissiveB: 0,
    normalScale: 1,
    occlusionStrength: 1,
    ior: 1.5,
    alphaMode: 'Opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
  },
}

/** A Universal texture set, which reaches this surface through the union. */
const oak: MaterialLibraryEntryDto = {
  ...brass,
  kind: 'GlobalMaterial',
  id: 3,
  name: 'Oak Planks',
  requiresUvs: true,
  hasThumbnail: false,
  parameters: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/materials/library')) {
      const entries = url.includes('searchName=oak') ? [oak] : [brass, oak]
      return Promise.resolve({
        data: {
          entries,
          totalCount: entries.length,
          page: 1,
          pageSize: 60,
          totalPages: 1,
        },
      })
    }

    if (url.includes('/models/12/versions')) {
      return Promise.resolve({
        data: [{ id: 34, materialNames: ['Frame', 'Cushions'], files: [] }],
      })
    }

    return Promise.resolve({ data: {} })
  })
})

describe('SceneNodeMaterials', () => {
  it("offers a row per the model's material slots, plus the default", async () => {
    renderWithProviders(
      <SceneNodeMaterials
        node={node()}
        dressing={undefined}
        onBind={jest.fn()}
      />
    )

    expect(await screen.findByText('Frame')).toBeInTheDocument()
    expect(screen.getByText('Cushions')).toBeInTheDocument()
    // The default binding is a row of its own: it dresses every slot no
    // override names, which is how a model with no declared slots is dressed
    // at all.
    expect(screen.getByText('Every slot')).toBeInTheDocument()
  })

  it('lists a slot nothing declares any more when something is bound to it', async () => {
    // An agent can dress a slot a later model version renamed away. Hiding the
    // row would leave a binding the user can see in the viewport and has no
    // way to remove.
    renderWithProviders(
      <SceneNodeMaterials
        node={node({ materialSlots: [{ materialId: 7, slot: 'Legs' }] })}
        dressing={undefined}
        onBind={jest.fn()}
      />
    )

    expect(await screen.findByText('Legs')).toBeInTheDocument()
  })

  it('picks from the merged library, not from either page endpoint', async () => {
    // This surface is the whole reason /materials/library exists: filling a
    // slot is the one place a texture set and a parameter material are the
    // same kind of answer. Pointing it at /materials would silently drop every
    // global material from the picker.
    const user = userEvent.setup()
    renderWithProviders(
      <SceneNodeMaterials
        node={node()}
        dressing={undefined}
        onBind={jest.fn()}
      />
    )

    await user.click(await screen.findByTestId('scene-node-materials-pick-'))

    expect(await screen.findByText('Brushed Brass')).toBeInTheDocument()
    expect(screen.getByText('Oak Planks')).toBeInTheDocument()
    // The e2e page object scopes its entry locator to this container; the
    // picker is a PrimeReact dialog, so the testid has to survive that wrapper.
    expect(screen.getByTestId('scene-material-picker')).toBeInTheDocument()

    const libraryCalls = mockGet.mock.calls
      .map(call => String(call[0]))
      .filter(url => url.includes('/materials'))
    expect(libraryCalls.length).toBeGreaterThan(0)
    for (const url of libraryCalls) {
      expect(url).toContain('/materials/library')
    }
  })

  it('tells the two kinds apart in the picker', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <SceneNodeMaterials
        node={node()}
        dressing={undefined}
        onBind={jest.fn()}
      />
    )

    await user.click(await screen.findByTestId('scene-node-materials-pick-'))
    await screen.findByText('Brushed Brass')

    expect(screen.getByText('PBR')).toBeInTheDocument()
    // Only a texture set needs UVs, and that is the one difference worth
    // acting on when choosing between them.
    expect(screen.getByText(/Textures · needs UVs/)).toBeInTheDocument()
  })

  it('binds a texture set by textureSetId alone', async () => {
    // The server rejects a binding naming both ids as ambiguous rather than
    // resolving it, so the picker must never build one.
    const onBind = jest.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <SceneNodeMaterials node={node()} dressing={undefined} onBind={onBind} />
    )

    await user.click(await screen.findByTestId('scene-node-materials-pick-'))
    await user.click(await screen.findByText('Oak Planks'))

    expect(onBind).toHaveBeenCalledWith(null, { textureSetId: 3 })
  })

  it('binds a parameter material to the named slot it was opened from', async () => {
    const onBind = jest.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <SceneNodeMaterials node={node()} dressing={undefined} onBind={onBind} />
    )

    await user.click(
      await screen.findByTestId('scene-node-materials-pick-Cushions')
    )
    await user.click(await screen.findByText('Brushed Brass'))

    expect(onBind).toHaveBeenCalledWith('Cushions', { materialId: 7 })
  })

  it('offers a clear only where something is bound', async () => {
    const onBind = jest.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <SceneNodeMaterials
        node={node({ material: { materialId: 7 } })}
        dressing={{
          textureSets: {},
          materials: {
            '': {
              id: 7,
              name: 'Brushed Brass',
              description: null,
              categoryId: null,
              categoryName: null,
              previewGeometryType: 'sphere',
              requiresUvs: false,
              tags: [],
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
              parameters: brass.parameters!,
            },
          },
        }}
        onBind={onBind}
      />
    )

    expect(await screen.findByText('Brushed Brass')).toBeInTheDocument()
    expect(
      screen.queryByTestId('scene-node-materials-clear-Frame')
    ).not.toBeInTheDocument()

    await user.click(screen.getByTestId('scene-node-materials-clear-'))
    expect(onBind).toHaveBeenCalledWith(null, null)
  })

  it('names a slot binding whose case differs from the declared slot', async () => {
    // The row is labelled from the model's declared name; the dressing map is
    // keyed by the label the binding carries. When a scene was written with a
    // different case, looking up by the row's label finds nothing and the row
    // falls back to "Material 7" - a bound material that reads as unresolved.
    renderWithProviders(
      <SceneNodeMaterials
        node={node({ materialSlots: [{ materialId: 7, slot: 'cushions' }] })}
        dressing={{
          textureSets: {},
          materials: {
            cushions: {
              id: 7,
              name: 'Brushed Brass',
              description: null,
              categoryId: null,
              categoryName: null,
              previewGeometryType: 'sphere',
              requiresUvs: false,
              tags: [],
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
              parameters: brass.parameters!,
            },
          },
        }}
        onBind={jest.fn()}
      />
    )

    // 'Cushions' is what the model declares; 'cushions' is what the binding
    // stored. The panel must still name the material.
    expect(await screen.findByText('Cushions')).toBeInTheDocument()
    expect(screen.getByText('Brushed Brass')).toBeInTheDocument()
  })

  it('does not offer a picker for a blockout primitive', async () => {
    // Primitives are drawn from three.js geometry that the dressing path never
    // touches, so a control here would change the document and nothing else.
    renderWithProviders(
      <SceneNodeMaterials
        node={node({ asset: null, primitive: { shape: 'box' } })}
        dressing={undefined}
        onBind={jest.fn()}
      />
    )

    await waitFor(() =>
      expect(screen.getByText(/Blockout shapes/)).toBeInTheDocument()
    )
    expect(
      screen.queryByTestId('scene-node-materials-pick-')
    ).not.toBeInTheDocument()
  })
})
