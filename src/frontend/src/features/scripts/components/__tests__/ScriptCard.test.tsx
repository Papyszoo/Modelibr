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

  it('puts the description in the card tooltip, not inline on the card', () => {
    const { container } = render(
      <ScriptCard
        script={{ ...baseScript, description: 'Handles player movement' }}
        isSelected={false}
        isDragging={false}
        onSelect={noop}
        onClick={noop}
        onContextMenu={noop}
        onDragStart={noop}
        onDragEnd={noop}
      />
    )

    // Tooltip carries the description (kept off the card to stay icon-forward).
    const card = screen.getByTestId('script-card')
    expect(card).toHaveAttribute(
      'title',
      expect.stringContaining('Handles player movement')
    )
    // It must NOT be rendered as visible card text.
    expect(
      screen.queryByText('Handles player movement')
    ).not.toBeInTheDocument()
    expect(container.querySelector('.script-description')).toBeNull()
  })

  it('uses just the name as the tooltip when there is no description', () => {
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

    expect(screen.getByTestId('script-card')).toHaveAttribute(
      'title',
      'player_controller'
    )
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
