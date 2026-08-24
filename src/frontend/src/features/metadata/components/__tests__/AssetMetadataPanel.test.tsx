import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { client } from '@/lib/apiBase'
import { renderWithProviders } from '@/test/renderWithProviders'

import * as metadataApi from '../../api/metadataApi'
import type {
  AssetMetadataField,
  AssetMetadataResponse,
  AssetMetadataValue,
} from '../../types'
import { AssetMetadataPanel } from '../AssetMetadataPanel'

jest.mock('../../api/metadataApi')

const api = metadataApi as jest.Mocked<typeof metadataApi>

// The picker's options come from each family's own api module, which talks to
// the shared axios client - so the URL it asks for is the assertion that matters.
const mockGet = client.get as jest.Mock
const requested: string[] = []

function field(
  overrides: Partial<AssetMetadataField> = {}
): AssetMetadataField {
  return {
    key: 'description',
    label: 'Description',
    group: 'descriptive',
    type: 'multiline',
    provenance: 'authored',
    storage: 'entity',
    repeats: false,
    readOnly: false,
    ...overrides,
  }
}

function value(
  overrides: Partial<AssetMetadataValue> = {}
): AssetMetadataValue {
  return {
    key: 'description',
    group: 'descriptive',
    type: 'multiline',
    repeats: false,
    readOnly: false,
    provenance: 'authored',
    storage: 'entity',
    value: null,
    ...overrides,
  }
}

function response(
  overrides: Partial<AssetMetadataResponse> = {}
): AssetMetadataResponse {
  return {
    assetType: 'Model',
    assetId: 7,
    name: 'Oak crate',
    schemaVersion: 1,
    currentSchemaVersion: 1,
    fields: [value()],
    completeness: {
      fillableFieldCount: 4,
      filledFieldCount: 1,
      missingKeys: ['license', 'author', 'styles'],
    },
    ...overrides,
  }
}

describe('AssetMetadataPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.getAssetMetadataSchema.mockResolvedValue({
      version: 1,
      families: [{ assetType: 'Model', fields: [field()] }],
    })
    api.getAssetMetadata.mockResolvedValue(response())
    api.setAssetMetadata.mockResolvedValue(response())
  })

  const render = () =>
    renderWithProviders(<AssetMetadataPanel assetType="Model" assetId={7} />)

  it('sends only the fields that changed', async () => {
    // A blanket replace would let opening and saving this panel overwrite what
    // an agent wrote in between.
    api.getAssetMetadataSchema.mockResolvedValue({
      version: 1,
      families: [
        {
          assetType: 'Model',
          fields: [
            field(),
            field({
              key: 'author',
              label: 'Author',
              group: 'rights',
              type: 'text',
            }),
          ],
        },
      ],
    })

    render()

    await userEvent.type(await screen.findByLabelText('Description'), 'A crate')
    await userEvent.click(screen.getByTestId('asset-metadata-save'))

    await waitFor(() => expect(api.setAssetMetadata).toHaveBeenCalled())
    expect(api.setAssetMetadata).toHaveBeenCalledWith('Model', 7, {
      description: 'A crate',
    })
  })

  it('clears a field with null rather than an empty string', async () => {
    // Empty string and "no value" are different stored things, and only one of
    // them is what the patch contract clears with.
    api.getAssetMetadata.mockResolvedValue(
      response({ fields: [value({ value: 'A crate' })] })
    )

    render()

    await userEvent.clear(await screen.findByLabelText('Description'))
    await userEvent.click(screen.getByTestId('asset-metadata-save'))

    await waitFor(() => expect(api.setAssetMetadata).toHaveBeenCalled())
    expect(api.setAssetMetadata).toHaveBeenCalledWith('Model', 7, {
      description: null,
    })
  })

  it('shows a read-only field with where its value came from', async () => {
    // Hiding it would make a store import look like an asset nobody knows
    // anything about.
    api.getAssetMetadataSchema.mockResolvedValue({
      version: 1,
      families: [
        {
          assetType: 'Model',
          fields: [
            field({
              key: 'storeItemId',
              label: 'Store item id',
              group: 'provenance',
              type: 'text',
              provenance: 'imported',
              readOnly: true,
            }),
          ],
        },
      ],
    })
    api.getAssetMetadata.mockResolvedValue(
      response({
        fields: [
          value({
            key: 'storeItemId',
            group: 'provenance',
            type: 'text',
            readOnly: true,
            provenance: 'imported',
            value: 'abc-123',
          }),
        ],
      })
    )

    render()

    expect(await screen.findByLabelText(/Store item id/)).toBeDisabled()
    expect(await screen.findByLabelText(/Store item id/)).toHaveValue('abc-123')
    expect(screen.getByText('imported')).toBeInTheDocument()
  })

  it('counts completeness over what a person could fill', async () => {
    render()

    expect(
      await screen.findByTestId('asset-metadata-completeness')
    ).toHaveTextContent('1 of 4 fields filled')
    expect(
      screen.getByText(/missing: license, author, styles/)
    ).toBeInTheDocument()
  })

  it('will not save until something changes', async () => {
    render()

    expect(await screen.findByTestId('asset-metadata-save')).toBeDisabled()
  })

  it('offers only the schema vocabulary for an enum list', async () => {
    // A value outside it is one no search filter will ever match.
    api.getAssetMetadataSchema.mockResolvedValue({
      version: 1,
      families: [
        {
          assetType: 'Model',
          fields: [
            field({
              key: 'styles',
              label: 'Styles',
              group: 'descriptive',
              type: 'enum',
              repeats: true,
              allowedValues: ['Low Poly', 'Realistic'],
            }),
          ],
        },
      ],
    })

    render()

    const input = await screen.findByTestId('metadata-styles')
    await userEvent.type(input, 'Voxel{Enter}')
    await userEvent.type(input, 'Low Poly{Enter}')
    await userEvent.click(screen.getByTestId('asset-metadata-save'))

    await waitFor(() => expect(api.setAssetMetadata).toHaveBeenCalled())
    expect(api.setAssetMetadata).toHaveBeenCalledWith('Model', 7, {
      styles: ['Low Poly'],
    })
  })
})

/**
 * The category picker, which is the one field whose value has two shapes and
 * whose option list lives in another feature's tree.
 *
 * Two things were wrong before: the panel asked for the tree without saying
 * which KIND, and the texture-set endpoint binds a missing kind to
 * ModelSpecific rather than rejecting it - so a Material (Universal only) and a
 * Universal texture set both silently got the wrong half of the tree. And the
 * picker owned its own query key, so nothing that edited a category refreshed it.
 */
describe('AssetMetadataPanel - the category picker', () => {
  const categoryField = (family: string) =>
    field({
      key: 'category',
      label: 'Category',
      group: 'classification',
      type: 'categoryRef',
      categoryFamily: family,
    })

  const categoryValue = (current: unknown) =>
    value({
      key: 'category',
      group: 'classification',
      type: 'categoryRef',
      value: current,
    })

  function setup({
    assetType,
    categoryFamily = assetType,
    categoryKind = null,
    current = null,
  }: {
    assetType: string
    categoryFamily?: string
    categoryKind?: string | null
    current?: unknown
  }) {
    api.getAssetMetadataSchema.mockResolvedValue({
      version: 1,
      families: [{ assetType, fields: [categoryField(categoryFamily)] }],
    })
    api.getAssetMetadata.mockResolvedValue(
      response({
        assetType,
        fields: [categoryValue(current)],
        categoryKind,
      })
    )
    api.setAssetMetadata.mockResolvedValue(
      response({ assetType, fields: [categoryValue(current)] })
    )

    return renderWithProviders(
      <AssetMetadataPanel assetType={assetType} assetId={7} />
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGet.mockImplementation((url: string) => {
      requested.push(url)
      return Promise.resolve({
        data: {
          categories: [
            { id: 3, name: 'Props', parentId: null, path: 'Props' },
            {
              id: 4,
              name: 'Furniture',
              parentId: 3,
              path: 'Props / Furniture',
            },
          ],
        },
      })
    })
    requested.length = 0
  })

  it('reads a Model category from the model tree', async () => {
    setup({ assetType: 'Model' })

    await screen.findByTestId('metadata-category-category')

    await waitFor(() => expect(requested).toContain('/model-categories'))
  })

  it('reads a Material category from the UNIVERSAL half of the texture-set tree', async () => {
    // Materials use the shared Universal vocabulary and only that one. Asking
    // without a kind returned ModelSpecific, because the endpoint binds a
    // missing enum to its zero value rather than refusing.
    setup({ assetType: 'Material', categoryKind: 'Universal' })

    await screen.findByTestId('metadata-category-category')

    await waitFor(() =>
      expect(requested).toContain('/texture-set-categories?kind=1')
    )
  })

  it('reads a Universal texture set category from the Universal half', async () => {
    setup({ assetType: 'TextureSet', categoryKind: 'Universal' })

    await screen.findByTestId('metadata-category-category')

    await waitFor(() =>
      expect(requested).toContain('/texture-set-categories?kind=1')
    )
  })

  it('reads a ModelSpecific texture set category from the ModelSpecific half', async () => {
    // The half that differs BETWEEN two assets of the same family, which is why
    // the kind comes from the asset's metadata rather than from the schema.
    setup({ assetType: 'TextureSet', categoryKind: 'ModelSpecific' })

    await screen.findByTestId('metadata-category-category')

    await waitFor(() =>
      expect(requested).toContain('/texture-set-categories?kind=0')
    )
  })

  it('shares the family category query key, so editing a category refreshes the picker', async () => {
    // Not a key of its own: creating, renaming, moving or deleting a category
    // invalidates the family's key, and a picker keyed elsewhere would go on
    // offering the tree as it was when the panel opened.
    const { queryClient } = setup({ assetType: 'Model' })

    await screen.findByTestId('metadata-category-category')
    await waitFor(() => expect(requested).toContain('/model-categories'))

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['model-categories'] })
    })

    await waitFor(() =>
      expect(requested.filter(u => u === '/model-categories')).toHaveLength(2)
    )
  })

  it('writes the bare id the patch contract accepts, not the object it reads back', async () => {
    setup({ assetType: 'Model' })

    const select = await screen.findByTestId('metadata-category-category')
    await userEvent.selectOptions(select, '4')
    await userEvent.click(screen.getByTestId('asset-metadata-save'))

    await waitFor(() => expect(api.setAssetMetadata).toHaveBeenCalled())
    expect(api.setAssetMetadata).toHaveBeenCalledWith('Model', 7, {
      category: 4,
    })
  })

  it('keeps a category the tree no longer offers selectable', async () => {
    // Otherwise opening the panel on such an asset silently re-points it at
    // nothing the moment anything else is saved.
    setup({
      assetType: 'Model',
      current: { id: 99, name: 'Retired' },
    })

    const select = (await screen.findByTestId(
      'metadata-category-category'
    )) as HTMLSelectElement

    expect(select.value).toBe('99')
    expect(screen.getByRole('option', { name: 'Retired' })).toBeInTheDocument()
  })

  it('clears the field as null rather than an empty string', async () => {
    setup({ assetType: 'Model', current: { id: 3, name: 'Props' } })

    const select = await screen.findByTestId('metadata-category-category')
    await userEvent.selectOptions(select, '')
    await userEvent.click(screen.getByTestId('asset-metadata-save'))

    await waitFor(() => expect(api.setAssetMetadata).toHaveBeenCalled())
    expect(api.setAssetMetadata).toHaveBeenCalledWith('Model', 7, {
      category: null,
    })
  })
})
