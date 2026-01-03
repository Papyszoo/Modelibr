import { Page, Locator } from '@playwright/test'

const API_BASE = 'http://localhost:8090'

export interface PackInfo {
  id: number
  name: string
  description?: string
}

export class PacksPage {
  readonly page: Page
  readonly packListTab: Locator
  readonly createPackButton: Locator
  readonly packNameInput: Locator
  readonly packDescriptionInput: Locator
  readonly createButton: Locator
  readonly cancelButton: Locator
  readonly packGrid: Locator

  constructor(page: Page) {
    this.page = page
    this.packListTab = page.locator('[data-tab-id="packList"]')
    this.createPackButton = page.locator('button:has-text("Create Pack")')
    this.packNameInput = page.locator('#pack-name')
    this.packDescriptionInput = page.locator('#pack-description')
    this.createButton = page.locator('button:has-text("Create"):not(:has-text("Pack"))')
    this.cancelButton = page.locator('button:has-text("Cancel")')
    this.packGrid = page.locator('.pack-grid')
  }

  async navigateToPackList(): Promise<void> {
    // Click on Packs tab in sidebar or navigate directly
    // Tab type is 'packs' (not 'packList') per TabContent.tsx
    await this.page.goto('http://localhost:3002/?leftTabs=packs&activeLeft=packs')
    await this.page.waitForLoadState('networkidle')
    console.log('[Navigation] Navigated to Pack List')
  }

  async createPack(name: string, description?: string): Promise<PackInfo> {
    // Wait for the page to be fully loaded
    await this.page.waitForSelector('.pack-list-header, .pack-list-empty', { timeout: 10000 })
    
    // Click create button - could be in header or in empty state
    const createButton = this.page.locator('button:has-text("Create Pack")').first()
    await createButton.waitFor({ state: 'visible', timeout: 10000 })
    await createButton.click()
    console.log('[Action] Clicked Create Pack button')

    // Wait for dialog to appear
    await this.page.waitForSelector('.p-dialog:has-text("Create New Pack")', { state: 'visible', timeout: 5000 })
    console.log('[Action] Create Pack dialog opened')

    // Fill in pack details using correct input IDs from PackList.tsx
    const nameInput = this.page.locator('#pack-name')
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.fill(name)
    console.log(`[Action] Filled pack name: ${name}`)

    if (description) {
      const descInput = this.page.locator('#pack-description')
      await descInput.fill(description)
      console.log(`[Action] Filled pack description: ${description}`)
    }

    // Click Create button in dialog footer
    const dialogCreateBtn = this.page.locator('.p-dialog-footer button:has-text("Create")')
    await dialogCreateBtn.click()
    console.log('[Action] Clicked Create button in dialog')

    // Wait for dialog to close
    await this.page.waitForSelector('.p-dialog:has-text("Create New Pack")', { state: 'hidden', timeout: 10000 })
    console.log('[Action] Dialog closed')

    // Wait for the pack card to appear in the grid
    await this.page.waitForSelector(`.pack-grid-card:has-text("${name}")`, { state: 'visible', timeout: 10000 })
    console.log(`[Action] Pack card "${name}" visible in grid`)

    // Get the pack ID from the API
    const response = await this.page.request.get(`${API_BASE}/packs`)
    const packs = await response.json()
    const pack = packs.packs.find((p: any) => p.name === name)
    
    console.log(`[Pack] Created pack "${name}" with ID: ${pack?.id}`)
    return { id: pack?.id, name, description }
  }

  async openPack(packName: string): Promise<void> {
    const packCard = this.page.locator(`.pack-grid-card:has-text("${packName}")`)
    await packCard.click()
    await this.page.waitForTimeout(500)
    console.log(`[Navigation] Opened pack: ${packName}`)
  }

  async deletePack(packName: string): Promise<void> {
    const packCard = this.page.locator(`.pack-grid-card:has-text("${packName}")`)
    const deleteButton = packCard.locator('button[aria-label="Delete Pack"], button.p-button-danger')
    await deleteButton.click()
    await this.page.waitForTimeout(500)
    console.log(`[Action] Deleted pack: ${packName}`)
  }

  getPackCard(packName: string): Locator {
    return this.page.locator(`.pack-grid-card:has-text("${packName}")`)
  }

  async isPackVisible(packName: string): Promise<boolean> {
    const packCard = this.page.locator(`.pack-grid-card:has-text("${packName}")`)
    return await packCard.isVisible()
  }

  // PackViewer methods
  async addModelToPack(): Promise<void> {
    // Click Add button in models section
    const addButton = this.page.locator('.pack-section:has-text("Models") button:has-text("Add")')
    await addButton.click()
    await this.page.waitForTimeout(500)
    console.log('[Action] Opened Add Model dialog')
  }

  async selectModelInDialog(modelName: string): Promise<void> {
    const modelItem = this.page.locator(`.p-dialog .model-item:has-text("${modelName}")`)
    await modelItem.click()
    console.log(`[Action] Selected model: ${modelName}`)
  }

  async confirmAddSelection(): Promise<void> {
    const addButton = this.page.locator('.p-dialog-footer button:has-text("Add")')
    await addButton.click()
    await this.page.waitForTimeout(500)
    console.log('[Action] Confirmed adding items to pack')
  }

  async removeModelFromPack(modelName: string): Promise<void> {
    const modelCard = this.page.locator(`.pack-models .model-card:has-text("${modelName}")`)
    await modelCard.click({ button: 'right' })
    await this.page.waitForTimeout(300)
    const removeOption = this.page.locator('.p-contextmenu .p-menuitem:has-text("Remove")')
    await removeOption.click()
    await this.page.waitForTimeout(500)
    console.log(`[Action] Removed model "${modelName}" from pack`)
  }

  async getModelCount(): Promise<number> {
    const stat = this.page.locator('.pack-grid-card-stats span:has(.pi-cube)')
    const text = await stat.textContent()
    return parseInt(text?.trim() || '0', 10)
  }

  async getTextureSetCount(): Promise<number> {
    const stat = this.page.locator('.pack-grid-card-stats span:has(.pi-palette)')
    const text = await stat.textContent()
    return parseInt(text?.trim() || '0', 10)
  }

  async getSpriteCount(): Promise<number> {
    const stat = this.page.locator('.pack-grid-card-stats span:has(.pi-image)')
    const text = await stat.textContent()
    return parseInt(text?.trim() || '0', 10)
  }
}
