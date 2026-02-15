import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { TextureSetsPage } from "../pages/TextureSetsPage";
import { ApiHelper } from "../helpers/api-helper";
import { sharedState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { TextureType } from "../../../src/frontend/src/types/index.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Given, When, Then } = createBdd();
const apiHelper = new ApiHelper();

// Generate unique suffix for each test run to avoid name conflicts
const runId = Date.now().toString(36).slice(-4);

// Helper to find a texture set card by name
const getTextureSetCard = (page: any, name: string) => {
    return page.locator(`.texture-set-card:has-text("${name}")`).first();
};

// ==================== Setup Steps ====================

Given("texture set {string} exists", async ({ page }, name: string) => {
    // Create texture set via API with unique name
    const uniqueName = `${name}_${runId}`;
    const textureSet = await apiHelper.createTextureSet(uniqueName);
    sharedState.saveTextureSet(name, { id: textureSet.id, name: uniqueName });
    console.log(
        `[API] Created texture set "${uniqueName}" with ID ${textureSet.id}`,
    );
});

Given(
    "texture set {string} exists with file {string}",
    async ({ page }, setName: string, fileName: string) => {
        // Create texture set with file via API in one step with unique name
        const uniqueName = `${setName}_${runId}`;
        const filePath = await UniqueFileGenerator.generate(fileName);
        const result = await apiHelper.createTextureSetWithFile(
            uniqueName,
            filePath,
            TextureType.Albedo,
        );
        sharedState.saveTextureSet(setName, {
            id: result.textureSetId,
            name: uniqueName,
        });
        console.log(
            `[API] Created texture set "${uniqueName}" with file "${fileName}", ID ${result.textureSetId}`,
        );
    },
);

Given(
    "texture set {string} exists with a {string} texture",
    async ({ page }, setName: string, textureTypeName: string) => {
        // Use shared TextureType enum from frontend types
        const typeValue =
            TextureType[textureTypeName as keyof typeof TextureType] ||
            TextureType.Albedo;

        // Create texture set with unique file via API
        const uniqueName = `${setName}_${runId}`;
        const filePath = await UniqueFileGenerator.generate("yellow_color.png");
        const result = await apiHelper.createTextureSetWithFile(
            uniqueName,
            filePath,
            typeValue,
        );
        sharedState.saveTextureSet(setName, {
            id: result.textureSetId,
            name: uniqueName,
        });
        console.log(
            `[API] Created texture set "${uniqueName}" with ${textureTypeName} texture, ID ${result.textureSetId}`,
        );
    },
);

// ==================== Drag and Drop Steps ====================

When(
    "I drag {string} onto {string}",
    async ({ page }, sourceName: string, targetName: string) => {
        // Get stored names from shared state
        const sourceSet = sharedState.getTextureSet(sourceName);
        const targetSet = sharedState.getTextureSet(targetName);
        const sourceDisplayName = sourceSet?.name || sourceName;
        const targetDisplayName = targetSet?.name || targetName;

        // Refresh the page to see newly created texture sets
        await page.reload();
        await page.waitForLoadState("domcontentloaded");

        const sourceCard = page
            .locator(`.texture-set-card:has-text("${sourceDisplayName}")`)
            .first();
        const targetCard = page
            .locator(`.texture-set-card:has-text("${targetDisplayName}")`)
            .first();

        await expect(sourceCard).toBeVisible({ timeout: 10000 });
        await expect(targetCard).toBeVisible({ timeout: 10000 });

        // Use manual drag event dispatch because Playwright's dragTo() doesn't
        // properly set custom dataTransfer data for React's synthetic events.
        // The React handler requires 'application/x-texture-set-id' in dataTransfer.
        await page.evaluate(
            ({ sourceName, targetName }) => {
                return new Promise<void>((resolve, reject) => {
                    const allCards =
                        document.querySelectorAll(".texture-set-card");
                    let source: Element | null = null;
                    let target: Element | null = null;

                    for (const card of allCards) {
                        const name =
                            card.querySelector(".texture-set-card-name")
                                ?.textContent || "";
                        if (name.includes(sourceName) && !source) source = card;
                        if (name.includes(targetName) && !target) target = card;
                    }

                    if (!source || !target) {
                        reject(
                            new Error(
                                `Cards not found: source="${sourceName}" (${!!source}), target="${targetName}" (${!!target})`,
                            ),
                        );
                        return;
                    }

                    const dataTransfer = new DataTransfer();

                    // Dispatch dragstart on source
                    source.dispatchEvent(
                        new DragEvent("dragstart", {
                            bubbles: true,
                            cancelable: true,
                            dataTransfer: dataTransfer,
                        }),
                    );

                    // Wait for React state update, then dispatch dragover + drop
                    setTimeout(() => {
                        target!.dispatchEvent(
                            new DragEvent("dragover", {
                                bubbles: true,
                                cancelable: true,
                                dataTransfer: dataTransfer,
                            }),
                        );

                        target!.dispatchEvent(
                            new DragEvent("drop", {
                                bubbles: true,
                                cancelable: true,
                                dataTransfer: dataTransfer,
                            }),
                        );

                        resolve();
                    }, 200);
                });
            },
            {
                sourceName: sourceDisplayName,
                targetName: targetDisplayName,
            },
        );

        console.log(
            `[UI] Dragged "${sourceDisplayName}" onto "${targetDisplayName}" (manual dispatch)`,
        );
    },
);

// ==================== Dialog Verification Steps ====================

Then("I should see a merge dialog showing source files", async ({ page }) => {
    const dialog = page.locator(".p-dialog").first();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Check for file or channel mapping section
    const hasMergeContent = await dialog
        .locator(".file-channel-mapping, .channel-row, .file-name")
        .first()
        .isVisible()
        .catch(() => false);
    expect(
        hasMergeContent ||
            (await dialog.textContent().then((t) => t?.includes("Merge"))),
    ).toBeTruthy();
    console.log("[UI] Merge dialog with source files is visible");
});

Then(
    "I should see a merge dialog showing {string}",
    async ({ page }, fileName: string) => {
        const dialog = page.locator(".p-dialog").first();
        await expect(dialog).toBeVisible();

        const fileElement = dialog.locator(`text="${fileName}"`);
        await expect(fileElement).toBeVisible({ timeout: 5000 });
        console.log(`[UI] Merge dialog shows file "${fileName}"`);
    },
);

// ==================== Channel Selection Steps ====================

Then(
    "I should see an RGB dropdown with options {string}",
    async ({ page }, optionsStr: string) => {
        const rgbDropdown = page.locator(".p-dropdown").first();
        await rgbDropdown.click();

        const options = await page
            .locator(".p-dropdown-item")
            .allTextContents();
        const expectedOptions = optionsStr.split(",").map((s) => s.trim());

        for (const expected of expectedOptions) {
            const found = options.some((opt) => opt.includes(expected));
            expect(
                found,
                `Expected option "${expected}" not found in [${options.join(", ")}]`,
            ).toBe(true);
        }

        await page.keyboard.press("Escape");
        console.log("[UI] RGB dropdown has expected options");
    },
);

When(
    "I select {string} for the RGB dropdown",
    async ({ page }, option: string) => {
        const rgbDropdown = page
            .locator(
                ".file-channel-mapping .p-dropdown, .channel-row .p-dropdown",
            )
            .first();
        await rgbDropdown.click();
        await page.locator(`.p-dropdown-item:has-text("${option}")`).click();
        console.log(`[UI] Selected "${option}" for RGB dropdown`);
    },
);

Then("I should see R, G, B channel dropdowns appear", async ({ page }) => {
    const splitSection = page.locator(".split-channels, .channel-dropdowns");
    await expect(splitSection).toBeVisible({ timeout: 3000 });

    // Verify all channel options are visible
    for (const channel of ["R:", "G:", "B:"]) {
        await expect(
            page
                .locator(
                    `.channel-row:has-text("${channel}"), label:has-text("${channel}")`,
                )
                .first(),
        ).toBeVisible();
    }
    console.log("[UI] R, G, B channel dropdowns are visible");
});

When(
    "I set the {word} channel to {string}",
    async ({ page }, channel: string, type: string) => {
        // Map channel letter to nth position in split-channels (R=1, G=2, B=3)
        const channelIndex: { [key: string]: number } = { R: 0, G: 1, B: 2 };
        const index = channelIndex[channel.toUpperCase()] ?? 0;

        // Target the specific dropdown in split-channels section
        const dropdown = page
            .locator(".split-channels .channel-row.indent")
            .nth(index)
            .locator(".p-dropdown");
        await dropdown.click();
        await page.locator(`.p-dropdown-item:has-text("${type}")`).click();
        console.log(`[UI] Set ${channel} channel to "${type}"`);
    },
);

When("I set the A channel to {string}", async ({ page }, type: string) => {
    const channelRow = page
        .locator('.channel-row:has-text("A:"), label:has-text("Alpha")')
        .locator("..");
    const dropdown = channelRow.locator(".p-dropdown");
    await dropdown.click();
    await page.locator(`.p-dropdown-item:has-text("${type}")`).click();
    console.log(`[UI] Set A channel to "${type}"`);
});

When(
    "I select {string} and set G to {string}",
    async ({ page }, option: string, type: string) => {
        // Select split channels
        const rgbDropdown = page
            .locator(
                ".file-channel-mapping .p-dropdown, .channel-row .p-dropdown",
            )
            .first();
        await rgbDropdown.click();
        await page.locator(`.p-dropdown-item:has-text("${option}")`).click();

        // Set G channel
        const channelRow = page.locator('.channel-row:has-text("G:")').first();
        const dropdown = channelRow.locator(".p-dropdown");
        await dropdown.click();
        await page.locator(`.p-dropdown-item:has-text("${type}")`).click();
        console.log(`[UI] Selected "${option}" and set G to "${type}"`);
    },
);

// ==================== Action Steps ====================

When("I click {string}", async ({ page }, buttonText: string) => {
    await page.locator(`button:has-text("${buttonText}")`).click();
    console.log(`[UI] Clicked "${buttonText}"`);
});

// ==================== Warning Steps ====================

Then(
    "I should see a warning about replacing existing texture",
    async ({ page }) => {
        const warning = page.locator(
            ".override-warning, .warning-message, .p-message-warn",
        );
        await expect(warning).toBeVisible({ timeout: 3000 });
        console.log("[UI] Override warning is visible");
    },
);

// ==================== Result Verification Steps ====================

Then(
    "{string} should have AO, Roughness, and Metallic textures",
    async ({ page }, setName: string) => {
        // Get stored unique name from shared state
        const set = sharedState.getTextureSet(setName);
        const displayName = set?.name || setName;

        const card = page
            .locator(`.texture-set-card:has-text("${displayName}")`)
            .first();
        await card.dblclick();
        await page.waitForSelector(".texture-set-viewer, .p-dialog", {
            timeout: 10000,
        });

        // Try both "Texture Types" tab (new name) and "Textures" tab (old name)
        const newTab = page.locator(
            '.p-tabview-nav-link:has-text("Texture Types")',
        );
        const oldTab = page.locator('.p-tabview-nav-link:has-text("Textures")');

        if (await newTab.isVisible({ timeout: 1000 }).catch(() => false)) {
            await newTab.click();
        } else if (
            await oldTab.isVisible({ timeout: 1000 }).catch(() => false)
        ) {
            await oldTab.click();
        }

        await expect(
            page.locator(
                '[data-texture-type="AO"], .texture-card:has-text("AO")',
            ),
        ).toBeVisible({ timeout: 5000 });
        await expect(
            page.locator(
                '[data-texture-type="Roughness"], .texture-card:has-text("Roughness")',
            ),
        ).toBeVisible({ timeout: 5000 });
        await expect(
            page.locator(
                '[data-texture-type="Metallic"], .texture-card:has-text("Metallic")',
            ),
        ).toBeVisible({ timeout: 5000 });
        console.log(
            `[UI] "${displayName}" has AO, Roughness, and Metallic textures`,
        );
    },
);

Then(
    "{string} should have an {string} texture",
    async ({ page }, setName: string, type: string) => {
        // Get stored unique name from shared state
        const set = sharedState.getTextureSet(setName);
        const displayName = set?.name || setName;

        const card = page
            .locator(`.texture-set-card:has-text("${displayName}")`)
            .first();
        await card.dblclick();
        await page.waitForSelector(".texture-set-viewer, .p-dialog", {
            timeout: 10000,
        });

        const tab = page.locator(
            '.p-tabview-nav-link:has-text("Texture Types")',
        );
        if (await tab.isVisible()) {
            await tab.click();
        }

        const typeCard = page.locator(
            `[data-texture-type="${type}"], .texture-card:has-text("${type}")`,
        );
        await expect(typeCard).toBeVisible();
        console.log(`[UI] "${setName}" has ${type} texture`);
    },
);

Then(
    "{string} should have both {string} and {string} textures",
    async ({ page }, setName: string, type1: string, type2: string) => {
        const card = getTextureSetCard(page, setName);
        await card.dblclick();
        await page.waitForSelector(".texture-set-viewer, .p-dialog", {
            timeout: 10000,
        });

        const tab = page.locator(
            '.p-tabview-nav-link:has-text("Texture Types")',
        );
        if (await tab.isVisible()) {
            await tab.click();
        }

        await expect(
            page.locator(
                `[data-texture-type="${type1}"], .texture-card:has-text("${type1}")`,
            ),
        ).toBeVisible();
        await expect(
            page.locator(
                `[data-texture-type="${type2}"], .texture-card:has-text("${type2}")`,
            ),
        ).toBeVisible();
        console.log(
            `[UI] "${setName}" has both ${type1} and ${type2} textures`,
        );
    },
);

// ==================== Dummy Steps for Other Features ====================

When("I view the Texture Types tab", async ({ page }) => {
    const tab = page.locator('.p-tabview-nav-link:has-text("Texture Types")');
    if (await tab.isVisible()) {
        await tab.click();
    }
    console.log("[UI] Viewing Texture Types tab");
});

When(
    "I change Height card mode to {string}",
    async ({ page }, mode: string) => {
        // Find Height card and click mode dropdown
        const heightCard = page.locator(
            '[data-texture-type="Height"], .texture-card:has-text("Height")',
        );
        const modeDropdown = heightCard.locator(".p-dropdown, select");
        await modeDropdown.click();
        await page.locator(`.p-dropdown-item:has-text("${mode}")`).click();
        console.log(`[UI] Changed Height card mode to "${mode}"`);
    },
);

Then("{string} should be the assigned type", async ({ page }, type: string) => {
    const typeIndicator = page.locator(
        `[data-texture-type="${type}"], .texture-card:has-text("${type}")`,
    );
    await expect(typeIndicator).toBeVisible();
    console.log(`[UI] "${type}" is the assigned type`);
});
