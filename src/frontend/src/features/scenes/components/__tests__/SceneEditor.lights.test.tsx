import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useSceneEditorStore } from '@/stores'
import { renderWithProviders } from '@/test/renderWithProviders'

import * as modelApi from '../../../models/api/modelApi'
import * as projectApi from '../../../project/api/projectApi'
import * as scenesApi from '../../api/scenesApi'
import { SceneEditor } from '../SceneEditor'

/*
  The 3D canvas cannot draw in jsdom; everything else - the store, the queries,
  the inspector - is the real thing.
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
 * The Light button's light, and the inspector that edits it.
 *
 * Regressions these catch: the button added a light nothing could select or
 * edit, so its intensity, colour and aim were agent-only (the exact complaint
 * while recording the scenes video), and a light whose properties can only be
 * changed by editing the saved document by hand.
 */
describe('scene editor lights', () => {
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

  function light() {
    return useSceneEditorStore.getState().document?.lights[0] ?? null
  }

  it('adds a key light and selects it for the inspector', async () => {
    await open()

    await userEvent.click(screen.getByRole('button', { name: 'Light' }))

    // The added light opens in the inspector; there is no other way to reach
    // it, so an add that does not select leaves the light uneditable.
    expect(await screen.findByLabelText('Intensity')).toBeVisible()
    expect(light()?.type).toBe('directional')
  })

  it('edits the selected light intensity, colour and aim from the inspector', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Light' }))

    // PrimeReact's InputNumber commits typed values on blur, so it is typed
    // into and left, exactly as a user edits it.
    const intensity = await screen.findByLabelText('Intensity')
    await userEvent.clear(intensity)
    await userEvent.type(intensity, '2.5')
    await userEvent.tab()

    fireEvent.input(screen.getByLabelText('Colour'), {
      target: { value: '#ff0000' },
    })

    const aimZ = document.getElementById('Aim at-z') as HTMLInputElement
    await userEvent.clear(aimZ)
    await userEvent.type(aimZ, '3')
    await userEvent.tab()

    expect(light()?.intensity).toBe(2.5)
    expect(light()?.color).toBe('#ff0000')
    expect(light()?.target).toEqual({ x: 0, y: 0, z: 3 })
  })
})
