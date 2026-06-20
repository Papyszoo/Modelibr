import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { client } from '@/lib/apiBase'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ScriptList } from '../ScriptList'

// ScriptList opens an editor tab via the tab context; stub it so the list can
// render standalone.
jest.mock('@/hooks/useTabContext', () => ({
  useTabContext: () => ({ openScriptDetailsTab: jest.fn() }),
}))

const mockGet = client.get as jest.Mock

function scriptDto(id: number, name: string, language: string) {
  return {
    id,
    name,
    fileId: id * 10,
    categoryId: null,
    categoryName: null,
    language,
    lineCount: 5,
    fileName: `${name}.${language}`,
    fileSizeBytes: 512,
    description: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

const lua = scriptDto(1, 'player', 'lua')
const csharp = scriptDto(2, 'Enemy', 'csharp')

function page(scripts: ReturnType<typeof scriptDto>[]) {
  return {
    data: {
      scripts,
      totalCount: scripts.length,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockImplementation((url: string) => {
    if (url.startsWith('/script-categories')) {
      return Promise.resolve({ data: { categories: [] } })
    }
    // The list query filters server-side by language; once C# is selected the
    // server only returns C# scripts (this is exactly what used to collapse the
    // filter dropdown).
    if (url.includes('language=csharp')) {
      return Promise.resolve(page([csharp]))
    }
    return Promise.resolve(page([lua, csharp]))
  })
})

function dropdownPanel(): HTMLElement {
  const panel = document.querySelector('.p-dropdown-panel') as HTMLElement
  if (!panel) throw new Error('language dropdown panel not open')
  return panel
}

describe('ScriptList language filter', () => {
  // Regression: the language options were derived from the *filtered* result
  // set, so selecting C# left only C# in the dropdown and you could never get
  // back to Lua. Options must stay stable across filtering.
  it('keeps every loaded language selectable after a language is chosen', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ScriptList />)

    // Both scripts load.
    expect(await screen.findByText('player')).toBeInTheDocument()
    expect(screen.getByText('Enemy')).toBeInTheDocument()

    // Open Filters, then the language dropdown — it lists both languages.
    await user.click(screen.getByRole('button', { name: /^filters$/i }))
    await user.click(screen.getByTestId('language-filter'))
    expect(within(dropdownPanel()).getByText('Lua')).toBeInTheDocument()
    expect(within(dropdownPanel()).getByText('C#')).toBeInTheDocument()

    // Pick C# → the list refetches and returns only C# scripts.
    await user.click(within(dropdownPanel()).getByText('C#'))
    await waitFor(() =>
      expect(screen.queryByText('player')).not.toBeInTheDocument()
    )

    // Re-open the dropdown: Lua must STILL be offered (the bug dropped it).
    await user.click(screen.getByTestId('language-filter'))
    expect(within(dropdownPanel()).getByText('Lua')).toBeInTheDocument()
    expect(within(dropdownPanel()).getByText('C#')).toBeInTheDocument()
  })
})
