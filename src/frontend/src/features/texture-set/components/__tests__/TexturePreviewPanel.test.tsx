import { render } from '@testing-library/react'
import TexturePreviewPanel from '../TexturePreviewPanel'
import { TextureSetDto, TextureType } from '../../../../types'

// Mock ApiClient
jest.mock('../../../../services/ApiClient', () => ({
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

// Mock PrimeReact components
jest.mock('primereact/button', () => ({
  Button: ({ onClick, icon }: any) => (
    <button onClick={onClick} data-icon={icon}>
      Button
    </button>
  ),
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

describe('TexturePreviewPanel', () => {
  it('should render without errors', () => {
    expect(() => {
      render(<TexturePreviewPanel textureSet={mockTextureSet} />)
    }).not.toThrow()
  })

  it('should render with only albedo texture', () => {
    const setWithAlbedo: TextureSetDto = {
      ...mockTextureSet,
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
      render(<TexturePreviewPanel textureSet={setWithAlbedo} />)
    }).not.toThrow()
  })

  it('should render with multiple textures', () => {
    const setWithMultipleTextures: TextureSetDto = {
      ...mockTextureSet,
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
      render(<TexturePreviewPanel textureSet={setWithMultipleTextures} />)
    }).not.toThrow()
  })
})
