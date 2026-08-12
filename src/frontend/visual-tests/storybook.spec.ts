import { expect, test } from '@playwright/test'

/**
 * Visual regression tests for all Storybook stories.
 *
 * This test reads the built Storybook index and takes screenshots of every story,
 * comparing them against baseline snapshots. Uses Playwright's built-in
 * toHaveScreenshot() which does pixel-level diffing.
 *
 * Prerequisites:
 *   - Storybook must be built first: `npm run build-storybook`
 *   - Playwright browsers installed: `npx playwright install chromium`
 */

interface StoryIndex {
  v: number
  entries: Record<string, StoryEntry>
}

interface StoryEntry {
  id: string
  title: string
  name: string
  type: 'story' | 'docs'
  tags?: string[]
}

test.describe('Visual Regression', () => {
  test('all stories render without errors', async ({ page }) => {
    // Load the Storybook index to discover all stories
    const response = await page.goto('/index.json')
    expect(response?.ok()).toBeTruthy()

    const index: StoryIndex = await response!.json()
    const stories = Object.values(index.entries).filter(
      entry => entry.type === 'story'
    )

    expect(stories.length).toBeGreaterThan(0)

    // One test walks EVERY story, so the default 30s test budget can't fit
    // the whole catalog (navigation + settle + screenshot per story). Scale
    // the budget with the story count instead of a magic constant.
    test.setTimeout(60_000 + stories.length * 5_000)

    for (const story of stories) {
      await test.step(`${story.title} / ${story.name}`, async () => {
        // Navigate to the story's isolated iframe URL
        await page.goto(`/iframe.html?id=${story.id}&viewMode=story`, {
          waitUntil: 'networkidle',
        })

        // Wait for Storybook's own "story rendered" signal: it puts
        // `sb-show-main` on <body> once the story mounted cleanly (a render
        // error flips it to `sb-show-errordisplay`, so broken stories still
        // fail here). TRAP: do NOT gate on #storybook-root being 'visible'
        // or having children - a story whose only child is fixed-positioned
        // collapses root to a zero-size box (Layout/FloatingWindow), and a
        // portal-only story leaves root empty (Models/FileUploadModal);
        // both render fine. A root-based gate aborts the whole loop and
        // leaves every later story un-snapshotted.
        await page
          .locator('body.sb-show-main')
          .waitFor({ state: 'attached', timeout: 10_000 })

        // Small delay for animations/renders to settle
        await page.waitForTimeout(500)

        // Take screenshot and compare against baseline
        await expect(page).toHaveScreenshot(`${story.id}.png`, {
          fullPage: true,
        })
      })
    }
  })
})
