import { render, screen } from '@testing-library/react'
import type { JSX } from 'react'
import * as THREE from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RGBELoader } from 'three-stdlib'

import { CanvasErrorBoundary } from '@/features/model-viewer/components/CanvasErrorBoundary'
import { environmentMapLoader } from '@/shared/three/environmentMapLoader'

describe('environmentMapLoader', () => {
  // Regression: the loader was chosen from `url.split('.').pop()`, but the URL is
  // `/files/{id}` with no suffix, so every map went through TextureLoader - which
  // decodes an .hdr or .exr to nothing usable and looks like the environment did
  // not apply. The extension now comes from the source asset's file name.
  it('loads .hdr with RGBELoader and .exr with EXRLoader', () => {
    expect(environmentMapLoader('hdr')).toBe(RGBELoader)
    expect(environmentMapLoader('exr')).toBe(EXRLoader)
  })

  it('is case-insensitive', () => {
    expect(environmentMapLoader('HDR')).toBe(RGBELoader)
    expect(environmentMapLoader('EXR')).toBe(EXRLoader)
  })

  it('falls back to TextureLoader for an ordinary image or an unknown suffix', () => {
    expect(environmentMapLoader('png')).toBe(THREE.TextureLoader)
    expect(environmentMapLoader('')).toBe(THREE.TextureLoader)
  })
})

describe('CanvasErrorBoundary', () => {
  function Boom(): JSX.Element {
    throw new Error('loader failed')
  }

  function MaybeBoom({ shouldThrow }: { shouldThrow: boolean }): JSX.Element {
    if (shouldThrow) throw new Error('loader failed')
    return <p>loaded</p>
  }

  it('renders its fallback instead of taking the app down', () => {
    const originalError = console.error
    console.error = jest.fn()
    try {
      render(
        <CanvasErrorBoundary fallback={<p>view failed</p>}>
          <Boom />
        </CanvasErrorBoundary>
      )
    } finally {
      console.error = originalError
    }

    expect(screen.getByText('view failed')).toBeInTheDocument()
  })

  // Regression: the boundary never reset, so pointing the scene at a new
  // environment map kept rendering the old failure's fallback.
  it('resets when the resetKey changes', () => {
    const originalError = console.error
    console.error = jest.fn()
    try {
      const { rerender } = render(
        <CanvasErrorBoundary resetKey="map-a" fallback={<span>broken</span>}>
          <MaybeBoom shouldThrow />
        </CanvasErrorBoundary>
      )
      expect(screen.getByText('broken')).toBeInTheDocument()

      // A new source gets a fresh attempt.
      rerender(
        <CanvasErrorBoundary resetKey="map-b" fallback={<span>broken</span>}>
          <MaybeBoom shouldThrow={false} />
        </CanvasErrorBoundary>
      )
      expect(screen.getByText('loaded')).toBeInTheDocument()
    } finally {
      console.error = originalError
    }
  })
})
