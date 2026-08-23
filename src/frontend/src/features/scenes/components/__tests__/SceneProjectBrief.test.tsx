import { screen } from '@testing-library/react'
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
})
