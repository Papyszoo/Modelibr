import { render, screen } from '@testing-library/react'
import ModelInfo from '@/features/model-viewer/components/ModelInfo'

// Mock the ApiClient
jest.mock('../../../../services/ApiClient', () => ({
  __esModule: true,
  default: {
    updateModelTags: jest.fn(),
    disassociateTextureSetFromModelVersion: jest.fn(),
    getAllTextureSets: jest.fn().mockResolvedValue([]),
  },
}))

describe('ModelInfo', () => {
  const mockModel = {
    id: 'test-model-123',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-16T14:45:00Z',
    files: [{ originalFileName: 'test-model.obj' }],
    tags: '',
    description: '',
    textureSets: [],
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

  it('should display Tags & Description section', () => {
    render(<ModelInfo model={mockModel} />)

    expect(screen.getByText('Tags & Description')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Add new tag...')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Enter description...')
    ).toBeInTheDocument()
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
      ...mockModel,
      id: 'test-model-456',
      files: [],
    }

    render(<ModelInfo model={modelWithoutFiles} />)

    expect(screen.getByText('test-model-456')).toBeInTheDocument()
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
  })

  it('should handle model with multiple files', () => {
    const modelWithMultipleFiles = {
      ...mockModel,
      id: 'test-model-789',
      files: [
        { originalFileName: 'model.gltf' },
        { originalFileName: 'texture.jpg' },
      ],
    }

    render(<ModelInfo model={modelWithMultipleFiles} />)

    // Should show format of first file
    expect(screen.getByText('GLTF')).toBeInTheDocument()
  })

  it('should render all required sections', () => {
    render(<ModelInfo model={mockModel} />)

    // Check that all four main sections are present
    expect(
      screen.getByRole('heading', { name: 'Model Information' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Tags & Description' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Linked Texture Sets' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Controls' })
    ).toBeInTheDocument()
  })

  it('should display Linked Texture Sets section', () => {
    render(<ModelInfo model={mockModel} />)

    expect(screen.getByText('Linked Texture Sets')).toBeInTheDocument()
    expect(screen.getByText('No texture sets linked')).toBeInTheDocument()
    expect(screen.getByLabelText('Link Texture Sets')).toBeInTheDocument()
  })

  it('should display model tags when provided', () => {
    const modelWithTags = {
      ...mockModel,
      tags: 'character, sci-fi, robot',
    }

    render(<ModelInfo model={modelWithTags} />)

    expect(screen.getByText('character')).toBeInTheDocument()
    expect(screen.getByText('sci-fi')).toBeInTheDocument()
    expect(screen.getByText('robot')).toBeInTheDocument()
  })

  it('should display linked texture sets when provided', () => {
    const modelWithTextureSets = {
      ...mockModel,
      textureSets: [
        { id: 1, name: 'Metal Texture' },
        { id: 2, name: 'Wood Texture' },
      ],
    }

    render(<ModelInfo model={modelWithTextureSets} />)

    expect(screen.getByText('Metal Texture')).toBeInTheDocument()
    expect(screen.getByText('Wood Texture')).toBeInTheDocument()
  })
})
