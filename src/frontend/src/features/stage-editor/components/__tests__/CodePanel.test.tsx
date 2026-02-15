import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CodePanel } from '@/features/stage-editor/components/CodePanel'
import { StageConfig } from '@/features/stage-editor/components/SceneEditor'

// Mock clipboard API
const writeTextMock = jest.fn()
Object.assign(navigator, {
  clipboard: {
    writeText: writeTextMock,
  },
})

// Mock PrimeReact components
jest.mock('primereact/button', () => ({
  Button: ({ onClick, label, icon, ...props }: any) => (
    <button onClick={e => onClick?.(e)} data-icon={icon} {...props}>
      {label}
    </button>
  ),
}))

describe('CodePanel', () => {
  const mockStageConfig: StageConfig = {
    lights: [],
    meshes: [],
    groups: [],
    helpers: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render without crashing', () => {
    const { container } = render(<CodePanel stageConfig={mockStageConfig} />)
    expect(container.querySelector('.code-panel')).toBeInTheDocument()
  })

  it('should generate code with empty lights array', () => {
    const { container } = render(<CodePanel stageConfig={mockStageConfig} />)
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).toContain('function Scene()')
    expect(codeElement?.textContent).toContain('<group>')
    expect(codeElement?.textContent).toContain('</group>')
    expect(codeElement?.textContent).not.toContain('<Canvas')
    expect(codeElement?.textContent).not.toContain('OrbitControls')
  })

  it('should generate code with ambient light', () => {
    const configWithAmbientLight: StageConfig = {
      lights: [
        {
          id: 'light-1',
          type: 'ambient',
          color: '#ffffff',
          intensity: 0.5,
        },
      ],
      meshes: [],
      groups: [],
      helpers: [],
    }

    const { container } = render(
      <CodePanel stageConfig={configWithAmbientLight} />
    )
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).toContain('<ambientLight')
    expect(codeElement?.textContent).toContain('color="#ffffff"')
    expect(codeElement?.textContent).toContain('intensity={0.5}')
  })

  it('should generate code with directional light', () => {
    const configWithDirectionalLight: StageConfig = {
      lights: [
        {
          id: 'light-1',
          type: 'directional',
          color: '#ffffff',
          intensity: 1,
          position: [5, 5, 5],
        },
      ],
      meshes: [],
      groups: [],
      helpers: [],
    }

    const { container } = render(
      <CodePanel stageConfig={configWithDirectionalLight} />
    )
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).toContain('<directionalLight')
    expect(codeElement?.textContent).toContain('position={[5, 5, 5]}')
    expect(codeElement?.textContent).toContain('castShadow')
  })

  it('should generate code with point light', () => {
    const configWithPointLight: StageConfig = {
      lights: [
        {
          id: 'light-1',
          type: 'point',
          color: '#ffffff',
          intensity: 1,
          position: [5, 5, 5],
          distance: 0,
          decay: 2,
        },
      ],
      meshes: [],
      groups: [],
      helpers: [],
    }

    const { container } = render(
      <CodePanel stageConfig={configWithPointLight} />
    )
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).toContain('<pointLight')
    expect(codeElement?.textContent).toContain('distance={0}')
    expect(codeElement?.textContent).toContain('decay={2}')
  })

  it('should generate code with spot light', () => {
    const configWithSpotLight: StageConfig = {
      lights: [
        {
          id: 'light-1',
          type: 'spot',
          color: '#ffffff',
          intensity: 1,
          position: [5, 5, 5],
          angle: 0.5235987755982988,
          penumbra: 0.1,
          distance: 0,
          decay: 2,
        },
      ],
      meshes: [],
      groups: [],
      helpers: [],
    }

    const { container } = render(
      <CodePanel stageConfig={configWithSpotLight} />
    )
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).toContain('<spotLight')
    expect(codeElement?.textContent).toContain('angle={0.5235987755982988}')
    expect(codeElement?.textContent).toContain('penumbra={0.1}')
  })

  it('should generate code with multiple lights', () => {
    const configWithMultipleLights: StageConfig = {
      lights: [
        {
          id: 'light-1',
          type: 'directional',
          color: '#ffffff',
          intensity: 1,
          position: [5, 5, 5],
        },
        {
          id: 'light-2',
          type: 'ambient',
          color: '#ffffff',
          intensity: 0.5,
        },
        {
          id: 'light-3',
          type: 'point',
          color: '#ffffff',
          intensity: 1,
          position: [5, 5, 5],
          distance: 0,
          decay: 2,
        },
      ],
      meshes: [],
      groups: [],
      helpers: [],
    }

    const { container } = render(
      <CodePanel stageConfig={configWithMultipleLights} />
    )
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).toContain('<directionalLight')
    expect(codeElement?.textContent).toContain('<ambientLight')
    expect(codeElement?.textContent).toContain('<pointLight')
  })

  it('should not include Canvas component in generated code', () => {
    const { container } = render(<CodePanel stageConfig={mockStageConfig} />)
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).not.toContain('<Canvas')
    expect(codeElement?.textContent).not.toContain('</Canvas>')
  })

  it('should not include OrbitControls in generated code', () => {
    const { container } = render(<CodePanel stageConfig={mockStageConfig} />)
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).not.toContain('OrbitControls')
  })

  it('should not include meshes when meshes array is empty', () => {
    const { container } = render(<CodePanel stageConfig={mockStageConfig} />)
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).not.toContain('<mesh')
  })

  it('should generate code with meshes', () => {
    const configWithMesh: StageConfig = {
      lights: [],
      meshes: [
        {
          id: 'mesh-1',
          type: 'box',
          position: [0, 1, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: '#4a9eff',
          wireframe: false,
        },
      ],
      groups: [],
      helpers: [],
    }

    const { container } = render(<CodePanel stageConfig={configWithMesh} />)
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).toContain('<mesh')
    expect(codeElement?.textContent).toContain('position={[0, 1, 0]}')
    expect(codeElement?.textContent).toContain('boxGeometry')
    expect(codeElement?.textContent).toContain('meshStandardMaterial')
    expect(codeElement?.textContent).toContain('color="#4a9eff"')
  })

  it('should generate code with wireframe mesh', () => {
    const configWithWireframeMesh: StageConfig = {
      lights: [],
      meshes: [
        {
          id: 'mesh-1',
          type: 'sphere',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: '#ff0000',
          wireframe: true,
        },
      ],
      groups: [],
      helpers: [],
    }

    const { container } = render(
      <CodePanel stageConfig={configWithWireframeMesh} />
    )
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).toContain('wireframe')
  })

  it('should wrap lights in a group element', () => {
    const { container } = render(<CodePanel stageConfig={mockStageConfig} />)
    const codeElement = container.querySelector('code')
    const code = codeElement?.textContent || ''
    expect(code).toContain('<group>')
    expect(code).toContain('</group>')
    // Verify that group is the return value
    expect(code).toMatch(/return\s*\(\s*<group>/)
  })

  it('should have a copy button', () => {
    render(<CodePanel stageConfig={mockStageConfig} />)
    const copyButton = screen.getByText('Copy')
    expect(copyButton).toBeInTheDocument()
  })

  it('should show "Copied!" message after copying', async () => {
    const user = userEvent.setup()
    render(<CodePanel stageConfig={mockStageConfig} />)

    const copyButton = screen.getByText('Copy')
    await user.click(copyButton)

    expect(screen.getByText('Copied!')).toBeInTheDocument()
  })

  it('should not import Canvas from @react-three/fiber', () => {
    const { container } = render(<CodePanel stageConfig={mockStageConfig} />)
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).not.toContain(
      "import { Canvas } from '@react-three/fiber'"
    )
  })

  it('should not import OrbitControls', () => {
    const { container } = render(<CodePanel stageConfig={mockStageConfig} />)
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).not.toContain(
      "import { OrbitControls } from '@react-three/drei'"
    )
  })
})
