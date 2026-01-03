import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { sharedState } from "../fixtures/shared-state";
import { PacksPage } from "../pages/PacksPage";

// DataTable interface for cucumber-style data tables
interface DataTable {
    hashes(): Array<Record<string, string>>;
    raw(): string[][];
    rows(): string[][];
}

const { Given, When, Then } = createBdd();

const API_BASE = "http://localhost:8090";

// ============= Navigation Steps =============

Given("I am on the pack list page", async ({ page }) => {
    const packsPage = new PacksPage(page);
    await packsPage.navigateToPackList();
    
    // Wait for page to load
    await page.waitForLoadState("networkidle");
    console.log("[Navigation] On pack list page");
});

Given("I am on the pack viewer for {string}", async ({ page }, packName: string) => {
    const pack = sharedState.getPack(packName);
    
    if (!pack) {
        throw new Error(`Pack "${packName}" not found in shared state`);
    }
    
    // URL format per tabSerialization.ts: 'pack-{id}' (not 'packViewer-{id}')
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
    await page.goto(`${baseUrl}/?leftTabs=pack-${pack.id}&activeLeft=pack-${pack.id}`);
    await page.waitForLoadState("networkidle");
    console.log(`[Navigation] Opened pack viewer for "${packName}" (ID: ${pack.id})`);
});

// ============= Background/Setup Steps =============

Given("the following packs exist in shared state:", async ({ page }, dataTable: DataTable) => {
    const packs = dataTable.hashes();
    
    for (const row of packs) {
        const packName = row.name;
        const pack = sharedState.getPack(packName);
        
        if (!pack) {
            throw new Error(
                `Pack "${packName}" not found in shared state. ` +
                `Ensure pack creation scenarios have run first.`
            );
        }
        console.log(`[SharedState] Verified pack exists: ${packName}`);
    }
});

// ============= Pack CRUD Steps =============

When(
    "I create a pack named {string} with description {string}",
    async ({ page }, name: string, description: string) => {
        const packsPage = new PacksPage(page);
        const pack = await packsPage.createPack(name, description);
        
        sharedState.savePack(name, pack);
        console.log(`[Action] Created and stored pack "${name}"`);
    }
);

When(
    "I create a pack named {string} without description",
    async ({ page }, name: string) => {
        const packsPage = new PacksPage(page);
        const pack = await packsPage.createPack(name);
        
        sharedState.savePack(name, pack);
        console.log(`[Action] Created and stored pack "${name}" (no description)`);
    }
);

When("I open the pack {string}", async ({ page }, packName: string) => {
    const packsPage = new PacksPage(page);
    await packsPage.openPack(packName);
    console.log(`[Action] Opened pack "${packName}"`);
});

When("I delete the pack {string}", async ({ page }, packName: string) => {
    const packsPage = new PacksPage(page);
    await packsPage.deletePack(packName);
    console.log(`[Action] Deleted pack "${packName}"`);
});

// ============= Pack Assertion Steps =============

Then(
    "the pack {string} should be visible in the pack list",
    async ({ page }, packName: string) => {
        const packsPage = new PacksPage(page);
        
        // Wait for pack grid to update
        await page.waitForTimeout(1000);
        
        const isVisible = await packsPage.isPackVisible(packName);
        expect(isVisible).toBe(true);
        console.log(`[UI] Pack "${packName}" is visible ✓`);
    }
);

Then(
    "the pack {string} should not be visible in the pack list",
    async ({ page }, packName: string) => {
        const packsPage = new PacksPage(page);
        
        // Wait for pack grid to update
        await page.waitForTimeout(1000);
        
        const isVisible = await packsPage.isPackVisible(packName);
        expect(isVisible).toBe(false);
        console.log(`[UI] Pack "${packName}" is not visible ✓`);
    }
);

Then(
    "the pack {string} should be stored in shared state",
    async ({ page }, packName: string) => {
        const pack = sharedState.getPack(packName);
        expect(pack).toBeDefined();
        expect(pack?.name).toBe(packName);
        console.log(`[SharedState] Pack "${packName}" stored ✓`);
    }
);

Then("the pack viewer should be visible", async ({ page }) => {
    // Use .first() to avoid strict mode violation when multiple elements match
    const packViewer = page.locator(".pack-viewer").first();
    await expect(packViewer).toBeVisible({ timeout: 10000 });
    console.log("[UI] Pack viewer is visible ✓");
});

Then("the pack name {string} should be displayed", async ({ page }, packName: string) => {
    const header = page.locator(".pack-header h2, .pack-title");
    await expect(header).toContainText(packName);
    console.log(`[UI] Pack name "${packName}" is displayed ✓`);
});

// ============= Pack Association Steps =============

When(
    "I add model {string} to the pack",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);
        
        if (!model) {
            throw new Error(`Model "${modelStateName}" not found in shared state`);
        }
        
        // Click "Add Model" card in pack viewer (PackViewer.tsx uses .pack-card-add)
        const addModelCard = page.locator('.pack-section:has-text("Models") .pack-card-add').first();
        await addModelCard.waitFor({ state: 'visible', timeout: 10000 });
        await addModelCard.click();
        console.log('[Action] Clicked Add Model card');
        
        // Wait for dialog to appear
        await page.waitForSelector('.p-dialog:has-text("Add Models to Pack")', { state: 'visible', timeout: 5000 });
        console.log('[Action] Add Models dialog opened');
        
        // Model items are clickable divs with cursor=pointer containing checkbox + model name
        // Use the model's actual file name which is what shows in the dialog
        // In our test setup, pack-test-model's file is named test-cube.glb, so name is "test-cube"
        const modelName = model.name; // This is the file name from upload
        
        // Find the clickable model item container by model name text
        // Structure: div[cursor=pointer] > checkbox + div > img + div[name]
        const modelItems = page.locator('.p-dialog div[data-pc-section="content"] > div').filter({
            hasText: modelName
        });
        
        // Click directly on the first matching item (clickable container)
        const firstItem = modelItems.first();
        await firstItem.waitFor({ state: 'visible', timeout: 5000 });
        await firstItem.click();
        console.log(`[Action] Clicked model item: ${modelName}`);
        
        // Wait for button to become enabled (shows count > 0)
        await page.waitForTimeout(300);
        const addButton = page.locator('.p-dialog-footer button:has-text("Add Selected")').first();
        await addButton.waitFor({ state: 'visible', timeout: 5000 });
        
        // Check if button is enabled (has models selected)
        const buttonText = await addButton.textContent();
        console.log(`[Action] Add button text: ${buttonText}`);
        
        if (buttonText?.includes('(0)')) {
            // Try clicking the checkbox directly
            const checkbox = firstItem.locator('input[type="checkbox"], .p-checkbox-box').first();
            await checkbox.click({ force: true });
            console.log('[Action] Clicked checkbox directly');
            await page.waitForTimeout(300);
        }
        
        // Click Add button
        await addButton.click();
        console.log('[Action] Clicked Add button');
        
        // Wait for dialog to close
        await page.waitForSelector('.p-dialog:has-text("Add Models to Pack")', { state: 'hidden', timeout: 10000 });
        console.log('[Action] Dialog closed');
        
        // Wait for success toast
        await page.waitForTimeout(500);
        console.log(`[Action] Added model "${model.name}" to pack`);
    }
);

When(
    "I remove model {string} from the pack",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);
        
        if (!model) {
            throw new Error(`Model "${modelStateName}" not found in shared state`);
        }
        
        // Right-click on model card in pack viewer (uses .pack-card not .model-card)
        const modelCard = page.locator(`.pack-section:has-text("Models") .pack-card:has-text("${model.name}")`).first();
        await modelCard.waitFor({ state: 'visible', timeout: 10000 });
        await modelCard.click({ button: "right" });
        console.log('[Action] Right-clicked on model card');
        
        // Wait for context menu
        await page.waitForTimeout(300);
        
        // Click remove option
        const removeOption = page.locator('.p-contextmenu .p-menuitem:has-text("Remove")');
        await removeOption.click();
        console.log('[Action] Clicked Remove from pack');
        
        // Wait for model to be removed
        await page.waitForTimeout(500);
        console.log(`[Action] Removed model "${model.name}" from pack`);
    }
);

When(
    "I add texture set {string} to the pack",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);
        
        if (!textureSet) {
            throw new Error(`Texture set "${textureSetName}" not found in shared state`);
        }
        
        // Click add texture set button
        const addButton = page.locator('button:has-text("Add"):near(.pack-section:has-text("Texture"))').first();
        await addButton.click();
        await page.waitForTimeout(500);
        
        // Select texture set in dialog
        const textureItem = page.locator(`.p-dialog [data-textureset-id="${textureSet.id}"], .p-dialog .texture-item:has-text("${textureSet.name}")`);
        await textureItem.click();
        
        // Confirm
        const confirmButton = page.locator('.p-dialog-footer button:has-text("Add")');
        await confirmButton.click();
        await page.waitForTimeout(500);
        
        console.log(`[Action] Added texture set "${textureSet.name}" to pack`);
    }
);

When(
    "I remove texture set {string} from the pack",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);
        
        if (!textureSet) {
            throw new Error(`Texture set "${textureSetName}" not found in shared state`);
        }
        
        // Right-click on texture set card
        const textureCard = page.locator(`.pack-textures .texture-card:has-text("${textureSet.name}")`);
        await textureCard.click({ button: "right" });
        await page.waitForTimeout(300);
        
        // Click remove option
        const removeOption = page.locator('.p-contextmenu .p-menuitem:has-text("Remove")');
        await removeOption.click();
        await page.waitForTimeout(500);
        
        console.log(`[Action] Removed texture set "${textureSet.name}" from pack`);
    }
);

// ============= Pack Association Assertions =============

Then(
    "the pack should contain model {string}",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);
        
        if (!model) {
            throw new Error(`Model "${modelStateName}" not found in shared state`);
        }
        
        // Model cards in pack viewer use .pack-card class
        const modelCard = page.locator(`.pack-section:has-text("Models") .pack-card:has-text("${model.name}")`).first();
        await expect(modelCard).toBeVisible({ timeout: 10000 });
        console.log(`[UI] Pack contains model "${model.name}" ✓`);
    }
);

Then(
    "the pack should not contain model {string}",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);
        
        if (!model) {
            throw new Error(`Model "${modelStateName}" not found in shared state`);
        }
        
        // Check model card is not visible
        const modelCard = page.locator(`.pack-section:has-text("Models") .pack-card:has-text("${model.name}")`).first();
        await expect(modelCard).not.toBeVisible();
        console.log(`[UI] Pack does not contain model "${model.name}" ✓`);
    }
);

Then("the pack model count should be {int}", async ({ page }, expectedCount: number) => {
    const stat = page.locator('.pack-stats span:has(.pi-cube), .pack-grid-card-stats span:has(.pi-cube)');
    const text = await stat.textContent();
    const count = parseInt(text?.trim() || "0", 10);
    expect(count).toBe(expectedCount);
    console.log(`[UI] Pack model count is ${count} ✓`);
});

Then(
    "the pack should contain texture set {string}",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);
        
        if (!textureSet) {
            throw new Error(`Texture set "${textureSetName}" not found in shared state`);
        }
        
        const textureCard = page.locator(`.pack-textures .texture-card:has-text("${textureSet.name}")`);
        await expect(textureCard).toBeVisible({ timeout: 10000 });
        console.log(`[UI] Pack contains texture set "${textureSet.name}" ✓`);
    }
);

Then(
    "the pack should not contain texture set {string}",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);
        
        if (!textureSet) {
            throw new Error(`Texture set "${textureSetName}" not found in shared state`);
        }
        
        const textureCard = page.locator(`.pack-textures .texture-card:has-text("${textureSet.name}")`);
        await expect(textureCard).not.toBeVisible();
        console.log(`[UI] Pack does not contain texture set "${textureSet.name}" ✓`);
    }
);

Then("the pack texture set count should be {int}", async ({ page }, expectedCount: number) => {
    const stat = page.locator('.pack-stats span:has(.pi-palette), .pack-grid-card-stats span:has(.pi-palette)');
    const text = await stat.textContent();
    const count = parseInt(text?.trim() || "0", 10);
    expect(count).toBe(expectedCount);
    console.log(`[UI] Pack texture set count is ${count} ✓`);
});

// ============= Background Condition Steps =============

Given(
    "the pack contains model {string}",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);
        if (!model) {
            throw new Error(`Model "${modelStateName}" not found in shared state`);
        }
        
        const modelCard = page.locator(`.pack-section:has-text("Models") .pack-card:has-text("${model.name}")`).first();
        const isPresent = await modelCard.isVisible();
        
        if (!isPresent) {
            throw new Error(`Pack does not contain model "${model.name}". Add it first.`);
        }
        console.log(`[Precondition] Pack contains model "${model.name}" ✓`);
    }
);

Given(
    "the pack contains texture set {string}",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);
        if (!textureSet) {
            throw new Error(`Texture set "${textureSetName}" not found in shared state`);
        }
        
        const textureCard = page.locator(`.pack-textures .texture-card:has-text("${textureSet.name}")`);
        const isPresent = await textureCard.isVisible();
        
        if (!isPresent) {
            throw new Error(`Pack does not contain texture set "${textureSet.name}". Add it first.`);
        }
        console.log(`[Precondition] Pack contains texture set "${textureSet.name}" ✓`);
    }
);

// ============= Screenshot Steps =============

Then("I take a screenshot of the pack list", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/pack-list.png" });
    console.log("[Screenshot] Captured pack list");
});

Then("I take a screenshot after deletion", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/pack-deleted.png" });
    console.log("[Screenshot] Captured after deletion");
});

Then("I take a screenshot of the pack viewer", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/pack-viewer.png" });
    console.log("[Screenshot] Captured pack viewer");
});

Then("I take a screenshot showing model in pack", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/pack-with-model.png" });
    console.log("[Screenshot] Captured pack with model");
});
