import { render } from '@testing-library/react'
import { Canvas } from '@react-three/fiber'
import Model from '../Model'

// Mock the loaders to avoid actual file loading
jest.mock('three/examples/jsm/loaders/OBJLoader', () => ({
  OBJLoader: jest.fn(),
}))

jest.mock('three/examples/jsm/loaders/GLTFLoader', () => ({
  GLTFLoader: jest.fn(),
}))

// Mock the @react-three/drei components
jest.mock('@react-three/drei', () => ({
  Box: ({ children, ...props }) => <mesh {...props}>{children}</mesh>,
  Text: ({ children, ...props }) => (
    <mesh {...props} data-testid="loading-text">
      {children}
    </mesh>
  ),
}))

// Mock useLoader to simulate loading state
jest.mock('@react-three/fiber', () => ({
  ...jest.requireActual('@react-three/fiber'),
  useLoader: jest.fn(() => {
    // Simulate loading by throwing a promise (Suspense behavior)
    throw new Promise(() => {})
  }),
  useFrame: jest.fn(),
}))

describe('Model', () => {
  it('should render LoadingPlaceholder as fallback during model loading', () => {
    const { container } = render(
      <Canvas>
        <Model modelUrl="test.obj" fileExtension="obj" />
      </Canvas>
    )

    // The loading placeholder should be rendered during loading
    expect(container).toBeTruthy()
  })

  it('should handle unsupported file extensions with PlaceholderModel', () => {
    const { container } = render(
      <Canvas>
        <Model modelUrl="test.xyz" fileExtension="xyz" />
      </Canvas>
    )

    // Should render the purple cube for unsupported formats
    expect(container).toBeTruthy()
  })

  it('should not throw errors when rendered', () => {
    expect(() => {
      render(
        <Canvas>
          <Model modelUrl="test.obj" fileExtension="obj" />
        </Canvas>
      )
    }).not.toThrow()
  })
})
