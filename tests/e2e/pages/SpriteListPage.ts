import { Page, expect } from "@playwright/test"

/**
 * Page Object Model for interacting with the Sprite List page.
 * Provides methods for navigating to sprites, interacting with sprite cards,
 * using the context menu, and recycling sprites.
 */
export class SpriteListPage {
  constructor(private page: Page) {}

  // Selectors
  private readonly spriteCard = ".sprite-card"
  private readonly contextMenu = ".p-contextmenu"
  private readonly recycleMenuItem = ".p-menuitem"
  private readonly spriteGrid = ".sprite-grid"
  private readonly spriteName = ".sprite-name"
  private readonly toastMessage = ".p-toast-message"

  /**
   * Navigate to the sprites page
   */
  async goto(): Promise<void> {
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002"
    await this.page.goto(`${baseUrl}/?leftTabs=sprites&activeLeft=sprites`)
    await this.page.waitForTimeout(2000)
    // Wait for sprites grid to be visible
    await this.page.waitForSelector(this.spriteGrid, { 
      state: "visible", 
      timeout: 10000 
    }).catch(() => {
      // Grid might not exist if no sprites, that's ok
    })
  }

  /**
   * Get a sprite card by index
   */
  getSpriteCard(index: number) {
    return this.page.locator(this.spriteCard).nth(index)
  }

  /**
   * Get a sprite card by name
   */
  getSpriteCardByName(name: string) {
    return this.page.locator(this.spriteCard).filter({
      has: this.page.locator(this.spriteName, { hasText: name })
    })
  }

  /**
   * Get the total count of sprites visible
   */
  async getSpriteCount(): Promise<number> {
    return await this.page.locator(this.spriteCard).count()
  }

  /**
   * Right-click on a sprite card to show context menu
   */
  async rightClickSprite(index: number): Promise<void> {
    const card = this.getSpriteCard(index)
    await card.click({ button: "right" })
    await this.page.waitForSelector(this.contextMenu, { 
      state: "visible",
      timeout: 5000 
    })
  }

  /**
   * Right-click on a sprite card by name to show context menu
   */
  async rightClickSpriteByName(name: string): Promise<void> {
    const card = this.getSpriteCardByName(name)
    await card.click({ button: "right" })
    await this.page.waitForSelector(this.contextMenu, { 
      state: "visible",
      timeout: 5000 
    })
  }

  /**
   * Click the Recycle menu item in the context menu
   */
  async clickRecycleMenuItem(): Promise<void> {
    const menu = this.page.locator(this.contextMenu)
    // Find the menu item containing "Recycle" text
    await menu.locator(this.recycleMenuItem).filter({ hasText: /Recycle/ }).click()
    // Wait for the operation to complete
    await this.page.waitForTimeout(1500)
  }

  /**
   * Recycle a sprite by index (right-click + click Recycle)
   */
  async recycleSprite(index: number): Promise<void> {
    await this.rightClickSprite(index)
    await this.clickRecycleMenuItem()
  }

  /**
   * Recycle a sprite by name (right-click + click Recycle)
   */
  async recycleSpriteByName(name: string): Promise<void> {
    await this.rightClickSpriteByName(name)
    await this.clickRecycleMenuItem()
  }

  /**
   * Upload a sprite from a file path
   */
  async uploadSprite(filePath: string): Promise<void> {
    // The sprite list uses drag-and-drop, but we can also trigger file input
    const fileChooserPromise = this.page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null)
    
    // If there's a visible file input, use it
    const fileInput = this.page.locator("input[type='file']").first()
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(filePath)
    } else {
      // Otherwise, create a temporary input and use it
      await this.page.evaluate(async (path) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.style.display = 'none'
        document.body.appendChild(input)
        // This would need actual file setting from test
      }, filePath)
    }
    
    await this.page.waitForTimeout(2000)
  }

  /**
   * Wait for sprite to appear in the list
   */
  async waitForSpriteByName(name: string, timeout = 10000): Promise<void> {
    await expect(this.getSpriteCardByName(name)).toBeVisible({ timeout })
  }

  /**
   * Check if a sprite exists by name
   */
  async spriteExists(name: string): Promise<boolean> {
    const card = this.getSpriteCardByName(name)
    return await card.count() > 0
  }

  /**
   * Wait for toast message to appear
   */
  async waitForToast(text: string, timeout = 5000): Promise<void> {
    await expect(
      this.page.locator(this.toastMessage).filter({ hasText: text })
    ).toBeVisible({ timeout })
  }
}
