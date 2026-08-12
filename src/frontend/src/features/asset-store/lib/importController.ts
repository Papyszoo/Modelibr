import { queryClient } from '@/lib/react-query'
import { useAssetStoreImportStore } from '@/stores/assetStoreImportStore'

import { getStoreImportJob, startStoreImport } from '../api/importApi'
import { mintImportToken } from '../api/storeApi'
import { storeImportSignalRService } from '../services/storeImportSignalR'
import type { StoreImportJobDto, StoreLibraryItem } from '../types'
import { getConfiguredStoreUrl } from './storeConfig'

/**
 * Orchestrates one pack import: mint an import token on the store (browser →
 * store, JWT), hand it to the local backend (POST /store-imports), then track
 * the job - SignalR push for liveness plus polling as the reliable fallback
 * (demo mode and dropped hub connections still finish). All observable state
 * lands in useAssetStoreImportStore.
 */

const POLL_INTERVAL_MS = 2500
// Must cover every terminal StoreImportJobStatus the backend can persist.
// 'CompletedWithErrors' (any item failed) used to be missing here, which left the
// spinner up and the poll loop hammering the job endpoint forever.
const TERMINAL_STATUSES = new Set([
  'Completed',
  'CompletedWithErrors',
  'Failed',
])

// Every collection an import can add to - a finished import must refresh all of
// them, not just the pack list, or the new assets stay invisible until a manual
// refetch. Keys mirror the feature api/queries modules.
const IMPORT_TOUCHED_QUERY_KEYS = [
  ['packs'],
  ['models'],
  ['model-categories'],
  ['model-tags'],
  ['textureSets'],
  ['textureSetCategories'],
  ['sounds'],
  ['soundCategories'],
  ['sprites'],
  ['spriteCategories'],
  ['environmentMaps'],
  ['environment-map-categories'],
]

// One SignalR subscription feeds every running import.
let progressSubscribed = false

function ensureProgressSubscription(): void {
  if (progressSubscribed) return
  progressSubscribed = true
  storeImportSignalRService.onImportProgress(progress => {
    useAssetStoreImportStore.getState().applyProgress({
      ...progress,
      // On failure the hub's message carries the reason ("Import failed: …").
      errorMessage: progress.status === 'Failed' ? progress.message : null,
    })
    if (TERMINAL_STATUSES.has(progress.status)) {
      onImportFinished()
    }
  })
}

function onImportFinished(): void {
  // The import created/updated a pack and any of five asset types - refetch all
  // of them (a partial success still creates assets, so this runs for
  // CompletedWithErrors too).
  for (const queryKey of IMPORT_TOUCHED_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey })
  }
}

function applyJobSnapshot(job: StoreImportJobDto): void {
  useAssetStoreImportStore.getState().applyProgress({
    jobId: job.id,
    status: job.status,
    packId: job.packId,
    itemsTotal: job.itemsTotal,
    itemsProcessed: job.itemsCreated + job.itemsSkipped + job.itemsFailed,
    itemsFailed: job.itemsFailed,
    errorMessage: job.errorMessage,
  })
}

async function pollUntilDone(assetId: string, jobId: number): Promise<void> {
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))

    const entry = useAssetStoreImportStore.getState().imports[assetId]
    // Entry cleared (re-import restarted) or already terminal via SignalR.
    if (!entry || entry.jobId !== jobId) return
    if (entry.phase === 'completed' || entry.phase === 'failed') return

    try {
      const job = await getStoreImportJob(jobId)
      applyJobSnapshot(job)
      if (TERMINAL_STATUSES.has(job.status)) {
        onImportFinished()
        return
      }
    } catch {
      // Transient poll failure - keep trying; SignalR may still deliver.
    }
  }
}

/**
 * Starts (or re-runs) the import of a store library item. Pass `selectedItemIds`
 * to import only specific pack items; omit to import the whole pack. Errors
 * surface in the import store, not as a rejection.
 */
export async function startImport(
  item: StoreLibraryItem,
  selectedItemIds?: string[]
): Promise<void> {
  const storeUrl = getConfiguredStoreUrl()
  const importStore = useAssetStoreImportStore.getState()

  if (!storeUrl) {
    importStore.markFailed(item.assetId, 'Store URL is not configured.')
    return
  }

  importStore.beginImport(item.assetId)

  let jobId: number
  try {
    const minted = await mintImportToken(item.assetId)
    useAssetStoreImportStore.getState().markStarting(item.assetId)
    const started = await startStoreImport({
      storeUrl,
      assetId: item.assetId,
      importToken: minted.token,
      selectedItemIds,
    })
    jobId = started.jobId
    useAssetStoreImportStore.getState().markStarted(item.assetId, jobId)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to start the import.'
    useAssetStoreImportStore.getState().markFailed(item.assetId, message)
    return
  }

  // Live progress is best-effort; polling is the guarantee. Start polling
  // BEFORE awaiting the hub join - a slow or failing SignalR connect (demo
  // mode, hub down) must never delay the progress the poll loop provides.
  ensureProgressSubscription()
  const polling = pollUntilDone(item.assetId, jobId)
  try {
    await storeImportSignalRService.joinJobGroup(jobId)
  } catch {
    // Hub unavailable (e.g. demo mode) - polling carries the job.
  }

  await polling
}
