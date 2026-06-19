import { type Model } from '@/utils/fileUtils'

import { resolveModelPreview } from '../resolveModelPreview'

function file(id: string, name: string, isRenderable: boolean) {
  return {
    id,
    originalFileName: name,
    storedFileName: name,
    filePath: `/x/${name}`,
    mimeType: 'application/octet-stream',
    sizeBytes: 1,
    sha256Hash: 'h',
    fileType: 'model',
    isRenderable,
    createdAt: '',
    updatedAt: '',
  }
}

function model(files: ReturnType<typeof file>[]): Model {
  return { id: 1, name: 'm', files } as unknown as Model
}

describe('resolveModelPreview', () => {
  it('prefers the renderable file over the first file', () => {
    // Regression: source file (.blend) is first, the loadable .glb is flagged
    // renderable — picking files[0] is what made model selection a no-op.
    const result = resolveModelPreview(
      model([file('1', 'source.blend', false), file('2', 'mesh.glb', true)])
    )
    expect(result?.extension).toBe('glb')
    expect(result?.url).toContain('/files/2')
  })

  it('falls back to the first file when none are flagged renderable', () => {
    const result = resolveModelPreview(model([file('5', 'thing.obj', false)]))
    expect(result?.extension).toBe('obj')
    expect(result?.url).toContain('/files/5')
  })

  it('returns null for an unsupported renderable format', () => {
    expect(
      resolveModelPreview(model([file('9', 'scene.blend', true)]))
    ).toBeNull()
  })

  it('returns null when there are no files or no model', () => {
    expect(resolveModelPreview(model([]))).toBeNull()
    expect(resolveModelPreview(null)).toBeNull()
    expect(resolveModelPreview(undefined)).toBeNull()
  })
})
