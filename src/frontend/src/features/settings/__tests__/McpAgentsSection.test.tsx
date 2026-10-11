import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import * as mcpAgentsApi from '@/features/settings/api/mcpAgentsApi'
import * as settingsApi from '@/features/settings/api/settingsApi'
import { renderWithProviders } from '@/test/renderWithProviders'

import { McpAgentsSection } from '../McpAgentsSection'

jest.mock('@/features/settings/api/mcpAgentsApi')
jest.mock('@/features/settings/api/settingsApi')

const api = mcpAgentsApi as jest.Mocked<typeof mcpAgentsApi>
const settings = settingsApi as jest.Mocked<typeof settingsApi>

/** A complete GET /settings payload; tests override the fields they exercise. */
function settingsSnapshot(
  overrides: Partial<Awaited<ReturnType<typeof settingsApi.getSettings>>> = {}
): Awaited<ReturnType<typeof settingsApi.getSettings>> {
  return {
    maxFileSizeBytes: 1073741824,
    maxThumbnailSizeBytes: 10485760,
    thumbnailFrameCount: 30,
    thumbnailSize: 256,
    generateThumbnailOnUpload: true,
    generateAnimatedThumbnail: true,
    textureProxySize: 512,
    blenderPath: 'blender',
    blenderEnabled: false,
    duplicateNamePolicy: 'Allow',
    autoAssignOnImport: true,
    cleanRecycledFilesAfterDays: 0,
    preMigrationBackupEnabled: true,
    preMigrationBackupRetention: 3,
    skipDuplicateThumbnails: false,
    mcpEnabled: true,
    mcpWriteEnabled: false,
    mcpDestructiveEnabled: false,
    thumbnailBackground: 'transparent',
    blenderOperationTimeoutMinutes: 15,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function mockMcp(
  agents: mcpAgentsApi.McpAgent[],
  tools: mcpAgentsApi.McpTool[]
): void {
  api.getMcpAgents.mockResolvedValue(agents)
  api.getMcpTools.mockResolvedValue(tools)
}

/** The tools list, scoped so agent cards naming the same tools do not interfere. */
function toolsList(): HTMLElement {
  return screen.getByRole('list', { name: 'Registered MCP tools' })
}

describe('McpAgentsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    settings.getSettings.mockResolvedValue(settingsSnapshot())
  })

  it('lists every agent with its family chips and tools', async () => {
    // The view exists to tell users exactly what an agent can call, so a render
    // that dropped `families` or `tools` would leave the read-only contract
    // unverifiable - the section would still look populated.
    mockMcp(
      [
        {
          name: 'stylist',
          description: 'Edits materials and texture sets',
          families: ['Model', 'TextureSet'],
          tools: [
            {
              name: 'bind_texture_set',
              description: 'Bind a texture set to a model version',
            },
            {
              name: 'create_material',
              description: 'Create a global material',
            },
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
      ],
      // The Tools block also lists tool names, so this uses a tool no agent
      // names - the agent-card assertions below stay unambiguous.
      [{ name: 'search_assets', description: 'Search the library' }]
    )

    renderWithProviders(<McpAgentsSection />)

    // Scoped to the agent-name element: the agent filter's <option> also carries
    // the name, so a bare text query would match two nodes.
    expect(
      await screen.findByText('stylist', { selector: '.mcp-agent-name' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Edits materials and texture sets')
    ).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('TextureSet')).toBeInTheDocument()
    expect(screen.getByText('bind_texture_set')).toBeInTheDocument()
    expect(
      screen.getByText('Bind a texture set to a model version')
    ).toBeInTheDocument()

    expect(
      screen.getByText('librarian', { selector: '.mcp-agent-name' })
    ).toBeInTheDocument()
    expect(screen.getByText('Pack')).toBeInTheDocument()
    // A long tool list is summarised, not dumped in full, by default.
    expect(screen.getByText('Tools (4)')).toBeInTheDocument()

    // And the tool surface is listed alongside the agents.
    expect(screen.getByText('Tools', { selector: 'h4' })).toBeInTheDocument()
    expect(within(toolsList()).getByText('search_assets')).toBeInTheDocument()
  })

  it('chips each tool with the agents that use it, and "no agent" for the rest', async () => {
    // The point of the tool list is attribution: a user needs to see which
    // agent, if any, can actually call a tool - a missing chip would hide the
    // difference between "assigned" and "registered but unreachable".
    mockMcp(
      [
        {
          name: 'stylist',
          description: 'Edits materials',
          families: ['Model'],
          tools: [
            {
              name: 'bind_texture_set',
              description: 'Bind a texture set to a model version',
            },
          ],
        },
        {
          name: 'librarian',
          description: 'Organises models',
          families: ['Pack'],
          tools: [{ name: 'tag_asset', description: 'Apply tags to an asset' }],
        },
      ],
      [
        {
          name: 'bind_texture_set',
          description: 'Bind a texture set to a model version',
        },
        { name: 'tag_asset', description: 'Apply tags to an asset' },
        { name: 'search_assets', description: 'Search the library' },
      ]
    )

    renderWithProviders(<McpAgentsSection />)

    const list = await screen.findByRole('list', {
      name: 'Registered MCP tools',
    })

    const unusedRow = within(list).getByText('search_assets').closest('li')!
    expect(within(unusedRow).getByText('no agent')).toBeInTheDocument()

    const stylistRow = within(list).getByText('bind_texture_set').closest('li')!
    expect(within(stylistRow).getByText('stylist')).toBeInTheDocument()
    expect(within(stylistRow).queryByText('no agent')).not.toBeInTheDocument()

    const librarianRow = within(list).getByText('tag_asset').closest('li')!
    expect(within(librarianRow).getByText('librarian')).toBeInTheDocument()
  })

  it('filters down to tools no agent uses', async () => {
    mockMcp(
      [
        {
          name: 'stylist',
          description: 'Edits materials',
          families: ['Model'],
          tools: [
            {
              name: 'bind_texture_set',
              description: 'Bind a texture set to a model version',
            },
          ],
        },
      ],
      [
        {
          name: 'bind_texture_set',
          description: 'Bind a texture set to a model version',
        },
        { name: 'search_assets', description: 'Search the library' },
      ]
    )

    renderWithProviders(<McpAgentsSection />)

    const select = await screen.findByLabelText('Filter by agent')
    const unusedOption = within(select).getByRole('option', {
      name: 'Used by no agent',
    }) as HTMLOptionElement
    fireEvent.change(select, { target: { value: unusedOption.value } })

    const list = toolsList()
    expect(within(list).getByText('search_assets')).toBeInTheDocument()
    expect(within(list).queryByText('bind_texture_set')).not.toBeInTheDocument()
  })

  it('filters by text found in a tool description, not just its name', async () => {
    mockMcp(
      [
        {
          name: 'stylist',
          description: 'Edits materials',
          families: ['Model'],
          tools: [],
        },
      ],
      [
        { name: 'render_scene', description: 'Render a scene preview' },
        { name: 'search_assets', description: 'Search the library' },
      ]
    )

    renderWithProviders(<McpAgentsSection />)

    const search = await screen.findByLabelText('Search tools')
    // "preview" appears only in the description, so this fails if the filter
    // looks at names alone.
    fireEvent.change(search, { target: { value: 'preview' } })

    const list = toolsList()
    expect(within(list).getByText('render_scene')).toBeInTheDocument()
    expect(within(list).queryByText('search_assets')).not.toBeInTheDocument()
  })

  it('saves the MCP toggles through the settings endpoint', async () => {
    settings.getSettings.mockResolvedValue(settingsSnapshot())
    settings.updateSetting.mockResolvedValue({
      key: 'McpWriteEnabled',
      value: 'true',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    mockMcp([], [])

    renderWithProviders(<McpAgentsSection />)

    const writeTools = await screen.findByRole('checkbox', {
      name: /Allow write tools/,
    })
    await waitFor(() => expect(writeTools).toBeEnabled())
    expect(writeTools).not.toBeChecked()

    await userEvent.click(writeTools)

    await waitFor(() => {
      expect(settings.updateSetting).toHaveBeenCalledWith(
        'McpWriteEnabled',
        'true'
      )
    })
  })

  it('keeps the MCP toggles visible when the agent list cannot load', async () => {
    // Turning the server off makes /mcp-agents unreachable; if the error state
    // replaced the whole section there would be no way to turn it back on.
    settings.getSettings.mockResolvedValue(
      settingsSnapshot({ mcpEnabled: false })
    )
    api.getMcpAgents.mockRejectedValue(new Error('Request failed (404)'))
    api.getMcpTools.mockRejectedValue(new Error('Request failed (404)'))

    renderWithProviders(<McpAgentsSection />)

    const toggle = await screen.findByRole('checkbox', { name: /MCP server/ })
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(toggle).not.toBeChecked()
  })
})
