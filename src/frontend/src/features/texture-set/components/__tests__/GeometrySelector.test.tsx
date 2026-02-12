import { render, screen, fireEvent } from '@testing-library/react'
import GeometrySelector from '@/features/texture-set/components/GeometrySelector'

describe('GeometrySelector', () => {
  it('should render all geometry options', () => {
    const mockOnSelect = jest.fn()
    render(<GeometrySelector onGeometrySelect={mockOnSelect} />)

    expect(screen.getByText('Preview with Geometry')).toBeInTheDocument()
    expect(screen.getByText('Cube')).toBeInTheDocument()
    expect(screen.getByText('Sphere')).toBeInTheDocument()
    expect(screen.getByText('Cylinder')).toBeInTheDocument()
    expect(screen.getByText('Torus')).toBeInTheDocument()
  })

  it('should call onGeometrySelect when a geometry button is clicked', () => {
    const mockOnSelect = jest.fn()
    render(<GeometrySelector onGeometrySelect={mockOnSelect} />)

    const cubeButton = screen.getByText('Cube')
    fireEvent.click(cubeButton)

    expect(mockOnSelect).toHaveBeenCalledWith('box')
  })

  it('should call onGeometrySelect with correct geometry type for each button', () => {
    const mockOnSelect = jest.fn()
    render(<GeometrySelector onGeometrySelect={mockOnSelect} />)

    fireEvent.click(screen.getByText('Cube'))
    expect(mockOnSelect).toHaveBeenCalledWith('box')

    fireEvent.click(screen.getByText('Sphere'))
    expect(mockOnSelect).toHaveBeenCalledWith('sphere')

    fireEvent.click(screen.getByText('Cylinder'))
    expect(mockOnSelect).toHaveBeenCalledWith('cylinder')

    fireEvent.click(screen.getByText('Torus'))
    expect(mockOnSelect).toHaveBeenCalledWith('torus')
  })
})
