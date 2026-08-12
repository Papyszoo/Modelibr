/**
 * Gap-fill rule for the demo Asset Store importer.
 *
 * Lives apart from assetStoreHandlers because that module pulls in the MSW/demo
 * runtime (and `import.meta`), which Jest cannot parse — keeping the rule here makes
 * it testable, which is the point: a re-import used to return the existing pack
 * untouched, so items skipped by a first partial run were never added while the demo
 * still reported success.
 *
 * The real importer (StoreImportProcessor) dedupes by file hash and gap-fills the
 * files a previous run missed; this mirrors that.
 */

/** Deterministic per-mesh hash, mirroring the sha the importer dedupes on. */
export const meshHash = (name: string) => `store-import-${name}`

/**
 * The meshes a (re-)import still has to create: those whose hash no model already in
 * the pack carries.
 */
export function missingMeshes<T extends { name: string }>(
  meshes: readonly T[],
  packModels: readonly { files?: readonly { sha256Hash?: string }[] }[]
): T[] {
  const imported = new Set<string>()
  for (const model of packModels) {
    for (const file of model.files ?? []) {
      if (file.sha256Hash) imported.add(file.sha256Hash)
    }
  }
  return meshes.filter(m => !imported.has(meshHash(m.name)))
}
