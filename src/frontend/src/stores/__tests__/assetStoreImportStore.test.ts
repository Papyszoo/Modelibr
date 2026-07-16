/**
 * State-machine tests for the per-asset import tracker. Progress arrives
 * from two independent channels (SignalR push + job polling) — these pin
 * the ordering rules that keep the UI honest when they race.
 */
import { useAssetStoreImportStore } from '../assetStoreImportStore'

const store = () => useAssetStoreImportStore.getState()

beforeEach(() => {
  useAssetStoreImportStore.setState({ imports: {} })
})

function startedImport(assetId: string, jobId: number) {
  store().beginImport(assetId)
  store().markStarting(assetId)
  store().markStarted(assetId, jobId)
}

describe('assetStoreImportStore', () => {
  it('walks requestingToken → starting → importing as the import starts', () => {
    store().beginImport('a1')
    expect(store().imports['a1'].phase).toBe('requestingToken')
    store().markStarting('a1')
    expect(store().imports['a1'].phase).toBe('starting')
    store().markStarted('a1', 7)
    expect(store().imports['a1']).toMatchObject({
      phase: 'importing',
      jobId: 7,
    })
  })

  // Regression: progress events carry only the jobId — routing by assetId
  // (or applying to the wrong entry) would show pack A's progress on pack B
  // when two imports run at once.
  it('routes progress to the entry with the matching jobId', () => {
    startedImport('a1', 7)
    startedImport('a2', 8)

    store().applyProgress({
      jobId: 8,
      status: 'Running',
      packId: null,
      itemsTotal: 10,
      itemsProcessed: 4,
      itemsFailed: 0,
    })

    expect(store().imports['a2'].itemsProcessed).toBe(4)
    expect(store().imports['a1'].itemsProcessed).toBe(0)
  })

  it('marks the entry completed with its packId on a Completed status', () => {
    startedImport('a1', 7)
    store().applyProgress({
      jobId: 7,
      status: 'Completed',
      packId: 42,
      itemsTotal: 5,
      itemsProcessed: 5,
      itemsFailed: 0,
    })
    expect(store().imports['a1']).toMatchObject({
      phase: 'completed',
      packId: 42,
    })
  })

  // Regression: SignalR and the poll loop race — a stale "Running" snapshot
  // arriving after "Completed" must not un-complete the import (the "Open in
  // library" button would flicker back to a spinner forever).
  it('keeps terminal phases sticky against late progress events', () => {
    startedImport('a1', 7)
    store().applyProgress({
      jobId: 7,
      status: 'Completed',
      packId: 42,
      itemsTotal: 5,
      itemsProcessed: 5,
      itemsFailed: 0,
    })
    store().applyProgress({
      jobId: 7,
      status: 'Running',
      packId: null,
      itemsTotal: 5,
      itemsProcessed: 3,
      itemsFailed: 0,
    })
    expect(store().imports['a1']).toMatchObject({
      phase: 'completed',
      packId: 42,
    })
  })

  it('records a failure reason for entries that never got a job', () => {
    store().beginImport('a1')
    store().markFailed('a1', 'token minting failed')
    expect(store().imports['a1']).toMatchObject({
      phase: 'failed',
      error: 'token minting failed',
    })
  })

  // Regression: a re-import starts with beginImport — if the old terminal
  // entry survived, the sticky-terminal rule above would block all progress
  // of the new run.
  it('beginImport resets a finished entry for a re-import', () => {
    startedImport('a1', 7)
    store().applyProgress({
      jobId: 7,
      status: 'Completed',
      packId: 42,
      itemsTotal: 5,
      itemsProcessed: 5,
      itemsFailed: 0,
    })

    store().beginImport('a1')

    expect(store().imports['a1']).toMatchObject({
      phase: 'requestingToken',
      jobId: null,
      packId: null,
    })
  })
})
