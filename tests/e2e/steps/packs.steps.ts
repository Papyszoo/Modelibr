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

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

// ============= Navigation Steps =============

Given("I am on the pack list page", async ({ page }) => {
    const packsPage = new PacksPage(page);
    await packsPage.navigateToPackList();

    // Wait for page to load
    await page.waitForLoadState("networkidle");
    console.log("[Navigation] On pack list page");
});

Given(
    "I am on the pack viewer for {string}",
    async ({ page }, packName: string) => {
        const pack = sharedState.getPack(packName);

        if (!pack) {
            throw new Error(`Pack "${packName}" not found in shared state`);
        }

        // URL format per tabSerialization.ts: 'pack-{id}' (not 'packViewer-{id}')
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
        await page.goto(
            `${baseUrl}/?leftTabs=pack-${pack.id}&activeLeft=pack-${pack.id}`,
        );
        await page.waitForLoadState("networkidle");

        // Wait for pack viewer content to fully load (not just "Loading...")
        await page
            .locator(".pack-viewer")
            .first()
            .waitFor({ state: "visible", timeout: 15000 });

        console.log(
            `[Navigation] Opened pack viewer for "${packName}" (ID: ${pack.id})`,
        );
    },
);

// ============= Background/Setup Steps =============

Given(
    "the following packs exist in shared state:",
    async ({ page }, dataTable: DataTable) => {
        const packs = dataTable.hashes();

        for (const row of packs) {
            const packName = row.name;
            let pack = sharedState.getPack(packName);

            if (!pack) {
                // Self-provision: create the pack via API
                console.log(
                    `[AutoProvision] Pack "${packName}" not in shared state, creating via API...`,
                );
                const API = process.env.API_BASE_URL || "http://localhost:8090";
                const response = await page.request.post(`${API}/packs`, {
                    data: { name: packName, description: "" },
                });
                if (!response.ok()) {
                    throw new Error(
                        `Failed to auto-provision pack "${packName}": ${response.status()}`,
                    );
                }
                const data = await response.json();
                sharedState.savePack(packName, { id: data.id, name: packName });
                console.log(
                    `[AutoProvision] Created pack "${packName}" (ID: ${data.id})`,
                );
            } else {
                console.log(`[SharedState] Verified pack exists: ${packName}`);
            }
        }
    },
);

Given("the pack {string} exists", async ({ page }, packName: string) => {
    let pack = sharedState.getPack(packName);

    if (!pack) {
        // Self-provision: create the pack via API
        console.log(
            `[AutoProvision] Pack "${packName}" not in shared state, creating via API...`,
        );
        const API = process.env.API_BASE_URL || "http://localhost:8090";
        const response = await page.request.post(`${API}/packs`, {
            data: { name: packName, description: "" },
        });
        if (!response.ok()) {
            throw new Error(
                `Failed to auto-provision pack "${packName}": ${response.status()}`,
            );
        }
        const data = await response.json();
        pack = { id: data.id, name: packName };
        sharedState.savePack(packName, pack);
        console.log(
            `[AutoProvision] Created pack "${packName}" (ID: ${pack.id})`,
        );
    }
    console.log(
        `[SharedState] Verified pack exists: ${packName} (ID: ${pack.id})`,
    );
});

// ============= Pack CRUD Steps =============

When(
    "I create a pack named {string} with description {string}",
    async ({ page }, name: string, description: string) => {
        const packsPage = new PacksPage(page);
        const pack = await packsPage.createPack(name, description);

        sharedState.savePack(name, pack);
        console.log(`[Action] Created and stored pack "${name}"`);
    },
);

When(
    "I create a pack named {string} without description",
    async ({ page }, name: string) => {
        const packsPage = new PacksPage(page);
        const pack = await packsPage.createPack(name);

        sharedState.savePack(name, pack);
        console.log(
            `[Action] Created and stored pack "${name}" (no description)`,
        );
    },
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

        // Wait for pack grid to be stable
        await page.waitForLoadState("networkidle").catch(() => {});

        const isVisible = await packsPage.isPackVisible(packName);
        expect(isVisible).toBe(true);
        console.log(`[UI] Pack "${packName}" is visible ✓`);
    },
);

Then(
    "the pack {string} should not be visible in the pack list",
    async ({ page }, packName: string) => {
        const packsPage = new PacksPage(page);

        // Wait for pack grid to be stable
        await page.waitForLoadState("networkidle").catch(() => {});

        const isVisible = await packsPage.isPackVisible(packName);
        expect(isVisible).toBe(false);
        console.log(`[UI] Pack "${packName}" is not visible ✓`);
    },
);

Then(
    "the pack {string} should be stored in shared state",
    async ({ page }, packName: string) => {
        const pack = sharedState.getPack(packName);
        expect(pack).toBeDefined();
        expect(pack?.name).toBe(packName);
        console.log(`[SharedState] Pack "${packName}" stored ✓`);
    },
);

Then("the pack viewer should be visible", async ({ page }) => {
    // Use .first() to avoid strict mode violation when multiple elements match
    const packViewer = page.locator(".pack-viewer").first();
    await expect(packViewer).toBeVisible({ timeout: 10000 });
    console.log("[UI] Pack viewer is visible ✓");
});

Then(
    "the pack name {string} should be displayed",
    async ({ page }, packName: string) => {
        const header = page.locator(".pack-header h2, .pack-title");
        await expect(header).toContainText(packName);
        console.log(`[UI] Pack name "${packName}" is displayed ✓`);
    },
);

// ============= Pack Association Steps =============

When(
    "I add model {string} to the pack",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        // Click "Add Model" card in pack viewer (PackViewer.tsx uses .pack-card-add)
        const addModelCard = page
            .locator('.pack-section:has-text("Models") .pack-card-add')
            .first();
        await addModelCard.waitFor({ state: "visible", timeout: 10000 });
        await addModelCard.click();
        console.log("[Action] Clicked Add Model card");

        // Wait for dialog to appear
        await page.waitForSelector('.p-dialog:has-text("Add Models to Pack")', {
            state: "visible",
            timeout: 5000,
        });
        console.log("[Action] Add Models dialog opened");

        // Wait for dialog content to load
        await page.waitForTimeout(500);

        const modelName = model.name; // This is the actual file name

        // Find the model item by its name - items are clickable divs in the content area
        // The structure is: [data-pc-section="content"] > container div > clickable items
        // Each item has checkbox + thumbnail + name and is fully clickable
        const dialogContent = page.locator(
            '.p-dialog [data-pc-section="content"]',
        );

        // Find ALL divs that contain the model name, then click the one with a checkbox
        // The clickable container wraps checkbox + model info
        const items = dialogContent
            .locator("div")
            .filter({
                hasText: modelName,
            })
            .all();

        // Click directly on a getByText match for the model name, which should be within the clickable area
        // Use .first() because multiple models may share the same name (e.g. "test-cube")
        const modelText = page
            .locator(".p-dialog")
            .getByText(modelName, { exact: true })
            .first();
        await modelText.waitFor({ state: "visible", timeout: 5000 });

        // Click the parent container (the clickable item)
        const clickableContainer = modelText
            .locator(
                'xpath=ancestor::*[@role="option" or contains(@class, "cursor") or position()=1]/..',
            )
            .first();

        // Try to click using different strategies
        try {
            // Strategy 1: Click the text element's grandparent (the clickable container)
            await modelText.locator("..").locator("..").click();
            console.log(`[Action] Clicked container for model: ${modelName}`);
        } catch (e) {
            // Strategy 2: Click directly on the text
            await modelText.click();
            console.log(`[Action] Clicked model text: ${modelName}`);
        }

        // Wait for selection to register
        await page.waitForTimeout(500);

        // Check the Add button state
        const addButton = page
            .locator('.p-dialog-footer button:has-text("Add Selected")')
            .first();
        await addButton.waitFor({ state: "visible", timeout: 5000 });

        const buttonText = await addButton.textContent();
        console.log(`[Action] Add button text: ${buttonText}`);

        // If still shows (0), try clicking the checkbox via JavaScript
        if (buttonText?.includes("(0)")) {
            console.log(
                "[Action] Selection not registered, trying JS click...",
            );

            // Try to find and toggle the checkbox via JavaScript
            const checkboxInput = modelText
                .locator('input[type="checkbox"]')
                .first();
            if ((await checkboxInput.count()) > 0) {
                await checkboxInput.check({ force: true });
                console.log("[Action] Force-checked the checkbox");
            } else {
                // Click on the item container itself
                await modelText.click({
                    force: true,
                    position: { x: 20, y: 20 },
                });
                console.log("[Action] Clicked item at specific position");
            }

            await page.waitForTimeout(300);
            const updatedText = await addButton.textContent();
            console.log(`[Action] Updated button text: ${updatedText}`);
        }

        // Click Add button
        await addButton.click();
        console.log("[Action] Clicked Add button");

        // Wait for dialog to close
        await page.waitForSelector('.p-dialog:has-text("Add Models to Pack")', {
            state: "hidden",
            timeout: 10000,
        });
        console.log("[Action] Dialog closed");

        // Wait for success toast
        await page.waitForTimeout(500);
        console.log(`[Action] Added model "${model.name}" to pack`);
    },
);

When(
    "I remove model {string} from the pack",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        // Right-click on model card in pack viewer (uses .pack-card not .model-card)
        const modelCard = page
            .locator(
                `.pack-section:has-text("Models") .pack-card:has-text("${model.name}")`,
            )
            .first();
        await modelCard.waitFor({ state: "visible", timeout: 10000 });
        await modelCard.click({ button: "right" });
        console.log("[Action] Right-clicked on model card");

        // Wait for context menu
        await page.waitForTimeout(300);

        // Click remove option
        const removeOption = page.locator(
            '.p-contextmenu .p-menuitem:has-text("Remove")',
        );
        await removeOption.click();
        console.log("[Action] Clicked Remove from pack");

        // Wait for model to be removed
        await page.waitForTimeout(500);
        console.log(`[Action] Removed model "${model.name}" from pack`);
    },
);

When(
    "I add texture set {string} to the pack",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Click add texture set button
        const addButton = page
            .locator(
                'button:has-text("Add"):near(.pack-section:has-text("Texture"))',
            )
            .first();
        await addButton.click();
        await page.waitForTimeout(500);

        // Select texture set in dialog
        const textureItem = page.locator(
            `.p-dialog [data-textureset-id="${textureSet.id}"], .p-dialog .texture-item:has-text("${textureSet.name}")`,
        );
        await textureItem.click();

        // Confirm
        const confirmButton = page.locator(
            '.p-dialog-footer button:has-text("Add")',
        );
        await confirmButton.click();
        await page.waitForTimeout(500);

        console.log(`[Action] Added texture set "${textureSet.name}" to pack`);
    },
);

When(
    "I remove texture set {string} from the pack",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Right-click on texture set card
        const textureCard = page.locator(
            `.pack-textures .texture-card:has-text("${textureSet.name}")`,
        );
        await textureCard.click({ button: "right" });
        await page.waitForTimeout(300);

        // Click remove option
        const removeOption = page.locator(
            '.p-contextmenu .p-menuitem:has-text("Remove")',
        );
        await removeOption.click();
        await page.waitForTimeout(500);

        console.log(
            `[Action] Removed texture set "${textureSet.name}" from pack`,
        );
    },
);

// ============= Pack Association Assertions =============

Then(
    "the pack should contain model {string}",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        // Model cards in pack viewer use .pack-card class
        const modelCard = page
            .locator(
                `.pack-section:has-text("Models") .pack-card:has-text("${model.name}")`,
            )
            .first();
        await expect(modelCard).toBeVisible({ timeout: 10000 });
        console.log(`[UI] Pack contains model "${model.name}" ✓`);
    },
);

Then(
    "the pack should not contain model {string}",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        // Check model card is not visible
        const modelCard = page
            .locator(
                `.pack-section:has-text("Models") .pack-card:has-text("${model.name}")`,
            )
            .first();
        await expect(modelCard).not.toBeVisible();
        console.log(`[UI] Pack does not contain model "${model.name}" ✓`);
    },
);

Then(
    "the pack model count should be {int}",
    async ({ page }, expectedCount: number) => {
        const stat = page.locator(
            ".pack-stats span:has(.pi-cube), .pack-grid-card-stats span:has(.pi-cube)",
        );
        const text = await stat.textContent();
        const count = parseInt(text?.trim() || "0", 10);
        expect(count).toBe(expectedCount);
        console.log(`[UI] Pack model count is ${count} ✓`);
    },
);

Then(
    "the pack should contain texture set {string}",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        const textureCard = page.locator(
            `.pack-textures .texture-card:has-text("${textureSet.name}")`,
        );
        await expect(textureCard).toBeVisible({ timeout: 10000 });
        console.log(`[UI] Pack contains texture set "${textureSet.name}" ✓`);
    },
);

Then(
    "the pack should not contain texture set {string}",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        const textureCard = page.locator(
            `.pack-textures .texture-card:has-text("${textureSet.name}")`,
        );
        await expect(textureCard).not.toBeVisible();
        console.log(
            `[UI] Pack does not contain texture set "${textureSet.name}" ✓`,
        );
    },
);

Then(
    "the pack texture set count should be {int}",
    async ({ page }, expectedCount: number) => {
        const stat = page.locator(
            ".pack-stats span:has(.pi-palette), .pack-grid-card-stats span:has(.pi-palette)",
        );
        const text = await stat.textContent();
        const count = parseInt(text?.trim() || "0", 10);
        expect(count).toBe(expectedCount);
        console.log(`[UI] Pack texture set count is ${count} ✓`);
    },
);

// ============= Background Condition Steps =============

Given(
    "the pack contains model {string}",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);
        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        const modelCard = page
            .locator(
                `.pack-section:has-text("Models") .pack-card:has-text("${model.name}")`,
            )
            .first();
        const isPresent = await modelCard.isVisible();

        if (!isPresent) {
            throw new Error(
                `Pack does not contain model "${model.name}". Add it first.`,
            );
        }
        console.log(`[Precondition] Pack contains model "${model.name}" ✓`);
    },
);

Given(
    "the pack contains texture set {string}",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);
        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        const textureCard = page.locator(
            `.pack-textures .texture-card:has-text("${textureSet.name}")`,
        );
        const isPresent = await textureCard.isVisible();

        if (!isPresent) {
            throw new Error(
                `Pack does not contain texture set "${textureSet.name}". Add it first.`,
            );
        }
        console.log(
            `[Precondition] Pack contains texture set "${textureSet.name}" ✓`,
        );
    },
);

// ============= Screenshot Steps =============

Then("I take a screenshot of the pack list", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/pack-list.png" });
    console.log("[Screenshot] Captured pack list");
});

Then("I take a screenshot after deletion", async ({ page }) => {
    await page.screenshot({
        path: "test-results/screenshots/pack-deleted.png",
    });
    console.log("[Screenshot] Captured after deletion");
});

Then("I take a screenshot of the pack viewer", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/pack-viewer.png" });
    console.log("[Screenshot] Captured pack viewer");
});

Then("I take a screenshot showing model in pack", async ({ page }) => {
    await page.screenshot({
        path: "test-results/screenshots/pack-with-model.png",
    });
    console.log("[Screenshot] Captured pack with model");
});

Then("I take a screenshot of pack with sprite", async ({ page }) => {
    await page.screenshot({
        path: "test-results/screenshots/pack-with-sprite.png",
    });
    console.log("[Screenshot] Captured pack with sprite");
});

Then("I take a screenshot of pack after sprite removed", async ({ page }) => {
    await page.screenshot({
        path: "test-results/screenshots/pack-sprite-removed.png",
    });
    console.log("[Screenshot] Captured pack after sprite removed");
});

// ============= Pack Sprite Association Steps =============

When("I click add sprites button", async ({ page }) => {
    // The Sprites section has <h3>Sprites</h3> and the Add Sprite card is inside with class .pack-card-add
    // Structure: .pack-section > h3[Sprites] > ... > .pack-card-add > span[Add Sprite]

    // Try to find the add card in the Sprites section specifically
    const spritesSection = page
        .locator(".pack-section")
        .filter({ hasText: "Sprites" })
        .last();
    const addSpriteCard = spritesSection.locator(
        '.pack-card-add:has-text("Add Sprite")',
    );

    if ((await addSpriteCard.count()) > 0) {
        await addSpriteCard.click();
        console.log("[Action] Clicked Add Sprite card in Sprites section");
    } else {
        // Fallback: find any .pack-card-add with "Add Sprite" text
        const fallbackCard = page
            .locator('.pack-card-add:has-text("Add Sprite")')
            .first();
        if ((await fallbackCard.count()) > 0) {
            await fallbackCard.click();
            console.log("[Action] Clicked Add Sprite card (fallback)");
        } else {
            throw new Error(
                "Could not find Add Sprite button in Pack/Project viewer",
            );
        }
    }

    // Wait for dialog
    await page.waitForSelector('.p-dialog:has-text("Add Sprites")', {
        state: "visible",
        timeout: 5000,
    });
    await page.waitForTimeout(500);
    console.log("[Action] Add Sprites dialog opened");
});

When("I select the first available sprite", async ({ page }) => {
    // Wait for dialog to load sprites
    await page.waitForTimeout(1000);

    // Click the first sprite in the selection dialog
    const spriteItem = page.locator(".p-dialog .add-item-card").first();
    await spriteItem.click();
    console.log("[Action] Selected first available sprite");
});

When("I confirm adding sprites", async ({ page }) => {
    const addButton = page.locator('.p-dialog-footer button:has-text("Add")');
    await addButton.click();
    await page.waitForTimeout(1000);
    console.log("[Action] Confirmed adding sprites");
});

Then(
    "the pack sprite count should be {int}",
    async ({ page }, expectedCount: number) => {
        // Check sprite count in pack stats
        const statSpan = page.locator('.pack-stats span:has-text("sprite")');
        const text = (await statSpan.textContent()) || "0";
        const count = parseInt(text.match(/\d+/)?.[0] || "0", 10);
        expect(count).toBe(expectedCount);
        console.log(`[UI] Pack sprite count is ${count} ✓`);
    },
);

Given(
    "the pack has at least {int} sprite",
    async ({ page }, minCount: number) => {
        const statSpan = page.locator('.pack-stats span:has-text("sprite")');
        const text = (await statSpan.textContent()) || "0";
        const count = parseInt(text.match(/\d+/)?.[0] || "0", 10);
        if (count < minCount) {
            throw new Error(
                `Pack has only ${count} sprites, but at least ${minCount} required`,
            );
        }
        console.log(`[Precondition] Pack has ${count} sprite(s) ✓`);
    },
);

When("I remove the first sprite from the pack", async ({ page }) => {
    // Right-click on first sprite card to open context menu
    const spriteCard = page
        .locator(
            '.pack-section:has(h3:has-text("Sprite")) .pack-card:not(.pack-card-add)',
        )
        .first();
    await spriteCard.click({ button: "right" });
    await page.waitForTimeout(300);

    // Click Remove from pack option
    const removeOption = page.locator(
        '.p-contextmenu .p-menuitem:has-text("Remove")',
    );
    await removeOption.click();
    await page.waitForTimeout(500);
    console.log("[Action] Removed first sprite from pack");
});
