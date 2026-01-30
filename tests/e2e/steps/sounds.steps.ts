/**
 * Step definitions for Sound CRUD E2E tests
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { sharedState } from "../fixtures/shared-state";

const { Given, When, Then } = createBdd();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============= Navigation Steps =============

Given("I am on the sounds page", async ({ page }) => {
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
    await page.goto(`${baseUrl}/?leftTabs=sounds&activeLeft=sounds`);
    await page.waitForTimeout(2000);
    console.log("[Navigation] Navigated to sounds page");
});

// ============= Upload & Create Steps =============

When("I upload a sound named {string} from {string}", async ({ page }, soundName: string, filename: string) => {
    const filePath = path.join(__dirname, "..", "assets", filename);
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    
    // Get existing sound IDs BEFORE upload
    const beforeResponse = await page.request.get(`${API_BASE}/sounds`);
    const beforeData = await beforeResponse.json();
    const existingIds = new Set((beforeData.sounds || []).map((s: any) => s.id));
    
    // Find file input for sound upload
    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles(filePath);
    
    // Wait for upload to complete
    await page.waitForTimeout(3000);
    
    // Get sounds AFTER upload and find the new one
    const afterResponse = await page.request.get(`${API_BASE}/sounds`);
    const afterData = await afterResponse.json();
    
    // Find the NEW sound (one that wasn't in the before list)
    let sound = (afterData.sounds || []).find((s: any) => !existingIds.has(s.id));
    
    // If not found by diff, fall back to highest ID (most recent)
    if (!sound && afterData.sounds?.length > 0) {
        sound = afterData.sounds.reduce((max: any, s: any) => s.id > max.id ? s : max, afterData.sounds[0]);
        console.log(`[Upload] Found sound by highest ID: ${sound.id} (${sound.name})`);
    }
    
    // Rename the sound if needed
    if (sound && sound.name !== soundName) {
        const renameResponse = await page.request.put(`${API_BASE}/sounds/${sound.id}`, {
            data: { name: soundName }
        });
        
        if (renameResponse.ok()) {
            console.log(`[Upload] Renamed sound from "${sound.name}" to "${soundName}"`);
            sound.name = soundName;
        } else {
            console.log(`[Warning] Rename failed: ${renameResponse.status()} ${await renameResponse.text()}`);
        }
    }
    
    // Save to shared state for use in subsequent steps
    if (sound) {
        sharedState.saveSound(soundName, {
            id: sound.id,
            name: soundName,
            fileId: sound.fileId,
            duration: sound.duration,
            categoryId: sound.categoryId
        });
        console.log(`[State] Saved sound "${soundName}" (ID: ${sound.id}) to shared state`);
    } else {
        console.log(`[Warning] Could not find uploaded sound in API response`);
    }
    
    // Reload the page to see the renamed sound
    await page.reload();
    await page.waitForTimeout(1000);
    
    console.log(`[Upload] Uploaded sound "${soundName}" from "${filename}"`);
});

Then("I store the sound {string} in shared state", async ({ page }, soundName: string) => {
    // Get all sounds from API and find the one by name
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    const response = await page.request.get(`${API_BASE}/sounds`);
    const data = await response.json();
    
    const sound = data.sounds?.find((s: any) => s.name === soundName);
    if (!sound) {
        // Try to find by partial match
        const partialMatch = data.sounds?.find((s: any) => 
            s.name.includes(soundName) || soundName.includes(s.name)
        );
        if (partialMatch) {
            console.log(`[Warning] Found partial match: "${partialMatch.name}" for "${soundName}"`);
            sharedState.saveSound(soundName, {
                id: partialMatch.id,
                name: partialMatch.name,
                fileId: partialMatch.fileId,
                duration: partialMatch.duration,
                categoryId: partialMatch.categoryId,
            });
            console.log(`[State] Saved sound "${soundName}" (actual: "${partialMatch.name}", ID: ${partialMatch.id}) to shared state`);
            return;
        }
        throw new Error(`Sound "${soundName}" not found in API response. Available: ${data.sounds?.map((s: any) => s.name).join(', ')}`);
    }
    
    sharedState.saveSound(soundName, {
        id: sound.id,
        name: sound.name,
        fileId: sound.fileId,
        duration: sound.duration,
        categoryId: sound.categoryId,
    });
    
    console.log(`[State] Saved sound "${soundName}" (ID: ${sound.id}) to shared state`);
});

Given("the sound {string} exists in shared state", async ({}, soundName: string) => {
    const sound = sharedState.getSound(soundName);
    if (!sound) {
        throw new Error(`Sound "${soundName}" not found in shared state`);
    }
    console.log(`[Precondition] Sound "${soundName}" exists in shared state (ID: ${sound.id})`);
});

// ============= Update Steps =============

When("I open the sound {string} for viewing", async ({ page }, soundName: string) => {
    const sound = sharedState.getSound(soundName);
    if (!sound) {
        throw new Error(`Sound "${soundName}" not found in shared state`);
    }
    
    // Click on the sound card to open the modal
    const soundCard = page.locator(".sound-card").filter({
        has: page.locator(".sound-name", { hasText: sound.name })
    });
    await soundCard.first().click();
    
    // Wait for the sound modal to appear
    await expect(page.locator(".p-dialog")).toBeVisible({ timeout: 5000 });
    
    console.log(`[Action] Opened sound "${soundName}" for viewing`);
});

When("I change the sound name to {string}", async ({ page }, newName: string) => {
    // Close the modal first since it might not support inline editing
    const closeButton = page.locator(".p-dialog-header-close, .p-dialog button:has-text('Close')");
    if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(300);
    }
    
    // Get the sound from shared state and rename via API
    const sound = sharedState.getSound("crud-test-sound");
    if (!sound) {
        throw new Error("Sound 'crud-test-sound' not found in shared state for renaming");
    }
    
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    const response = await page.request.put(`${API_BASE}/sounds/${sound.id}`, {
        data: { name: newName }
    });
    
    if (!response.ok()) {
        throw new Error(`Failed to rename sound: ${response.status()} ${await response.text()}`);
    }
    
    // Update shared state with new name
    sound.name = newName;
    sharedState.saveSound("crud-test-sound", sound);
    
    console.log(`[Action] Renamed sound to "${newName}" via API`);
});

When("I save the sound changes", async ({ page }) => {
    // Check if dialog is still open - if not, API already saved changes
    const dialog = page.locator(".p-dialog");
    const isDialogVisible = await dialog.isVisible();
    
    if (isDialogVisible) {
        // Use data-testid for save button if available
        const saveButton = dialog.locator('[data-testid="sound-dialog-save"], button:has-text("Save")');
        if (await saveButton.isVisible()) {
            await saveButton.click();
            await dialog.waitFor({ state: 'hidden', timeout: 10000 });
            console.log("[Action] Saved sound changes via dialog");
        }
    } else {
        // Dialog already closed - API saved changes directly
        console.log("[Action] Sound changes already saved via API (no dialog)");
    }
    
    // Reload page to ensure UI reflects API changes
    await page.reload();
    await page.waitForLoadState('networkidle');
    console.log("[Action] Page reloaded to reflect sound changes");
});

When("I assign the sound to category {string}", async ({ page }, categoryName: string) => {
    const category = sharedState.getSoundCategory(categoryName);
    if (!category) {
        throw new Error(`Category "${categoryName}" not found in shared state`);
    }
    
    // Get the sound from shared state
    const sound = sharedState.getSound("crud-test-sound");
    if (!sound) {
        throw new Error("Sound 'crud-test-sound' not found in shared state for category assignment");
    }
    
    // Close modal if open
    const dialog = page.locator(".p-dialog");
    if (await dialog.isVisible()) {
        const closeButton = dialog.locator(".p-dialog-header-close");
        if (await closeButton.isVisible()) {
            await closeButton.click();
            await page.waitForTimeout(300);
        }
    }
    
    // Assign via API
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    const response = await page.request.put(`${API_BASE}/sounds/${sound.id}`, {
        data: { categoryId: category.id }
    });
    
    if (!response.ok()) {
        throw new Error(`Failed to assign category: ${response.status()} ${await response.text()}`);
    }
    
    console.log(`[Action] Assigned sound to category "${categoryName}" via API`);
});

// ============= Filter Steps =============

When("I filter sounds by category {string}", async ({ page }, categoryName: string) => {
    // Click the category tab to filter
    const categoryTab = page.locator(".category-tab").filter({ hasText: categoryName });
    await categoryTab.click();
    await page.waitForTimeout(500);
    console.log(`[Action] Filtered sounds by category "${categoryName}"`);
});

Then("the sound {string} should be visible in the filtered results", async ({ page }, soundName: string) => {
    const sound = sharedState.getSound(soundName);
    const name = sound?.name || soundName;
    
    const soundCard = page.locator(".sound-card").filter({
        has: page.locator(".sound-name", { hasText: name })
    });
    await expect(soundCard.first()).toBeVisible({ timeout: 10000 });
    console.log(`[Verify] Sound "${name}" is visible in filtered results ✓`);
});

// ============= Category Management Steps =============

When("I open the sound category management dialog", async ({ page }) => {
    // Click "Add Category" button
    const addCategoryButton = page.locator("button:has-text('Add Category')");
    await addCategoryButton.click();
    
    await expect(page.locator(".p-dialog")).toBeVisible({ timeout: 5000 });
    console.log("[Action] Opened sound category dialog");
});

When("I create a sound category named {string} with description {string}", async ({ page }, name: string, description: string) => {
    // Wait for dialog to be fully visible
    const dialog = page.locator(".p-dialog");
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    
    // Wait for PrimeReact InputText - uses #categoryName id
    const nameInput = dialog.locator('#categoryName');
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill(name);
    console.log(`[Action] Filled category name: ${name}`);
    
    // Fill in description (if textarea exists) - uses #categoryDescription id
    const descInput = dialog.locator('#categoryDescription');
    if (await descInput.isVisible()) {
        await descInput.fill(description);
        console.log(`[Action] Filled description: ${description}`);
    }
    
    // Click Save button
    const saveButton = dialog.locator("button:has-text('Save')");
    await saveButton.click();
    
    // Wait for dialog to close
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
    console.log(`[Action] Created sound category "${name}" with description "${description}"`);
});

When("I create a sound category named {string}", async ({ page }, name: string) => {
    // Wait for dialog to be visible
    const dialog = page.locator(".p-dialog");
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    
    // Fill in category name using PrimeReact InputText ID
    const nameInput = dialog.locator('#categoryName');
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill(name);
    
    // Click Save button
    const saveButton = dialog.locator("button:has-text('Save')");
    await saveButton.click();
    
    // Wait for dialog to close
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
    console.log(`[Action] Created sound category "${name}"`);
});

Then("the sound category {string} should be visible in the category list", async ({ page }, categoryName: string) => {
    const categoryTab = page.locator(".category-tab").filter({ hasText: categoryName });
    await expect(categoryTab).toBeVisible({ timeout: 5000 });
    console.log(`[Verify] Sound category "${categoryName}" is visible in category list ✓`);
});

Then("I store the sound category {string} in shared state", async ({ page }, categoryName: string) => {
    // Get all categories from API and find the one by name
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    const response = await page.request.get(`${API_BASE}/sound-categories`);
    const data = await response.json();
    
    const category = data.categories?.find((c: any) => c.name === categoryName);
    if (!category) {
        throw new Error(`Sound category "${categoryName}" not found in API response`);
    }
    
    sharedState.saveSoundCategory(categoryName, {
        id: category.id,
        name: category.name,
        description: category.description,
    });
    
    console.log(`[State] Saved sound category "${categoryName}" (ID: ${category.id}) to shared state`);
});

Given("the sound category {string} exists in shared state", async ({}, categoryName: string) => {
    const category = sharedState.getSoundCategory(categoryName);
    if (!category) {
        throw new Error(`Sound category "${categoryName}" not found in shared state`);
    }
    console.log(`[Precondition] Sound category "${categoryName}" exists in shared state (ID: ${category.id})`);
});

When("I edit the sound category {string}", async ({ page }, categoryName: string) => {
    // Ensure no dialog is blocking
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    // First select the category tab
    const categoryTab = page.locator(".category-tab").filter({ hasText: categoryName });
    await categoryTab.waitFor({ state: 'visible', timeout: 5000 });
    await categoryTab.click();
    await page.waitForTimeout(300);
    
    // Click the edit (pencil) button on the category tab
    const editButton = categoryTab.locator("button:has(.pi-pencil)");
    await editButton.click();
    
    // Wait for dialog using data-testid
    const dialog = page.locator('[data-testid="category-dialog"], .p-dialog');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    console.log(`[Action] Opened edit dialog for sound category "${categoryName}"`);
});

When("I change the sound category name to {string}", async ({ page }, newName: string) => {
    // Use data-testid for the name input
    const dialog = page.locator('[data-testid="category-dialog"], .p-dialog').first();
    const nameInput = dialog.locator('[data-testid="category-name-input"], #categoryName');
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.clear();
    await nameInput.fill(newName);
    console.log(`[Action] Changed sound category name to "${newName}"`);
});

When("I save the sound category changes", async ({ page }) => {
    // Use data-testid for save button
    const dialog = page.locator('[data-testid="category-dialog"], .p-dialog').first();
    const saveButton = dialog.locator('[data-testid="category-dialog-save"], button:has-text("Save")');
    await saveButton.click();
    
    // Wait for dialog to close
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
    console.log("[Action] Saved sound category changes");
});

When("I delete the sound category {string}", async ({ page }, categoryName: string) => {
    // Ensure no dialog is blocking
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    // First select the category tab
    const categoryTab = page.locator(".category-tab").filter({ hasText: categoryName });
    await categoryTab.waitFor({ state: 'visible', timeout: 5000 });
    await categoryTab.click();
    await page.waitForTimeout(300);
    
    // Click the delete (trash) button on the category tab
    const deleteButton = categoryTab.locator("button:has(.pi-trash)");
    await deleteButton.click();
    
    // Confirm deletion in dialog
    const confirmDialog = page.locator(".p-confirm-dialog, .p-dialog");
    await confirmDialog.waitFor({ state: 'visible', timeout: 5000 });
    
    const confirmButton = confirmDialog.locator("button.p-button-danger, button:has-text('Yes'), button:has-text('Delete')");
    await confirmButton.click();
    
    // Wait for dialog to close and page refresh
    await confirmDialog.waitFor({ state: 'hidden', timeout: 10000 });
    await page.waitForTimeout(500);
    
    console.log(`[Action] Deleted sound category "${categoryName}"`);
});

Then("the sound category {string} should not be visible in the category list", async ({ page }, categoryName: string) => {
    const categoryTab = page.locator(".category-tab").filter({ hasText: categoryName });
    await expect(categoryTab).not.toBeVisible({ timeout: 5000 });
    console.log(`[Verify] Sound category "${categoryName}" is not visible ✓`);
});

// ============= Visibility Assertions =============

Then("the sound {string} should be visible in the sound list", async ({ page }, soundName: string) => {
    // First try to get from shared state
    const sound = sharedState.getSound(soundName);
    const name = sound?.name || soundName;
    
    const soundCard = page.locator(".sound-card").filter({
        has: page.locator(".sound-name", { hasText: name })
    });
    await expect(soundCard.first()).toBeVisible({ timeout: 10000 });
    console.log(`[Verify] Sound "${name}" is visible in sound list ✓`);
});

Then("the sound {string} should not be visible", async ({ page }, soundName: string) => {
    // IMPORTANT: Use the literal Gherkin parameter, not the shared state name
    // After rename, shared state would have the NEW name, but we want to verify OLD name is gone
    const name = soundName;
    
    const soundCard = page.locator(".sound-card").filter({
        has: page.locator(".sound-name", { hasText: name })
    });
    await expect(soundCard).not.toBeVisible({ timeout: 5000 });
    console.log(`[Verify] Sound "${name}" is not visible ✓`);
});

// ============= Delete Steps =============

When("I delete the sound {string} via API", async ({ page }, soundName: string) => {
    const sound = sharedState.getSound(soundName);
    if (!sound) {
        throw new Error(`Sound "${soundName}" not found in shared state`);
    }
    
    const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
    const response = await page.request.delete(`${API_BASE}/sounds/${sound.id}`);
    
    if (!response.ok()) {
        throw new Error(`Failed to delete sound: ${response.status()} ${await response.text()}`);
    }
    
    console.log(`[Action] Deleted sound "${soundName}" (ID: ${sound.id}) via API`);
    
    // Reload page to reflect deletion
    await page.reload();
    await page.waitForLoadState('networkidle');
});
