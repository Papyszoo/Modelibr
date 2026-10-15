import { fireEvent, screen, waitFor } from '@testing-library/react'

import { renderWithProviders } from '@/test/renderWithProviders'

import * as vfxApi from '../../api/vfxApi'
import { fitComponents, VfxEditor } from '../VfxEditor'

/*
  The 3D preview cannot draw in jsdom, so the canvas is stubbed. Everything
  else - the inspector, the timeline, the query and the toolbar - is real.
*/
jest.mock('../VfxPreview', () => ({
  VfxPreview: () => <div data-testid="vfx-preview" />,
}))

jest.mock('../../api/vfxApi')

const vfx = vfxApi as jest.Mocked<typeof vfxApi>

const detail = {
  id: 1,
  name: 'Spark fountain',
  description: null,
  definition: {
    version: 1 as const,
    duration: 2,
    loop: false,
    components: [
      {
        id: 'particles-1',
        type: 'particles' as const,
        name: 'Sparks',
        start: 0,
        duration: 1,
        particles: {
          mode: 'continuous' as const,
          rate: 60,
          count: 100,
          lifetime: 1,
          speed: 2,
          spread: 25,
          gravity: -2,
          sizeStart: 0.15,
          sizeEnd: 0,
          colorStart: '#ffd27a',
          colorEnd: '#ff4a1c',
          opacityStart: 1,
          opacityEnd: 0,
          blending: 'additive' as const,
          spriteId: null,
          seed: 7,
        },
      },
      {
        id: 'light-1',
        type: 'light' as const,
        name: 'Glow',
        start: 0.5,
        duration: 1,
        position: [0, 0, 0] as [number, number, number],
        light: { color: '#ffb466', range: 6 },
        tracks: {
          intensity: [
            [0, 0],
            [1, 4],
          ] as [number, number][],
        },
      },
    ],
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('VfxEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    vfx.getVfx.mockResolvedValue(detail as never)
    vfx.updateVfx.mockResolvedValue(detail as never)
    vfx.vfxProblems.mockReturnValue([])
  })

  it('loads the effect into the toolbar, preview and timeline', async () => {
    renderWithProviders(<VfxEditor vfxId={1} />, { tabId: 'vfxEditor-1' })

    expect(await screen.findByTestId('vfx-editor')).toBeInTheDocument()
    expect(screen.getByLabelText('Effect name')).toHaveValue('Spark fountain')
    expect(screen.getByTestId('vfx-preview')).toBeInTheDocument()
    expect(screen.getAllByTestId('vfx-timeline-track')).toHaveLength(2)
  })

  // Regression: clearing the effect name showed no inline message (the autosave
  // silently substituted "Untitled effect"), unlike the project and material
  // name fields. The field must flag the empty name after the user leaves it.
  it('shows an inline error when the effect name is cleared', async () => {
    renderWithProviders(<VfxEditor vfxId={1} />, { tabId: 'vfxEditor-1' })
    await screen.findByTestId('vfx-editor')

    const input = screen.getByLabelText('Effect name')
    fireEvent.change(input, { target: { value: '' } })
    // Not shown until the field is left, so opening the editor stays quiet.
    expect(screen.queryByTestId('vfx-name-error')).not.toBeInTheDocument()

    fireEvent.blur(input)

    expect(await screen.findByTestId('vfx-name-error')).toHaveTextContent(
      'Name is required.'
    )
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  // Regression: the save-state text ignored `update.isError`, and for a
  // non-400 failure there are no problems to list, so a rejected autosave read
  // "Saved" while the edit existed only in the browser.
  it('reports a failed autosave instead of Saved', async () => {
    vfx.updateVfx.mockRejectedValue(new Error('Network down'))

    renderWithProviders(<VfxEditor vfxId={1} />, { tabId: 'vfxEditor-1' })
    await screen.findByTestId('vfx-editor')

    fireEvent.change(screen.getByLabelText('Effect name'), {
      target: { value: 'Changed name' },
    })

    await waitFor(
      () =>
        expect(screen.getByTestId('vfx-save-state')).toHaveTextContent(
          'Save failed'
        ),
      { timeout: 3000 }
    )
  })

  // Regression: `setDirty(false)` ran before the mutation, so a rejected save
  // left the editor clean - the unmount flush skipped it and the edit was lost
  // on navigation. A failed save must stay dirty.
  it('stays dirty after a failed autosave so the edit flushes on unmount', async () => {
    vfx.updateVfx.mockRejectedValue(new Error('Network down'))

    const { unmount } = renderWithProviders(<VfxEditor vfxId={1} />, {
      tabId: 'vfxEditor-1',
    })
    await screen.findByTestId('vfx-editor')

    fireEvent.change(screen.getByLabelText('Effect name'), {
      target: { value: 'Keep me on failure' },
    })

    await waitFor(
      () =>
        expect(screen.getByTestId('vfx-save-state')).toHaveTextContent(
          'Save failed'
        ),
      { timeout: 3000 }
    )
    expect(vfx.updateVfx).toHaveBeenCalledTimes(1)

    unmount()

    await waitFor(() => expect(vfx.updateVfx).toHaveBeenCalledTimes(2))
    expect(vfx.updateVfx).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ name: 'Keep me on failure' })
    )
  })

  // Regression: unmounting the editor (a tab switch) inside the 600 ms
  // debounce cleared the timer without flushing it, and the edit was lost.
  it('flushes a pending autosave on unmount', async () => {
    const { unmount } = renderWithProviders(<VfxEditor vfxId={1} />, {
      tabId: 'vfxEditor-1',
    })
    await screen.findByTestId('vfx-editor')

    fireEvent.change(screen.getByLabelText('Effect name'), {
      target: { value: 'Saved on the way out' },
    })
    unmount()

    await waitFor(() =>
      expect(vfx.updateVfx).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'Saved on the way out' })
      )
    )
  })
})

describe('fitComponents', () => {
  const component = (
    start: number,
    duration: number
  ): Parameters<typeof fitComponents>[0][number] => ({
    id: 'light-1',
    type: 'light',
    name: 'Glow',
    start,
    duration,
    light: { color: '#ffb466', range: 6 },
  })

  it('shrinks and slides components so none runs past the effect', () => {
    // The regression: shortening the effect left components hanging outside
    // it, which the server rejects on the next save.
    const [fitted] = fitComponents([component(1.5, 1)], 2)

    expect(fitted.duration).toBeLessThanOrEqual(2)
    expect(fitted.start + fitted.duration).toBeLessThanOrEqual(2)
  })

  it('leaves a component that already fits untouched', () => {
    const inside = component(0, 1)

    expect(fitComponents([inside], 5)[0]).toBe(inside)
  })
})
