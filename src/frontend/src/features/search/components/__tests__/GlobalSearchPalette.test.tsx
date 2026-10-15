import { fireEvent, screen } from '@testing-library/react'

import { renderWithProviders } from '@/test/renderWithProviders'

import { GlobalSearchPalette } from '../GlobalSearchPalette'

/*
  Regression: Cmd/Ctrl+K was owned by a bubble-phase window listener, so any
  child that stopped keydown propagation (the project comment badge does)
  swallowed the shortcut. The listener is now capture-phase.
*/
describe('GlobalSearchPalette', () => {
  it('opens on Cmd+K even when a focused child stops keydown propagation', async () => {
    renderWithProviders(
      <>
        <GlobalSearchPalette windowId="win" />
        <div
          data-testid="propagation-sink"
          tabIndex={0}
          onKeyDown={event => event.stopPropagation()}
        />
      </>,
      { tabId: 'newTab' }
    )

    const sink = screen.getByTestId('propagation-sink')
    sink.focus()
    fireEvent.keyDown(sink, { key: 'k', metaKey: true })

    expect(
      await screen.findByTestId('search-palette-input')
    ).toBeInTheDocument()
  })
})
