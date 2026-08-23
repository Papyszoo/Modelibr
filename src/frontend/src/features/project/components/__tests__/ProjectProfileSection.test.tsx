import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '@/test/renderWithProviders'
import type { ProjectBriefDto, ProjectProfileOptionDto } from '@/types'

import * as projectApi from '../../api/projectApi'
import { ProjectProfileSection } from '../ProjectProfileSection'

jest.mock('../../api/projectApi')

const api = projectApi as jest.Mocked<typeof projectApi>

function option(
  id: number,
  dimension: string,
  name: string
): ProjectProfileOptionDto {
  return {
    id,
    dimension,
    name,
    isBuiltIn: true,
    isHidden: false,
    sortOrder: id,
  }
}

function brief(overrides: Partial<ProjectBriefDto> = {}): ProjectBriefDto {
  return {
    id: 1,
    name: 'Rooftop chase',
    description: null,
    notes: null,
    engines: [],
    platforms: [],
    genres: [],
    styles: [{ optionId: 20, name: 'Low Poly', role: null }],
    perspectives: [],
    budget: {
      maxTrianglesPerAsset: null,
      maxTextureSize: null,
      targetSceneTriangles: null,
      pixelsPerUnit: null,
    },
    budgetSuggestion: null,
    worldConvention: {
      unitsPerMetre: 1,
      upAxis: 'Y',
      handedness: 'right',
      isDefault: true,
      engineConversions: [],
      conflicts: [],
    },
    styleSignals: {
      maxTriangles: null,
      maxTextureSize: null,
      maxMaterials: null,
      preferredUvStatus: null,
      boostTokens: [],
      penaltyTokens: [],
      familyHint: null,
      unmappedStyles: [],
    },
    paletteHex: [],
    conceptImages: [],
    environmentMaps: [],
    scenes: [],
    assetCounts: {
      models: 0,
      textureSets: 0,
      sprites: 0,
      sounds: 0,
      scripts: 0,
      environmentMaps: 0,
      scenes: 0,
    },
    guidance: [],
    ...overrides,
  }
}

describe('ProjectProfileSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.getProjectProfileOptions.mockResolvedValue([
      option(20, 'style', 'Low Poly'),
      option(21, 'style', 'Realistic'),
      option(30, 'platform', 'Quest'),
    ])
    api.getProjectBrief.mockResolvedValue(brief())
    api.setProjectProfile.mockResolvedValue(brief())
  })

  const render = () =>
    renderWithProviders(
      <ProjectProfileSection projectId={1} showToast={jest.fn()} />
    )

  it('offers a budget suggestion as a hint that names its platform, and does not apply it', async () => {
    // A number with no reason attached is a number nobody can argue with - and
    // one written into the field for the user is a decision they never made.
    api.getProjectBrief.mockResolvedValue(
      brief({
        budgetSuggestion: {
          maxTrianglesPerAsset: 5000,
          maxTextureSize: 1024,
          platform: 'Quest',
          note: 'Quest is the tightest platform here: 5,000 triangles per asset.',
        },
      })
    )

    render()

    expect(
      await screen.findByTestId('project-profile-suggestion')
    ).toHaveTextContent('Quest is the tightest platform here')

    // Not written until the user accepts it.
    await userEvent.click(screen.getByTestId('project-profile-save'))
    await waitFor(() => expect(api.setProjectProfile).toHaveBeenCalled())
    expect(api.setProjectProfile.mock.calls[0][1].settings).toMatchObject({
      maxTrianglesPerAsset: null,
    })
  })

  it('applies the suggestion only once the user accepts it', async () => {
    api.getProjectBrief.mockResolvedValue(
      brief({
        budgetSuggestion: {
          maxTrianglesPerAsset: 5000,
          maxTextureSize: 1024,
          platform: 'Quest',
          note: 'Quest is the tightest platform here.',
        },
      })
    )

    render()

    await userEvent.click(
      await screen.findByTestId('project-profile-accept-suggestion')
    )
    await userEvent.click(screen.getByTestId('project-profile-save'))

    await waitFor(() => expect(api.setProjectProfile).toHaveBeenCalled())
    expect(api.setProjectProfile.mock.calls[0][1].settings).toMatchObject({
      maxTrianglesPerAsset: 5000,
      maxTextureSize: 1024,
    })
  })

  it('sends option ids, not names', async () => {
    render()

    await userEvent.click(await screen.findByTestId('project-profile-save'))

    await waitFor(() => expect(api.setProjectProfile).toHaveBeenCalled())
    expect(api.setProjectProfile.mock.calls[0][1].dimensions?.style).toEqual([
      { optionId: 20, role: null },
    ])
  })

  it('creates a vocabulary option before selecting it', async () => {
    // The field stores an id, so a name the vocabulary does not have cannot be
    // selected until it exists.
    api.createProjectProfileOption.mockResolvedValue(
      option(99, 'style', 'Voxel')
    )

    render()

    const input = await screen.findByTestId('profile-style')
    await userEvent.type(input, 'Voxel{Enter}')

    await waitFor(() =>
      expect(api.createProjectProfileOption).toHaveBeenCalledWith(
        'style',
        'Voxel'
      )
    )
  })

  it('shows the brief verbatim rather than composing one', async () => {
    api.getProjectBrief.mockResolvedValue(
      brief({ guidance: ['Keep every hero prop under 5,000 triangles.'] })
    )

    render()

    await userEvent.click(
      await screen.findByTestId('project-profile-brief-toggle')
    )

    expect(screen.getByTestId('project-profile-brief')).toHaveTextContent(
      'Keep every hero prop under 5,000 triangles.'
    )
  })

  it('states an engine conflict rather than resolving it', async () => {
    api.getProjectBrief.mockResolvedValue(
      brief({
        worldConvention: {
          unitsPerMetre: 1,
          upAxis: 'Y',
          handedness: 'right',
          isDefault: false,
          engineConversions: ['Unity: 1 unit = 1 m, Y up, left-handed'],
          conflicts: ['Unreal is Z-up while Unity is Y-up.'],
        },
      })
    )

    render()

    await userEvent.click(
      await screen.findByTestId('project-profile-brief-toggle')
    )

    expect(screen.getByTestId('project-profile-brief')).toHaveTextContent(
      'Unreal is Z-up while Unity is Y-up.'
    )
  })
})
