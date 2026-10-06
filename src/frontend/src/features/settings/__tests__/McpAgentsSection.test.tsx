import { screen } from '@testing-library/react'

import * as mcpAgentsApi from '@/features/settings/api/mcpAgentsApi'
import { renderWithProviders } from '@/test/renderWithProviders'

import { McpAgentsSection } from '../McpAgentsSection'

jest.mock('@/features/settings/api/mcpAgentsApi')

const api = mcpAgentsApi as jest.Mocked<typeof mcpAgentsApi>

describe('McpAgentsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('lists every agent with its family chips and tools', async () => {
    // The view exists to tell users exactly what an agent can call, so a render
    // that dropped `families` or `tools` would leave the read-only contract
    // unverifiable - the section would still look populated.
    api.getMcpAgents.mockResolvedValue([
      {
        name: 'stylist',
        description: 'Edits materials and texture sets',
        families: ['Model', 'TextureSet'],
        tools: [
          {
            name: 'bind_texture_set',
            description: 'Bind a texture set to a model version',
          },
          { name: 'create_material', description: 'Create a global material' },
        ],
      },
      {
        name: 'librarian',
        description: 'Organises models, packs and projects',
        families: ['Pack'],
        tools: [
          { name: 'tag_asset', description: 'Apply tags to an asset' },
          { name: 'move_to_pack', description: 'Move a model into a pack' },
          { name: 'create_project', description: 'Create a project' },
          {
            name: 'set_project_thumbnail',
            description: 'Set a project thumbnail',
          },
        ],
      },
    ])

    renderWithProviders(<McpAgentsSection />)

    expect(await screen.findByText('stylist')).toBeInTheDocument()
    expect(
      screen.getByText('Edits materials and texture sets')
    ).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('TextureSet')).toBeInTheDocument()
    expect(screen.getByText('bind_texture_set')).toBeInTheDocument()
    expect(
      screen.getByText('Bind a texture set to a model version')
    ).toBeInTheDocument()

    expect(screen.getByText('librarian')).toBeInTheDocument()
    expect(screen.getByText('Pack')).toBeInTheDocument()
    // A long tool list is summarised, not dumped in full, by default.
    expect(screen.getByText('Tools (4)')).toBeInTheDocument()
  })
})
