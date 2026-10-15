import path from 'node:path'

import { readCssRules } from '@/test/cssRules'

const GRID_CSS = path.resolve(__dirname, '../TextureSetGrid.css')

describe('texture-set card labels', () => {
  // Regression: the name/count strip was opacity 0 until hover, so the
  // Multi-Model Textures and Global Materials grids read as a wall of
  // anonymous thumbnails (and were unlabelled on touch). The Models tab
  // (`AssetTile`) keeps its overlay visible; this grid now matches it.
  it('keeps the name strip visible without hover', () => {
    const overlay = readCssRules(GRID_CSS, '.texture-set-card-overlay')

    expect(overlay).not.toMatch(/opacity:\s*0(?![.\d])/)
    expect(overlay).toMatch(/asset-card-overlay-gradient/)
  })
})
