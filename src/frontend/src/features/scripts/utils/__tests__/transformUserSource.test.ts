import { transformUserSource } from '../transformUserSource'

describe('transformUserSource', () => {
  it('wraps the output so it returns the default export', () => {
    const out = transformUserSource('export default 42')
    expect(out.startsWith('let __result;')).toBe(true)
    expect(out).toContain('__result = 42')
    expect(out.trimEnd().endsWith('return __result;')).toBe(true)
  })

  it('maps `import * as` to the injected three / tsl bindings', () => {
    const out = transformUserSource(
      "import * as THREE from 'three'\nimport * as TSL from 'three/tsl'"
    )
    expect(out).toContain('const THREE = __THREE;')
    expect(out).toContain('const TSL = __TSL;')
  })

  it('maps named imports, including aliases', () => {
    const out = transformUserSource(
      "import { Vector3, Color as C } from 'three'"
    )
    expect(out).toContain('const { Vector3, Color: C } = __THREE;')
  })

  it('collapses multi-line named imports before transforming them', () => {
    // IDE auto-formatting often splits long imports across lines; a naive
    // line-by-line transform would emit broken `const {` fragments and the
    // generated Function would throw a SyntaxError. This is the regression
    // the collapse step guards against.
    const src = [
      'import {',
      '  MeshBasicNodeMaterial,',
      '  uniform,',
      "} from 'three/webgpu'",
      'export default new MeshBasicNodeMaterial()',
    ].join('\n')

    const out = transformUserSource(src)
    expect(out).toContain('const { MeshBasicNodeMaterial, uniform } = __THREE;')
    expect(out).not.toMatch(/const\s*\{\s*$/m)
    // The collapsed result must be valid JS body (no SyntaxError when compiled).
    expect(() => new Function('__THREE', '__TSL', out)).not.toThrow()
  })

  it('drops side-effect / unresolvable imports', () => {
    const out = transformUserSource("import './styles.css'\nconst x = 1")
    expect(out).not.toContain('styles.css')
    expect(out).toContain('const x = 1')
  })

  it('strips `export` keywords from named declarations', () => {
    const out = transformUserSource(
      'export const helper = () => 1\nexport default helper'
    )
    expect(out).toContain('const helper = () => 1')
    expect(out).not.toContain('export const')
    expect(out).toContain('__result = helper')
  })

  it('produces a compilable Function body for a realistic TSL material', () => {
    const src = [
      "import * as THREE from 'three/webgpu'",
      "import { color } from 'three/tsl'",
      'const material = new THREE.MeshBasicNodeMaterial()',
      'material.colorNode = color(0x00ff00)',
      'export default material',
    ].join('\n')

    const out = transformUserSource(src)
    expect(() => new Function('__THREE', '__TSL', out)).not.toThrow()
  })
})
