import {
  createResourceManager,
  safeLoadingManager,
} from '../safeLoadingManager'

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='

/**
 * Regression: an imported loose `.gltf` could not be opened in the browser at all.
 * The viewer attached the shared safe loading manager to every loader, which
 * substitutes a transparent pixel for anything that isn't `/files/<id>` - so the
 * glTF's `scene.bin` buffer was replaced with a PNG and the model rendered empty.
 * The worker resolved these references for thumbnails; the browser never did.
 */
describe('createResourceManager', () => {
  const resolve = (
    resources: Record<string, string> | null | undefined,
    url: string
  ): string => {
    const manager = createResourceManager(resources)
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

  it('resolves an FBX-baked absolute Windows path by its file name', () => {
    // An FBX records the path the artist's machine had. This is why every FBX in
    // the library rendered untextured: nothing could turn that string into a URL,
    // so it was rewritten to a transparent pixel unconditionally.
    expect(
      resolve(
        { 'chest_Specular.png': '/api/files/91' },
        'C:\\Assets\\Chest\\chest_Specular.png'
      )
    ).toBe('/api/files/91')
  })

  it('resolves a recorded .tga to the .png the pack actually shipped', () => {
    // Last-resort stem match. Exporters rewrite the extension routinely, and the
    // alternative for a whole FBX pack is no textures at all.
    expect(
      resolve({ 'chest_Specular.png': '/api/files/91' }, 'chest_Specular.tga')
    ).toBe('/api/files/91')
  })

  it('does not let a stem match displace a real path', () => {
    // Two textures of the same name in different folders. The exact path wins;
    // the loose stem rule must never reorder that.
    const resources = {
      'textures/wood.png': '/api/files/1',
      'wood.png': '/api/files/2',
    }
    expect(resolve(resources, 'textures/wood.png')).toBe('/api/files/1')
  })

  it('does not invent a match for an unrelated name', () => {
    expect(resolve({ 'chest_Specular.png': '/api/files/91' }, 'door.tga')).toBe(
      TRANSPARENT_PIXEL
    )
  })

  it('returns the shared manager unchanged when there is nothing to resolve', () => {
    // Packed .glb and every non-glTF format must keep exactly their old behaviour.
    expect(createResourceManager(null)).toBe(safeLoadingManager)
    expect(createResourceManager({})).toBe(safeLoadingManager)
  })
})
