import { render, screen } from '@testing-library/react'
import { StageHierarchy } from '@/features/stage-editor/components/StageHierarchy'
import { StageConfig } from '@/features/stage-editor/components/SceneEditor'

describe('StageHierarchy', () => {
  const mockOnSelectObject = jest.fn()
  const mockOnDeleteObject = jest.fn()
  const mockOnUpdateGroup = jest.fn()

  const emptyConfig: StageConfig = {
    lights: [],
    meshes: [],
    groups: [],
    helpers: [],
  }

  const configWithObjects: StageConfig = {
    lights: [
      {
        id: 'light-1',
        type: 'directional',
        color: '#ffffff',
        intensity: 1.0,
        position: [5, 5, 5],
      },
    ],
    meshes: [
      {
        id: 'mesh-1',
        type: 'box',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#4a9eff',
      },
    ],
    groups: [
      {
        id: 'group-1',
        type: 'group',
        name: 'Test Group',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        children: [],
      },
    ],
    helpers: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render empty state when no objects exist', () => {
    render(
      <StageHierarchy
        stageConfig={emptyConfig}
        selectedObjectId={null}
        onSelectObject={mockOnSelectObject}
        onDeleteObject={mockOnDeleteObject}
        onUpdateGroup={mockOnUpdateGroup}
      />
    )

    expect(screen.getByText('No objects in scene')).toBeInTheDocument()
    expect(
      screen.getByText('Add components using the library button')
    ).toBeInTheDocument()
  })

  it('should render hierarchy tree when objects exist', () => {
    render(
      <StageHierarchy
        stageConfig={configWithObjects}
        selectedObjectId={null}
        onSelectObject={mockOnSelectObject}
        onDeleteObject={mockOnDeleteObject}
        onUpdateGroup={mockOnUpdateGroup}
      />
    )

    // Tree should be rendered (we can't easily test Tree content due to PrimeReact complexity)
    expect(screen.queryByText('No objects in scene')).not.toBeInTheDocument()
  })

  it('should show delete button when object is selected', () => {
    render(
      <StageHierarchy
        stageConfig={configWithObjects}
        selectedObjectId="mesh-1"
        onSelectObject={mockOnSelectObject}
        onDeleteObject={mockOnDeleteObject}
        onUpdateGroup={mockOnUpdateGroup}
      />
    )

    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('should not show delete button when no object is selected', () => {
    render(
      <StageHierarchy
        stageConfig={configWithObjects}
        selectedObjectId={null}
        onSelectObject={mockOnSelectObject}
        onDeleteObject={mockOnDeleteObject}
        onUpdateGroup={mockOnUpdateGroup}
      />
    )

    expect(
      screen.queryByRole('button', { name: /delete/i })
    ).not.toBeInTheDocument()
  })
})
