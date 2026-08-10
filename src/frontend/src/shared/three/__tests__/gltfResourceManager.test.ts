import {
  createGltfResourceManager,
  safeLoadingManager,
} from '../safeLoadingManager'

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='

/**
 * Regression: an imported loose `.gltf` could not be opened in the browser at all.
 * The viewer attached the shared safe loading manager to every loader, which
 * substitutes a transparent pixel for anything that isn't `/files/<id>` — so the
 * glTF's `scene.bin` buffer was replaced with a PNG and the model rendered empty.
 * The worker resolved these references for thumbnails; the browser never did.
 */
describe('createGltfResourceManager', () => {
  const resolve = (
    resources: Record<string, string> | null | undefined,
    url: string
  ): string => {
    const manager = createGltfResourceManager(resources)
    return manager.resolveURL(url)
  }

  it('resolves a relative buffer reference to its uploaded auxiliary file', () => {
    expect(resolve({ 'scene.bin': '/api/files/42' }, 'scene.bin')).toBe(
      '/api/files/42'
    )
  })

  it('resolves a reference the loader prefixed with the primary file URL', () => {
    // GLTFLoader resolves relative URIs against the .gltf's own URL, so what it
    // actually asks for is the file route with the relative path appended.
    expect(
      resolve(
        { 'textures/wood.png': '/api/files/7' },
        'http://localhost:8080/files/textures/wood.png'
      )
    ).toBe('/api/files/7')
  })

  it('prefers the most specific key over a bare basename match', () => {
    const resources = {
      'a/tex.png': '/api/files/1',
      'b/tex.png': '/api/files/2',
    }
    expect(resolve(resources, 'http://x/y/b/tex.png')).toBe('/api/files/2')
  })

  it('normalises ./, backslashes and percent-encoding', () => {
    const resources = { 'textures/red wall.png': '/api/files/9' }
    expect(resolve(resources, './textures/red%20wall.png')).toBe('/api/files/9')
    expect(resolve(resources, 'textures\\red wall.png')).toBe('/api/files/9')
  })

  it('passes the primary model file and synthesised data:/blob: URLs through', () => {
    const resources = { 'scene.bin': '/api/files/42' }
    expect(resolve(resources, 'http://localhost:8080/files/41')).toBe(
      'http://localhost:8080/files/41'
    )
    expect(resolve(resources, 'data:image/png;base64,AAA')).toBe(
      'data:image/png;base64,AAA'
    )
    expect(resolve(resources, 'blob:http://localhost/abc')).toBe(
      'blob:http://localhost/abc'
    )
  })

  it('keeps the safe fallback for an unmapped reference (never a live request)', () => {
    expect(resolve({ 'scene.bin': '/api/files/42' }, 'missing.tga')).toBe(
      TRANSPARENT_PIXEL
    )
  })

  it('returns the shared manager unchanged when there is nothing to resolve', () => {
    // Packed .glb and every non-glTF format must keep exactly their old behaviour.
    expect(createGltfResourceManager(null)).toBe(safeLoadingManager)
    expect(createGltfResourceManager({})).toBe(safeLoadingManager)
  })
})
