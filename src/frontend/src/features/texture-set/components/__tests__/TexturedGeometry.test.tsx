import { render } from '@testing-library/react'
import { Canvas } from '@react-three/fiber'
import { TexturedGeometry } from '@/features/texture-set/components/TexturedGeometry'
import { TextureSetDto, TextureType } from '@/types'

// Mock ApiClient
jest.mock('../../../../services/ApiClient', () => ({
  apiClient: {
    getFileUrl: jest.fn(id => `http://localhost/files/${id}`),
  },
}))

// Mock @react-three/drei
jest.mock('@react-three/drei', () => ({
  useTexture: jest.fn(() => ({})),
  OrbitControls: () => null,
}))

const mockTextureSet: TextureSetDto = {
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

describe('TexturedGeometry', () => {
  it('should render box geometry without errors', () => {
    expect(() => {
      render(
        <Canvas>
          <TexturedGeometry geometryType="box" textureSet={mockTextureSet} />
        </Canvas>
      )
    }).not.toThrow()
  })

  it('should render sphere geometry without errors', () => {
    expect(() => {
      render(
        <Canvas>
          <TexturedGeometry geometryType="sphere" textureSet={mockTextureSet} />
        </Canvas>
      )
    }).not.toThrow()
  })

  it('should render cylinder geometry without errors', () => {
    expect(() => {
      render(
        <Canvas>
          <TexturedGeometry
            geometryType="cylinder"
            textureSet={mockTextureSet}
          />
        </Canvas>
      )
    }).not.toThrow()
  })

  it('should render torus geometry without errors', () => {
    expect(() => {
      render(
        <Canvas>
          <TexturedGeometry geometryType="torus" textureSet={mockTextureSet} />
        </Canvas>
      )
    }).not.toThrow()
  })
})
