import { waitFor } from '@testing-library/react'

import { renderWithProviders } from '@/test/renderWithProviders'

import * as vfxApi from '../../api/vfxApi'
import { VfxRenderView } from '../VfxRenderView'

jest.mock('../../api/vfxApi')
// The canvas cannot draw in jsdom; the layers it mounts are covered by the
// runtime tests, and the real draw is exercised by the worker's render.
jest.mock('@react-three/fiber', () => ({
  Canvas: () => null,
  useThree: () => ({}),
}))
jest.mock('@react-three/drei', () => ({
  useProgress: () => ({ active: false }),
}))
jest.mock('../VfxPreview', () => ({
  VfxLayers: () => null,
  VfxStage: () => null,
}))

const vfx = vfxApi as jest.Mocked<typeof vfxApi>

describe('VfxRenderView', () => {
  afterEach(() => {
    delete window.__VFX_RENDER__
  })

  // Regression guard: the worker waits for `ready`. An effect that cannot be read
  // (deleted between the save and the render) must say so right away, not leave
  // the worker waiting out its whole timeout for a page that will never draw.
  it('reports a missing effect as ready with an error so the worker stops waiting', async () => {
    vfx.getVfx.mockRejectedValue(new Error('No such effect.'))

    renderWithProviders(<VfxRenderView vfxId={9} />)

    await waitFor(() => expect(window.__VFX_RENDER__?.ready).toBe(true))
    expect(window.__VFX_RENDER__?.error).toBe('No such effect.')
  })

  it('is not ready while the effect is still loading', () => {
    vfx.getVfx.mockReturnValue(new Promise(() => undefined))

    renderWithProviders(<VfxRenderView vfxId={9} />)

    expect(window.__VFX_RENDER__).toBeUndefined()
  })
})
