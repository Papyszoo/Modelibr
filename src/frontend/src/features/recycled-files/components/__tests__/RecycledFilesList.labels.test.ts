import path from 'node:path'

import { readCssRules } from '@/test/cssRules'

const LIST_CSS = path.resolve(__dirname, '../RecycledFilesList.css')

describe('recycled file card labels', () => {
  // Regression: the name strip was opacity 0 until hover, so Recycled Files
  // showed anonymous blank squares and a touch user never saw which item they
  // were restoring. Matches the Models tab (`AssetTile`) overlay.
  it('keeps the name strip visible without hover', () => {
    const overlay = readCssRules(LIST_CSS, '.recycled-card-overlay')

    expect(overlay).not.toMatch(/opacity:\s*0(?![.\d])/)
    expect(overlay).toMatch(/asset-card-overlay-gradient/)
  })
})
