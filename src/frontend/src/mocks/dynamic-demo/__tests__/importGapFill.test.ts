import { meshHash, missingMeshes } from '../importGapFill'

/**
 * Demo mode is the public showcase, so an import that reports success while doing
 * nothing is worse than one that fails. The real importer (StoreImportProcessor)
 * dedupes by file hash and gap-fills what a previous partial run missed; the demo
 * has to match, or "import 2 items, then re-import to add the rest" silently
 * no-ops in the demo only.
 */
describe('missingMeshes', () => {
  const mesh = (name: string) => ({ name, sizeBytes: 1 })
  const modelFor = (name: string) => ({
    files: [{ sha256Hash: meshHash(name) }],
  })

  it('returns everything for a pack that does not exist yet', () => {
    expect(missingMeshes([mesh('chair'), mesh('table')], [])).toEqual([
      mesh('chair'),
      mesh('table'),
    ])
  })

  // Regression: a re-import used to return the existing pack untouched, so items
  // the first run skipped were never added.
  it('returns only the meshes the pack is missing', () => {
    const result = missingMeshes(
      [mesh('chair'), mesh('table'), mesh('lamp')],
      [modelFor('chair')]
    )

    expect(result).toEqual([mesh('table'), mesh('lamp')])
  })

  it('returns nothing when the pack already holds every mesh', () => {
    const result = missingMeshes(
      [mesh('chair'), mesh('table')],
      [modelFor('chair'), modelFor('table')]
    )

    expect(result).toEqual([])
  })

  it('tolerates models with no files or no hash', () => {
    const result = missingMeshes(
      [mesh('chair')],
      [{}, { files: [] }, { files: [{}] }]
    )

    expect(result).toEqual([mesh('chair')])
  })

  // The hash is the contract shared with the model records the demo writes; if it
  // drifts from what materializeImport stores, every re-import re-adds duplicates.
  it('derives the hash the demo stores on imported model files', () => {
    expect(meshHash('chair')).toBe('store-import-chair')
  })
})
