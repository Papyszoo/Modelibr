import path from 'node:path'

import { readCssRules } from '@/test/cssRules'

const PROJECT_CSS = path.resolve(__dirname, '../ProjectList.css')

describe('project grid rows', () => {
  // Regression: same trap as the pack gallery (both cards clip their overflow,
  // so their automatic minimum height is 0) - the projects grid would compress
  // its rows into the container instead of scrolling once it held more cards
  // than fit. jsdom does no layout, so the stylesheet is the contract.
  it('sizes rows from their content so the cards keep their height', () => {
    expect(readCssRules(PROJECT_CSS, '.project-grid')).toMatch(
      /grid-auto-rows:\s*max-content/
    )
  })
})
