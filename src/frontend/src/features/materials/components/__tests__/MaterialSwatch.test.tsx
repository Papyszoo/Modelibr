import { render, screen } from '@testing-library/react'

import { type MaterialDto } from '../../api/materialApi'
import { MaterialSwatch } from '../MaterialSwatch'

// The real preview mounts a WebGL canvas, which jsdom cannot draw. This test
// only asserts which surface the swatch chooses; the preview's own rendering
// is exercised in the browser.
jest.mock('../MaterialEffectPreview', () => ({
  MaterialEffectPreview: ({ animated }: { animated: boolean }) => (
    <div
      data-testid="material-effect-preview"
      data-animated={String(animated)}
    />
  ),
}))

function material(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 1,
    name: 'Test Material',
    description: null,
    categoryId: null,
    categoryName: null,
    previewGeometryType: 'sphere',
    requiresUvs: false,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    parameters: {
      baseColorR: 0.5,
      baseColorG: 0.5,
      baseColorB: 0.5,
      baseColorA: 1,
      baseColorHex: '#808080',
      roughness: 0.5,
      metallic: 0,
      emissiveR: 0,
      emissiveG: 0,
      emissiveB: 0,
      normalScale: 1,
      occlusionStrength: 1,
      ior: 1.5,
      alphaMode: 'Opaque',
      alphaCutoff: 0.5,
      doubleSided: false,
    },
    ...overrides,
  }
}

const rimEffects = {
  version: 1 as const,
  effects: [{ type: 'rim' as const, color: '#ffffff', power: 3, intensity: 1 }],
}

describe('MaterialSwatch', () => {
  it('keeps the CSS swatch for a material without effects', () => {
    // Effect-free is the common case and must not change: no canvas, the same
    // swatch every existing caller renders.
    const value = material()
    render(<MaterialSwatch parameters={value.parameters} material={value} />)

    expect(screen.getByTestId('material-swatch')).toBeInTheDocument()
    expect(
      screen.queryByTestId('material-effect-preview')
    ).not.toBeInTheDocument()
  })

  it('keeps the CSS swatch when no full material is passed', () => {
    // Scene callers pass only the five scalars; the branch must not require a
    // full material to draw a swatch.
    render(
      <MaterialSwatch
        parameters={{
          baseColorHex: '#808080',
          roughness: 0.5,
          metallic: 0,
          baseColorA: 1,
          alphaMode: 'Opaque',
        }}
      />
    )

    expect(screen.getByTestId('material-swatch')).toBeInTheDocument()
    expect(
      screen.queryByTestId('material-effect-preview')
    ).not.toBeInTheDocument()
  })

  it('renders the real preview for a material with effects', () => {
    const value = material({ effects: rimEffects })
    render(<MaterialSwatch parameters={value.parameters} material={value} />)

    expect(screen.getByTestId('material-effect-preview')).toBeInTheDocument()
  })

  it('renders a still frame in a tile and an animated one in the editor', () => {
    // Step 2/3: the grid must not animate; the open editor must.
    const value = material({ effects: rimEffects })
    const { unmount } = render(
      <MaterialSwatch parameters={value.parameters} material={value} />
    )
    expect(screen.getByTestId('material-effect-preview')).toHaveAttribute(
      'data-animated',
      'false'
    )
    unmount()

    render(
      <MaterialSwatch
        parameters={value.parameters}
        material={value}
        size="editor"
      />
    )
    expect(screen.getByTestId('material-effect-preview')).toHaveAttribute(
      'data-animated',
      'true'
    )
  })

  it('falls back to the CSS swatch for an invalid effects document', () => {
    // The parser is the trust boundary; a malformed document is the plain PBR
    // material rather than a crash or an empty canvas.
    const value = material({
      effects: { version: 2, effects: [] } as unknown as MaterialDto['effects'],
    })
    render(<MaterialSwatch parameters={value.parameters} material={value} />)

    expect(screen.getByTestId('material-swatch')).toBeInTheDocument()
    expect(
      screen.queryByTestId('material-effect-preview')
    ).not.toBeInTheDocument()
  })
})
