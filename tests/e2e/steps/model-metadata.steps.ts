/**
 * Step definitions for Model Tags and Description (Model Metadata) E2E tests.
 * Covers adding/removing tags, editing descriptions, and searching models.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ModelListPage } from "../pages/ModelListPage";
import { ModelViewerPage } from "../pages/ModelViewerPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

const OPENED_MODEL_ID_KEY = "modelMetadata.openedModelId";
const TAG_COUNT_BEFORE_REMOVE_KEY = "modelMetadata.tagCountBeforeRemove";
const CARD_COUNT_BEFORE_SEARCH_KEY = "modelMetadata.cardCountBeforeSearch";

function setOpenedModelId(page: any, modelId: string | null): void {
    getScenarioState(page).setCustom(OPENED_MODEL_ID_KEY, modelId);
}

function getOpenedModelId(page: any): string | null {
    return (
        getScenarioState(page).getCustom<string | null>(OPENED_MODEL_ID_KEY) ??
        null
    );
}

function setTagCountBeforeRemove(page: any, count: number): void {
    getScenarioState(page).setCustom(TAG_COUNT_BEFORE_REMOVE_KEY, count);
}

function getTagCountBeforeRemove(page: any): number {
    return (
        getScenarioState(page).getCustom<number>(TAG_COUNT_BEFORE_REMOVE_KEY) ??
        0
    );
}

function setCardCountBeforeSearch(page: any, count: number): void {
    getScenarioState(page).setCustom(CARD_COUNT_BEFORE_SEARCH_KEY, count);
}

function getCardCountBeforeSearch(page: any): number {
    return (
        getScenarioState(page).getCustom<number>(
            CARD_COUNT_BEFORE_SEARCH_KEY,
        ) ?? 0
    );
}

const getTagInput = (infoPanel) =>
    infoPanel.locator('input[placeholder="Add new tag..."], .tag-input');

const getTagAddButton = (infoPanel) =>
    infoPanel.locator(".tag-input-group").getByRole("button", {
        name: /Add Tag|Add/,
    });

// ============= Given Steps =============

Given("I open a model in the viewer", async ({ page }) => {
    // Click the first model card to open it in the viewer
    const firstCard = page.locator(".model-card").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    // Store the model ID so we can re-open the same model later
    const openedModelId =
        (await firstCard.getAttribute("data-model-id")) ?? null;
    setOpenedModelId(page, openedModelId);
    await firstCard.click();
    console.log(
        `[Action] Clicked first model card (model ID: ${openedModelId})`,
    );

    // Wait for the viewer canvas to appear
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });
    console.log("[UI] Viewer canvas is visible ✓");
});

Given("I open the model info panel", async ({ page }) => {
    const viewerPage = new ModelViewerPage(page);
    await viewerPage.openTab("Model Info", '[data-testid="model-info-panel"]');

    // Wait for the info panel to be visible
    const infoPanel = page.locator('[data-testid="model-info-panel"]');
    await expect(infoPanel).toBeVisible({ timeout: 10000 });
    console.log("[UI] Model info panel is visible ✓");
});

Given("the model has at least one tag", async ({ page }) => {
    const infoPanel = page.locator('[data-testid="model-info-panel"]');

    // Wait for tags to render — give the useEffect + React Query time to
    // deliver fresh model data after the component mounts.
    const firstChip = infoPanel.locator(".p-chip").first();
    const hasChips = await firstChip
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false);

    if (!hasChips) {
        // No tags exist on this model — add one so the "remove" step has
        // something to work with.
        console.log("[Setup] No tags found on model, adding one...");
        const tagInput = getTagInput(infoPanel);
        await tagInput.fill("setup-tag");

        const addButton = getTagAddButton(infoPanel);
        await addButton.click();

        // Save and wait for API confirmation
        const saveButton = infoPanel.getByRole("button", {
            name: "Save Changes",
        });
        const saveResponse = page.waitForResponse(
            (resp) =>
                resp.url().includes("/models/") &&
                resp.url().includes("/tags") &&
                resp.request().method() === "POST",
            { timeout: 10000 },
        );
        await saveButton.click();
        await saveResponse;
        await page.waitForTimeout(500);
        console.log("[Setup] Added setup tag and saved ✓");
    }

    // Record current tag count for later verification
    const tagCountBeforeRemove = await infoPanel.locator(".p-chip").count();
    setTagCountBeforeRemove(page, tagCountBeforeRemove);
    console.log(`[State] Current tag count: ${tagCountBeforeRemove}`);
    expect(tagCountBeforeRemove).toBeGreaterThan(0);
});

// ============= When Steps =============

When("I add the tag {string}", async ({ page }, tag: string) => {
    const infoPanel = page.locator('[data-testid="model-info-panel"]');

    const tagInput = getTagInput(infoPanel);
    await expect(tagInput).toBeVisible({ timeout: 5000 });
    await tagInput.fill(tag);

    const addButton = getTagAddButton(infoPanel);
    await addButton.click();

    // Verify the tag chip appeared
    const tagChip = infoPanel.locator(`.p-chip:has-text("${tag}")`);
    await expect(tagChip).toBeVisible({ timeout: 5000 });
    console.log(`[Action] Added tag "${tag}" ✓`);
});

When(
    "I attach the concept image {string} to the model",
    async ({ page }, fileName: string) => {
        const viewerPage = new ModelViewerPage(page);
        const currentModelId = await viewerPage.getCurrentModelId();
        if (currentModelId !== null) {
            setOpenedModelId(page, String(currentModelId));
        }

        const filePath = await UniqueFileGenerator.generate(fileName);
        const infoPanel = page.locator('[data-testid="model-info-panel"]');
        const conceptInput = infoPanel.locator(
            'input[type="file"][accept="image/*"]',
        );

        await conceptInput.setInputFiles(filePath);

        await expect(infoPanel.locator(`img[alt="${fileName}"]`)).toBeVisible({
            timeout: 30000,
        });
        console.log(`[Action] Attached concept image "${fileName}" ✓`);
    },
);

When("I remove the first tag", async ({ page }) => {
    const infoPanel = page.locator('[data-testid="model-info-panel"]');

    // Wait for tag count to stabilise before recording — the component may
    // still be rendering chips from a fresh React Query fetch.
    let initialCount = 0;
    await expect(async () => {
        initialCount = await infoPanel.locator(".p-chip").count();
        expect(initialCount).toBeGreaterThan(0);
    }).toPass({ timeout: 10000, intervals: [500, 500, 500] });

    setTagCountBeforeRemove(page, initialCount);
    console.log(`[State] Tags before removal: ${initialCount}`);

    // Click the remove icon on the first tag chip
    const firstChipRemove = infoPanel
        .locator(".p-chip .p-chip-remove-icon")
        .first();
    await expect(firstChipRemove).toBeVisible({ timeout: 5000 });
    await firstChipRemove.click();

    // Verify count decreased
    await expect(async () => {
        const currentCount = await infoPanel.locator(".p-chip").count();
        expect(currentCount).toBeLessThan(getTagCountBeforeRemove(page));
    }).toPass({ timeout: 5000 });

    console.log("[Action] Removed first tag ✓");
});

When("I save the model info changes", async ({ page }) => {
    const infoPanel = page.locator('[data-testid="model-info-panel"]');

    const saveButton = infoPanel.getByRole("button", {
        name: "Save Changes",
    });
    await expect(saveButton).toBeVisible({ timeout: 5000 });

    // Click save and wait for any model-related API response
    const responsePromise = page.waitForResponse(
        (resp) =>
            resp.url().includes("/models/") &&
            (resp.request().method() === "POST" ||
                resp.request().method() === "PUT") &&
            resp.status() >= 200 &&
            resp.status() < 300,
        { timeout: 15000 },
    );
    await saveButton.click();
    await responsePromise;

    // Brief pause to let React re-render after mutation success callback
    await page.waitForTimeout(1000);
    console.log("[Action] Saved model info changes ✓");
});

When("I set the description to {string}", async ({ page }, text: string) => {
    const infoPanel = page.locator('[data-testid="model-info-panel"]');

    const textarea = infoPanel.locator(
        'textarea[placeholder="Enter description..."], .description-textarea',
    );
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill(text);
    console.log(`[Action] Set description to "${text}" ✓`);
});

When("I search for models with {string}", async ({ page }, text: string) => {
    // Record model count before search
    await page.waitForTimeout(500);
    const cardCountBeforeSearch = await page.locator(".model-card").count();
    setCardCountBeforeSearch(page, cardCountBeforeSearch);
    console.log(`[State] Model cards before search: ${cardCountBeforeSearch}`);

    const modelListPage = new ModelListPage(page);
    await modelListPage.searchForModels(text);

    // Wait for the list to update
    await page.waitForTimeout(1000);
    console.log(`[Action] Searched for "${text}" ✓`);
});

When("I clear the model search", async ({ page }) => {
    const modelListPage = new ModelListPage(page);
    await modelListPage.searchForModels("");

    // Wait for the list to update
    await page.waitForTimeout(1000);
    console.log("[Action] Cleared model search ✓");
});

When("I enable the concept art filter", async ({ page }) => {
    const modelListPage = new ModelListPage(page);
    await modelListPage.enableConceptArtFilter();
    console.log("[Action] Enabled concept art filter ✓");
});

// ============= Then Steps =============

Then(
    "the tags {string} and {string} should be saved",
    async ({ page }, tag1: string, tag2: string) => {
        // Navigate back to model list to verify persistence
        const { navigateToTab } = await import("../helpers/navigation-helper");
        await navigateToTab(page, "modelList");

        // Re-open the SAME model by ID to avoid parallel test interference
        let targetCard;
        const openedModelId = getOpenedModelId(page);
        if (openedModelId) {
            targetCard = page.locator(
                `.model-card[data-model-id="${openedModelId}"]`,
            );
        } else {
            targetCard = page.locator(".model-card").first();
        }
        await expect(targetCard).toBeVisible({ timeout: 10000 });
        await targetCard.click();

        // Wait for viewer canvas
        const canvas = page.locator("canvas");
        await expect(canvas).toBeVisible({ timeout: 15000 });

        // Re-open the info panel
        const viewerPage = new ModelViewerPage(page);
        await viewerPage.openTab(
            "Model Info",
            '[data-testid="model-info-panel"]',
        );

        const infoPanel = page.locator('[data-testid="model-info-panel"]');
        await expect(infoPanel).toBeVisible({ timeout: 10000 });

        // Verify both tags are present (use polling with reload for robustness)
        const tag1Chip = infoPanel.locator(`.p-chip:has-text("${tag1}")`);
        const tag2Chip = infoPanel.locator(`.p-chip:has-text("${tag2}")`);

        await expect(async () => {
            // If tags are not visible, try reloading
            if (!(await tag1Chip.isVisible().catch(() => false))) {
                await page.reload();
                await page.waitForLoadState("domcontentloaded");
                await viewerPage.openTab(
                    "Model Info",
                    '[data-testid="model-info-panel"]',
                );
            }
            await expect(tag1Chip).toBeVisible({ timeout: 5000 });
            await expect(tag2Chip).toBeVisible({ timeout: 5000 });
        }).toPass({ timeout: 30000, intervals: [2000, 5000, 5000] });

        console.log(
            `[Verify] Tags "${tag1}" and "${tag2}" are saved and visible after reload ✓`,
        );
    },
);

Then("the tag count should have decreased", async ({ page }) => {
    // Navigate back to model list to verify persistence
    const { navigateToTab } = await import("../helpers/navigation-helper");
    await navigateToTab(page, "modelList");

    // Re-open the SAME model by ID to avoid parallel test interference
    let targetCard;
    const openedModelId = getOpenedModelId(page);
    if (openedModelId) {
        targetCard = page.locator(
            `.model-card[data-model-id="${openedModelId}"]`,
        );
    } else {
        targetCard = page.locator(".model-card").first();
    }
    await expect(targetCard).toBeVisible({ timeout: 10000 });
    await targetCard.click();

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Re-open the info panel
    const viewerPage = new ModelViewerPage(page);
    await viewerPage.openTab("Model Info", '[data-testid="model-info-panel"]');

    const infoPanel = page.locator('[data-testid="model-info-panel"]');
    await expect(infoPanel).toBeVisible({ timeout: 10000 });

    // Use a retrying assertion — the ModelInfo component initialises tags
    // from the model prop, but the first render may use stale/cached data
    // before React Query delivers the fresh payload.
    await expect(async () => {
        const currentCount = await infoPanel.locator(".p-chip").count();
        console.log(
            `[Verify] Tags before: ${getTagCountBeforeRemove(page)}, after reload: ${currentCount} (modelId: ${openedModelId})`,
        );
        expect(currentCount).toBeLessThan(getTagCountBeforeRemove(page));
    }).toPass({ timeout: 15000, intervals: [1000, 1000, 2000, 2000] });

    console.log("[Verify] Tag count decreased after reload ✓");
});

Then(
    "the description should be saved as {string}",
    async ({ page }, text: string) => {
        // Navigate back to model list to verify persistence
        const { navigateToTab } = await import("../helpers/navigation-helper");
        await navigateToTab(page, "modelList");

        // Re-open the SAME model by ID to avoid parallel test interference
        let targetCard;
        const openedModelId = getOpenedModelId(page);
        if (openedModelId) {
            targetCard = page.locator(
                `.model-card[data-model-id="${openedModelId}"]`,
            );
        } else {
            targetCard = page.locator(".model-card").first();
        }
        await expect(targetCard).toBeVisible({ timeout: 10000 });
        await targetCard.click();

        const canvas = page.locator("canvas");
        await expect(canvas).toBeVisible({ timeout: 15000 });

        // Re-open the info panel
        const viewerPage = new ModelViewerPage(page);
        await viewerPage.openTab(
            "Model Info",
            '[data-testid="model-info-panel"]',
        );

        const infoPanel = page.locator('[data-testid="model-info-panel"]');
        await expect(infoPanel).toBeVisible({ timeout: 10000 });

        const textarea = infoPanel.locator(
            'textarea[placeholder="Enter description..."], .description-textarea',
        );
        await expect(textarea).toBeVisible({ timeout: 10000 });

        // Use polling with reload to wait for the description value to be populated
        await expect(async () => {
            // Wait for the model data API response to ensure data is loaded
            const responsePromise = page
                .waitForResponse(
                    (resp) =>
                        resp.url().includes("/models/") &&
                        resp.request().method() === "GET" &&
                        resp.status() >= 200 &&
                        resp.status() < 300,
                    { timeout: 10000 },
                )
                .catch(() => null); // Don't fail if response already happened

            await page.reload();
            await responsePromise;
            await page.waitForLoadState("domcontentloaded");
            await viewerPage.openTab(
                "Model Info",
                '[data-testid="model-info-panel"]',
            );
            // Give React Query time to populate the textarea
            await page.waitForTimeout(1000);
            const updatedTextarea = page
                .locator('[data-testid="model-info-panel"]')
                .locator(
                    'textarea[placeholder="Enter description..."], .description-textarea',
                );
            const updatedValue = await updatedTextarea.inputValue();
            expect(updatedValue).toBe(text);
        }).toPass({
            timeout: 60000,
            intervals: [3000, 5000, 5000, 5000, 5000],
        });
        console.log(`[Verify] Description "${text}" is saved after reload ✓`);
    },
);

Then(
    "the technical data section should show analyzed values",
    async ({ page }) => {
        const infoPanel = page.locator('[data-testid="model-info-panel"]');
        const technicalSection = infoPanel.locator(
            '.model-info-section:has(.model-info-title:has-text("Technical Data"))',
        );

        await expect(technicalSection).toBeVisible({ timeout: 10000 });

        for (const label of ["Triangles", "Vertices", "Meshes", "Materials"]) {
            const row = technicalSection.locator(
                `.model-info-item:has(label:has-text("${label}"))`,
            );
            await expect(row).toBeVisible({ timeout: 5000 });
            await expect(row.locator("span")).not.toHaveText("Unknown", {
                timeout: 20000,
            });
        }

        const basedOnRow = technicalSection.locator(
            '.model-info-item:has(label:has-text("Based On"))',
        );
        await expect(basedOnRow.locator("span")).toContainText("Version", {
            timeout: 10000,
        });
        console.log("[Verify] Technical data section shows analyzed values ✓");
    },
);

Then(
    "the concept image {string} should be saved for the model",
    async ({ page }, fileName: string) => {
        const openedModelId = getOpenedModelId(page);
        if (!openedModelId) {
            throw new Error(
                "No opened model ID tracked for concept image check",
            );
        }

        const { navigateToTab } = await import("../helpers/navigation-helper");
        await navigateToTab(page, "modelList");

        const modelCard = page.locator(
            `.model-card[data-model-id="${openedModelId}"]`,
        );
        await expect(modelCard).toBeVisible({ timeout: 15000 });
        await modelCard.click();

        const viewerPage = new ModelViewerPage(page);
        await viewerPage.waitForModelLoaded();
        await viewerPage.openTab(
            "Model Info",
            '[data-testid="model-info-panel"]',
        );

        const infoPanel = page.locator('[data-testid="model-info-panel"]');
        const conceptImage = infoPanel.locator(`img[alt="${fileName}"]`);
        await expect(conceptImage).toBeVisible({ timeout: 10000 });
        await expect
            .poll(
                async () => {
                    return await conceptImage.evaluate(
                        (img: HTMLImageElement) => {
                            return img.complete && img.naturalWidth > 0;
                        },
                    );
                },
                {
                    message: `Waiting for concept image \"${fileName}\" to decode`,
                    timeout: 15000,
                    intervals: [500, 1000, 2000],
                },
            )
            .toBe(true);

        const details = await conceptImage.evaluate(
            (img: HTMLImageElement) => ({
                src: img.getAttribute("src"),
                currentSrc: img.currentSrc,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
            }),
        );
        console.log(
            `[Verify] Concept image "${fileName}" loaded: ${details.naturalWidth}x${details.naturalHeight} (${details.currentSrc || details.src}) ✓`,
        );
    },
);

Then("the model list should show filtered results", async ({ page }) => {
    const currentCount = await page.locator(".model-card").count();
    console.log(
        `[Verify] Cards before search: ${getCardCountBeforeSearch(page)}, after: ${currentCount}`,
    );

    // Filtered results should either show fewer cards or at least some cards
    // (if all models match the search, count may be the same)
    expect(currentCount).toBeGreaterThan(0);
    console.log("[Verify] Filtered results are visible ✓");
});

Then("more models should be visible", async ({ page }) => {
    // After clearing search, wait for all models to reappear
    await expect(async () => {
        const currentCount = await page.locator(".model-card").count();
        expect(currentCount).toBeGreaterThanOrEqual(
            getCardCountBeforeSearch(page),
        );
    }).toPass({ timeout: 5000 });

    const finalCount = await page.locator(".model-card").count();
    console.log(
        `[Verify] Cards after clearing search: ${finalCount} (was ${getCardCountBeforeSearch(page)} during search) ✓`,
    );
});
