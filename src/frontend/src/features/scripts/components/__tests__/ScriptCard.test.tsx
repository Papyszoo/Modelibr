import { fireEvent, render, screen } from '@testing-library/react'

import { type ScriptDto } from '@/types'

import { ScriptCard } from '../ScriptCard'

const baseScript: ScriptDto = {
  id: 7,
  name: 'player_controller',
  fileId: 511,
  categoryId: null,
  categoryName: null,
  language: 'lua',
  lineCount: 12,
  fileName: 'player_controller.lua',
  fileSizeBytes: 2048,
  description: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const noop = () => {}

describe('ScriptCard', () => {
  it('renders the language badge, name, and line count', () => {
    render(
      <ScriptCard
        script={baseScript}
        isSelected={false}
        isDragging={false}
        onSelect={noop}
        onClick={noop}
        onContextMenu={noop}
        onDragStart={noop}
        onDragEnd={noop}
      />
    )

    expect(screen.getByTestId('script-language-badge')).toHaveTextContent('Lua')
    expect(screen.getByText('player_controller')).toBeInTheDocument()
    expect(screen.getByText('12 lines')).toBeInTheDocument()
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
  })

  it('maps known language ids to friendly labels', () => {
    render(
      <ScriptCard
        script={{ ...baseScript, language: 'csharp' }}
        isSelected={false}
        isDragging={false}
        onSelect={noop}
        onClick={noop}
        onContextMenu={noop}
        onDragStart={noop}
        onDragEnd={noop}
      />
    )

    expect(screen.getByTestId('script-language-badge')).toHaveTextContent('C#')
  })

  it('fires onClick when the card is clicked', () => {
    const onClick = jest.fn()
    render(
      <ScriptCard
        script={baseScript}
        isSelected={false}
        isDragging={false}
        onSelect={noop}
        onClick={onClick}
        onContextMenu={noop}
        onDragStart={noop}
        onDragEnd={noop}
      />
    )

    fireEvent.click(screen.getByText('player_controller'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
