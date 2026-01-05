import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { sharedState } from "../fixtures/shared-state";

const { Given, When, Then } = createBdd();

// ============= Filter Steps =============

When("I filter the model list by pack {string}", async ({ page }, packName: string) => {
    const pack = sharedState.getPack(packName);
    if (!pack) {
        throw new Error(`Pack "${packName}" not found in shared state`);
    }
    
    // Click the packs multiselect dropdown (first one in filter bar)
    const packsMultiselect = page.locator('.filter-bar .p-multiselect').first();
    await packsMultiselect.click();
    await page.waitForTimeout(300);
    
    // Select the pack option in the dropdown panel
    const packOption = page.locator(`.p-multiselect-panel .p-multiselect-item:has-text("${packName}")`);
    await packOption.click();
    
    // Close the dropdown by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Wait for filtered results to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    console.log(`[Action] Filtered model list by pack "${packName}"`);
});

When("I filter the model list by project {string}", async ({ page }, projectName: string) => {
    const project = sharedState.getProject(projectName);
    if (!project) {
        throw new Error(`Project "${projectName}" not found in shared state`);
    }
    
    // Click the projects multiselect dropdown (should be second in filter bar, or first if no packs)
    // We'll use placeholder text to identify
    const projectsMultiselect = page.locator('.filter-bar .p-multiselect:has([class*="placeholder"]:has-text("Projects"))');
    await projectsMultiselect.click();
    await page.waitForTimeout(300);
    
    // Select the project option in the dropdown panel
    const projectOption = page.locator(`.p-multiselect-panel .p-multiselect-item:has-text("${projectName}")`);
    await projectOption.click();
    
    // Close the dropdown by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log(`[Action] Filtered model list by project "${projectName}"`);
});

When("I clear the model list filter", async ({ page }) => {
    // Click the clear filters button if visible
    const clearButton = page.locator('.clear-filters-btn');
    if (await clearButton.isVisible()) {
        await clearButton.click();
        await page.waitForLoadState('networkidle');
        console.log("[Action] Cleared model list filter via clear button");
    } else {
        // If no clear button, clear individual multiselects
        const packsClear = page.locator('.filter-bar .p-multiselect').first().locator('.p-multiselect-clear-icon');
        if (await packsClear.isVisible()) {
            await packsClear.click();
        }
        const projectsClear = page.locator('.filter-bar .p-multiselect').nth(1).locator('.p-multiselect-clear-icon');
        if (await projectsClear.isVisible()) {
            await projectsClear.click();
        }
        await page.waitForLoadState('networkidle');
        console.log("[Action] Cleared model list filter");
    }
});

// ============= Precondition Steps =============

Given("the model {string} is in the pack {string}", async ({ page }, modelStateName: string, packName: string) => {
    const model = sharedState.getModel(modelStateName);
    const pack = sharedState.getPack(packName);
    
    if (!model) {
        throw new Error(`Model "${modelStateName}" not found in shared state`);
    }
    if (!pack) {
        throw new Error(`Pack "${packName}" not found in shared state`);
    }
    
    // Add model to pack via API
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    const response = await page.request.post(`${API_BASE}/packs/${pack.id}/models/${model.id}`);
    
    if (response.ok()) {
        console.log(`[Precondition] Model "${model.name}" (ID: ${model.id}) added to pack "${packName}" (ID: ${pack.id})`);
    } else {
        console.log(`[Precondition] Add model to pack response: ${response.status()} (may already be in pack)`);
    }
    
    // Navigate to model list page to ensure UI shows updated data
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
    await page.goto(`${baseUrl}/?leftTabs=modelList&activeLeft=modelList`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
});

Given("the model {string} is in the project {string}", async ({ page }, modelStateName: string, projectName: string) => {
    const model = sharedState.getModel(modelStateName);
    const project = sharedState.getProject(projectName);
    
    if (!model) {
        throw new Error(`Model "${modelStateName}" not found in shared state`);
    }
    if (!project) {
        throw new Error(`Project "${projectName}" not found in shared state`);
    }
    
    // Add model to project via API
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    const response = await page.request.post(`${API_BASE}/projects/${project.id}/models/${model.id}`);
    
    if (response.ok()) {
        console.log(`[Precondition] Model "${model.name}" (ID: ${model.id}) added to project "${projectName}" (ID: ${project.id})`);
    } else {
        console.log(`[Precondition] Add model to project response: ${response.status()} (may already be in project)`);
    }
    
    // Navigate to model list page to ensure UI shows updated data
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
    await page.goto(`${baseUrl}/?leftTabs=modelList&activeLeft=modelList`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
});

Given("the model list is filtered by pack {string}", async ({ page }, packName: string) => {
    const pack = sharedState.getPack(packName);
    if (!pack) {
        throw new Error(`Pack "${packName}" not found in shared state`);
    }
    
    // Apply the filter using multiselect
    const packsMultiselect = page.locator('.filter-bar .p-multiselect').first();
    await packsMultiselect.click();
    await page.waitForTimeout(300);
    
    const packOption = page.locator(`.p-multiselect-panel .p-multiselect-item:has-text("${packName}")`);
    await packOption.click();
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log(`[Precondition] Model list filtered by pack "${packName}"`);
});

Given("the model list is filtered by project {string}", async ({ page }, projectName: string) => {
    const project = sharedState.getProject(projectName);
    if (!project) {
        throw new Error(`Project "${projectName}" not found in shared state`);
    }
    
    // Apply the filter using multiselect
    const projectsMultiselect = page.locator('.filter-bar .p-multiselect:has([class*="placeholder"]:has-text("Projects"))');
    await projectsMultiselect.click();
    await page.waitForTimeout(300);
    
    const projectOption = page.locator(`.p-multiselect-panel .p-multiselect-item:has-text("${projectName}")`);
    await projectOption.click();
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log(`[Precondition] Model list filtered by project "${projectName}"`);
});

// ============= Assertion Steps =============

Then("the model list should show model {string}", async ({ page }, modelStateName: string) => {
    const model = sharedState.getModel(modelStateName);
    if (!model) {
        throw new Error(`Model "${modelStateName}" not found in shared state`);
    }
    
    // Model cards show the actual model name (usually the filename without extension)
    // Not the state name we use to reference it
    console.log(`[Debug] Looking for model card with name: "${model.name}" (state name: "${modelStateName}")`);
    
    const modelCard = page.locator(`.model-card:has-text("${model.name}")`).first();
    await expect(modelCard).toBeVisible({ timeout: 10000 });
    console.log(`[UI] Model "${model.name}" is visible in model list ✓`);
});

Then("the model list should show all models", async ({ page }) => {
    // Wait for the model list to load
    await page.waitForLoadState('networkidle');
    
    // Verify no filter chips are visible (filters are cleared)
    const filterChips = page.locator('.filter-bar .p-multiselect-token');
    const chipCount = await filterChips.count();
    expect(chipCount).toBe(0);
    console.log("[UI] Model list is showing all models (no filters active) ✓");
});

Then("I take a screenshot of filtered model list", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/filtered-model-list.png" });
    console.log("[Screenshot] Captured filtered model list");
});

// ============= API Setup Steps for Independent Tests =============
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";

// ESM-compatible __dirname
const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename_local);

Given("I create a test pack named {string} via API", async ({ page }, packName: string) => {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    
    const response = await page.request.post(`${API_BASE}/packs`, {
        data: { name: packName, description: `Test pack created for E2E testing` }
    });
    
    if (!response.ok()) {
        throw new Error(`Failed to create pack "${packName}": ${response.status()}`);
    }
    
    const data = await response.json();
    sharedState.savePack(packName, { id: data.id, name: packName });
    console.log(`[API] Created pack "${packName}" (ID: ${data.id})`);
});

Given("I create a unique test model named {string} via API", async ({ page }, modelName: string) => {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    
    // Generate a unique model file
    const uniqueFilePath = await UniqueFileGenerator.generate("test-cube.glb");
    const fileBuffer = fs.readFileSync(uniqueFilePath);
    
    // Upload the model
    const response = await page.request.post(`${API_BASE}/models`, {
        multipart: {
            file: {
                name: path.basename(uniqueFilePath),
                mimeType: "model/gltf-binary",
                buffer: fileBuffer
            }
        }
    });
    
    if (!response.ok()) {
        throw new Error(`Failed to create model "${modelName}": ${response.status()}`);
    }
    
    const data = await response.json();
    const actualName = path.basename(uniqueFilePath).replace(/\.[^/.]+$/, '');
    sharedState.saveModel(modelName, { id: data.id, name: actualName, versions: [] });
    console.log(`[API] Created model "${modelName}" (ID: ${data.id}, actual name: ${actualName})`);
});

Given("I add the model {string} to the pack {string} via API", async ({ page }, modelName: string, packName: string) => {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    
    const model = sharedState.getModel(modelName);
    const pack = sharedState.getPack(packName);
    
    if (!model) {
        throw new Error(`Model "${modelName}" not found in shared state`);
    }
    if (!pack) {
        throw new Error(`Pack "${packName}" not found in shared state`);
    }
    
    const response = await page.request.post(`${API_BASE}/packs/${pack.id}/models/${model.id}`);
    
    if (!response.ok() && response.status() !== 400) {
        // 400 means already in pack, which is fine
        throw new Error(`Failed to add model to pack: ${response.status()}`);
    }
    
    console.log(`[API] Added model "${modelName}" (ID: ${model.id}) to pack "${packName}" (ID: ${pack.id})`);
});

Given("I create a test project named {string} via API", async ({ page }, projectName: string) => {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    
    const response = await page.request.post(`${API_BASE}/projects`, {
        data: { name: projectName, description: `Test project created for E2E testing` }
    });
    
    if (!response.ok()) {
        throw new Error(`Failed to create project "${projectName}": ${response.status()}`);
    }
    
    const data = await response.json();
    sharedState.saveProject(projectName, { id: data.id, name: projectName });
    console.log(`[API] Created project "${projectName}" (ID: ${data.id})`);
});

Given("I add the model {string} to the project {string} via API", async ({ page }, modelName: string, projectName: string) => {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    
    const model = sharedState.getModel(modelName);
    const project = sharedState.getProject(projectName);
    
    if (!model) {
        throw new Error(`Model "${modelName}" not found in shared state`);
    }
    if (!project) {
        throw new Error(`Project "${projectName}" not found in shared state`);
    }
    
    const response = await page.request.post(`${API_BASE}/projects/${project.id}/models/${model.id}`);
    
    if (!response.ok() && response.status() !== 400) {
        // 400 means already in project, which is fine
        throw new Error(`Failed to add model to project: ${response.status()}`);
    }
    
    console.log(`[API] Added model "${modelName}" (ID: ${model.id}) to project "${projectName}" (ID: ${project.id})`);
});

Given("I create a test sprite named {string} via API", async ({ page }, spriteName: string) => {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    
    // Read sprite image from assets
    const spriteFile = path.join(__dirname_local, "../assets/blue_color.png");
    const fileBuffer = fs.readFileSync(spriteFile);
    
    // Upload the sprite using /sprites/with-file endpoint
    const response = await page.request.post(`${API_BASE}/sprites/with-file`, {
        multipart: {
            file: {
                name: `${spriteName}.png`,
                mimeType: "image/png",
                buffer: fileBuffer
            },
            name: spriteName
        }
    });
    
    if (!response.ok()) {
        throw new Error(`Failed to create sprite "${spriteName}": ${response.status()}`);
    }
    
    const data = await response.json();
    const spriteId = data.spriteId || data.id;
    const fileId = data.fileId || spriteId; // Fallback to spriteId if fileId not returned
    sharedState.saveSprite(spriteName, { id: spriteId, name: spriteName, fileId, categoryId: undefined });
    console.log(`[API] Created sprite "${spriteName}" (ID: ${spriteId})`);
});

Given("I add the sprite {string} to the pack {string} via API", async ({ page }, spriteName: string, packName: string) => {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    
    const sprite = sharedState.getSprite(spriteName);
    const pack = sharedState.getPack(packName);
    
    if (!sprite) {
        throw new Error(`Sprite "${spriteName}" not found in shared state`);
    }
    if (!pack) {
        throw new Error(`Pack "${packName}" not found in shared state`);
    }
    
    const response = await page.request.post(`${API_BASE}/packs/${pack.id}/sprites/${sprite.id}`);
    
    if (!response.ok() && response.status() !== 400) {
        throw new Error(`Failed to add sprite to pack: ${response.status()}`);
    }
    
    console.log(`[API] Added sprite "${spriteName}" (ID: ${sprite.id}) to pack "${packName}" (ID: ${pack.id})`);
});

Given("I add the sprite {string} to the project {string} via API", async ({ page }, spriteName: string, projectName: string) => {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    
    const sprite = sharedState.getSprite(spriteName);
    const project = sharedState.getProject(projectName);
    
    if (!sprite) {
        throw new Error(`Sprite "${spriteName}" not found in shared state`);
    }
    if (!project) {
        throw new Error(`Project "${projectName}" not found in shared state`);
    }
    
    const response = await page.request.post(`${API_BASE}/projects/${project.id}/sprites/${sprite.id}`);
    
    if (!response.ok() && response.status() !== 400) {
        throw new Error(`Failed to add sprite to project: ${response.status()}`);
    }
    
    console.log(`[API] Added sprite "${spriteName}" (ID: ${sprite.id}) to project "${projectName}" (ID: ${project.id})`);
});

Given("I create a test sprite category named {string} via API", async ({ page }, categoryName: string) => {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    
    const response = await page.request.post(`${API_BASE}/sprite-categories`, {
        data: { name: categoryName, description: `Test category for E2E testing` }
    });
    
    if (!response.ok()) {
        throw new Error(`Failed to create sprite category "${categoryName}": ${response.status()}`);
    }
    
    const data = await response.json();
    sharedState.saveSpriteCategory(categoryName, { id: data.id, name: categoryName, description: data.description });
    console.log(`[API] Created sprite category "${categoryName}" (ID: ${data.id})`);
});

Given("I assign the sprite {string} to category {string} via API", async ({ page }, spriteName: string, categoryName: string) => {
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    
    const sprite = sharedState.getSprite(spriteName);
    const category = sharedState.getSpriteCategory(categoryName);
    
    if (!sprite) {
        throw new Error(`Sprite "${spriteName}" not found in shared state`);
    }
    if (!category) {
        throw new Error(`Category "${categoryName}" not found in shared state`);
    }
    
    const response = await page.request.put(`${API_BASE}/sprites/${sprite.id}`, {
        data: { name: sprite.name, categoryId: category.id }
    });
    
    if (!response.ok()) {
        throw new Error(`Failed to assign sprite to category: ${response.status()}`);
    }
    
    console.log(`[API] Assigned sprite "${spriteName}" (ID: ${sprite.id}) to category "${categoryName}" (ID: ${category.id})`);
});
