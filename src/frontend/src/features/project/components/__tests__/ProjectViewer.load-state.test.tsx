import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ContainerViewer } from '@/shared/components/ContainerViewer'
import {
  type ContainerAdapter,
  type ContainerDto,
} from '@/shared/types/ContainerTypes'
import { renderWithProviders } from '@/test/renderWithProviders'

function projectContainer(overrides: Partial<ContainerDto> = {}): ContainerDto {
  return {
    id: 9,
    name: 'Missing Meridian',
    description: '',
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    modelCount: 0,
    globalMaterialCount: 0,
    multiModelTextureCount: 0,
    spriteCount: 0,
    soundCount: 0,
    scriptCount: 0,
    environmentMapCount: 0,
    isEmpty: true,
    customThumbnailUrl: null,
    conceptImageCount: 0,
    conceptImages: [],
    models: [],
    textureSets: [],
    sprites: [],
    environmentMaps: [],
    ...overrides,
  }
}

function adapter(loadContainer: jest.Mock): ContainerAdapter {
  const unused = jest.fn().mockResolvedValue([])
  return {
    type: 'project',
    containerId: 9,
    label: 'Project',
    cssPrefix: 'container',
    renderDetails: () => <div>Project details loaded</div>,
    loadContainer,
    loadModels: unused,
    loadTextureSets: unused,
    loadSprites: unused,
    loadSounds: unused,
    loadScripts: unused,
    loadEnvironmentMaps: unused,
    addModel: jest.fn(),
    removeModel: jest.fn(),
    addTextureSet: jest.fn(),
    removeTextureSet: jest.fn(),
    addSprite: jest.fn(),
    removeSprite: jest.fn(),
    addSound: jest.fn(),
    removeSound: jest.fn(),
    addScript: jest.fn(),
    removeScript: jest.fn(),
    addEnvironmentMap: jest.fn(),
    removeEnvironmentMap: jest.fn(),
    uploadTextureWithFile: jest.fn(),
    createSpriteOptions: jest.fn(),
    createSoundOptions: jest.fn(),
    createScriptOptions: jest.fn(),
  }
}

describe('ProjectViewer load states', () => {
  it('shows loading while the Project request is pending', () => {
    const loadContainer = jest.fn(
      () => new Promise<ContainerDto>(() => undefined)
    )

    renderWithProviders(<ContainerViewer adapter={adapter(loadContainer)} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading project…')
  })

  it('shows the real failure and recovers through Retry', async () => {
    // A rejected detail request used to be reduced to the same undefined value
    // as an initial load, leaving the viewer on "Loading..." forever.
    const loadContainer = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('API connection lost'), { status: 500 })
      )
      .mockResolvedValueOnce(projectContainer())

    renderWithProviders(<ContainerViewer adapter={adapter(loadContainer)} />)

    expect(await screen.findByText('API connection lost')).toBeVisible()
    expect(screen.queryByText('Loading project…')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Project details loaded')).toBeVisible()
  })

  it('distinguishes a successful response with no Project data from a failure', async () => {
    const loadContainer = jest.fn().mockResolvedValue(null)

    renderWithProviders(<ContainerViewer adapter={adapter(loadContainer)} />)

    expect(await screen.findByText('Project data is unavailable')).toBeVisible()
    expect(screen.queryByText('Loading project…')).not.toBeInTheDocument()
  })
})
