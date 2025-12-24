import { Page, expect, Locator } from '@playwright/test'
import * as path from 'path'

/**
 * Page object for the Texture Sets tab/page.
 * Provides methods for interacting with texture sets via the UI.
 */
export class TextureSetsPage {
  readonly page: Page
  readonly baseUrl: string

  // Selectors for texture set elements
  readonly uploadButton: Locator
  readonly fileInput: Locator
  readonly createSetButton: Locator
  readonly textureSetGrid: Locator
  readonly textureSetCards: Locator
  readonly emptyState: Locator
  readonly searchInput: Locator

  constructor(page: Page, baseUrl: string = 'http://localhost:3002') {
    this.page = page
    this.baseUrl = baseUrl

    // Header buttons
    this.uploadButton = page.locator('button[aria-label="Upload textures"]')
    this.fileInput = page.locator('input[data-testid="texture-upload-input"]')
    this.createSetButton = page.locator('button:has-text("Create Set")')

    // Grid elements
    this.textureSetGrid = page.locator('.texture-set-grid')
    this.textureSetCards = page.locator('.texture-set-card')
    this.emptyState = page.locator('.texture-set-grid-empty')
    this.searchInput = page.locator('.search-input')
  }

  /**
   * Navigate to the Texture Sets tab using URL parameters
   */
  async goto(): Promise<void> {
    // Navigate directly to texture sets using query params
    await this.page.goto(
      `${this.baseUrl}/?leftTabs=modelList,textureSets&activeLeft=textureSets`
    )

    // Wait for the page to load
    await this.page.waitForSelector('.texture-set-list', { timeout: 10000 })
  }

  /**
   * Upload texture files using the Upload Textures button.
   * This is easier to test than drag-and-drop.
   * @param filePaths - Array of file paths to upload
   */
  async uploadTextures(filePaths: string[]): Promise<void> {
    // Set up file chooser handler before clicking
    const fileChooserPromise = this.page.waitForEvent('filechooser')

    // Click the upload button
    await this.uploadButton.click()

    // Handle the file chooser
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(filePaths)

    // Wait for upload to complete (toast message appears)
    await this.page.waitForSelector('.p-toast-message', { timeout: 30000 })
  }

  /**
   * Upload a single texture file
   * @param filePath - Path to the texture file
   */
  async uploadTexture(filePath: string): Promise<void> {
    await this.uploadTextures([filePath])
  }

  /**
   * Upload a texture by setting files directly on the hidden input (alternative to file chooser)
   * @param filePaths - Array of file paths to upload
   */
  async uploadTexturesViaInput(filePaths: string[]): Promise<void> {
    await this.fileInput.setInputFiles(filePaths)

    // Wait for upload to complete
    await this.page.waitForSelector('.p-toast-message', { timeout: 30000 })
  }

  /**
   * Select a texture set by clicking on its card
   * @param name - Name of the texture set to select
   */
  async selectTextureSet(name: string): Promise<void> {
    const card = this.textureSetCards.filter({
      has: this.page.locator(`.texture-set-card-name:has-text("${name}")`),
    })
    await card.click()

    // Wait for the texture set details tab to open
    await this.page.waitForTimeout(500)
  }

  /**
   * Get the names of all visible texture sets
   */
  async getTextureSetNames(): Promise<string[]> {
    const nameLocators = this.textureSetCards.locator('.texture-set-card-name')
    return await nameLocators.allTextContents()
  }

  /**
   * Check if a texture set exists by name
   * @param name - Name of the texture set to check
   */
  async textureSetExists(name: string): Promise<boolean> {
    const card = this.textureSetCards.filter({
      has: this.page.locator(`.texture-set-card-name:has-text("${name}")`),
    })
    return (await card.count()) > 0
  }

  /**
   * Get the count of texture sets in the grid
   */
  async getTextureSetCount(): Promise<number> {
    return await this.textureSetCards.count()
  }

  /**
   * Check if the empty state is displayed
   */
  async isEmptyStateVisible(): Promise<boolean> {
    return await this.emptyState.isVisible()
  }

  /**
   * Search for texture sets by name
   * @param query - Search query
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query)
  }

  /**
   * Clear the search input
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear()
  }

  /**
   * Wait for texture sets to load
   */
  async waitForLoad(): Promise<void> {
    // Either the grid with cards or the empty state should be visible
    await Promise.race([
      this.textureSetGrid.waitFor({ state: 'visible', timeout: 10000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 10000 }),
    ])
  }

  /**
   * Create an empty texture set using the Create Set button
   * @param name - Name for the new texture set
   */
  async createEmptyTextureSet(name: string): Promise<void> {
    await this.createSetButton.click()

    // Wait for dialog to appear
    const dialog = this.page.locator('.p-dialog')
    await dialog.waitFor({ state: 'visible' })

    // Fill in the name
    const nameInput = dialog.locator('input[type="text"]')
    await nameInput.fill(name)

    // Click create/submit button
    const submitButton = dialog.locator('button:has-text("Create")')
    await submitButton.click()

    // Wait for dialog to close
    await dialog.waitFor({ state: 'hidden' })
  }

  /**
   * Right-click on a texture set to open context menu
   * @param name - Name of the texture set
   */
  async openContextMenu(name: string): Promise<void> {
    const card = this.textureSetCards.filter({
      has: this.page.locator(`.texture-set-card-name:has-text("${name}")`),
    })
    await card.click({ button: 'right' })

    // Wait for context menu to appear
    await this.page.waitForSelector('.p-contextmenu', { timeout: 5000 })
  }

  /**
   * Click an option in the context menu
   * @param option - Text of the menu option to click
   */
  async selectContextMenuOption(option: string): Promise<void> {
    const menuItem = this.page.locator(
      `.p-contextmenu .p-menuitem:has-text("${option}")`
    )
    await menuItem.click()
  }

  /**
   * Recycle a texture set via context menu
   * @param name - Name of the texture set to recycle
   */
  async recycleTextureSet(name: string): Promise<void> {
    await this.openContextMenu(name)
    await this.selectContextMenuOption('Recycle')

    // Wait for toast confirmation
    await this.page.waitForSelector('.p-toast-message', { timeout: 5000 })
  }
}
