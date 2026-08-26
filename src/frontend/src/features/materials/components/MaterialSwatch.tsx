import './MaterialSwatch.css'

import { type JSX } from 'react'

import { type MaterialParametersDto } from '../api/materialApi'

/**
 * The five fields the swatch actually reads.
 *
 * Narrower than `MaterialParametersDto` on purpose: a caller that has a colour and a
 * roughness - a scene choice card, say - should not have to invent an `ior` and an
 * `occlusionStrength` to draw one. Every existing caller passes a full DTO and still
 * satisfies this.
 */
export type MaterialSwatchParameters = Pick<
  MaterialParametersDto,
  'baseColorHex' | 'roughness' | 'metallic' | 'baseColorA' | 'alphaMode'
>

interface MaterialSwatchProps {
  parameters: MaterialSwatchParameters
  /** Rendered small (tile) or large (editor preview). */
  size?: 'tile' | 'editor'
}

/**
 * A parameter material has no file and, until the preview generator learns to
 * render one, no thumbnail either. It does have a colour, a roughness and a
 * metallic - so the tile shows those rather than an empty frame or a glyph.
 *
 * This is a CSS approximation, not a render: a broad specular highlight that
 * tightens as roughness drops, and a darkened base as metallic rises (a metal
 * has no diffuse response). It is honest about being a swatch - the sphere
 * render lands with the thumbnail work.
 */
export function MaterialSwatch({
  parameters,
  size = 'tile',
}: MaterialSwatchProps): JSX.Element {
  const { baseColorHex, roughness, metallic, baseColorA, alphaMode } =
    parameters

  // Rough surfaces spread the highlight to nearly the whole sphere; smooth ones
  // concentrate it. 12%..70% keeps both extremes readable at tile size.
  const highlightSpread = 12 + roughness * 58
  const highlightAlpha = 0.75 - roughness * 0.55
  // Metals darken the diffuse term; the highlight carries the colour instead.
  const baseShade = 1 - metallic * 0.45

  const isTransparent = alphaMode === 'Blend' && baseColorA < 1

  return (
    <div
      className={`material-swatch material-swatch--${size}${
        isTransparent ? ' material-swatch--transparent' : ''
      }`}
      data-testid="material-swatch"
    >
      <div
        className="material-swatch-sphere"
        // Material colour is content, not chrome - the same exception three.js
        // scene colours take. It cannot come from a token; it is user data.
        style={{
          backgroundColor: baseColorHex,
          filter: `brightness(${baseShade})`,
          opacity: isTransparent ? Math.max(baseColorA, 0.25) : 1,
        }}
      >
        <span
          className="material-swatch-highlight"
          style={{
            background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,${highlightAlpha}) 0%, rgba(255,255,255,0) ${highlightSpread}%)`,
          }}
        />
      </div>
    </div>
  )
}
