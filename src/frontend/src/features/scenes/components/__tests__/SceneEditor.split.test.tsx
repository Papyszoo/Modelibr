import { screen, waitFor } from '@testing-library/react'

import { useSceneEditorStore } from '@/stores'
import { renderWithProviders } from '@/test/renderWithProviders'

import * as modelApi from '../../../models/api/modelApi'
import * as projectApi from '../../../project/api/projectApi'
import * as scenesApi from '../../api/scenesApi'
import type { SceneDocument } from '../../types'
import { SceneEditor } from '../SceneEditor'

/*
  The 3D canvas cannot draw in jsdom; everything else - the store, the queries,
  the toolbar - is the real thing.
*/
jest.mock('../SceneCanvas', () => ({
  SceneCanvas: () => <div data-testid="scene-canvas" />,
}))

jest.mock('../../api/scenesApi')
jest.mock('../../../project/api/projectApi')
jest.mock('../../../models/api/modelApi')

const scenes = scenesApi as jest.Mocked<typeof scenesApi>
const projects = projectApi as jest.Mocked<typeof projectApi>
const models = modelApi as jest.Mocked<typeof modelApi>

/**
 * Two scene tabs rendered side by side (split view) must BOTH load and keep
 * their own draft. The store used to hold one active scene behind a flat
 * projection, so whichever tab mounted last won and the other saw
 * "Loading scene…" forever.
 */
describe('two scene editors opened side by side', () => {
  function document(nodeId: string): SceneDocument {
    return {
      schemaVersion: 1,
      lights: [],
      nodes: [
        {
          id: nodeId,
          name: nodeId,
          transform: {
            position: { x: 0, y: 0, z: 0 },
            rotationEuler: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          asset: { assetType: 'Model', assetId: 12, versionId: 34 },
          visible: true,
        },
      ],
    }
  }

  function sceneView(id: number, name: string) {
    return {
      scene: {
        id,
        name,
        description: null,
        revision: 1,
        projectId: null,
        projectName: null,
        stage: null,
        schemaVersion: 1,
        nodeCount: 1,
        lightCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      document: document(name.toLowerCase()),
      nodes: [],
      overlaps: [],
      scaleWarnings: [],
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Seed both sessions, exactly as the tabs would have left them.
    useSceneEditorStore.getState().open(11, document('alpha'), 1)
    useSceneEditorStore.getState().open(22, document('beta'), 1)

    scenes.getSceneById.mockImplementation((id: number) =>
      Promise.resolve(sceneView(id, id === 11 ? 'Alpha' : 'Beta') as never)
    )
    scenes.getSceneSlots.mockResolvedValue({
      sceneId: 11,
      revision: 1,
      slots: [],
    } as never)
    projects.getAllProjects.mockResolvedValue([] as never)
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)
    models.getModelsPaginated.mockResolvedValue({
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 40,
    } as never)
  })

  it('renders both scenes, each from its own draft', async () => {
    renderWithProviders(
      <>
        <SceneEditor
          sceneId={11}
          onShowSceneList={() => {}}
          registerSave={() => {}}
          onClose={() => {}}
        />
        <SceneEditor
          sceneId={22}
          onShowSceneList={() => {}}
          registerSave={() => {}}
          onClose={() => {}}
        />
      </>
    )

    // Both editors reached the canvas: neither is stuck on a loading frame
    // waiting for the other to release a single active scene.
    await waitFor(() =>
      expect(screen.getAllByTestId('scene-editor')).toHaveLength(2)
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })
})
