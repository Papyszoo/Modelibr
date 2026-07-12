import {
  BASE_MESHES_COMMIT,
  BASE_MESHES_PACK_ID,
  baseMeshFileAssets,
  baseMeshRemoteThumbnails,
  buildBaseMeshSeed,
} from '../baseMeshesSeed'

// The Base Meshes demo pack is stitched together across three modules
// (demoDb seeding, the seedFileAssets map, the seedRemoteThumbnails map)
// keyed only by generated ids. An id-scheme drift between them doesn't
// throw — it silently produces 404 files or endlessly "generating"
// thumbnails in the hosted demo. These tests pin the cross-module contract.
describe('baseMeshesSeed', () => {
  const now = '2026-07-12T00:00:00.000Z'
  const { models, versions, pack } = buildBaseMeshSeed(now)
  const fileAssets = baseMeshFileAssets()
  const remoteThumbnails = baseMeshRemoteThumbnails()

  it('links every model to exactly one version sharing its single file', () => {
    expect(models.length).toBeGreaterThan(0)
    for (const model of models) {
      expect(model.files).toHaveLength(1)
      const version = versions.find(v => v.id === model.activeVersionId)
      expect(version).toBeDefined()
      expect(version!.modelId).toBe(model.id)
      expect(version!.files[0].id).toBe(model.files[0].id)
    }
  })

  it('keeps seeded ids above the demo id sequences (start at 100/1000)', () => {
    // Collision here would let a user-created model overwrite a seeded one.
    for (const model of models) expect(model.id).toBeGreaterThan(1000)
    for (const version of versions) expect(version.id).toBeGreaterThan(1000)
    for (const model of models) expect(model.files[0].id).toBeGreaterThan(1000)
  })

  it('serves every model file from the pinned fork commit', () => {
    for (const model of models) {
      const url = fileAssets[model.files[0].id]
      expect(url).toBeDefined()
      expect(url).toContain(BASE_MESHES_COMMIT)
      expect(url.endsWith(`/${model.files[0].originalFileName}`)).toBe(true)
    }
  })

  it('provides a remote animated thumbnail for every model and version', () => {
    for (const model of models) {
      expect(remoteThumbnails[`model:${model.id}`]).toMatch(/\.webp$/)
    }
    for (const version of versions) {
      expect(remoteThumbnails[`version:${version.id}`]).toMatch(/\.webp$/)
    }
  })

  it('keeps the pack membership and counts consistent', () => {
    expect(pack.id).toBe(BASE_MESHES_PACK_ID)
    expect(pack.modelCount).toBe(models.length)
    expect(pack.models.map(m => m.id)).toEqual(models.map(m => m.id))
    for (const model of models) {
      expect(model.packs).toEqual([{ id: pack.id, name: pack.name }])
    }
  })

  it('credits the CC0 sources on the pack', () => {
    expect(pack.licenseType).toBe('CC0')
    expect(pack.url).toBe('https://www.thebasemesh.com/')
    expect(pack.description).toContain('thebasemesh.com')
    expect(pack.description).toContain('M3-org/base-meshes')
  })
})
