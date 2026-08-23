import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
