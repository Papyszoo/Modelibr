import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { navigateToAppClean } from "../helpers/navigation-helper";
import { ModelListPage } from "../pages/ModelListPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

// ============= Filter Steps =============

When(
    "I filter the model list by pack {string}",
    async ({ page }, packName: string) => {
        const pack = getScenarioState(page).getPack(packName);
        if (!pack) {
            throw new Error(`Pack "${packName}" not found in shared state`);
        }

        const modelListPage = new ModelListPage(page);
        await modelListPage.filterByPack(packName);

        // Wait for filtered results to load
        await page.waitForLoadState("domcontentloaded");

        // Assert filter was applied - check for filter token/chip
        await expect(modelListPage.getFilterTokens().first()).toBeVisible({
            timeout: 5000,
        });
        console.log(`[Action] Filtered model list by pack "${packName}"`);
    },
);

When(
    "I filter the model list by project {string}",
    async ({ page }, projectName: string) => {
        const project = getScenarioState(page).getProject(projectName);
        if (!project) {
            throw new Error(
                `Project "${projectName}" not found in shared state`,
            );
        }

        const modelListPage = new ModelListPage(page);
        await modelListPage.filterByProject(projectName);

        // Assert filter was applied - check for filter token/chip
        await expect(modelListPage.getFilterTokens().first()).toBeVisible({
            timeout: 5000,
        });
        console.log(`[Action] Filtered model list by project "${projectName}"`);
    },
);

When("I clear the model list filter", async ({ page }) => {
    const modelListPage = new ModelListPage(page);
    await modelListPage.clearFilters();
    expect(await modelListPage.getFilterTokens().count()).toBe(0);
    console.log("[Action] Cleared model list filter");
});

// ============= Precondition Steps =============

Given(
    "the model {string} is in the pack {string}",
    async ({ page }, modelStateName: string, packName: string) => {
        const model = getScenarioState(page).getModel(modelStateName);
        const pack = getScenarioState(page).getPack(packName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }
        if (!pack) {
            throw new Error(`Pack "${packName}" not found in shared state`);
        }

        // Add model to pack via API
        const response = await page.request.post(
            `${API_BASE}/packs/${pack.id}/models/${model.id}`,
        );

        // Assert response is either success or "already in pack" (400)
        expect(response.ok() || response.status() === 400).toBeTruthy();
        if (response.ok()) {
            console.log(
                `[Precondition] Model "${model.name}" (ID: ${model.id}) added to pack "${packName}" (ID: ${pack.id})`,
            );
        } else {
            console.log(
                `[Precondition] Add model to pack response: ${response.status()} (may already be in pack)`,
            );
        }

        // Navigate to model list page to ensure UI shows updated data
        await navigateToAppClean(page);
        await page.waitForLoadState("domcontentloaded");
    },
);

Given(
    "the model {string} is in the project {string}",
    async ({ page }, modelStateName: string, projectName: string) => {
        const model = getScenarioState(page).getModel(modelStateName);
        const project = getScenarioState(page).getProject(projectName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }
        if (!project) {
            throw new Error(
                `Project "${projectName}" not found in shared state`,
            );
        }

        // Add model to project via API
        const response = await page.request.post(
            `${API_BASE}/projects/${project.id}/models/${model.id}`,
        );

        // Assert response is either success or "already in project" (400)
        expect(response.ok() || response.status() === 400).toBeTruthy();
        if (response.ok()) {
            console.log(
                `[Precondition] Model "${model.name}" (ID: ${model.id}) added to project "${projectName}" (ID: ${project.id})`,
            );
        } else {
            console.log(
                `[Precondition] Add model to project response: ${response.status()} (may already be in project)`,
            );
        }

        // Navigate to model list page to ensure UI shows updated data
        await navigateToAppClean(page);
        await page.waitForLoadState("domcontentloaded");
    },
);

Given(
    "the model list is filtered by pack {string}",
    async ({ page }, packName: string) => {
        const pack = getScenarioState(page).getPack(packName);
        if (!pack) {
            throw new Error(`Pack "${packName}" not found in shared state`);
        }

        const modelListPage = new ModelListPage(page);
        await modelListPage.filterByPack(packName);

        // Assert filter chip is visible
        await expect(modelListPage.getFilterTokens().first()).toBeVisible({
            timeout: 5000,
        });
        console.log(`[Precondition] Model list filtered by pack "${packName}"`);
    },
);

Given(
    "the model list is filtered by project {string}",
    async ({ page }, projectName: string) => {
        const project = getScenarioState(page).getProject(projectName);
        if (!project) {
            throw new Error(
                `Project "${projectName}" not found in shared state`,
            );
        }

        const modelListPage = new ModelListPage(page);
        await modelListPage.filterByProject(projectName);

        // Assert filter chip is visible
        await expect(modelListPage.getFilterTokens().first()).toBeVisible({
            timeout: 5000,
        });
        console.log(
            `[Precondition] Model list filtered by project "${projectName}"`,
        );
    },
);

// ============= Assertion Steps =============

Then(
    "the model list should show model {string}",
    async ({ page }, modelStateName: string) => {
        const model = getScenarioState(page).getModel(modelStateName);
        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        // Model cards show the actual model name (usually the filename without extension)
        // Not the state name we use to reference it
        console.log(
            `[Debug] Looking for model card with name: "${model.name}" (state name: "${modelStateName}")`,
        );

        const modelListPage = new ModelListPage(page);
        const modelCard = modelListPage.getModelCard(model.name, model.id);
        await expect(modelCard).toBeVisible({ timeout: 10000 });
        console.log(`[UI] Model "${model.name}" is visible in model list ✓`);
    },
);

Then(
    "the model list should not show model {string}",
    async ({ page }, modelStateName: string) => {
        const model = getScenarioState(page).getModel(modelStateName);
        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state`,
            );
        }

        const modelListPage = new ModelListPage(page);
        const modelCard = modelListPage.getModelCard(model.name, model.id);
        await expect(modelCard).not.toBeVisible({ timeout: 10000 });
        console.log(
            `[UI] Model "${model.name}" is not visible in model list ✓`,
        );
    },
);

Then("the model list should show all models", async ({ page }) => {
    // Wait for the model list to load
    await page.waitForLoadState("domcontentloaded");

    // Verify no filter chips are visible (filters are cleared)
    const modelListPage = new ModelListPage(page);
    const chipCount = await modelListPage.getFilterTokens().count();
    expect(chipCount).toBe(0);
    console.log("[UI] Model list is showing all models (no filters active) ✓");
});

Then("I take a screenshot of filtered model list", async ({ page }) => {
    await page.screenshot({
        path: "test-results/screenshots/filtered-model-list.png",
    });
    console.log("[Screenshot] Captured filtered model list");
});

// ============= API Setup Steps for Independent Tests =============
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";

// ESM-compatible __dirname
const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename_local);

Given(
    "I create a test pack named {string} via API",
    async ({ page }, packName: string) => {
        // Check if pack already exists (idempotent)
        const listResponse = await page.request.get(`${API_BASE}/packs`);
        if (listResponse.ok()) {
            const listData = await listResponse.json();
            const existing = (listData.packs || []).find(
                (p: any) => p.name === packName,
            );
            if (existing) {
                // Clean up stale sprites from previous runs
                const detailRes = await page.request.get(
                    `${API_BASE}/packs/${existing.id}`,
                );
                if (detailRes.ok()) {
                    const detail = await detailRes.json();
                    for (const sprite of detail.sprites || []) {
                        await page.request
                            .delete(
                                `${API_BASE}/packs/${existing.id}/sprites/${sprite.id}`,
                            )
                            .catch(() => {});
                    }
                    if ((detail.sprites || []).length > 0) {
                        console.log(
                            `[API] Cleaned ${detail.sprites.length} stale sprite(s) from pack "${packName}"`,
                        );
                    }
                }
                getScenarioState(page).savePack(packName, {
                    id: existing.id,
                    name: packName,
                });
                console.log(
                    `[API] Pack "${packName}" already exists (ID: ${existing.id}), reusing`,
                );
                return;
            }
        }

        const response = await page.request.post(`${API_BASE}/packs`, {
            data: {
                name: packName,
                description: `Test pack created for E2E testing`,
            },
        });

        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.id).toBeTruthy();
        getScenarioState(page).savePack(packName, {
            id: data.id,
            name: packName,
        });
        console.log(`[API] Created pack "${packName}" (ID: ${data.id})`);
    },
);

Given(
    "I create a unique test model named {string} via API",
    async ({ page }, modelName: string) => {
        // Generate a unique model file
        const uniqueFilePath =
            await UniqueFileGenerator.generate("test-cube.glb");
        const fileBuffer = fs.readFileSync(uniqueFilePath);

        // Upload the model
        const response = await page.request.post(`${API_BASE}/models`, {
            multipart: {
                file: {
                    name: path.basename(uniqueFilePath),
                    mimeType: "model/gltf-binary",
                    buffer: fileBuffer,
                },
            },
        });

        if (!response.ok()) {
            throw new Error(
                `Failed to create model "${modelName}": ${response.status()}`,
            );
        }

        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.id).toBeTruthy();

        // Fetch the actual model name from the server (may differ due to AutoRename policy)
        const detailResp = await page.request.get(
            `${API_BASE}/models/${data.id}`,
        );
        const detailData = detailResp.ok()
            ? await detailResp.json()
            : null;
        const actualName =
            detailData?.name ||
            path.basename(uniqueFilePath).replace(/\.[^/.]+$/, "");

        getScenarioState(page).saveModel(modelName, {
            id: data.id,
            name: actualName,
            versions: [],
        });
        console.log(
            `[API] Created model "${modelName}" (ID: ${data.id}, actual name: ${actualName})`,
        );
    },
);

Given(
    "I add the model {string} to the pack {string} via API",
    async ({ page }, modelName: string, packName: string) => {
        const model = getScenarioState(page).getModel(modelName);
        const pack = getScenarioState(page).getPack(packName);

        if (!model) {
            throw new Error(`Model "${modelName}" not found in shared state`);
        }
        if (!pack) {
            throw new Error(`Pack "${packName}" not found in shared state`);
        }

        const response = await page.request.post(
            `${API_BASE}/packs/${pack.id}/models/${model.id}`,
        );

        // Assert response is success or "already in pack" (400)
        expect(response.ok() || response.status() === 400).toBeTruthy();
        if (!response.ok() && response.status() !== 400) {
            throw new Error(
                `Failed to add model to pack: ${response.status()}`,
            );
        }

        console.log(
            `[API] Added model "${modelName}" (ID: ${model.id}) to pack "${packName}" (ID: ${pack.id})`,
        );
    },
);

Given(
    "I create a test project named {string} via API",
    async ({ page }, projectName: string) => {
        // Check if project already exists (idempotent)
        const listResponse = await page.request.get(`${API_BASE}/projects`);
        if (listResponse.ok()) {
            const listData = await listResponse.json();
            const existing = (listData.projects || []).find(
                (p: any) => p.name === projectName,
            );
            if (existing) {
                getScenarioState(page).saveProject(projectName, {
                    id: existing.id,
                    name: projectName,
                });
                console.log(
                    `[API] Project "${projectName}" already exists (ID: ${existing.id}), reusing`,
                );
                return;
            }
        }

        const response = await page.request.post(`${API_BASE}/projects`, {
            data: {
                name: projectName,
                description: `Test project created for E2E testing`,
            },
        });

        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.id).toBeTruthy();
        getScenarioState(page).saveProject(projectName, {
            id: data.id,
            name: projectName,
        });
        console.log(`[API] Created project "${projectName}" (ID: ${data.id})`);
    },
);

Given(
    "I add the model {string} to the project {string} via API",
    async ({ page }, modelName: string, projectName: string) => {
        const model = getScenarioState(page).getModel(modelName);
        const project = getScenarioState(page).getProject(projectName);

        if (!model) {
            throw new Error(`Model "${modelName}" not found in shared state`);
        }
        if (!project) {
            throw new Error(
                `Project "${projectName}" not found in shared state`,
            );
        }

        const response = await page.request.post(
            `${API_BASE}/projects/${project.id}/models/${model.id}`,
        );

        // Assert response is success or "already in project" (400)
        expect(response.ok() || response.status() === 400).toBeTruthy();
        if (!response.ok() && response.status() !== 400) {
            throw new Error(
                `Failed to add model to project: ${response.status()}`,
            );
        }

        console.log(
            `[API] Added model "${modelName}" (ID: ${model.id}) to project "${projectName}" (ID: ${project.id})`,
        );
    },
);

Given(
    "I create a test sprite named {string} via API",
    async ({ page }, spriteName: string) => {
        // Generate unique PNG file to avoid hash-based deduplication
        const uniqueFilePath =
            await UniqueFileGenerator.generate("blue_color.png");
        const fileBuffer = fs.readFileSync(uniqueFilePath);

        // Upload the sprite using /sprites/with-file endpoint
        const response = await page.request.post(
            `${API_BASE}/sprites/with-file`,
            {
                multipart: {
                    file: {
                        name: `${spriteName}.png`,
                        mimeType: "image/png",
                        buffer: fileBuffer,
                    },
                    name: spriteName,
                },
            },
        );

        if (!response.ok()) {
            throw new Error(
                `Failed to create sprite "${spriteName}": ${response.status()}`,
            );
        }

        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        const spriteId = data.spriteId || data.id;
        expect(spriteId).toBeTruthy();
        const fileId = data.fileId || spriteId; // Fallback to spriteId if fileId not returned
        getScenarioState(page).saveSprite(spriteName, {
            id: spriteId,
            name: spriteName,
            fileId,
            categoryId: undefined,
        });
        console.log(`[API] Created sprite "${spriteName}" (ID: ${spriteId})`);
    },
);

Given(
    "I add the sprite {string} to the pack {string} via API",
    async ({ page }, spriteName: string, packName: string) => {
        const sprite = getScenarioState(page).getSprite(spriteName);
        const pack = getScenarioState(page).getPack(packName);

        if (!sprite) {
            throw new Error(`Sprite "${spriteName}" not found in shared state`);
        }
        if (!pack) {
            throw new Error(`Pack "${packName}" not found in shared state`);
        }

        const response = await page.request.post(
            `${API_BASE}/packs/${pack.id}/sprites/${sprite.id}`,
        );

        // Assert response is success or "already in pack" (400)
        expect(response.ok() || response.status() === 400).toBeTruthy();
        if (!response.ok() && response.status() !== 400) {
            throw new Error(
                `Failed to add sprite to pack: ${response.status()}`,
            );
        }

        console.log(
            `[API] Added sprite "${spriteName}" (ID: ${sprite.id}) to pack "${packName}" (ID: ${pack.id})`,
        );
    },
);

Given(
    "I add the sprite {string} to the project {string} via API",
    async ({ page }, spriteName: string, projectName: string) => {
        const sprite = getScenarioState(page).getSprite(spriteName);
        const project = getScenarioState(page).getProject(projectName);

        if (!sprite) {
            throw new Error(`Sprite "${spriteName}" not found in shared state`);
        }
        if (!project) {
            throw new Error(
                `Project "${projectName}" not found in shared state`,
            );
        }

        const response = await page.request.post(
            `${API_BASE}/projects/${project.id}/sprites/${sprite.id}`,
        );

        // Assert response is success or "already in project" (400)
        expect(response.ok() || response.status() === 400).toBeTruthy();
        if (!response.ok() && response.status() !== 400) {
            throw new Error(
                `Failed to add sprite to project: ${response.status()}`,
            );
        }

        console.log(
            `[API] Added sprite "${spriteName}" (ID: ${sprite.id}) to project "${projectName}" (ID: ${project.id})`,
        );
    },
);

Given(
    "I create a test sprite category named {string} via API",
    async ({ page }, categoryName: string) => {
        const response = await page.request.post(
            `${API_BASE}/sprite-categories`,
            {
                data: {
                    name: categoryName,
                    description: `Test category for E2E testing`,
                },
            },
        );

        if (!response.ok()) {
            // Handle duplicate: if the category already exists, look it up
            const errBody = await response.text();
            if (
                response.status() === 400 &&
                errBody.includes("AlreadyExists")
            ) {
                console.log(
                    `[API] Sprite category "${categoryName}" already exists, looking it up...`,
                );
                const listResp = await page.request.get(
                    `${API_BASE}/sprite-categories`,
                );
                if (listResp.ok()) {
                    const categories = await listResp.json();
                    const existing = (
                        Array.isArray(categories)
                            ? categories
                            : categories.categories || []
                    ).find((c: any) => c.name === categoryName);
                    if (existing) {
                        expect(existing.id).toBeTruthy();
                        getScenarioState(page).saveSpriteCategory(
                            categoryName,
                            {
                                id: existing.id,
                                name: categoryName,
                                description: existing.description,
                            },
                        );
                        console.log(
                            `[API] Found existing sprite category "${categoryName}" (ID: ${existing.id})`,
                        );
                        return;
                    }
                }
            }
            throw new Error(
                `Failed to create sprite category "${categoryName}": ${response.status()} ${errBody}`,
            );
        }

        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.id).toBeTruthy();
        getScenarioState(page).saveSpriteCategory(categoryName, {
            id: data.id,
            name: categoryName,
            description: data.description,
        });
        console.log(
            `[API] Created sprite category "${categoryName}" (ID: ${data.id})`,
        );
    },
);

Given(
    "I assign the sprite {string} to category {string} via API",
    async ({ page }, spriteName: string, categoryName: string) => {
        const sprite = getScenarioState(page).getSprite(spriteName);
        const category = getScenarioState(page).getSpriteCategory(categoryName);

        if (!sprite) {
            throw new Error(`Sprite "${spriteName}" not found in shared state`);
        }
        if (!category) {
            throw new Error(
                `Category "${categoryName}" not found in shared state`,
            );
        }

        const response = await page.request.put(
            `${API_BASE}/sprites/${sprite.id}`,
            {
                data: { name: sprite.name, categoryId: category.id },
            },
        );

        expect(response.ok()).toBeTruthy();
        if (!response.ok()) {
            throw new Error(
                `Failed to assign sprite to category: ${response.status()}`,
            );
        }

        console.log(
            `[API] Assigned sprite "${spriteName}" (ID: ${sprite.id}) to category "${categoryName}" (ID: ${category.id})`,
        );
    },
);
