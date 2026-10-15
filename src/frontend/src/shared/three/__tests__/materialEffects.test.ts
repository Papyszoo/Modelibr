import * as THREE from 'three'

import {
  advanceMaterialEffects,
  applyMaterialEffects,
  hasMaterialEffects,
  type MaterialEffectsDocument,
  parseMaterialEffects,
  updateMaterialEffects,
} from '../materialEffects'
import { applyDispNormalDisplacement } from '../sharedDisplacementNormal'

/** A document carrying all four effect types and drivers on two of them. */
function fullDocument(): MaterialEffectsDocument {
  return {
    version: 1,
    effects: [
      {
        type: 'jelly_wobble',
        amplitude: 0.03,
        frequency: 1.5,
        waveScale: 4,
        seed: 0,
        drivers: { amplitude: { input: 'speed', scale: 0.02 } },
      },
      { type: 'rim', color: '#7CFF2A', power: 3, intensity: 1 },
      { type: 'translucency', interiorColor: '#2E5A12', thickness: 0.6 },
      {
        type: 'emission_pulse',
        color: '#CCFF66',
        intensity: 0,
        rate: 2,
        drivers: { intensity: { input: 'charge', scale: 4 } },
      },
    ],
    previewInputs: { speed: 2, impulse: 0.5, charge: 0.25 },
  }
}

function vertexStub(): string {
  return [
    '#include <common>',
    '#include <displacementmap_pars_vertex>',
    'void main() {',
    '  #include <beginnormal_vertex>',
    '  #include <begin_vertex>',
    '  #include <skinning_vertex>',
    '  #include <displacementmap_vertex>',
    '  #include <project_vertex>',
    '}',
  ].join('\n')
}

function fragmentStub(): string {
  return [
    '#include <common>',
    'void main() {',
    '  #include <normal_fragment_begin>',
    '  #include <emissivemap_fragment>',
    '}',
  ].join('\n')
}

interface PatchedShader {
  uniforms: Record<string, { value: unknown }>
  vertexShader: string
  fragmentShader: string
}

function patchShader(material: THREE.Material): PatchedShader {
  const shader = {
    uniforms: {},
    vertexShader: vertexStub(),
    fragmentShader: fragmentStub(),
  } as unknown as Parameters<NonNullable<typeof material.onBeforeCompile>>[0]
  material.onBeforeCompile!(shader, {} as THREE.WebGLRenderer)
  return shader as unknown as PatchedShader
}

describe('parseMaterialEffects', () => {
  it('returns null for null, undefined and malformed input', () => {
    expect(parseMaterialEffects(null)).toBeNull()
    expect(parseMaterialEffects(undefined)).toBeNull()
    expect(parseMaterialEffects('not json')).toBeNull()
    expect(parseMaterialEffects({})).toBeNull()
    expect(parseMaterialEffects({ version: 2, effects: [] })).toBeNull()
  })

  it('rejects a document the backend validator would reject', () => {
    expect(
      parseMaterialEffects({
        version: 1,
        effects: [{ type: 'rim', color: 'red', power: 3, intensity: 1 }],
      })
    ).toBeNull()
    expect(
      parseMaterialEffects({
        version: 1,
        effects: [{ type: 'rim', color: '#ffffff', power: 99, intensity: 1 }],
      })
    ).toBeNull()
    expect(
      parseMaterialEffects({
        version: 1,
        effects: [
          { type: 'rim', color: '#ffffff', power: 3, intensity: 1 },
          { type: 'rim', color: '#000000', power: 3, intensity: 1 },
        ],
      })
    ).toBeNull()
  })

  it('keeps valid effects and preview inputs', () => {
    const parsed = parseMaterialEffects(fullDocument())
    expect(parsed?.effects).toHaveLength(4)
    expect(parsed?.previewInputs).toEqual({
      speed: 2,
      impulse: 0.5,
      charge: 0.25,
    })
  })
})

describe('hasMaterialEffects', () => {
  it('is true only for a document with at least one effect', () => {
    expect(hasMaterialEffects(null)).toBe(false)
    expect(hasMaterialEffects(undefined)).toBe(false)
    expect(hasMaterialEffects({ version: 1, effects: [] })).toBe(false)
    expect(hasMaterialEffects(fullDocument())).toBe(true)
  })
})

describe('applyMaterialEffects shader injection', () => {
  it('injects vertex code after skinning_vertex and before project_vertex', () => {
    const material = new THREE.MeshPhysicalMaterial()
    applyMaterialEffects(material, fullDocument())
    const shader = patchShader(material)

    const skinning = shader.vertexShader.indexOf('#include <skinning_vertex>')
    const wobble = shader.vertexShader.indexOf('transformed += objectNormal')
    const project = shader.vertexShader.indexOf('#include <project_vertex>')

    expect(skinning).toBeGreaterThanOrEqual(0)
    expect(wobble).toBeGreaterThan(skinning)
    expect(wobble).toBeLessThan(project)
    // The exact spec formula, with the driver applied in GLSL.
    expect(shader.vertexShader).toContain('6.2831853')
    expect(shader.vertexShader).toContain(
      'clamp(uJellyWobbleAmplitude + uInputSpeed * uJellyWobbleAmplitudeScale, 0.0, 0.5)'
    )
  })

  it('injects fragment code right after emissivemap_fragment', () => {
    const material = new THREE.MeshPhysicalMaterial()
    applyMaterialEffects(material, fullDocument())
    const shader = patchShader(material)

    const emissive = shader.fragmentShader.indexOf(
      '#include <emissivemap_fragment>'
    )
    const addition = shader.fragmentShader.indexOf(
      'totalEmissiveRadiance += uRimColor'
    )

    expect(emissive).toBeGreaterThanOrEqual(0)
    expect(addition).toBeGreaterThan(emissive)
    expect(shader.fragmentShader).toContain('normalize(vViewPosition)')
    expect(shader.fragmentShader).toContain(
      'totalEmissiveRadiance += uTranslucencyInteriorColor'
    )
    expect(shader.fragmentShader).toContain(
      'totalEmissiveRadiance += uEmissionPulseColor'
    )
  })

  it('defines the required uniforms', () => {
    const material = new THREE.MeshPhysicalMaterial()
    applyMaterialEffects(material, fullDocument())
    const shader = patchShader(material)

    for (const name of [
      'uEffectTime',
      'uInputSpeed',
      'uInputImpulse',
      'uInputCharge',
    ]) {
      expect(shader.uniforms[name]).toBeDefined()
      expect(shader.vertexShader).toContain(`uniform float ${name};`)
    }
  })

  it('composes with the existing displacement onBeforeCompile hook', () => {
    const material = new THREE.MeshPhysicalMaterial()
    applyDispNormalDisplacement(material)
    applyMaterialEffects(material, fullDocument())
    const shader = patchShader(material)

    // Both hooks ran: displacement still swaps the push direction, effects
    // still wobble the transformed vertex and add emission.
    expect(shader.vertexShader).toContain('attribute vec3 aDispNormal;')
    expect(shader.vertexShader).toContain('normalize( aDispNormal )')
    expect(shader.vertexShader).toContain('transformed += objectNormal')
    expect(shader.fragmentShader).toContain(
      'totalEmissiveRadiance += uRimColor'
    )
  })
})

describe('applyMaterialEffects program cache key', () => {
  it('is stable for the same effect set and different for a different set', () => {
    const material = new THREE.MeshPhysicalMaterial()
    const jellyAndRim: MaterialEffectsDocument = {
      version: 1,
      effects: [
        {
          type: 'jelly_wobble',
          amplitude: 0.1,
          frequency: 1,
          waveScale: 1,
          seed: 0,
        },
        { type: 'rim', color: '#ffffff', power: 3, intensity: 1 },
      ],
    }

    applyMaterialEffects(material, jellyAndRim)
    const first = material.customProgramCacheKey!()
    applyMaterialEffects(material, jellyAndRim)
    expect(material.customProgramCacheKey!()).toBe(first)

    applyMaterialEffects(material, {
      version: 1,
      effects: [jellyAndRim.effects[1]],
    })
    expect(material.customProgramCacheKey!()).not.toBe(first)
  })
})

describe('updateMaterialEffects', () => {
  it('updates uniforms for param and input changes without recompiling', () => {
    const material = new THREE.MeshPhysicalMaterial()
    applyMaterialEffects(material, fullDocument())
    const versionAfterApply = material.version

    const changed = fullDocument()
    changed.effects[0] = {
      ...(changed.effects[0] as Extract<
        (typeof changed.effects)[number],
        { type: 'jelly_wobble' }
      >),
      amplitude: 0.4,
    }
    updateMaterialEffects(material, changed, { speed: 7 }, 3.5)

    expect(material.version).toBe(versionAfterApply)

    const shader = patchShader(material)
    expect(shader.uniforms.uEffectTime.value).toBe(3.5)
    expect(shader.uniforms.uInputSpeed.value).toBe(7)
    expect(shader.uniforms.uJellyWobbleAmplitude.value).toBe(0.4)
  })

  it('recompiles when an effect type is added or removed', () => {
    const material = new THREE.MeshPhysicalMaterial()
    const rimOnly: MaterialEffectsDocument = {
      version: 1,
      effects: [{ type: 'rim', color: '#ffffff', power: 3, intensity: 1 }],
    }
    applyMaterialEffects(material, rimOnly)
    const versionBefore = material.version

    updateMaterialEffects(
      material,
      {
        version: 1,
        effects: [
          ...rimOnly.effects,
          {
            type: 'jelly_wobble',
            amplitude: 0.1,
            frequency: 1,
            waveScale: 1,
            seed: 0,
          },
        ],
      },
      {},
      0
    )

    expect(material.version).toBeGreaterThan(versionBefore)
  })

  it('advances every effect material under a root', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshPhysicalMaterial()
    )
    const group = new THREE.Group()
    group.add(mesh)
    applyMaterialEffects(mesh.material as THREE.Material, fullDocument())
    const before = patchShader(mesh.material as THREE.Material).uniforms
      .uEffectTime.value as number

    advanceMaterialEffects(group, before + 2)

    const after = patchShader(mesh.material as THREE.Material).uniforms
      .uEffectTime.value
    expect(after).toBe(before + 2)
  })
})

describe('applyMaterialEffects safety', () => {
  it('leaves a material untouched for null effects', () => {
    const material = new THREE.MeshPhysicalMaterial()
    const onBeforeCompile = material.onBeforeCompile
    const cacheKey = material.customProgramCacheKey
    const version = material.version

    applyMaterialEffects(material, null)

    expect(material.onBeforeCompile).toBe(onBeforeCompile)
    expect(material.customProgramCacheKey).toBe(cacheKey)
    expect(material.version).toBe(version)
  })

  it('never touches map, normalMap or vertexColors', () => {
    const map = new THREE.Texture()
    const normalMap = new THREE.Texture()
    const material = new THREE.MeshPhysicalMaterial({
      map,
      normalMap,
      vertexColors: true,
    })

    applyMaterialEffects(material, fullDocument())

    expect(material.map).toBe(map)
    expect(material.normalMap).toBe(normalMap)
    expect(material.vertexColors).toBe(true)
  })
})
