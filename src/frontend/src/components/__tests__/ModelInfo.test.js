import { render, screen } from '@testing-library/react'
import ModelInfo from '../ModelInfo'

describe('ModelInfo', () => {
  const mockModel = {
    id: 'test-model-123',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-16T14:45:00Z',
    files: [
      { originalFileName: 'test-model.obj' }
    ]
  }

  it('should render model information correctly', () => {
    render(<ModelInfo model={mockModel} />)

    // Check if model information is displayed
    expect(screen.getByText('Model Information')).toBeInTheDocument()
    expect(screen.getByText('test-model-123')).toBeInTheDocument()
    expect(screen.getByText('OBJ')).toBeInTheDocument()
  })

  it('should format dates correctly', () => {
    render(<ModelInfo model={mockModel} />)

    // Check if dates are formatted (will depend on locale)
    const createdDate = new Date(mockModel.createdAt).toLocaleString()
    const updatedDate = new Date(mockModel.updatedAt).toLocaleString()
    
    expect(screen.getByText(createdDate)).toBeInTheDocument()
    expect(screen.getByText(updatedDate)).toBeInTheDocument()
  })

  it('should display TSL rendering features', () => {
    render(<ModelInfo model={mockModel} />)

    expect(screen.getByText('TSL Rendering Features')).toBeInTheDocument()
    expect(screen.getByText(/Real-time physically based rendering/)).toBeInTheDocument()
    expect(screen.getByText(/Dynamic lighting with shadow mapping/)).toBeInTheDocument()
    expect(screen.getByText(/Material metalness and roughness controls/)).toBeInTheDocument()
    expect(screen.getByText(/Environment mapping for reflections/)).toBeInTheDocument()
    expect(screen.getByText(/Interactive orbit controls/)).toBeInTheDocument()
  })

  it('should display control instructions', () => {
    render(<ModelInfo model={mockModel} />)

    expect(screen.getByText('Controls')).toBeInTheDocument()
    expect(screen.getByText(/Mouse:/)).toBeInTheDocument()
    expect(screen.getByText(/Scroll:/)).toBeInTheDocument()
    expect(screen.getByText(/Right-click \+ drag:/)).toBeInTheDocument()
  })

  it('should handle model without files', () => {
    const modelWithoutFiles = {
      id: 'test-model-456',
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-16T14:45:00Z',
      files: []
    }

    render(<ModelInfo model={modelWithoutFiles} />)

    expect(screen.getByText('test-model-456')).toBeInTheDocument()
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
  })

  it('should handle model with multiple files', () => {
    const modelWithMultipleFiles = {
      id: 'test-model-789',
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-16T14:45:00Z',
      files: [
        { originalFileName: 'model.gltf' },
        { originalFileName: 'texture.jpg' }
      ]
    }

    render(<ModelInfo model={modelWithMultipleFiles} />)

    // Should show format of first file
    expect(screen.getByText('GLTF')).toBeInTheDocument()
  })

  it('should render all required sections', () => {
    render(<ModelInfo model={mockModel} />)

    // Check that all three main sections are present
    expect(screen.getByRole('heading', { name: 'Model Information' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'TSL Rendering Features' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Controls' })).toBeInTheDocument()
  })
})