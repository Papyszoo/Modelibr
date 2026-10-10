import { screen, waitFor } from '@testing-library/react'

import { useSceneEditorStore } from '@/stores'
import { renderWithProviders } from '@/test/renderWithProviders'

import * as modelApi from '../../../models/api/modelApi'
import * as projectApi from '../../../project/api/projectApi'
import * as scenesApi from '../../api/scenesApi'
import type { SceneDocument } from '../../types'
import { SceneEditor } from '../SceneEditor'

/*
  The canvas is stubbed with one that reports its node as settled-loaded, which
  is the signal the editor uses to clear a stale failure. Everything else is real.
*/
jest.mock('../SceneCanvas', () => {
  const { useEffect } = require('react')
  return {
    SceneCanvas: ({
      onNodeLoadSettled,
    }: {
      onNodeLoadSettled?: (nodeId: string, loaded: boolean) => void
    }) => {
      useEffect(() => {
        onNodeLoadSettled?.('alpha', true)
      }, [onNodeLoadSettled])
      return <div data-testid="scene-canvas" />
    },
  }
})

jest.mock('../../api/scenesApi')
jest.mock('../../../project/api/projectApi')
jest.mock('../../../models/api/modelApi')

const scenes = scenesApi as jest.Mocked<typeof scenesApi>
const projects = projectApi as jest.Mocked<typeof projectApi>
const models = modelApi as jest.Mocked<typeof modelApi>

/**
 * Regression: a node failure flag survived a successful retry until the whole
 * draft was reseeded, so the hierarchy kept marking a node that was drawing
 * fine. The editor now clears it when the node reports itself loaded.
 */
describe('SceneEditor node failures', () => {
  const document: SceneDocument = {
    schemaVersion: 1,
    lights: [],
    nodes: [
      {
        id: 'alpha',
        name: 'alpha',
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

  beforeEach(() => {
    jest.clearAllMocks()
    useSceneEditorStore.getState().open(11, document, 1)
    useSceneEditorStore.getState().recordNodeFailure('alpha', 'texture 404', 11)

    scenes.getSceneById.mockResolvedValue({
      scene: {
        id: 11,
        name: 'Alpha',
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
      document,
      nodes: [],
      overlaps: [],
      scaleWarnings: [],
    } as never)
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

  it('clears a node failure once that node reports itself loaded', async () => {
    renderWithProviders(
      <SceneEditor
        sceneId={11}
        onShowSceneList={() => {}}
        registerSave={() => {}}
        onClose={() => {}}
      />
    )

    expect(await screen.findByTestId('scene-canvas')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        useSceneEditorStore.getState().drafts[11]?.failedNodes.has('alpha')
      ).toBe(false)
    )
  })
})
