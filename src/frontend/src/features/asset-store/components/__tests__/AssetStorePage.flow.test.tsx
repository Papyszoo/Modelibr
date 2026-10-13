/**
 * Asset Store page flow tests for the signed-out experience: browse the
 * public catalog, import a FREE pack anonymously, and surface sign-in only
 * where an account is needed. Regression these catch: the page used to render
 * the login form INSTEAD of any store content for signed-out users, so free
 * packs could not be browsed or imported in the UI at all; and the import
 * controller minted a store token before every import, which a signed-out user
 * cannot do.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { client } from '@/lib/apiBase'
import { renderWithProviders } from '@/test/renderWithProviders'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'
import { useAssetStoreImportStore } from '@/stores/assetStoreImportStore'

import { storeClient } from '../../api/storeApi'
import { AssetStorePage } from '../AssetStorePage'

jest.mock('../../services/storeImportSignalR', () => ({
  storeImportSignalRService: {
    joinJobGroup: jest.fn().mockResolvedValue(undefined),
    onImportProgress: jest.fn(() => jest.fn()),
  },
}))

const storeGet = storeClient.get as jest.Mock
const storePost = storeClient.post as jest.Mock
const clientGet = client.get as jest.Mock
const clientPost = client.post as jest.Mock

const CATALOG_ASSET_ID = '3b1a2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

/** A public-catalog page as the store serializes it (wire shape). */
function catalogPage(price: number, title: string) {
  return {
    items: [
      {
        id: CATALOG_ASSET_ID,
        title,
        author: 'E2E Fixture',
        thumbnailUrl: null,
        itemTypes: ['Model'],
        isPack: true,
        itemCount: 1,
        fileSize: 1024,
        license: 'CC0',
        price,
      },
    ],
    page: 1,
    pageSize: 48,
    totalCount: 1,
    totalPages: 1,
  }
}

/** The public catalog detail - no per-item fileIds (anonymous shape). */
const catalogDetail = {
  id: CATALOG_ASSET_ID,
  title: 'E2E Catalog Pack',
  author: 'E2E Fixture',
  isPack: true,
  files: [],
  items: [
    {
      id: 'item-1',
      itemType: 'Model',
      name: 'E2E Catalog Cube',
      isPreviewable: true,
    },
  ],
  previews: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  useAssetStoreAuthStore.getState().clearSession()
  useAssetStoreImportStore.setState({ imports: {} })

  storeGet.mockImplementation(async (url: string) => {
    if (url === '/api/assets') {
      return { data: catalogPage(0, 'E2E Catalog Pack') }
    }
    if (url === `/api/assets/${CATALOG_ASSET_ID}`) {
      return { data: catalogDetail }
    }
    throw new Error(`Unexpected store GET ${url}`)
  })

  // The local backend: pack list (for the imported chip) and the import job.
  clientGet.mockImplementation(async (url: string) => {
    if (url === '/packs') return { data: { packs: [] } }
    if (url.startsWith('/store-imports/')) {
      return {
        data: {
          id: 7,
          status: 'Running',
          packId: null,
          storeAssetId: CATALOG_ASSET_ID,
          manifestSchemaVersion: 1,
          itemsTotal: 1,
          itemsCreated: 0,
          itemsSkipped: 0,
          itemsFailed: 0,
          resultJson: null,
          errorMessage: null,
          createdAt: 'now',
          updatedAt: 'now',
          completedAt: null,
        },
      }
    }
    throw new Error(`Unexpected local GET ${url}`)
  })
  clientPost.mockResolvedValue({ data: { jobId: 7 } })
})

describe('AssetStorePage signed out', () => {
  it('browses the public catalog instead of forcing a sign-in', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AssetStorePage />)

    expect(
      await screen.findByRole('button', { name: /E2E Catalog Pack/ })
    ).toBeInTheDocument()
    expect(screen.queryByTestId('asset-store-login')).not.toBeInTheDocument()
    expect(storeGet).toHaveBeenCalledWith('/api/assets', {
      params: { page: 1, pageSize: 48 },
    })

    // The library endpoint is account-scoped - it must not be called.
    expect(storeGet).not.toHaveBeenCalledWith('/api/library', expect.anything())

    // Sign-in stays one click away.
    await user.click(screen.getByTestId('asset-store-sign-in'))
    expect(await screen.findByTestId('asset-store-login')).toBeInTheDocument()

    await user.click(screen.getByTestId('asset-store-login-back'))
    expect(
      await screen.findByRole('button', { name: /E2E Catalog Pack/ })
    ).toBeInTheDocument()
  })

  it('imports a free pack anonymously - no store token is minted or sent', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AssetStorePage />)

    await user.click(
      await screen.findByRole('button', { name: /E2E Catalog Pack/ })
    )
    await screen.findByTestId('asset-store-detail')
    await user.click(await screen.findByTestId('asset-store-detail-import'))

    await waitFor(() => expect(clientPost).toHaveBeenCalled())
    const body = clientPost.mock.calls.find(
      ([url]) => url === '/store-imports'
    )?.[1] as { assetId: string; importToken?: string }
    expect(body.assetId).toBe(CATALOG_ASSET_ID)
    expect(body.importToken).toBeUndefined()
    // The mint endpoint needs a store account - an anonymous import must not
    // touch it.
    expect(storePost).not.toHaveBeenCalled()
  })

  it('asks for an account on a paid pack instead of offering an import', async () => {
    storeGet.mockImplementation(async (url: string) => {
      if (url === '/api/assets') {
        return { data: catalogPage(9.99, 'Premium Pack') }
      }
      if (url === `/api/assets/${CATALOG_ASSET_ID}`) {
        return { data: { ...catalogDetail, title: 'Premium Pack' } }
      }
      throw new Error(`Unexpected store GET ${url}`)
    })

    const user = userEvent.setup()
    renderWithProviders(<AssetStorePage />)

    await user.click(
      await screen.findByRole('button', { name: /Premium Pack/ })
    )
    await screen.findByTestId('asset-store-detail')

    expect(
      screen.queryByTestId('asset-store-detail-import')
    ).not.toBeInTheDocument()
    await user.click(screen.getByTestId('asset-store-detail-sign-in'))
    expect(await screen.findByTestId('asset-store-login')).toBeInTheDocument()
  })
})

describe('AssetStorePage signed in', () => {
  it('shows the account library and never queries the public catalog', async () => {
    useAssetStoreAuthStore.getState().setSession({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      username: 'artist',
    })
    storeGet.mockImplementation(async (url: string) => {
      if (url === '/api/library') {
        return {
          data: {
            items: [
              {
                assetId: 'library-pack-1',
                title: 'My Library Pack',
                author: 'Artist',
                itemTypes: ['Model'],
                license: 'CC0',
                isPack: true,
                fileCount: 1,
                totalSize: 100,
                previewThumbnailUrl: null,
                addedAt: 'now',
              },
            ],
            page: 1,
            pageSize: 48,
            totalCount: 1,
            totalPages: 1,
          },
        }
      }
      throw new Error(`Unexpected store GET ${url}`)
    })

    renderWithProviders(<AssetStorePage />)

    expect(
      await screen.findByRole('button', { name: /My Library Pack/ })
    ).toBeInTheDocument()
    expect(storeGet).not.toHaveBeenCalledWith('/api/assets', expect.anything())
    expect(screen.queryByTestId('asset-store-sign-in')).not.toBeInTheDocument()
  })
})
