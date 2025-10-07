import type { Meta, StoryObj } from '@storybook/react'
import ModelHierarchy from './ModelHierarchy'
import * as THREE from 'three'

/**
 * ModelHierarchy displays the structure of a 3D model,
 * showing meshes, materials, and their properties in a tree view.
 */
const meta = {
  title: 'Components/ModelHierarchy',
  component: ModelHierarchy,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ModelHierarchy>

export default meta
type Story = StoryObj<typeof meta>

// Create a sample hierarchy structure
const createSampleHierarchy = () => {
  const scene = new THREE.Scene()
  scene.name = 'Scene'

  // Create a simple cube mesh
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({ color: 0x4338ca })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'Cube'
  scene.add(mesh)

  // Create a group with multiple meshes
  const group = new THREE.Group()
  group.name = 'Group'

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0x10b981 })
  )
  sphere.name = 'Sphere'
  sphere.position.set(2, 0, 0)
  group.add(sphere)

  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 1, 32),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b })
  )
  cylinder.name = 'Cylinder'
  cylinder.position.set(-2, 0, 0)
  group.add(cylinder)

  scene.add(group)

  // Extract hierarchy structure
  function extractHierarchy(object: THREE.Object3D): any {
    const node: any = {
      id: object.uuid,
      name: object.name || object.type,
      type: object.type,
      children: [],
    }

    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry
      const material = object.material

      const vertices = geometry.attributes.position?.count || 0
      const faces = geometry.index ? geometry.index.count / 3 : vertices / 3

      const materials: string[] = []
      if (Array.isArray(material)) {
        materials.push(...material.map(m => m.name || m.type))
      } else if (material) {
        materials.push(material.name || material.type)
      }

      node.meshInfo = {
        vertices: Math.floor(vertices),
        faces: Math.floor(faces),
        materials,
      }

      if (material && !Array.isArray(material)) {
        node.materialInfo = {
          type: material.type,
        }

        if ('color' in material && material.color instanceof THREE.Color) {
          node.materialInfo.color = '#' + material.color.getHexString()
        }
      }
    }

    if (object.children && object.children.length > 0) {
      node.children = object.children.map(child => extractHierarchy(child))
    }

    return node
  }

  return extractHierarchy(scene)
}

/**
 * Default state with a sample 3D model hierarchy
 */
export const Default: Story = {
  args: {
    hierarchy: createSampleHierarchy(),
  },
}

/**
 * Empty state with no model loaded
 */
export const Empty: Story = {
  args: {
    hierarchy: null,
  },
}

/**
 * Complex hierarchy with nested groups
 */
export const ComplexHierarchy: Story = {
  args: {
    hierarchy: {
      id: '1',
      name: 'RootScene',
      type: 'Scene',
      children: [
        {
          id: '2',
          name: 'MainModel',
          type: 'Group',
          children: [
            {
              id: '3',
              name: 'Body',
              type: 'Mesh',
              meshInfo: {
                vertices: 1024,
                faces: 2048,
                materials: ['MeshStandardMaterial'],
              },
              materialInfo: {
                type: 'MeshStandardMaterial',
                color: '#4338ca',
              },
              children: [],
            },
            {
              id: '4',
              name: 'Wheels',
              type: 'Group',
              children: [
                {
                  id: '5',
                  name: 'FrontLeft',
                  type: 'Mesh',
                  meshInfo: {
                    vertices: 512,
                    faces: 1024,
                    materials: ['MeshStandardMaterial'],
                  },
                  materialInfo: {
                    type: 'MeshStandardMaterial',
                    color: '#1f2937',
                  },
                  children: [],
                },
                {
                  id: '6',
                  name: 'FrontRight',
                  type: 'Mesh',
                  meshInfo: {
                    vertices: 512,
                    faces: 1024,
                    materials: ['MeshStandardMaterial'],
                  },
                  materialInfo: {
                    type: 'MeshStandardMaterial',
                    color: '#1f2937',
                  },
                  children: [],
                },
              ],
            },
          ],
        },
        {
          id: '7',
          name: 'Environment',
          type: 'Group',
          children: [
            {
              id: '8',
              name: 'Ground',
              type: 'Mesh',
              meshInfo: {
                vertices: 4,
                faces: 2,
                materials: ['MeshStandardMaterial'],
              },
              materialInfo: {
                type: 'MeshStandardMaterial',
                color: '#f0f0f0',
              },
              children: [],
            },
          ],
        },
      ],
    },
  },
}
