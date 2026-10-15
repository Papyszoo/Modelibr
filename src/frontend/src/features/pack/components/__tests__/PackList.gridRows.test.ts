import path from 'node:path'

import { readCssRules } from '@/test/cssRules'

const PACK_CSS = path.resolve(__dirname, '../PackList.css')

describe('pack grid rows', () => {
  // Regression: the pack card clips its own overflow, so its automatic minimum
  // height is 0. With a definite grid height (flex: 1 in a bounded column) the
  // auto rows were squeezed to share that height instead of scrolling: the
  // gallery rendered as 76px strips with every title, description and count
  // clipped away. jsdom does no layout, so the stylesheet is the contract.
  it('sizes rows from their content so the cards keep their height', () => {
    expect(readCssRules(PACK_CSS, '.pack-grid')).toMatch(
      /grid-auto-rows:\s*max-content/
    )
  })
})
