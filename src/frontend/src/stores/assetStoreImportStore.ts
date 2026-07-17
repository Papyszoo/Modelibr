import { create } from 'zustand'

/**
 * Per-asset state of running/finished store imports. Kept in a store (not
 * component state) so progress survives tab switches; the import controller
 * (features/asset-store) writes here from SignalR events and job polling.
 */

export type AssetStoreImportPhase =
  | 'requestingToken'
  | 'starting'
  | 'importing'
  | 'completed'
  | 'failed'

export interface AssetStoreImportEntry {
  assetId: string
  phase: AssetStoreImportPhase
  jobId: number | null
  itemsTotal: number
  itemsProcessed: number
  itemsFailed: number
  packId: number | null
  error: string | null
}

interface AssetStoreImportState {
  imports: Record<string, AssetStoreImportEntry>
  beginImport: (assetId: string) => void
  markStarting: (assetId: string) => void
  markStarted: (assetId: string, jobId: number) => void
  applyProgress: (progress: {
    jobId: number
    status: string
    packId: number | null
    itemsTotal: number
    itemsProcessed: number
    itemsFailed: number
    /** Backend failure reason (job errorMessage / hub message) — shown on the Failed chip. */
    errorMessage?: string | null
  }) => void
  markFailed: (assetId: string, error: string) => void
  clearImport: (assetId: string) => void
}

const TERMINAL_PHASES: AssetStoreImportPhase[] = ['completed', 'failed']

function newEntry(assetId: string): AssetStoreImportEntry {
  return {
    assetId,
    phase: 'requestingToken',
    jobId: null,
    itemsTotal: 0,
    itemsProcessed: 0,
    itemsFailed: 0,
    packId: null,
    error: null,
  }
}

/** Maps a backend job status (SignalR/DTO) onto the UI phase. */
function phaseForStatus(status: string): AssetStoreImportPhase {
  switch (status) {
    case 'Completed':
      return 'completed'
    case 'Failed':
      return 'failed'
    default:
      return 'importing'
  }
}

export const useAssetStoreImportStore = create<AssetStoreImportState>(
  (set, get) => ({
    imports: {},

    beginImport: assetId =>
      set(state => ({
        imports: { ...state.imports, [assetId]: newEntry(assetId) },
      })),

    markStarting: assetId =>
      set(state => {
        const entry = state.imports[assetId]
        if (!entry) return state
        return {
          imports: {
            ...state.imports,
            [assetId]: { ...entry, phase: 'starting' },
          },
        }
      }),

    markStarted: (assetId, jobId) =>
      set(state => {
        const entry = state.imports[assetId]
        if (!entry) return state
        return {
          imports: {
            ...state.imports,
            [assetId]: { ...entry, phase: 'importing', jobId },
          },
        }
      }),

    applyProgress: progress => {
      const state = get()
      const entry = Object.values(state.imports).find(
        e => e.jobId === progress.jobId
      )
      if (!entry) return
      // Terminal states are sticky — a late/out-of-order progress event
      // (poll vs SignalR race) must not un-complete an import.
      if (TERMINAL_PHASES.includes(entry.phase)) return

      const phase = phaseForStatus(progress.status)
      set(s => ({
        imports: {
          ...s.imports,
          [entry.assetId]: {
            ...entry,
            phase,
            itemsTotal: progress.itemsTotal,
            itemsProcessed: progress.itemsProcessed,
            itemsFailed: progress.itemsFailed,
            packId: progress.packId ?? entry.packId,
            error:
              phase === 'failed'
                ? (progress.errorMessage ?? entry.error ?? 'Import failed')
                : null,
          },
        },
      }))
    },

    markFailed: (assetId, error) =>
      set(state => {
        const entry = state.imports[assetId] ?? newEntry(assetId)
        return {
          imports: {
            ...state.imports,
            [assetId]: { ...entry, phase: 'failed', error },
          },
        }
      }),

    clearImport: assetId =>
      set(state => {
        if (!state.imports[assetId]) return state
        const imports = { ...state.imports }
        delete imports[assetId]
        return { imports }
      }),
  })
)
