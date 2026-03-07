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
    const stories = Object.values(index.entries).filter(entry => entry.type === 'story')

    expect(stories.length).toBeGreaterThan(0)

    for (const story of stories) {
      await test.step(`${story.title} / ${story.name}`, async () => {
        // Navigate to the story's isolated iframe URL
        await page.goto(`/iframe.html?id=${story.id}&viewMode=story`, {
          waitUntil: 'networkidle',
        })

        // Wait for the Storybook root to be present
        await page.locator('#storybook-root').waitFor({ state: 'visible', timeout: 10_000 })

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
