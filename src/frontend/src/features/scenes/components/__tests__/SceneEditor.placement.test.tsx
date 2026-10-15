import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useSceneEditorStore } from '@/stores'
import { renderWithProviders } from '@/test/renderWithProviders'

import * as modelApi from '../../../models/api/modelApi'
import * as projectApi from '../../../project/api/projectApi'
import * as scenesApi from '../../api/scenesApi'
import { SceneEditor } from '../SceneEditor'

/*
  The 3D canvas cannot draw in jsdom; everything else - the store, the queries,
  the picker - is the real thing.
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
 * Where a new node lands, judged against the whole draft.
 *
 * Regression these catch: placement read only the server's footprints, so a
 * node added in the same unsaved session - which the server has never seen -
 * was invisible to it. The 1 m blockout box dropped beside a freshly placed
 * 2 m model landed at x=1, overlapping it, and the server reported an overlap
 * the user did not create.
 */
describe('scene editor placement', () => {
  function sceneView() {
    return {
      scene: {
        id: 2,
        name: 'Kitchen',
        description: null,
        revision: 4,
        projectId: null,
        projectName: null,
        stage: null,
        schemaVersion: 1,
        nodeCount: 0,
        lightCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      document: { schemaVersion: 1, nodes: [], lights: [] },
      nodes: [],
      overlaps: [],
      scaleWarnings: [],
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    useSceneEditorStore.getState().close()
    useSceneEditorStore.setState({ drafts: {} })

    scenes.getSceneById.mockResolvedValue(sceneView() as never)
    scenes.getSceneSlots.mockResolvedValue({
      sceneId: 2,
      revision: 4,
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

  async function open() {
    renderWithProviders(
      <SceneEditor
        sceneId={2}
        onShowSceneList={() => {}}
        registerSave={() => {}}
        onClose={() => {}}
      />
    )
    await screen.findByTestId('scene-canvas')
  }

  function draftNodes() {
    return useSceneEditorStore.getState().drafts[2]?.document?.nodes ?? []
  }

  it('places a box clear of a model that only exists in the unsaved draft', async () => {
    scenes.getSceneAssetFacts.mockResolvedValue({
      assetType: 'Model',
      assetId: 42,
      versionId: 1,
      sourceDimensions: { x: 2, y: 2, z: 2 },
      originConvention: null,
      gridSize: null,
      groundedYAtOrigin: 1,
      originInBounds: null,
    } as never)
    models.getModelsPaginated.mockResolvedValue({
      items: [
        {
          id: '42',
          name: 'Draft model',
          activeVersionId: 1,
          latestVersionId: 1,
        },
      ],
      totalCount: 1,
      page: 1,
      pageSize: 40,
    } as never)
    // The selected node's animation section reads the model detail under
    // ['models', 'detail', id]; without an answer React Query treats the
    // auto-mock's undefined as a query-function mistake.
    models.getModelById.mockResolvedValue({
      id: '42',
      name: 'Draft model',
    } as never)

    await open()

    fireEvent.click(await screen.findByTestId('scene-picker-tile'))
    await waitFor(() => expect(draftNodes()).toHaveLength(1))
    expect(draftNodes()[0].id).toBe('model-42-1')

    await userEvent.click(screen.getByRole('button', { name: 'Blockout box' }))

    // The model at x=0 spans -1..1. Its footprint is nowhere on the server
    // yet, so this only lands clear if the measurements the placement fetched
    // reach nextPlacementX: the box starts on the model's right edge, which
    // puts its centre (the origin) at 1 + half its own width.
    expect(draftNodes()).toHaveLength(2)
    expect(draftNodes()[1].transform.position.x).toBe(1.5)
  })
})
