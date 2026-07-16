/**
 * Import-flow orchestration tests: token → job start → polling to a
 * terminal state. Polling is the reliability backstop (demo mode and
 * dropped SignalR connections depend on it), so it gets tested as the
 * primary channel here.
 */
import { queryClient } from '@/lib/react-query'
import { useAssetStoreImportStore } from '@/stores/assetStoreImportStore'

import type { StoreImportJobDto, StoreLibraryItem } from '../../types'
import { startImport } from '../importController'

jest.mock('../../api/storeApi', () => ({
  mintImportToken: jest.fn(),
}))
jest.mock('../../api/importApi', () => ({
  startStoreImport: jest.fn(),
  getStoreImportJob: jest.fn(),
}))
jest.mock('../../services/storeImportSignalR', () => ({
  storeImportSignalRService: {
    joinJobGroup: jest.fn().mockRejectedValue(new Error('hub down')),
    onImportProgress: jest.fn(() => jest.fn()),
  },
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const storeApi = require('../../api/storeApi') as { mintImportToken: jest.Mock }
const importApi = require('../../api/importApi') as {
  startStoreImport: jest.Mock
  getStoreImportJob: jest.Mock
}
/* eslint-enable @typescript-eslint/no-require-imports */

const ITEM: StoreLibraryItem = {
  assetId: 'asset-1',
  title: 'Medieval Props',
  author: 'The Base Mesh',
  categoryName: 'Props',
  license: 'CC0',
  isPack: true,
  fileCount: 4,
  totalSize: 1234,
  previewThumbnailUrl: null,
  addedAt: 'now',
}

function jobDto(overrides: Partial<StoreImportJobDto>): StoreImportJobDto {
  return {
    id: 9,
    status: 'Running',
    packId: null,
    storeAssetId: 'asset-1',
    manifestSchemaVersion: 1,
    itemsTotal: 4,
    itemsCreated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
    resultJson: null,
    errorMessage: null,
    createdAt: 'now',
    updatedAt: 'now',
    completedAt: null,
    ...overrides,
  }
}

const entry = () => useAssetStoreImportStore.getState().imports['asset-1']

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  useAssetStoreImportStore.setState({ imports: {} })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('startImport', () => {
  // Regression: the whole point of the token flow — the LOCAL backend gets
  // the minted import token and the configured store URL, never the JWT.
  it('mints a token, starts the job, and polls it to completion', async () => {
    storeApi.mintImportToken.mockResolvedValue({
      token: 'tok-1',
      scheme: 'ImportToken',
      expiresAt: 'x',
    })
    importApi.startStoreImport.mockResolvedValue({ jobId: 9 })
    importApi.getStoreImportJob
      .mockResolvedValueOnce(jobDto({ itemsCreated: 2 }))
      .mockResolvedValueOnce(
        jobDto({ status: 'Completed', packId: 42, itemsCreated: 4 })
      )
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue()

    const run = startImport(ITEM)

    // Let mint + start settle, then walk the two poll ticks.
    await jest.advanceTimersByTimeAsync(0)
    expect(importApi.startStoreImport).toHaveBeenCalledWith({
      storeUrl: 'https://store.test',
      assetId: 'asset-1',
      importToken: 'tok-1',
    })
    expect(entry().phase).toBe('importing')

    await jest.advanceTimersByTimeAsync(2500)
    expect(entry()).toMatchObject({ phase: 'importing', itemsProcessed: 2 })

    await jest.advanceTimersByTimeAsync(2500)
    await run

    expect(entry()).toMatchObject({ phase: 'completed', packId: 42 })
    // Regression: without invalidation the imported pack only appears
    // after a manual reload — the "packs" list must refetch.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['packs'] })
    invalidateSpy.mockRestore()
  })

  it('marks the entry failed when token minting is rejected', async () => {
    storeApi.mintImportToken.mockRejectedValue(new Error('403 not entitled'))

    await startImport(ITEM)

    expect(entry()).toMatchObject({ phase: 'failed' })
    expect(importApi.startStoreImport).not.toHaveBeenCalled()
  })

  it('marks the entry failed when the local backend rejects the job', async () => {
    storeApi.mintImportToken.mockResolvedValue({ token: 'tok-1' })
    importApi.startStoreImport.mockRejectedValue(
      new Error('Store URL must use https')
    )

    await startImport(ITEM)

    expect(entry()).toMatchObject({
      phase: 'failed',
      error: 'Store URL must use https',
    })
  })

  // Regression: a single failed poll (backend restart, blip) used to be
  // able to kill progress tracking for a job that was still running.
  it('keeps polling through transient poll failures', async () => {
    storeApi.mintImportToken.mockResolvedValue({ token: 'tok-1' })
    importApi.startStoreImport.mockResolvedValue({ jobId: 9 })
    importApi.getStoreImportJob
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce(
        jobDto({ status: 'Completed', packId: 7, itemsCreated: 4 })
      )
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()

    const run = startImport(ITEM)
    await jest.advanceTimersByTimeAsync(0)
    await jest.advanceTimersByTimeAsync(2500)
    expect(entry().phase).toBe('importing')

    await jest.advanceTimersByTimeAsync(2500)
    await run

    expect(entry()).toMatchObject({ phase: 'completed', packId: 7 })
  })
})
