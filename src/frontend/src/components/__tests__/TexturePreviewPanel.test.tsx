import { render } from '@testing-library/react'
import TexturePreviewPanel from '../tabs/texture-pack-viewer/TexturePreviewPanel'
import { TexturePackDto, TextureType } from '../../types'

// Mock ApiClient
jest.mock('../../services/ApiClient', () => ({
  default: {
    getFileUrl: jest.fn(id => `http://localhost/files/${id}`),
  },
}))

// Mock @react-three/drei
jest.mock('@react-three/drei', () => ({
  useTexture: jest.fn(() => ({})),
  OrbitControls: () => null,
  Stage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock leva
jest.mock('leva', () => ({
  useControls: jest.fn((name: string, config: any) => {
    // Return default values for all controls
    if (name === 'Geometry') {
      return {
        type: 'box',
        scale: 1,
        rotationSpeed: 0.01,
        wireframe: false,
      }
    }
    if (name === 'Cube Parameters') {
      return { cubeSize: 2 }
    }
    if (name === 'Sphere Parameters') {
      return { sphereRadius: 1.2, sphereSegments: 64 }
    }
    if (name === 'Cylinder Parameters') {
      return { cylinderRadius: 1, cylinderHeight: 2 }
    }
    if (name === 'Torus Parameters') {
      return { torusRadius: 1, torusTube: 0.4 }
    }
    return {}
  }),
}))

const mockTexturePack: TexturePackDto = {
  id: 1,
  name: 'Test Pack',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  textureCount: 1,
  isEmpty: false,
  textures: [
    {
      id: 1,
      textureType: TextureType.Albedo,
      fileId: 1,
      fileName: 'test.jpg',
      createdAt: new Date().toISOString(),
    },
  ],
  associatedModels: [],
}

describe('TexturePreviewPanel', () => {
  it('should render without errors (no circular dependency)', () => {
    // This test ensures that the circular dependency issue is fixed
    // Previously, useControls referenced itself before initialization
    expect(() => {
      render(<TexturePreviewPanel texturePack={mockTexturePack} />)
    }).not.toThrow()
  })

  it('should render with only albedo texture', () => {
    const packWithAlbedo: TexturePackDto = {
      ...mockTexturePack,
      textureCount: 1,
      textures: [
        {
          id: 1,
          textureType: TextureType.Albedo,
          fileId: 1,
          fileName: 'albedo.jpg',
          createdAt: new Date().toISOString(),
        },
      ],
    }

    expect(() => {
      render(<TexturePreviewPanel texturePack={packWithAlbedo} />)
    }).not.toThrow()
  })

  it('should render with multiple textures', () => {
    const packWithMultipleTextures: TexturePackDto = {
      ...mockTexturePack,
      textureCount: 3,
      textures: [
        {
          id: 1,
          textureType: TextureType.Albedo,
          fileId: 1,
          fileName: 'albedo.jpg',
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          textureType: TextureType.Normal,
          fileId: 2,
          fileName: 'normal.jpg',
          createdAt: new Date().toISOString(),
        },
        {
          id: 3,
          textureType: TextureType.Roughness,
          fileId: 3,
          fileName: 'roughness.jpg',
          createdAt: new Date().toISOString(),
        },
      ],
    }

    expect(() => {
      render(<TexturePreviewPanel texturePack={packWithMultipleTextures} />)
    }).not.toThrow()
  })
})
