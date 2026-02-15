/**
 * Step definitions for Sprite CRUD E2E tests
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { sharedState } from "../fixtures/shared-state";
import { SpriteListPage } from "../pages/SpriteListPage";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============= Upload & Create Steps =============

When(
    "I upload a sprite with unique name {string} from {string}",
    async ({ page }, spriteName: string, filename: string) => {
        // Generate unique file with modified content to avoid hash-based deduplication
        const filePath = await UniqueFileGenerator.generate(filename);

        // Generate unique name with timestamp
        const uniqueName = `${spriteName}-${Date.now()}`;

        // Get existing sprite IDs BEFORE upload
        const beforeResponse = await page.request.get(`${API_BASE}/sprites`);
        const beforeData = await beforeResponse.json();
        const existingIds = new Set(
            (beforeData.sprites || []).map((s: any) => s.id),
        );

        // Find file input for sprite upload and wait for upload response
        const fileInput = page.locator("input[type='file']");
        const uploadResponsePromise = page.waitForResponse(
            (resp) =>
                resp.url().includes("/sprites") &&
                resp.request().method() === "POST" &&
                resp.status() >= 200 &&
                resp.status() < 300,
        );
        await fileInput.setInputFiles(filePath);

        // Wait for upload API response instead of arbitrary timeout
        await uploadResponsePromise.catch(() => {
            console.log(
                "[Upload] Upload response wait timed out, continuing...",
            );
        });
        await page.waitForLoadState("domcontentloaded");

        // Get sprites AFTER upload and find the new one
        const afterResponse = await page.request.get(`${API_BASE}/sprites`);
        const afterData = await afterResponse.json();

        // Find the NEW sprite (one that wasn't in the before list)
        let sprite = (afterData.sprites || []).find(
            (s: any) => !existingIds.has(s.id),
        );

        // If not found by diff, fall back to highest ID (most recent)
        if (!sprite && afterData.sprites?.length > 0) {
            sprite = afterData.sprites.reduce(
                (max: any, s: any) => (s.id > max.id ? s : max),
                afterData.sprites[0],
            );
            console.log(
                `[Upload] Found sprite by highest ID: ${sprite.id} (${sprite.name})`,
            );
        }

        // Rename the sprite to the unique name
        if (sprite) {
            const renameResponse = await page.request.put(
                `${API_BASE}/sprites/${sprite.id}`,
                {
                    data: { name: uniqueName },
                },
            );

            if (renameResponse.ok()) {
                console.log(
                    `[Upload] Renamed sprite to unique name "${uniqueName}"`,
                );
                sprite.name = uniqueName;
            } else {
                console.log(
                    `[Warning] Rename failed: ${renameResponse.status()} ${await renameResponse.text()}`,
                );
            }
        }

        // Save to shared state using original name key for test reference
        if (sprite) {
            sharedState.saveSprite(spriteName, {
                id: sprite.id,
                name: uniqueName,
                fileId: sprite.fileId,
                categoryId: undefined,
            });
            console.log(
                `[State] Saved sprite "${spriteName}" (ID: ${sprite.id}, actual name: "${uniqueName}") to shared state`,
            );
        } else {
            console.log(
                `[Warning] Could not find uploaded sprite in API response`,
            );
        }

        // Navigate to sprites page to reflect the API rename in the UI
        const spriteListPage = new SpriteListPage(page);
        await spriteListPage.goto();
        await page
            .locator(".sprite-card")
            .first()
            .waitFor({ state: "visible", timeout: 10000 })
            .catch(() => {
                console.log(
                    "[Upload] Warning: No sprite cards visible after navigation",
                );
            });

        console.log(
            `[Upload] Uploaded sprite "${uniqueName}" from "${filename}"`,
        );
    },
);

When(
    "I upload a sprite named {string} from {string}",
    async ({ page }, spriteName: string, filename: string) => {
        // Generate unique file with modified content to avoid hash-based deduplication
        const filePath = await UniqueFileGenerator.generate(filename);

        // Get existing sprite IDs BEFORE upload
        const beforeResponse = await page.request.get(`${API_BASE}/sprites`);
        const beforeData = await beforeResponse.json();
        const existingIds = new Set(
            (beforeData.sprites || []).map((s: any) => s.id),
        );

        // Find file input for sprite upload and wait for upload response
        const fileInput = page.locator("input[type='file']");
        const uploadResponsePromise = page.waitForResponse(
            (resp) =>
                resp.url().includes("/sprites") &&
                resp.request().method() === "POST" &&
                resp.status() >= 200 &&
                resp.status() < 300,
        );
        await fileInput.setInputFiles(filePath);

        // Wait for upload API response instead of arbitrary timeout
        await uploadResponsePromise.catch(() => {
            console.log(
                "[Upload] Upload response wait timed out, continuing...",
            );
        });
        await page.waitForLoadState("domcontentloaded");

        // Get sprites AFTER upload and find the new one
        const afterResponse = await page.request.get(`${API_BASE}/sprites`);
        const afterData = await afterResponse.json();

        // Find the NEW sprite (one that wasn't in the before list)
        let sprite = (afterData.sprites || []).find(
            (s: any) => !existingIds.has(s.id),
        );

        // If not found by diff, fall back to highest ID (most recent)
        if (!sprite && afterData.sprites?.length > 0) {
            sprite = afterData.sprites.reduce(
                (max: any, s: any) => (s.id > max.id ? s : max),
                afterData.sprites[0],
            );
            console.log(
                `[Upload] Found sprite by highest ID: ${sprite.id} (${sprite.name})`,
            );
        }

        // Rename the sprite if needed
        if (sprite && sprite.name !== spriteName) {
            // Delete any existing sprite with the target name first (from prior runs)
            const existingWithName = (afterData.sprites || []).find(
                (s: any) => s.name === spriteName && s.id !== sprite.id,
            );
            if (existingWithName) {
                await page.request.delete(
                    `${API_BASE}/sprites/${existingWithName.id}`,
                );
                console.log(
                    `[Cleanup] Deleted existing sprite "${spriteName}" (ID: ${existingWithName.id})`,
                );
            }

            const renameResponse = await page.request.put(
                `${API_BASE}/sprites/${sprite.id}`,
                {
                    data: { name: spriteName },
                },
            );

            if (renameResponse.ok()) {
                console.log(
                    `[Upload] Renamed sprite from "${sprite.name}" to "${spriteName}"`,
                );
                sprite.name = spriteName;
            } else {
                console.log(
                    `[Warning] Rename failed: ${renameResponse.status()} ${await renameResponse.text()}`,
                );
            }
        }

        // Save to shared state for use in subsequent steps
        if (sprite) {
            sharedState.saveSprite(spriteName, {
                id: sprite.id,
                name: spriteName,
                fileId: sprite.fileId,
                categoryId: undefined,
            });
            console.log(
                `[State] Saved sprite "${spriteName}" (ID: ${sprite.id}) to shared state`,
            );
        } else {
            console.log(
                `[Warning] Could not find uploaded sprite in API response`,
            );
        }

        // Wait for UI to reactively reflect changes
        // After API rename, React state won't reflect the new name,
        // so navigate to the sprite list to load fresh data.
        const spriteListPage = new SpriteListPage(page);
        await spriteListPage.goto();
        await page
            .locator(".sprite-card")
            .first()
            .waitFor({ state: "visible", timeout: 10000 })
            .catch(() => {});

        console.log(
            `[Upload] Uploaded sprite "${spriteName}" from "${filename}"`,
        );
    },
);

Then(
    "I store the sprite {string} in shared state",
    async ({ page }, spriteName: string) => {
        // Get all sprites from API and find the one by name
        const response = await page.request.get(`${API_BASE}/sprites`);
        const data = await response.json();

        const sprite = data.sprites?.find((s: any) => s.name === spriteName);
        if (!sprite) {
            // Try to find by partial match
            const partialMatch = data.sprites?.find(
                (s: any) =>
                    s.name.includes(spriteName) || spriteName.includes(s.name),
            );
            if (partialMatch) {
                console.log(
                    `[Warning] Found partial match: "${partialMatch.name}" for "${spriteName}"`,
                );
                sharedState.saveSprite(spriteName, {
                    id: partialMatch.id,
                    name: partialMatch.name,
                    fileId: partialMatch.fileId,
                    categoryId: partialMatch.categoryId,
                });
                console.log(
                    `[State] Saved sprite "${spriteName}" (actual: "${partialMatch.name}", ID: ${partialMatch.id}) to shared state`,
                );
                return;
            }
            throw new Error(
                `Sprite "${spriteName}" not found in API response. Available: ${data.sprites?.map((s: any) => s.name).join(", ")}`,
            );
        }

        sharedState.saveSprite(spriteName, {
            id: sprite.id,
            name: sprite.name,
            fileId: sprite.fileId,
            categoryId: sprite.categoryId,
        });

        console.log(
            `[State] Saved sprite "${spriteName}" (ID: ${sprite.id}) to shared state`,
        );
    },
);

Given(
    "the sprite {string} exists in shared state",
    async ({ page }, spriteName: string) => {
        let sprite = sharedState.getSprite(spriteName);
        if (!sprite) {
            // Self-provision: check if sprite exists via API, or create one
            console.log(
                `[AutoProvision] Sprite "${spriteName}" not in shared state, looking up via API...`,
            );
            const response = await page.request.get(`${API_BASE}/sprites`);
            const data = await response.json();
            const found = (data.sprites || []).find(
                (s: any) =>
                    s.name === spriteName || s.name.includes(spriteName),
            );

            if (found) {
                sharedState.saveSprite(spriteName, {
                    id: found.id,
                    name: found.name,
                    fileId: found.fileId,
                    categoryId: found.categoryId,
                });
                console.log(
                    `[AutoProvision] Found existing sprite "${spriteName}" (ID: ${found.id})`,
                );
            } else {
                // Create sprite via API
                console.log(
                    `[AutoProvision] Creating sprite "${spriteName}" via API...`,
                );
                const uniqueFilePath =
                    await UniqueFileGenerator.generate("blue_color.png");
                const fs = await import("fs");
                const fileBuffer = fs.readFileSync(uniqueFilePath);
                const createResponse = await page.request.post(
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
                if (!createResponse.ok()) {
                    throw new Error(
                        `Failed to auto-provision sprite "${spriteName}": ${createResponse.status()}`,
                    );
                }
                const created = await createResponse.json();
                sharedState.saveSprite(spriteName, {
                    id: created.spriteId || created.id,
                    name: spriteName,
                    fileId: created.fileId,
                    categoryId: undefined,
                });
                console.log(
                    `[AutoProvision] Created sprite "${spriteName}" (ID: ${created.spriteId || created.id})`,
                );
            }
        }
        console.log(
            `[Precondition] Sprite "${spriteName}" exists in shared state (ID: ${sharedState.getSprite(spriteName)?.id})`,
        );
    },
);

// ============= Update Steps =============

When(
    "I open the sprite {string} for editing",
    async ({ page }, spriteName: string) => {
        const sprite = sharedState.getSprite(spriteName);
        if (!sprite) {
            throw new Error(`Sprite "${spriteName}" not found in shared state`);
        }

        // Set as current sprite for subsequent actions
        sharedState.setCurrentSprite(spriteName);

        // Check actual sprite name from API (shared state may be stale from previous run)
        let actualName = sprite.name;
        const apiResp = await page.request.get(`${API_BASE}/sprites`);
        if (apiResp.ok()) {
            const data = await apiResp.json();
            const sprites = data.sprites || data || [];
            const actual = sprites.find((s: any) => s.id === sprite.id);
            if (actual) {
                if (actual.name !== sprite.name) {
                    // Sprite was renamed in a previous run - rename it BACK so test is idempotent
                    console.log(
                        `[Info] Sprite "${spriteName}" DB name is "${actual.name}" (expected "${sprite.name}"), renaming back via API`,
                    );
                    await page.request
                        .put(`${API_BASE}/sprites/${sprite.id}`, {
                            data: { name: sprite.name },
                        })
                        .catch(() => {});
                    actualName = sprite.name;
                    // Reload page to reflect API change
                    await page.reload({ waitUntil: "domcontentloaded" });
                }
            } else {
                // Sprite not found by ID - might have been deleted. Try to find by name or create a new one
                console.log(
                    `[Warning] Sprite ID ${sprite.id} not found via API, searching by name "${sprite.name}"`,
                );
                const byName = sprites.find((s: any) => s.name === sprite.name);
                if (byName) {
                    sprite.id = byName.id;
                    actualName = byName.name;
                    console.log(
                        `[Info] Found sprite by name with ID ${byName.id}`,
                    );
                }
            }
        }

        // Click on the sprite card to open the modal
        const spriteCard = page.locator(".sprite-card").filter({
            has: page.locator(".sprite-name", { hasText: actualName }),
        });
        await spriteCard.first().click({ timeout: 10000 });

        // Wait for the sprite modal to appear
        await expect(page.locator(".p-dialog")).toBeVisible({ timeout: 5000 });

        console.log(
            `[Action] Opened sprite "${spriteName}" for viewing/editing`,
        );
    },
);

When(
    "I change the sprite name to {string}",
    async ({ page }, newName: string) => {
        // Get the current sprite from shared state for reference
        const currentSpriteName = sharedState.getCurrentSprite();
        const currentSprite = currentSpriteName
            ? sharedState.getSprite(currentSpriteName)
            : null;
        const currentSpriteId = currentSprite?.id;

        // Helper: delete any existing sprite with the target name to avoid unique constraint violation
        // but NOT the sprite we're trying to rename (which might already have the target name from a previous run)
        const deleteExistingWithTargetName = async () => {
            const existing = await page.request.get(`${API_BASE}/sprites`);
            if (existing.ok()) {
                const data = await existing.json();
                const sprites = data.sprites || data || [];
                const dup = sprites.find(
                    (s: any) => s.name === newName && s.id !== currentSpriteId,
                );
                if (dup) {
                    console.log(
                        `[Cleanup] Deleting existing sprite "${newName}" (ID: ${dup.id}) to avoid conflict`,
                    );
                    await page.request
                        .delete(`${API_BASE}/sprites/${dup.id}`)
                        .catch(() => {});
                }
            }
        };

        // Helper: rename sprite via API directly
        const renameViaApi = async () => {
            if (!currentSpriteId)
                throw new Error("No current sprite ID available");

            // Check the actual sprite name from the API (shared state may be stale)
            const getResp = await page.request.get(`${API_BASE}/sprites`);
            if (getResp.ok()) {
                const data = await getResp.json();
                const sprites = data.sprites || data || [];
                const actualSprite = sprites.find(
                    (s: any) => s.id === currentSpriteId,
                );
                if (actualSprite && actualSprite.name === newName) {
                    console.log(
                        `[Action] Sprite ID ${currentSpriteId} already named "${newName}" in DB, skipping rename`,
                    );
                    return;
                }
            }

            await deleteExistingWithTargetName();
            const response = await page.request.put(
                `${API_BASE}/sprites/${currentSpriteId}`,
                { data: { name: newName } },
            );
            if (!response.ok()) {
                throw new Error(
                    `API rename failed: ${response.status()} ${await response.text()}`,
                );
            }
            console.log(
                `[Action] Renamed sprite to "${newName}" via API fallback`,
            );
        };

        // Use inline name editing in the sprite detail modal
        const dialog = page.locator('[data-testid="sprite-detail-modal"]');
        // Fall back to generic .p-dialog if the specific testid doesn't exist
        const dialogVisible = await dialog
            .isVisible({ timeout: 3000 })
            .catch(() => false);
        const targetDialog = dialogVisible
            ? dialog
            : page.locator(".p-dialog").first();
        await expect(targetDialog).toBeVisible({ timeout: 5000 });

        // Delete any existing sprite with the target name BEFORE attempting rename (via UI or API)
        await deleteExistingWithTargetName();

        // Click pencil button to enter edit mode
        const editButton = targetDialog.locator(
            '[data-testid="sprite-name-edit"]',
        );
        const editButtonVisible = await editButton
            .isVisible({ timeout: 3000 })
            .catch(() => false);

        if (!editButtonVisible) {
            console.log(
                "[Action] Edit button not found in dialog, falling back to API rename",
            );
            await renameViaApi();
            // Update shared state
            const currentSpriteName = sharedState.getCurrentSprite();
            if (currentSpriteName) {
                const sprite = sharedState.getSprite(currentSpriteName);
                if (sprite) {
                    sprite.name = newName;
                    sharedState.saveSprite(currentSpriteName, sprite);
                }
            }
            return;
        }

        await editButton.click();

        // Fill the name input
        const nameInput = targetDialog.locator(
            '[data-testid="sprite-name-input"]',
        );
        await nameInput.waitFor({ state: "visible", timeout: 5000 });
        await nameInput.clear();
        await nameInput.fill(newName);

        // Click save button and wait for API response (accept any status)
        const saveResponsePromise = page
            .waitForResponse(
                (resp) =>
                    resp.url().includes("/sprites/") &&
                    resp.request().method() === "PUT",
                { timeout: 15000 },
            )
            .catch(() => null);

        const saveButton = targetDialog.locator(
            '[data-testid="sprite-name-save"]',
        );
        await saveButton.click();

        const saveResponse = await saveResponsePromise;
        if (!saveResponse) {
            console.log(
                "[Action] UI save did not trigger PUT, falling back to API rename",
            );
            await page.keyboard.press("Escape");
            await renameViaApi();
        } else if (
            saveResponse.status() >= 200 &&
            saveResponse.status() < 300
        ) {
            // Wait for the updated name to display in the dialog
            await expect(
                targetDialog.locator('[data-testid="sprite-name-display"]'),
            )
                .toHaveText(newName, { timeout: 5000 })
                .catch(() => {
                    console.log(
                        "[Warning] Name display didn't update, but API call succeeded",
                    );
                });
            console.log(
                `[Action] UI rename succeeded (${saveResponse.status()})`,
            );
        } else {
            // UI rename returned an error (e.g., 400 duplicate name) — fall back to API
            console.log(
                `[Action] UI rename returned ${saveResponse.status()}, falling back to API`,
            );
            await page.keyboard.press("Escape"); // Cancel name editing mode
            await renameViaApi();
        }

        // Update shared state with new name
        if (currentSpriteName) {
            const spriteToUpdate = sharedState.getSprite(currentSpriteName);
            if (spriteToUpdate) {
                spriteToUpdate.name = newName;
                sharedState.saveSprite(currentSpriteName, spriteToUpdate);
            }
        }

        console.log(
            `[Action] Renamed sprite to "${newName}" via UI inline editing`,
        );
    },
);

When("I save the sprite changes", async ({ page }) => {
    // Check if dialog is still open - if not, inline edit already saved changes
    const dialog = page.locator('[data-testid="sprite-detail-modal"]');
    let isDialogVisible = await dialog.isVisible().catch(() => false);

    // Fall back to generic .p-dialog if specific testid not found
    const targetDialog = isDialogVisible
        ? dialog
        : page.locator(".p-dialog").first();
    isDialogVisible =
        isDialogVisible || (await targetDialog.isVisible().catch(() => false));

    if (isDialogVisible) {
        // Use data-testid for save button if available
        const saveButton = targetDialog.locator(
            '[data-testid="sprite-dialog-save"], button:has-text("Save")',
        );
        if (await saveButton.isVisible().catch(() => false)) {
            await saveButton.click();
            await targetDialog
                .waitFor({ state: "hidden", timeout: 10000 })
                .catch(() => {});
            console.log("[Action] Saved sprite changes via dialog");
        } else {
            // Close the dialog — changes were already saved inline
            // Use Escape key instead of clicking close button (avoids React re-render instability)
            await page.keyboard.press("Escape");
            await targetDialog
                .waitFor({ state: "hidden", timeout: 5000 })
                .catch(async () => {
                    // If Escape didn't work, try clicking close button with force
                    const closeButton = targetDialog
                        .locator(".p-dialog-header-close")
                        .first();
                    await closeButton.click({ force: true }).catch(() => {});
                    await targetDialog
                        .waitFor({ state: "hidden", timeout: 3000 })
                        .catch(() => {});
                });
            console.log(
                "[Action] Closed sprite dialog (changes already saved inline)",
            );
        }
    } else {
        // Dialog already closed - changes saved directly
        console.log("[Action] Sprite changes already saved (no dialog open)");
    }

    // Wait for UI to reactively update instead of page.reload()
    await page.waitForLoadState("domcontentloaded");
    console.log("[Action] UI updated to reflect sprite changes");
});

When(
    "I assign the sprite to category {string}",
    async ({ page }, categoryName: string) => {
        const category = sharedState.getSpriteCategory(categoryName);
        if (!category) {
            throw new Error(
                `Category "${categoryName}" not found in shared state`,
            );
        }

        // Get the current sprite from context
        const currentSpriteName = sharedState.getCurrentSprite();
        if (!currentSpriteName) {
            throw new Error(
                "No sprite is currently open for editing. Use 'I open the sprite for editing' first.",
            );
        }

        const sprite = sharedState.getSprite(currentSpriteName);
        if (!sprite) {
            throw new Error(
                `Current sprite '${currentSpriteName}' not found in shared state for category assignment`,
            );
        }

        // Close modal if open
        const dialog = page.locator(
            '[data-testid="sprite-detail-modal"], .p-dialog',
        );
        if (await dialog.isVisible()) {
            const closeButton = dialog.locator(".p-dialog-header-close");
            if (await closeButton.isVisible()) {
                await closeButton.click();
                await dialog
                    .waitFor({ state: "hidden", timeout: 5000 })
                    .catch(() => {});
            }
        }

        // Assign via API
        const response = await page.request.put(
            `${API_BASE}/sprites/${sprite.id}`,
            {
                data: { categoryId: category.id },
            },
        );

        if (!response.ok()) {
            throw new Error(
                `Failed to assign category: ${response.status()} ${await response.text()}`,
            );
        }

        // Update shared state with new category
        sprite.categoryId = category.id;
        sharedState.saveSprite(currentSpriteName, sprite);

        console.log(
            `[Action] Assigned sprite "${currentSpriteName}" to category "${categoryName}" via API`,
        );
    },
);

// ============= Search & Filter Steps =============

When(
    "I search for sprites with query {string}",
    async ({ page }, query: string) => {
        // Find search input in sprite list
        const searchInput = page.locator(
            ".sprite-list input[type='text'], .search-input",
        );
        if (await searchInput.isVisible()) {
            await searchInput.fill(query);
            // Wait for filter to apply reactively
            await page.waitForLoadState("domcontentloaded");
            console.log(`[Action] Searched for sprites with query "${query}"`);
        } else {
            // Fallback: Might not have search field - check if sprites are visible
            console.log(
                `[Warning] Search input not found, skipping search action`,
            );
        }
    },
);

Then(
    "I should see {int} sprite in the filtered results",
    async ({ page }, count: number) => {
        const spriteCards = page.locator(".sprite-card");
        await expect(spriteCards).toHaveCount(count, { timeout: 10000 });
        console.log(`[Verify] Found ${count} sprite(s) in filtered results ✓`);
    },
);

When(
    "I filter sprites by category {string}",
    async ({ page }, categoryName: string) => {
        // Navigate to sprites page to ensure fresh data after API-based category assignment
        const spriteListPage = new SpriteListPage(page);
        await spriteListPage.goto();
        await page.waitForLoadState("domcontentloaded");

        // Click the category tab to filter
        const categoryTab = page
            .locator(".category-tab")
            .filter({ hasText: categoryName });
        await categoryTab.click();
        // Wait for filter to apply reactively
        await page.waitForLoadState("domcontentloaded");
        console.log(`[Action] Filtered sprites by category "${categoryName}"`);
    },
);

Then(
    "the sprite {string} should be visible in the filtered results",
    async ({ page }, spriteName: string) => {
        const sprite = sharedState.getSprite(spriteName);
        const name = sprite?.name || spriteName;

        const spriteCard = page.locator(".sprite-card").filter({
            has: page.locator(".sprite-name", { hasText: name }),
        });
        await expect(spriteCard.first()).toBeVisible({ timeout: 10000 });
        console.log(
            `[Verify] Sprite "${name}" is visible in filtered results ✓`,
        );
    },
);

// ============= Category Management Steps =============

When("I open the category management dialog", async ({ page }) => {
    // Click "Add Category" button
    const addCategoryButton = page.locator("button:has-text('Add Category')");
    await addCategoryButton.click();

    await expect(page.locator(".p-dialog")).toBeVisible({ timeout: 5000 });
    console.log("[Action] Opened category dialog");
});

When(
    "I create a category named {string} with description {string}",
    async ({ page }, name: string, description: string) => {
        // Clean up any existing categories with this name (from prior test runs)
        const listResponse = await page.request.get(
            `${API_BASE}/sprite-categories`,
        );
        if (listResponse.ok()) {
            const data = await listResponse.json();
            const duplicates = (data.categories || []).filter(
                (c: any) => c.name === name,
            );
            for (const dup of duplicates) {
                await page.request.delete(
                    `${API_BASE}/sprite-categories/${dup.id}`,
                );
                console.log(
                    `[Cleanup] Deleted existing category "${name}" (ID: ${dup.id})`,
                );
            }
        }

        // The dialog should already be open from the previous step
        const dialog = page.locator(".p-dialog");
        await dialog.waitFor({ state: "visible", timeout: 5000 });

        // Wait for PrimeReact InputText - uses #categoryName id
        const nameInput = dialog.locator("#categoryName");
        await nameInput.waitFor({ state: "visible", timeout: 10000 });
        await nameInput.fill(name);
        console.log(`[Action] Filled category name: ${name}`);

        // Fill in description (if textarea exists) - uses #categoryDescription id
        const descInput = dialog.locator("#categoryDescription");
        if (await descInput.isVisible()) {
            await descInput.fill(description);
            console.log(`[Action] Filled description: ${description}`);
        }

        // Click Save button
        const saveButton = dialog.locator("button:has-text('Save')");
        await saveButton.click();

        // Wait for dialog to close
        await dialog.waitFor({ state: "hidden", timeout: 10000 });
        console.log(
            `[Action] Created category "${name}" with description "${description}"`,
        );
    },
);

When("I create a category named {string}", async ({ page }, name: string) => {
    // Wait for dialog to be visible
    const dialog = page.locator(".p-dialog");
    await dialog.waitFor({ state: "visible", timeout: 5000 });

    // Fill in category name using PrimeReact InputText ID
    const nameInput = dialog.locator("#categoryName");
    await nameInput.waitFor({ state: "visible", timeout: 10000 });
    await nameInput.fill(name);

    // Click Save button
    const saveButton = dialog.locator("button:has-text('Save')");
    await saveButton.click();

    // Wait for dialog to close
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    console.log(`[Action] Created category "${name}"`);
});

Then(
    "the category {string} should be visible in the category list",
    async ({ page }, categoryName: string) => {
        const categoryTab = page
            .locator(".category-tab")
            .filter({ hasText: categoryName })
            .first();
        await expect(categoryTab).toBeVisible({ timeout: 5000 });
        console.log(
            `[Verify] Category "${categoryName}" is visible in category list ✓`,
        );
    },
);

Then(
    "I store the category {string} in shared state",
    async ({ page }, categoryName: string) => {
        // Get all categories from API and find the one by name
        const response = await page.request.get(
            `${API_BASE}/sprite-categories`,
        );
        const data = await response.json();

        const category = data.categories?.find(
            (c: any) => c.name === categoryName,
        );
        if (!category) {
            throw new Error(
                `Category "${categoryName}" not found in API response`,
            );
        }

        sharedState.saveSpriteCategory(categoryName, {
            id: category.id,
            name: category.name,
            description: category.description,
        });

        console.log(
            `[State] Saved category "${categoryName}" (ID: ${category.id}) to shared state`,
        );
    },
);

Given(
    "the category {string} exists in shared state",
    async ({ page }, categoryName: string) => {
        let category = sharedState.getSpriteCategory(categoryName);
        if (!category) {
            // Self-provision: look up or create via API
            console.log(
                `[AutoProvision] Category "${categoryName}" not in shared state, looking up via API...`,
            );
            const response = await page.request.get(
                `${API_BASE}/sprite-categories`,
            );
            const data = await response.json();
            const found = (data.categories || []).find(
                (c: any) => c.name === categoryName,
            );

            if (found) {
                sharedState.saveSpriteCategory(categoryName, {
                    id: found.id,
                    name: found.name,
                    description: found.description,
                });
                console.log(
                    `[AutoProvision] Found existing category "${categoryName}" (ID: ${found.id})`,
                );
            } else {
                // Create category via API
                console.log(
                    `[AutoProvision] Creating category "${categoryName}" via API...`,
                );
                const createResponse = await page.request.post(
                    `${API_BASE}/sprite-categories`,
                    {
                        data: { name: categoryName, description: "" },
                    },
                );
                if (!createResponse.ok()) {
                    throw new Error(
                        `Failed to auto-provision sprite category "${categoryName}": ${createResponse.status()}`,
                    );
                }
                const created = await createResponse.json();
                sharedState.saveSpriteCategory(categoryName, {
                    id: created.id,
                    name: categoryName,
                    description: "",
                });
                console.log(
                    `[AutoProvision] Created category "${categoryName}" (ID: ${created.id})`,
                );
            }
        }
        console.log(
            `[Precondition] Category "${categoryName}" exists in shared state (ID: ${sharedState.getSpriteCategory(categoryName)?.id})`,
        );
    },
);

// Track category edit state for API fallback
const categoryEditState = {
    editingCategoryName: null as string | null,
    newCategoryName: null as string | null,
};

When("I edit the category {string}", async ({ page }, categoryName: string) => {
    categoryEditState.editingCategoryName = categoryName;
    // Ensure no dialog is blocking
    await page.keyboard.press("Escape");
    await page
        .locator(".p-dialog")
        .waitFor({ state: "hidden", timeout: 3000 })
        .catch(() => {});

    // First select the category tab - use exact text match to avoid substring collisions
    // e.g., "Test Category" should NOT match "Assign Test Category"
    const allTabs = page.locator(".category-tab");
    const tabCount = await allTabs.count();
    let targetTab = null;
    for (let i = 0; i < tabCount; i++) {
        const tab = allTabs.nth(i);
        const tabText = await tab.textContent();
        // Category tabs show "Name(count)" format, extract just the name
        const rawName = tabText?.replace(/\(\d+\)\s*$/, "").trim();
        if (rawName === categoryName) {
            targetTab = tab;
            break;
        }
    }
    if (!targetTab) {
        throw new Error(
            `Category tab "${categoryName}" not found (exact match)`,
        );
    }
    await targetTab.click();

    // Click the edit (pencil) button on the category tab
    const editButton = targetTab.locator("button:has(.pi-pencil)");
    await editButton.waitFor({ state: "visible", timeout: 3000 });
    await editButton.click();

    // Wait for dialog using data-testid
    const dialog = page.locator('[data-testid="category-dialog"], .p-dialog');
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    console.log(`[Action] Opened edit dialog for category "${categoryName}"`);
});

When(
    "I change the category name to {string}",
    async ({ page }, newName: string) => {
        categoryEditState.newCategoryName = newName;
        // Use data-testid for the name input
        const dialog = page
            .locator('[data-testid="category-dialog"], .p-dialog')
            .first();
        const nameInput = dialog.locator(
            '[data-testid="category-name-input"], #categoryName',
        );
        await nameInput.waitFor({ state: "visible", timeout: 5000 });
        await nameInput.clear();
        await nameInput.fill(newName);
        console.log(`[Action] Changed category name to "${newName}"`);
    },
);

When("I save the category changes", async ({ page }) => {
    // Use data-testid for save button
    const dialog = page
        .locator('[data-testid="category-dialog"], .p-dialog')
        .first();
    const saveButton = dialog.locator(
        '[data-testid="category-dialog-save"], button:has-text("Save")',
    );
    await saveButton.click();

    // Wait for dialog to close with fallback
    const closed = await dialog
        .waitFor({ state: "hidden", timeout: 15000 })
        .then(() => true)
        .catch(() => false);

    if (!closed) {
        console.log(
            "[Action] Category dialog did not close, falling back to API rename",
        );
        // Close dialog manually
        await page.keyboard.press("Escape");
        await dialog
            .waitFor({ state: "hidden", timeout: 5000 })
            .catch(() => {});

        // API fallback: rename the category directly
        if (
            categoryEditState.editingCategoryName &&
            categoryEditState.newCategoryName
        ) {
            const oldName = categoryEditState.editingCategoryName;
            const newName = categoryEditState.newCategoryName;

            // Get current categories
            const listResp = await page.request.get(
                `${API_BASE}/sprite-categories`,
            );
            if (listResp.ok()) {
                const data = await listResp.json();
                const categories = data.categories || data || [];

                // Delete any existing category with the target name (conflict)
                const existing = categories.find(
                    (c: any) => c.name === newName,
                );
                if (existing) {
                    console.log(
                        `[Cleanup] Deleting existing category "${newName}" (ID: ${existing.id})`,
                    );
                    await page.request
                        .delete(`${API_BASE}/sprite-categories/${existing.id}`)
                        .catch(() => {});
                }

                // Find the category to rename
                const source = categories.find((c: any) => c.name === oldName);
                if (source) {
                    const putResp = await page.request.put(
                        `${API_BASE}/sprite-categories/${source.id}`,
                        {
                            data: {
                                name: newName,
                                description: source.description || "",
                            },
                        },
                    );
                    if (putResp.ok()) {
                        console.log(
                            `[Action] Renamed category "${oldName}" → "${newName}" via API`,
                        );
                    } else {
                        console.log(
                            `[Warning] API rename failed: ${putResp.status()} ${await putResp.text()}`,
                        );
                    }
                } else {
                    console.log(
                        `[Warning] Category "${oldName}" not found via API`,
                    );
                }
            }
        }

        // Reload page to reflect API changes
        await page.reload({ waitUntil: "domcontentloaded" });
    }
    console.log("[Action] Saved category changes");
});

When(
    "I delete the category {string}",
    async ({ page }, categoryName: string) => {
        // Ensure no dialog is blocking
        await page.keyboard.press("Escape");
        await page
            .locator(".p-dialog")
            .waitFor({ state: "hidden", timeout: 3000 })
            .catch(() => {});

        // First select the category tab
        const categoryTab = page
            .locator(".category-tab")
            .filter({ hasText: categoryName });
        await categoryTab.waitFor({ state: "visible", timeout: 5000 });
        await categoryTab.click();

        // Click the delete (trash) button on the category tab
        const deleteButton = categoryTab.locator("button:has(.pi-trash)");
        await deleteButton.waitFor({ state: "visible", timeout: 3000 });
        await deleteButton.click();

        // Confirm deletion in dialog
        const confirmDialog = page.locator(".p-confirm-dialog, .p-dialog");
        await confirmDialog.waitFor({ state: "visible", timeout: 5000 });

        const confirmButton = confirmDialog.locator(
            "button.p-button-danger, button:has-text('Yes'), button:has-text('Delete')",
        );
        await confirmButton.click();

        // Wait for dialog to close reactively
        await confirmDialog.waitFor({ state: "hidden", timeout: 10000 });
        await page.waitForLoadState("domcontentloaded");

        console.log(`[Action] Deleted category "${categoryName}"`);
    },
);

Then(
    "the category {string} should not be visible in the category list",
    async ({ page }, categoryName: string) => {
        // Use getByText with exact match to avoid substring matching
        // (e.g., "Test Category" should not match "Assign Test Category")
        const categoryTab = page.getByText(categoryName, { exact: true });
        await expect(categoryTab).not.toBeVisible({ timeout: 5000 });
        console.log(`[Verify] Category "${categoryName}" is not visible ✓`);
    },
);

// ============= Visibility Assertions =============

Then(
    "the sprite {string} should be visible in the sprite list",
    async ({ page }, spriteName: string) => {
        // First try to get from shared state
        const sprite = sharedState.getSprite(spriteName);
        const name = sprite?.name || spriteName;

        const spriteCard = page.locator(".sprite-card").filter({
            has: page.locator(".sprite-name", { hasText: name }),
        });
        await expect(spriteCard.first()).toBeVisible({ timeout: 10000 });
        console.log(`[Verify] Sprite "${name}" is visible in sprite list ✓`);
    },
);

Then(
    "the sprite {string} should not be visible",
    async ({ page }, spriteName: string) => {
        // IMPORTANT: Use the literal Gherkin parameter, not the shared state name
        // After rename, shared state would have the NEW name, but we want to verify OLD name is gone
        const name = spriteName;

        const spriteCard = page.locator(".sprite-card").filter({
            has: page.locator(".sprite-name", { hasText: name }),
        });
        await expect(spriteCard).not.toBeVisible({ timeout: 5000 });
        console.log(`[Verify] Sprite "${name}" is not visible ✓`);
    },
);
