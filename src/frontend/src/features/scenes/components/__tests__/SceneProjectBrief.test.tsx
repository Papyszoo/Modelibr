import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '@/test/renderWithProviders'

import * as projectApi from '../../../project/api/projectApi'
import * as scenesApi from '../../api/scenesApi'
import { SceneProjectBrief } from '../SceneProjectBrief'

jest.mock('../../../project/api/projectApi')
jest.mock('../../api/scenesApi')

const projects = projectApi as jest.Mocked<typeof projectApi>
const scenes = scenesApi as jest.Mocked<typeof scenesApi>

describe('SceneProjectBrief', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    projects.getAllProjects.mockResolvedValue([
      { id: 4, name: 'Rooftop chase' },
    ] as never)
    scenes.setSceneProject.mockResolvedValue({
      sceneId: 2,
      projectId: 4,
      revision: 8,
    })
  })

  /** Opens the panel and picks the one project on offer. */
  async function pickProject() {
    await userEvent.click(screen.getByTestId('scene-project-chip'))
    await userEvent.click(screen.getByTestId('scene-project-select'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
  }

  it('says plainly when a scene belongs to no project', async () => {
    // Not an empty panel: "no project" means the agent is given no budget, no
    // style and no world convention, which is worth stating rather than
    // leaving to be inferred from a blank box.
    renderWithProviders(
      <SceneProjectBrief sceneId={2} projectId={null} projectName={null} />
    )

    await userEvent.click(screen.getByTestId('scene-project-chip'))

    expect(
      await screen.findByTestId('scene-project-brief-unlinked')
    ).toBeInTheDocument()
    expect(projects.getProjectBrief).not.toHaveBeenCalled()
  })

  it('does not fetch the brief until the panel is opened', () => {
    renderWithProviders(
      <SceneProjectBrief
        sceneId={2}
        projectId={4}
        projectName="Rooftop chase"
      />
    )

    expect(projects.getProjectBrief).not.toHaveBeenCalled()
  })

  it('links the scene to the project the user picks', async () => {
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)

    renderWithProviders(
      <SceneProjectBrief sceneId={2} projectId={null} projectName={null} />
    )

    await userEvent.click(screen.getByTestId('scene-project-chip'))

    // The dropdown renders its list only once opened, so the picking is two
    // clicks - the same two the user makes.
    await userEvent.click(screen.getByTestId('scene-project-select'))
    await userEvent.click(await screen.findByText('Rooftop chase'))

    expect(scenes.setSceneProject).toHaveBeenCalledWith(2, 4)
  })

  it('refuses to link while the editor holds an unsaved draft', async () => {
    // Linking moves the scene's revision, and the draft was opened against the
    // old one - a save afterwards is refused as a conflict with nothing to
    // reconcile it.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)

    renderWithProviders(
      <SceneProjectBrief
        sceneId={2}
        projectId={null}
        projectName={null}
        blocked="Save your edits first."
      />
    )

    await userEvent.click(screen.getByTestId('scene-project-chip'))

    expect(
      await screen.findByTestId('scene-project-blocked')
    ).toHaveTextContent('Save your edits first.')
    await userEvent.click(screen.getByTestId('scene-project-select'))
    expect(screen.queryByText('Rooftop chase')).not.toBeInTheDocument()
    expect(scenes.setSceneProject).not.toHaveBeenCalled()
  })

  it('reports the link write as in flight, then as succeeded', async () => {
    // The other direction of the same exclusion: the editor reseeds its draft
    // from a new revision only while the draft is clean, so an edit made DURING
    // the link leaves it dirty at the old revision and the next save is refused.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)
    let settle!: (value: unknown) => void
    scenes.setSceneProject.mockReturnValue(
      new Promise(resolve => {
        settle = resolve
      }) as never
    )
    const statuses: string[] = []

    renderWithProviders(
      <SceneProjectBrief
        sceneId={2}
        projectId={null}
        projectName={null}
        onLinkStatusChange={status => statuses.push(status)}
      />
    )

    await pickProject()

    await waitFor(() => expect(statuses).toContain('pending'))

    settle({ sceneId: 2, projectId: 4, revision: 9 })
    await waitFor(() => expect(statuses[statuses.length - 1]).toBe('success'))
  })

  it('reports a refused link as failed, not merely as no longer pending', async () => {
    // The bit that was missing. The editor holds edits until the refetch the
    // link queued has landed - and a rejected link queues nothing, so "not
    // pending any more" told it to keep waiting for an event that never comes.
    // The editor stayed read-only until the tab was closed.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)
    scenes.setSceneProject.mockRejectedValue(new Error('nope'))
    const statuses: string[] = []

    renderWithProviders(
      <SceneProjectBrief
        sceneId={2}
        projectId={null}
        projectName={null}
        onLinkStatusChange={status => statuses.push(status)}
      />
    )

    await pickProject()

    await waitFor(() => expect(statuses).toContain('error'))
    expect(statuses).not.toContain('success')
  })

  it('shows why a link was refused, and leaves the control ready to retry', async () => {
    // It used to fail silently: the dropdown snapped back to the project the
    // scene still had, and nothing said anything.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)
    scenes.setSceneProject.mockRejectedValue(new Error('nope'))

    renderWithProviders(
      <SceneProjectBrief sceneId={2} projectId={null} projectName={null} />
    )

    await pickProject()

    const error = await screen.findByTestId('scene-project-error')
    expect(error).toHaveTextContent('Pick a project again to retry.')
    // Announced, because the panel it appears in is not where the eye is.
    expect(error).toHaveAttribute('role', 'alert')

    // And the retry is available: the write moved nothing, so there is nothing
    // to reconcile before trying again.
    expect(screen.getByTestId('scene-project-select')).not.toHaveClass(
      'p-disabled'
    )

    scenes.setSceneProject.mockResolvedValue({
      sceneId: 2,
      projectId: 4,
      revision: 9,
    })
    await pickProject()

    await waitFor(() => expect(scenes.setSceneProject).toHaveBeenCalledTimes(2))
  })
})
