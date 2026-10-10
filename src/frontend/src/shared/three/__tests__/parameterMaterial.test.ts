import * as THREE from 'three'

import type { MaterialDto } from '@/features/materials/api/materialApi'

import { advanceMaterialEffects } from '../materialEffects'
import {
  applyParameterMaterials,
  buildParameterMaterial,
} from '../parameterMaterial'

function material(
  overrides: Partial<MaterialDto['parameters']> = {},
  name = 'Test Material'
): MaterialDto {
  return {
    id: 1,
    name,
    description: null,
    categoryId: null,
    categoryName: null,
    previewGeometryType: 'sphere',
    requiresUvs: false,
    tags: [],
    createdAt: '2026-08-17T12:00:00Z',
    updatedAt: '2026-08-17T12:00:00Z',
    parameters: {
      baseColorR: 1,
      baseColorG: 1,
      baseColorB: 1,
      baseColorA: 1,
      baseColorHex: '#FFFFFF',
      roughness: 1,
      metallic: 0,
      emissiveR: 0,
      emissiveG: 0,
      emissiveB: 0,
      normalScale: 1,
      occlusionStrength: 1,
      ior: 1.5,
      alphaMode: 'Opaque',
      alphaCutoff: 0.5,
      doubleSided: false,
      ...overrides,
    },
  }
}

function meshNamed(materialName: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ name: materialName })
  )
  return mesh
}

describe('buildParameterMaterial', () => {
  it('carries the stored factors onto the three material', () => {
    const built = buildParameterMaterial(
      material({ roughness: 0.6, metallic: 1, ior: 2 })
    )

    expect(built.roughness).toBeCloseTo(0.6)
    expect(built.metalness).toBeCloseTo(1)
    expect(built.ior).toBeCloseTo(2)
  })

  it('treats the factors as linear rather than sRGB', () => {
    // The API already converted from sRGB. Converting again here is the classic
    // way to ship materials that render washed out.
    const built = buildParameterMaterial(
      material({ baseColorR: 0.25, baseColorG: 0.25, baseColorB: 0.25 })
    )

    expect(built.color.r).toBeCloseTo(0.25, 5)
  })

  it('only makes a material see-through in Blend mode', () => {
    const opaque = buildParameterMaterial(
      material({ alphaMode: 'Opaque', baseColorA: 0.2 })
    )
    const blended = buildParameterMaterial(
      material({ alphaMode: 'Blend', baseColorA: 0.2 })
    )

    expect(opaque.transparent).toBe(false)
    expect(opaque.opacity).toBe(1)
    expect(blended.transparent).toBe(true)
    expect(blended.opacity).toBeCloseTo(0.2)
  })

  it('turns Mask into an alpha test rather than blending', () => {
    const built = buildParameterMaterial(
      material({ alphaMode: 'Mask', alphaCutoff: 0.7 })
    )

    expect(built.alphaTest).toBeCloseTo(0.7)
    expect(built.transparent).toBe(false)
  })

  it('renders both sides when the material says so', () => {
    expect(buildParameterMaterial(material({ doubleSided: true })).side).toBe(
      THREE.DoubleSide
    )
    expect(buildParameterMaterial(material()).side).toBe(THREE.FrontSide)
  })
})

describe('buildParameterMaterial effects', () => {
  /** The builder must install stored effects, or a scene shows a plain PBR. */
  function materialWithEffects(): MaterialDto {
    const dto = material()
    dto.effects = {
      version: 1,
      effects: [{ type: 'rim', color: '#ff00aa', power: 3, intensity: 1 }],
    }
    return dto
  }

  it('installs the stored effects on the built material and advances them', () => {
    const built = buildParameterMaterial(materialWithEffects())

    // Patch the shader the way the renderer would, then move the effects
    // clock: the rim code must be injected and uEffectTime must follow.
    const shader = {
      uniforms: {},
      vertexShader: 'void main() {\n#include <skinning_vertex>\n}',
      fragmentShader: 'void main() {\n#include <emissivemap_fragment>\n}',
    } as unknown as Parameters<NonNullable<typeof built.onBeforeCompile>>[0]
    built.onBeforeCompile!(shader, {} as THREE.WebGLRenderer)

    expect(shader.fragmentShader).toContain(
      'totalEmissiveRadiance += uRimColor'
    )

    const group = new THREE.Group()
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), built))
    advanceMaterialEffects(group, 4)

    expect(
      (shader.uniforms as Record<string, THREE.IUniform>).uEffectTime.value
    ).toBe(4)
  })

  it('leaves a material without effects untouched', () => {
    const built = buildParameterMaterial(material())

    expect(built.userData.materialEffectState).toBeUndefined()
  })
})

describe('applyParameterMaterials', () => {
  it('dresses every mesh from the default binding', () => {
    const root = new THREE.Group()
    root.add(meshNamed('frame'), meshNamed('cushions'))

    applyParameterMaterials(root, { '': material({ roughness: 0.3 }) })

    const roughnesses = root.children.map(
      child => (child as THREE.Mesh).material as THREE.MeshPhysicalMaterial
    )
    expect(roughnesses.every(m => m.roughness === 0.3)).toBe(true)
  })

  it('lets a named slot win over the default binding', () => {
    const root = new THREE.Group()
    const frame = meshNamed('frame')
    const cushions = meshNamed('cushions')
    root.add(frame, cushions)

    applyParameterMaterials(root, {
      '': material({ roughness: 0.3 }, 'Whole sofa'),
      cushions: material({ roughness: 0.9 }, 'Cushion fabric'),
    })

    expect((frame.material as THREE.MeshPhysicalMaterial).roughness).toBe(0.3)
    expect((cushions.material as THREE.MeshPhysicalMaterial).roughness).toBe(
      0.9
    )
  })

  it('leaves a mesh alone when nothing names its slot and there is no default', () => {
    const root = new THREE.Group()
    const frame = meshNamed('frame')
    const original = frame.material
    root.add(frame)

    applyParameterMaterials(root, { cushions: material() })

    expect(frame.material).toBe(original)
  })

  it('returns what it created so the caller can dispose it', () => {
    const root = new THREE.Group()
    root.add(meshNamed('frame'))

    const created = applyParameterMaterials(root, { '': material() })

    expect(created).toHaveLength(1)
  })

  // Regression: one material instance was shared per slot, and the merge that
  // carries the model's own maps mutated it. The first mesh's map won and every
  // later mesh in the same slot silently wore it, so the default '' binding
  // across differently textured meshes rendered all of them with one texture.
  it('gives each mesh its own material instance in a shared slot', () => {
    const root = new THREE.Group()
    const first = meshNamed('frame')
    const second = meshNamed('cushions')
    const firstMap = new THREE.Texture()
    const secondMap = new THREE.Texture()
    ;(first.material as THREE.MeshStandardMaterial).map = firstMap
    ;(second.material as THREE.MeshStandardMaterial).map = secondMap
    root.add(first, second)

    applyParameterMaterials(root, { '': material() })

    const firstApplied = first.material as THREE.MeshPhysicalMaterial
    const secondApplied = second.material as THREE.MeshPhysicalMaterial
    expect(firstApplied).not.toBe(secondApplied)
    expect(firstApplied.map).toBe(firstMap)
    expect(secondApplied.map).toBe(secondMap)
  })

  it('applies the stored normalScale and occlusion strength after the merge', () => {
    const root = new THREE.Group()
    const mesh = meshNamed('frame')
    const original = mesh.material as THREE.MeshStandardMaterial
    original.normalMap = new THREE.Texture()
    original.normalScale.set(2, 2)
    original.aoMap = new THREE.Texture()
    original.aoMapIntensity = 0.2
    root.add(mesh)

    applyParameterMaterials(root, {
      '': material({ normalScale: 0.35, occlusionStrength: 0.8 }),
    })

    const applied = mesh.material as THREE.MeshPhysicalMaterial
    expect(applied.normalScale.x).toBeCloseTo(0.35)
    expect(applied.normalScale.y).toBeCloseTo(0.35)
    expect(applied.aoMapIntensity).toBeCloseTo(0.8)
  })

  it('does nothing at all when there is nothing to apply', () => {
    const root = new THREE.Group()
    const frame = meshNamed('frame')
    const original = frame.material
    root.add(frame)

    expect(applyParameterMaterials(root, {})).toEqual([])
    expect(frame.material).toBe(original)
  })
})
