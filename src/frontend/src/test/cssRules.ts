import { readFileSync } from 'node:fs'

/**
 * Reads every rule block for `selector` out of a stylesheet and returns them
 * joined, so a test can pin the declaration that fixed a layout bug.
 *
 * jsdom does no layout, so a card-height or overlay-visibility regression is
 * invisible to a rendered-DOM assertion - the stylesheet is the contract. All
 * matches are returned (not just the first) so a re-added rule inside a media
 * query also fails the assertion.
 */
export function readCssRules(cssPath: string, selector: string): string {
  const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  const blocks: string[] = []
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = rulePattern.exec(css)) !== null) {
    const selectors = match[1].split(',').map(part => part.trim())
    if (selectors.includes(selector)) {
      blocks.push(match[2])
    }
  }

  if (blocks.length === 0) {
    throw new Error(`No rule for "${selector}" in ${cssPath}`)
  }

  return blocks.join('\n')
}
