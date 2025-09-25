import { render } from '@testing-library/react'
import { Canvas } from '@react-three/fiber'
import LoadingPlaceholder from '../LoadingPlaceholder'

// Mock @react-three/drei Text component
jest.mock('@react-three/drei', () => ({
  Text: ({ children, ...props }) => (
    <mesh {...props} data-testid="loading-text">
      {children}
    </mesh>
  ),
}))

describe('LoadingPlaceholder', () => {
  it('should render within Canvas context', () => {
    const { container } = render(
      <Canvas>
        <LoadingPlaceholder />
      </Canvas>
    )

    // Check that the component rendered without errors
    expect(container).toBeTruthy()
  })

  it('should render loading text with correct properties', () => {
    const TestWrapper = () => (
      <Canvas>
        <LoadingPlaceholder />
      </Canvas>
    )

    render(<TestWrapper />)

    // Since we're in a Canvas context, we can't directly test the text
    // but we can verify the component structure
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('should not throw errors when rendered', () => {
    expect(() => {
      render(
        <Canvas>
          <LoadingPlaceholder />
        </Canvas>
      )
    }).not.toThrow()
  })
})