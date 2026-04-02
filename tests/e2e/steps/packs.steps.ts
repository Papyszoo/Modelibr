import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { PacksPage } from "../pages/PacksPage";
import { navigateToTab } from "../helpers/navigation-helper";

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
    await page.waitForLoadState("domcontentloaded");
    console.log("[Navigation] On pack list page");
});

Given(
    "I am on the pack viewer for {string}",
    async ({ page }, packName: string) => {
        const pack = getScenarioState(page).getPack(packName);

        if (!pack) {
            throw new Error(`Pack "${packName}" not found in shared state`);
        }

        // Navigate to packs tab, then open the specific pack by clicking
        await navigateToTab(page, "packs");
        await page.waitForLoadState("domcontentloaded");

        // Find and double-click the pack card to open viewer
        const packCard = page.locator(
            `.pack-grid-card[data-pack-id="${pack.id}"]`,
        );
        await packCard.waitFor({ state: "visible", timeout: 30000 });
        await packCard.dblclick();

        // Wait for container viewer content to fully load
        await page
            .locator(".container-viewer")
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
            let pack = getScenarioState(page).getPack(packName);

            if (!pack) {
                // Self-provision: create or find the pack via API
                console.log(
                    `[AutoProvision] Pack "${packName}" not in shared state, creating via API...`,
                );
                const API = process.env.API_BASE_URL || "http://localhost:8090";
                const response = await page.request.post(`${API}/packs`, {
                    data: { name: packName, description: "" },
                });
                if (response.ok()) {
                    const data = await response.json();
                    getScenarioState(page).savePack(packName, {
                        id: data.id,
                        name: packName,
                    });
                    console.log(
                        `[AutoProvision] Created pack "${packName}" (ID: ${data.id})`,
                    );
                } else {
                    // Pack likely already exists (created by setup or another worker)
                    const listResp = await page.request.get(`${API}/packs`);
                    const packsResp = await listResp.json();
                    const packList = Array.isArray(packsResp)
                        ? packsResp
                        : packsResp.packs || packsResp.items || [];
                    const existing = packList.find(
                        (p: any) => p.name === packName,
                    );
                    if (!existing) {
                        throw new Error(
                            `Failed to auto-provision pack "${packName}": ${response.status()} and not found via GET`,
                        );
                    }
                    getScenarioState(page).savePack(packName, {
                        id: existing.id,
                        name: packName,
                    });
                    console.log(
                        `[AutoProvision] Found existing pack "${packName}" (ID: ${existing.id})`,
                    );
                }
            } else {
                console.log(`[SharedState] Verified pack exists: ${packName}`);
            }
        }
    },
);

Given("the pack {string} exists", async ({ page }, packName: string) => {
    let pack = getScenarioState(page).getPack(packName);

    if (!pack) {
        // Self-provision: create or find the pack via API
        console.log(
            `[AutoProvision] Pack "${packName}" not in shared state, creating via API...`,
        );
        const API = process.env.API_BASE_URL || "http://localhost:8090";
        const response = await page.request.post(`${API}/packs`, {
            data: { name: packName, description: "" },
        });
        if (response.ok()) {
            const data = await response.json();
            pack = { id: data.id, name: packName };
            getScenarioState(page).savePack(packName, pack);
            console.log(
                `[AutoProvision] Created pack "${packName}" (ID: ${pack.id})`,
            );
        } else {
            // Pack likely already exists (created by setup or another worker)
            const listResp = await page.request.get(`${API}/packs`);
            const packsResp = await listResp.json();
            const packList = Array.isArray(packsResp)
                ? packsResp
                : packsResp.packs || packsResp.items || [];
            const existing = packList.find((p: any) => p.name === packName);
            if (!existing) {
                throw new Error(
                    `Failed to auto-provision pack "${packName}": ${response.status()} and not found via GET`,
                );
            }
            pack = { id: existing.id, name: packName };
            getScenarioState(page).savePack(packName, pack);
            console.log(
                `[AutoProvision] Found existing pack "${packName}" (ID: ${pack.id})`,
            );
        }
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

        getScenarioState(page).savePack(name, pack);
        console.log(`[Action] Created and stored pack "${name}"`);
    },
);

When(
    "I create a pack named {string} without description",
    async ({ page }, name: string) => {
        const packsPage = new PacksPage(page);
        const pack = await packsPage.createPack(name);

        getScenarioState(page).savePack(name, pack);
        console.log(
            `[Action] Created and stored pack "${name}" (no description)`,
        );
    },
);

When("I open the pack {string}", async ({ page }, packName: string) => {
    const packsPage = new PacksPage(page);
    const pack = getScenarioState(page).getPack(packName);
    await packsPage.openPack(packName, pack?.id);
    console.log(
        `[Action] Opened pack "${packName}"${pack?.id ? ` (id=${pack.id})` : ""}`,
    );
});

When("I delete the pack {string}", async ({ page }, packName: string) => {
    const packsPage = new PacksPage(page);
    const pack = getScenarioState(page).getPack(packName);
    await packsPage.deletePack(packName, pack?.id);
    console.log(`[Action] Deleted pack "${packName}"`);
});

// ============= Pack Assertion Steps =============

Then(
    "the pack {string} should be visible in the pack list",
    async ({ page }, packName: string) => {
        const packsPage = new PacksPage(page);

        // Wait for pack grid to be stable
        await page.waitForLoadState("domcontentloaded");

        const pack = getScenarioState(page).getPack(packName);
        const isVisible = await packsPage.isPackVisible(packName, pack?.id);
        expect(isVisible).toBe(true);
        console.log(`[UI] Pack "${packName}" is visible ✓`);
    },
);

Then(
    "the pack {string} should not be visible in the pack list",
    async ({ page }, packName: string) => {
        const packsPage = new PacksPage(page);

        // Wait for pack grid to be stable
        await page.waitForLoadState("domcontentloaded");

        const pack = getScenarioState(page).getPack(packName);
        const isVisible = await packsPage.isPackVisible(packName, pack?.id);
        expect(isVisible).toBe(false);
        console.log(`[UI] Pack "${packName}" is not visible ✓`);
    },
);

Then(
    "the pack {string} should be stored in shared state",
    async ({ page }, packName: string) => {
        const pack = getScenarioState(page).getPack(packName);
        expect(pack).toBeDefined();
        expect(pack?.name).toBe(packName);
        console.log(`[SharedState] Pack "${packName}" stored ✓`);
    },
);

Then("the pack viewer should be visible", async ({ page }) => {
    // Use .first() to avoid strict mode violation when multiple elements match
    const packViewer = page.locator(".container-viewer").first();
    await expect(packViewer).toBeVisible({ timeout: 10000 });
    console.log("[UI] Pack viewer is visible ✓");
});

Then(
    "the pack name {string} should be displayed",
    async ({ page }, packName: string) => {
        const header = page.locator(".container-header h2");
        await expect(header).toContainText(packName);
        console.log(`[UI] Pack name "${packName}" is displayed ✓`);
    },
);

// ============= Pack Association Steps =============

When(
    "I add model {string} to the pack",
    async ({ page }, modelStateName: string) => {
        const model = getScenarioState(page).getModel(modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        // Click the Models tab first to reveal model content
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Models" })
            .click();

        // Click "Add Model" card in container viewer (ModelGrid uses .model-card-add)
        const addModelCard = page.locator(".model-card-add").first();
        await addModelCard.waitFor({ state: "visible", timeout: 10000 });
        await addModelCard.click();
        console.log("[Action] Clicked Add Model card");

        // Wait for dialog to appear
        await page.waitForSelector('.p-dialog:has-text("Add Models to Pack")', {
            state: "visible",
            timeout: 5000,
        });
        console.log("[Action] Add Models dialog opened");

        // Wait for dialog content to load with model cards
        await page.waitForSelector(".p-dialog .container-card[data-model-id]", {
            state: "visible",
            timeout: 10000,
        });

        // Select the specific model by its ID (avoids ambiguity when multiple models share the same name)
        const modelCard = page.locator(
            `.p-dialog .container-card[data-model-id="${model.id}"]`,
        );
        await modelCard.waitFor({ state: "visible", timeout: 5000 });
        await modelCard.click();
        console.log(
            `[Action] Clicked model card with data-model-id="${model.id}" (${model.name})`,
        );

        // Verify selection registered
        const addButton = page
            .locator('.p-dialog-footer button:has-text("Add Selected")')
            .first();
        await addButton.waitFor({ state: "visible", timeout: 5000 });
        await expect(addButton).not.toContainText("(0)", { timeout: 3000 });

        const buttonText = await addButton.textContent();
        console.log(`[Action] Add button text: ${buttonText}`);

        // Click Add button
        await addButton.click();
        console.log("[Action] Clicked Add button");

        // Wait for dialog to close
        await page.waitForSelector('.p-dialog:has-text("Add Models to Pack")', {
            state: "hidden",
            timeout: 10000,
        });
        console.log("[Action] Dialog closed");

        // Wait for pack content to refresh after adding model
        await page.waitForLoadState("domcontentloaded");

        // Wait for the model card to appear in the grid after refresh
        await page
            .waitForSelector(`.model-card[data-model-id="${model.id}"]`, {
                state: "visible",
                timeout: 15000,
            })
            .catch(() => {
                console.warn(
                    `[Warn] Model card data-model-id="${model.id}" not visible after add`,
                );
            });
        console.log(`[Action] Added model "${model.name}" to pack`);
    },
);

When(
    "I remove model {string} from the pack",
    async ({ page }, modelStateName: string) => {
        const model = getScenarioState(page).getModel(modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        // Click the Models tab first to reveal model content
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Models" })
            .click();

        // Right-click on model card in container viewer (ModelGrid uses .model-card)
        const modelCard = page.locator(
            `.model-card[data-model-id="${model.id}"]`,
        );
        await modelCard.waitFor({ state: "visible", timeout: 10000 });
        await modelCard.click({ button: "right" });
        console.log("[Action] Right-clicked on model card");

        // Wait for context menu
        await page
            .locator(".p-contextmenu")
            .first()
            .waitFor({ state: "visible", timeout: 5000 });

        // Click remove option (ModelContextMenu uses "Remove from pack")
        const removeOption = page
            .locator(
                '.p-contextmenu .p-menuitem:has-text("Remove from pack"), .p-contextmenu .p-menuitem:has-text("Remove")',
            )
            .first();
        await removeOption.click();
        console.log("[Action] Clicked Remove from pack");

        // Wait for model to be removed from the grid
        await expect(modelCard).not.toBeVisible({ timeout: 10000 });
        console.log(`[Action] Removed model "${model.name}" from pack`);
    },
);

When(
    "I add texture set {string} to the pack",
    async ({ page }, textureSetName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Click the Texture Sets tab first to reveal texture set content
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Texture Sets" })
            .click();

        // Click add texture set card
        const addButton = page.locator(".container-card-add").first();
        await addButton.click();
        // Wait for add dialog to appear
        await page
            .locator(".p-dialog")
            .first()
            .waitFor({ state: "visible", timeout: 5000 });

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
        // Wait for dialog to close after adding
        await expect(page.locator(".p-dialog")).not.toBeVisible({
            timeout: 10000,
        });

        console.log(`[Action] Added texture set "${textureSet.name}" to pack`);
    },
);

When(
    "I remove texture set {string} from the pack",
    async ({ page }, textureSetName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Click the Texture Sets tab first to reveal texture set content
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Texture Sets" })
            .click();

        // Right-click on texture set card
        const textureCard = page.locator(
            `.container-card[data-texture-set-id="${textureSet.id}"]`,
        );
        await textureCard.click({ button: "right" });
        // Wait for context menu
        await page
            .locator(".p-contextmenu")
            .first()
            .waitFor({ state: "visible", timeout: 5000 });

        // Click remove option
        const removeOption = page
            .locator(
                '.p-contextmenu .p-menuitem:has-text("Remove from pack"), .p-contextmenu .p-menuitem:has-text("Remove")',
            )
            .first();
        await removeOption.click();
        // Wait for texture set to be removed
        await expect(textureCard).not.toBeVisible({ timeout: 10000 });

        console.log(
            `[Action] Removed texture set "${textureSet.name}" from pack`,
        );
    },
);

// ============= Pack Association Assertions =============

Then(
    "the pack should contain model {string}",
    async ({ page }, modelStateName: string) => {
        const model = getScenarioState(page).getModel(modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        // Click the Models tab first to reveal model content
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Models" })
            .click();

        // Wait for model grid to finish loading - wait for actual model cards (not just add button)
        // Note: .model-card-add also has .model-card class, so we must wait for cards WITH data-model-id
        await page
            .waitForSelector(".model-card[data-model-id]", {
                state: "visible",
                timeout: 15000,
            })
            .catch(async () => {
                // Debug: log what model cards exist in the DOM
                const allCards = await page
                    .locator(".model-card")
                    .evaluateAll((els) =>
                        els.map((el) => ({
                            classes: el.className,
                            dataModelId: el.getAttribute("data-model-id"),
                            text: el.textContent?.substring(0, 50),
                        })),
                    );
                console.log(
                    `[Debug] All .model-card elements:`,
                    JSON.stringify(allCards),
                );
            });

        // Model cards in container viewer use .model-card class (ModelGrid)
        const modelCard = page.locator(
            `.model-card[data-model-id="${model.id}"]`,
        );
        console.log(
            `[Debug] Looking for model card with data-model-id="${model.id}"`,
        );
        await expect(modelCard).toBeVisible({ timeout: 15000 });
        console.log(`[UI] Pack contains model "${model.name}" ✓`);
    },
);

Then(
    "the pack should not contain model {string}",
    async ({ page }, modelStateName: string) => {
        const model = getScenarioState(page).getModel(modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        // Click the Models tab first to reveal model content
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Models" })
            .click();

        // Wait for model grid to finish loading
        await page
            .waitForSelector(".model-card, .model-card-add, .no-results", {
                state: "visible",
                timeout: 15000,
            })
            .catch(() => {});

        // Check model card is not visible
        const modelCard = page.locator(
            `.model-card[data-model-id="${model.id}"]`,
        );
        await expect(modelCard).not.toBeVisible();
        console.log(`[UI] Pack does not contain model "${model.name}" ✓`);
    },
);

Then(
    "the pack model count should be {int}",
    async ({ page }, expectedCount: number) => {
        // Click Details tab to see asset counts
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Details" })
            .click();

        const stat = page
            .locator(
                '.container-detail-assets span:has-text("models"), .container-detail-assets span:has-text("model")',
            )
            .first();
        // Wait for Details tab content to render
        await stat.waitFor({ state: "visible", timeout: 5000 });
        const text = await stat.textContent();
        const count = parseInt(text?.match(/\d+/)?.[0] || "0", 10);
        expect(count).toBe(expectedCount);
        console.log(`[UI] Pack model count is ${count} ✓`);
    },
);

Then(
    "the pack should contain texture set {string}",
    async ({ page }, textureSetName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Click the Texture Sets tab first to reveal texture set content
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Texture Sets" })
            .click();

        const textureCard = page.locator(
            `.container-card[data-texture-set-id="${textureSet.id}"]`,
        );
        await expect(textureCard).toBeVisible({ timeout: 10000 });
        console.log(`[UI] Pack contains texture set "${textureSet.name}" ✓`);
    },
);

Then(
    "the pack should not contain texture set {string}",
    async ({ page }, textureSetName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Click the Texture Sets tab first to reveal texture set content
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Texture Sets" })
            .click();

        const textureCard = page.locator(
            `.container-card[data-texture-set-id="${textureSet.id}"]`,
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
        // Click Details tab to see asset counts
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Details" })
            .click();

        const stat = page
            .locator(
                '.container-detail-assets span:has-text("texture sets"), .container-detail-assets span:has-text("texture set")',
            )
            .first();
        // Wait for Details tab content to render
        await stat.waitFor({ state: "visible", timeout: 5000 });
        const text = await stat.textContent();
        const count = parseInt(text?.match(/\d+/)?.[0] || "0", 10);
        expect(count).toBe(expectedCount);
        console.log(`[UI] Pack texture set count is ${count} ✓`);
    },
);

// ============= Background Condition Steps =============

Given(
    "the pack contains model {string}",
    async ({ page }, modelStateName: string) => {
        const model = getScenarioState(page).getModel(modelStateName);
        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        // Click the Models tab first to reveal model content
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Models" })
            .click();

        // Wait for model grid to finish loading (cards or empty state)
        await page.waitForSelector(
            ".model-card, .model-card-add, .no-results",
            {
                state: "visible",
                timeout: 15000,
            },
        );

        const modelCard = page.locator(
            `.model-card[data-model-id="${model.id}"]`,
        );
        // Wait for tab content to render and verify model is present
        try {
            await expect(modelCard).toBeVisible({ timeout: 15000 });
        } catch {
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
        const textureSet = getScenarioState(page).getTextureSet(textureSetName);
        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Click the Texture Sets tab first to reveal texture set content
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Texture Sets" })
            .click();

        const textureCard = page.locator(
            `.container-card[data-texture-set-id="${textureSet.id}"]`,
        );
        // Wait for tab content to render and verify texture set is present
        try {
            await expect(textureCard).toBeVisible({ timeout: 10000 });
        } catch {
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
    // Click the Sprites tab first to reveal sprite content
    await page
        .locator(".p-tabview-nav li")
        .filter({ hasText: "Sprites" })
        .click();

    // Find the Add Sprite card in the active tab and wait for it
    const addSpriteCard = page
        .locator('.container-card-add:has-text("Add Sprite")')
        .first();
    await addSpriteCard.waitFor({ state: "visible", timeout: 10000 });

    if ((await addSpriteCard.count()) > 0) {
        await addSpriteCard.click();
        console.log("[Action] Clicked Add Sprite card");
    } else {
        throw new Error(
            "Could not find Add Sprite button in Pack/Project viewer",
        );
    }

    // Wait for dialog
    await page.waitForSelector('.p-dialog:has-text("Add Sprites")', {
        state: "visible",
        timeout: 5000,
    });
    // Wait for dialog content to load
    // Optional: dialog content may still be loading
    await page
        .locator(".p-dialog .add-item-card")
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => {});
    console.log("[Action] Add Sprites dialog opened");
});

When("I select the first available sprite", async ({ page }) => {
    // Wait for sprites to load in dialog
    const spriteItem = page.locator(".p-dialog .add-item-card").first();
    await spriteItem.waitFor({ state: "visible", timeout: 10000 });

    // Click the first sprite in the selection dialog
    await spriteItem.click();
    console.log("[Action] Selected first available sprite");
});

When("I confirm adding sprites", async ({ page }) => {
    const addButton = page.locator('.p-dialog-footer button:has-text("Add")');
    await addButton.click();
    // Wait for dialog to close after adding
    await expect(
        page.locator('.p-dialog:has-text("Add Sprites")'),
    ).not.toBeVisible({ timeout: 10000 });
    console.log("[Action] Confirmed adding sprites");
});

Then(
    "the pack sprite count should be {int}",
    async ({ page }, expectedCount: number) => {
        // Click Details tab to see asset counts
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Details" })
            .click();

        // Check sprite count in container details
        const statSpan = page
            .locator('.container-detail-assets span:has-text("sprite")')
            .first();
        // Wait for Details tab content to render
        await statSpan.waitFor({ state: "visible", timeout: 5000 });
        const text = (await statSpan.textContent()) || "0";
        const count = parseInt(text.match(/\d+/)?.[0] || "0", 10);
        expect(count).toBe(expectedCount);
        console.log(`[UI] Pack sprite count is ${count} ✓`);
    },
);

Given(
    "the pack has at least {int} sprite",
    async ({ page }, minCount: number) => {
        // Click Details tab to see asset counts
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Details" })
            .click();

        const statSpan = page
            .locator('.container-detail-assets span:has-text("sprite")')
            .first();
        // Wait for Details tab content to render
        await statSpan.waitFor({ state: "visible", timeout: 5000 });
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
    // Click the Sprites tab first to reveal sprite content
    await page
        .locator(".p-tabview-nav li")
        .filter({ hasText: "Sprites" })
        .click();

    // Right-click on first sprite card to open context menu
    const spriteCard = page
        .locator(".container-section .container-card:not(.container-card-add)")
        .first();
    await spriteCard.click({ button: "right" });
    // Wait for context menu
    await page
        .locator(".p-contextmenu")
        .first()
        .waitFor({ state: "visible", timeout: 5000 });

    // Click Remove from pack option
    const removeOption = page
        .locator(
            '.p-contextmenu .p-menuitem:has-text("Remove from pack"), .p-contextmenu .p-menuitem:has-text("Remove")',
        )
        .first();
    await removeOption.click();
    // Wait for sprite to be removed
    await expect(spriteCard).not.toBeVisible({ timeout: 10000 });
    console.log("[Action] Removed first sprite from pack");
});
