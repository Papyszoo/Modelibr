/**
 * Step definitions for Sound CRUD E2E tests
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { sharedState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { SoundListPage } from "../pages/SoundListPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

// Track which sound is currently being interacted with
let currentSoundName: string | null = null;

async function waitForSoundsUiReady(page: any): Promise<void> {
    await page
        .waitForSelector(
            ".sound-list, .sound-grid, .sound-list-empty, .sound-list-loading, button:has-text('Add Category'), input[type='file']",
            {
                timeout: 15000,
            },
        )
        .catch(() => {});

    const loadingShell = page.locator(".sound-list-loading");
    if (await loadingShell.isVisible().catch(() => false)) {
        await loadingShell
            .waitFor({ state: "hidden", timeout: 60000 })
            .catch(() => {});
    }

    const hasSoundShell =
        (await page
            .locator(".sound-list, .sound-grid, .sound-list-empty")
            .count()) > 0;

    if (!hasSoundShell) {
        const soundTab = page
            .locator(".draggable-tab:has(.pi-volume-up)")
            .first();
        if (await soundTab.isVisible().catch(() => false)) {
            await soundTab.click();
            await page
                .waitForSelector(
                    ".sound-list, .sound-grid, .sound-list-empty",
                    {
                        timeout: 15000,
                    },
                )
                .catch(() => {});
        }
    }
}

async function cleanupSoundByName(
    page: any,
    name: string,
    excludeId?: number,
): Promise<void> {
    const response = await page.request.get(`${API_BASE}/sounds`);
    const data = await response.json();
    const matches = (data.sounds || []).filter(
        (s: any) => s.name === name && s.id !== excludeId,
    );

    for (const sound of matches) {
        await page.request
            .delete(`${API_BASE}/sounds/${sound.id}`)
            .catch(() => {});
    }
}

async function cleanupCategoryByName(
    page: any,
    name: string,
    excludeId?: number,
): Promise<void> {
    const response = await page.request.get(`${API_BASE}/sound-categories`);
    const data = await response.json();
    const matches = (data.categories || []).filter(
        (c: any) => c.name === name && c.id !== excludeId,
    );

    for (const category of matches) {
        await page.request
            .delete(`${API_BASE}/sound-categories/${category.id}`)
            .catch(() => {});
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============= Navigation Steps =============

Given("I am on the sounds page", async ({ page }) => {
    const soundListPage = new SoundListPage(page);
    await soundListPage.goto();
    await waitForSoundsUiReady(page);
    console.log("[Navigation] Navigated to sounds page");
});

// ============= Upload & Create Steps =============

When(
    "I upload a sound named {string} from {string}",
    async ({ page }, soundName: string, filename: string) => {
        // Generate unique file with modified content to avoid hash-based deduplication
        const filePath = await UniqueFileGenerator.generate(filename);

        // Get existing sound IDs BEFORE upload
        const beforeResponse = await page.request.get(`${API_BASE}/sounds`);
        const beforeData = await beforeResponse.json();
        const existingIds = new Set(
            (beforeData.sounds || []).map((s: any) => s.id),
        );

        // Find file input for sound upload and wait for upload response
        const fileInput = page.locator("input[type='file']");
        await waitForSoundsUiReady(page);
        await expect(fileInput.first()).toBeAttached({ timeout: 10000 });
        const uploadResponsePromise = page.waitForResponse(
            (resp) =>
                resp.url().includes("/sounds") &&
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

        // Get sounds AFTER upload and find the new one
        const afterResponse = await page.request.get(`${API_BASE}/sounds`);
        const afterData = await afterResponse.json();

        // Find the NEW sound (one that wasn't in the before list)
        let sound = (afterData.sounds || []).find(
            (s: any) => !existingIds.has(s.id),
        );

        // If not found by diff, fall back to highest ID (most recent)
        if (!sound && afterData.sounds?.length > 0) {
            sound = afterData.sounds.reduce(
                (max: any, s: any) => (s.id > max.id ? s : max),
                afterData.sounds[0],
            );
            console.log(
                `[Upload] Found sound by highest ID: ${sound.id} (${sound.name})`,
            );
        }

        // Rename the sound if needed
        if (sound && sound.name !== soundName) {
            const renameResponse = await page.request.put(
                `${API_BASE}/sounds/${sound.id}`,
                {
                    data: { name: soundName },
                },
            );

            if (renameResponse.ok()) {
                console.log(
                    `[Upload] Renamed sound from "${sound.name}" to "${soundName}"`,
                );
                sound.name = soundName;
            } else {
                console.log(
                    `[Warning] Rename failed: ${renameResponse.status()} ${await renameResponse.text()}`,
                );
            }
        }

        // Save to shared state for use in subsequent steps
        if (sound) {
            sharedState.saveSound(soundName, {
                id: sound.id,
                name: soundName,
                fileId: sound.fileId,
                duration: sound.duration,
                categoryId: sound.categoryId,
            });
            console.log(
                `[State] Saved sound "${soundName}" (ID: ${sound.id}) to shared state`,
            );
        } else {
            console.log(
                `[Warning] Could not find uploaded sound in API response`,
            );
        }

        // Wait for UI to reflect changes reactively (sound card should appear)
        const soundListPage = new SoundListPage(page);
        await soundListPage
            .waitForSoundByName(soundName, 10000)
            .catch(async () => {
                // Fallback: navigate to sounds page if card not visible yet
                await soundListPage.goto();
            });

        console.log(
            `[Upload] Uploaded sound "${soundName}" from "${filename}"`,
        );
    },
);

Then(
    "I store the sound {string} in shared state",
    async ({ page }, soundName: string) => {
        // Get all sounds from API and find the one by name
        const response = await page.request.get(`${API_BASE}/sounds`);
        const data = await response.json();

        const sound = data.sounds?.find((s: any) => s.name === soundName);
        if (!sound) {
            // Try to find by partial match
            const partialMatch = data.sounds?.find(
                (s: any) =>
                    s.name.includes(soundName) || soundName.includes(s.name),
            );
            if (partialMatch) {
                console.log(
                    `[Warning] Found partial match: "${partialMatch.name}" for "${soundName}"`,
                );
                sharedState.saveSound(soundName, {
                    id: partialMatch.id,
                    name: partialMatch.name,
                    fileId: partialMatch.fileId,
                    duration: partialMatch.duration,
                    categoryId: partialMatch.categoryId,
                });
                console.log(
                    `[State] Saved sound "${soundName}" (actual: "${partialMatch.name}", ID: ${partialMatch.id}) to shared state`,
                );
                return;
            }
            throw new Error(
                `Sound "${soundName}" not found in API response. Available: ${data.sounds?.map((s: any) => s.name).join(", ")}`,
            );
        }

        sharedState.saveSound(soundName, {
            id: sound.id,
            name: sound.name,
            fileId: sound.fileId,
            duration: sound.duration,
            categoryId: sound.categoryId,
        });

        console.log(
            `[State] Saved sound "${soundName}" (ID: ${sound.id}) to shared state`,
        );
    },
);

Given(
    "the sound {string} exists in shared state",
    async ({ page }, soundName: string) => {
        let sound = sharedState.getSound(soundName);
        if (!sound) {
            console.log(
                `[AutoProvision] Sound "${soundName}" not in shared state, looking up via API...`,
            );
            const response = await page.request.get(`${API_BASE}/sounds`);
            const data = await response.json();
            const found = (data.sounds || []).find(
                (s: any) => s.name === soundName || s.name.includes(soundName),
            );

            if (found) {
                sharedState.saveSound(soundName, {
                    id: found.id,
                    name: found.name,
                    fileId: found.fileId,
                    duration: found.duration,
                    categoryId: found.categoryId,
                });
                console.log(
                    `[AutoProvision] Found existing sound "${soundName}" (ID: ${found.id})`,
                );
            } else {
                // Create sound via API
                console.log(
                    `[AutoProvision] Creating sound "${soundName}" via API...`,
                );
                const uniqueFilePath =
                    await UniqueFileGenerator.generate("test-tone.wav");
                const fs = await import("fs");
                const fileBuffer = fs.readFileSync(uniqueFilePath);
                const createResponse = await page.request.post(
                    `${API_BASE}/sounds/with-file`,
                    {
                        multipart: {
                            file: {
                                name: `${soundName}.wav`,
                                mimeType: "audio/wav",
                                buffer: fileBuffer,
                            },
                            name: soundName,
                        },
                    },
                );
                if (!createResponse.ok()) {
                    throw new Error(
                        `Failed to auto-provision sound "${soundName}": ${createResponse.status()}`,
                    );
                }
                const created = await createResponse.json();
                sharedState.saveSound(soundName, {
                    id: created.soundId || created.id,
                    name: soundName,
                    fileId: created.fileId,
                    duration: created.duration,
                    categoryId: undefined,
                });
                console.log(
                    `[AutoProvision] Created sound "${soundName}" (ID: ${created.soundId || created.id})`,
                );
            }
        }
        console.log(
            `[Precondition] Sound "${soundName}" exists in shared state (ID: ${sharedState.getSound(soundName)?.id})`,
        );
    },
);

// ============= Update Steps =============

When(
    "I open the sound {string} for viewing",
    async ({ page }, soundName: string) => {
        const sound = sharedState.getSound(soundName);
        if (!sound) {
            throw new Error(`Sound "${soundName}" not found in shared state`);
        }

        await waitForSoundsUiReady(page);
        await page.waitForSelector(
            ".sound-list, .sound-grid, .sound-card, .sound-list-empty",
            {
                timeout: 30000,
            },
        );

        const soundCard = page.locator(`[data-sound-id="${sound.id}"]`);
        await expect(soundCard).toBeVisible({ timeout: 10000 });
        await soundCard.scrollIntoViewIfNeeded();
        await soundCard.click();

        // Wait for the sound modal to appear
        await expect(page.locator(".p-dialog")).toBeVisible({ timeout: 5000 });
        currentSoundName = soundName;

        console.log(`[Action] Opened sound "${soundName}" for viewing`);
    },
);

When(
    "I change the sound name to {string}",
    async ({ page }, newName: string) => {
        const currentId = currentSoundName
            ? sharedState.getSound(currentSoundName)?.id
            : undefined;
        await cleanupSoundByName(page, newName, currentId);

        // Use inline name editing in the SoundEditor modal (ISSUE-04: UI instead of API)
        const dialog = page.locator(".p-dialog");
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // Click pencil button to enter edit mode
        const editButton = dialog.locator('[data-testid="sound-name-edit"]');
        await editButton.click();

        // Fill the name input
        const nameInput = dialog.locator('[data-testid="sound-name-input"]');
        await nameInput.waitFor({ state: "visible", timeout: 5000 });
        await nameInput.clear();
        await nameInput.fill(newName);

        // Click save button and wait for updated UI state
        const saveButton = dialog.locator('[data-testid="sound-name-save"]');
        await saveButton.click();

        // Wait for the updated name to display in the dialog
        await expect(
            dialog.locator('[data-testid="sound-name-display"]'),
        ).toHaveText(newName, { timeout: 5000 });

        // Update shared state with new name
        const lookupName = currentSoundName || "crud-test-sound";
        const sound = sharedState.getSound(lookupName);
        if (sound) {
            sound.name = newName;
            sharedState.saveSound(lookupName, sound);
        }

        console.log(
            `[Action] Renamed sound to "${newName}" via UI inline editing`,
        );
    },
);

When("I save the sound changes", async ({ page }) => {
    // The inline name edit already saved via API; just close the dialog if open
    const dialog = page.locator(".p-dialog");
    const isDialogVisible = await dialog.isVisible();

    if (isDialogVisible) {
        // Check for an explicit save button (some dialogs have one)
        const saveButton = dialog.locator(
            '[data-testid="sound-dialog-save"], button:has-text("Save")',
        );
        if (await saveButton.isVisible()) {
            await saveButton.click();
            await dialog.waitFor({ state: "hidden", timeout: 10000 });
            console.log("[Action] Saved sound changes via dialog");
        } else {
            // Close the dialog — changes were already saved inline
            const closeButton = dialog.locator(
                ".p-dialog-header-close, button:has(.pi-times)",
            );
            if (await closeButton.isVisible()) {
                await closeButton.click();
                await dialog
                    .waitFor({ state: "hidden", timeout: 5000 })
                    .catch(() => {});
            }
            console.log(
                "[Action] Closed sound dialog (changes already saved inline)",
            );
        }
    } else {
        console.log("[Action] Sound changes already saved (no dialog open)");
    }

    // Wait for UI to reactively update instead of page.reload()
    await page.waitForLoadState("domcontentloaded");
    console.log("[Action] UI updated to reflect sound changes");
});

When(
    "I assign the sound to category {string}",
    async ({ page }, categoryName: string) => {
        const category = sharedState.getSoundCategory(categoryName);
        if (!category) {
            throw new Error(
                `Category "${categoryName}" not found in shared state`,
            );
        }

        // Get the sound from shared state
        const lookupName = currentSoundName || "crud-test-sound";
        const sound = sharedState.getSound(lookupName);
        if (!sound) {
            throw new Error(
                `Sound '${lookupName}' not found in shared state for category assignment`,
            );
        }

        // Close modal if open
        const dialog = page.locator(".p-dialog");
        if (await dialog.isVisible()) {
            const closeButton = dialog.locator(".p-dialog-header-close");
            if (await closeButton.isVisible()) {
                await closeButton.click();
                await dialog
                    .waitFor({ state: "hidden", timeout: 5000 })
                    .catch(() => {});
            }
        }

        // Assign via API (drag-drop only in UI, so API is correct here)
        const response = await page.request.put(
            `${API_BASE}/sounds/${sound.id}`,
            {
                data: { categoryId: category.id },
            },
        );

        if (!response.ok()) {
            throw new Error(
                `Failed to assign category: ${response.status()} ${await response.text()}`,
            );
        }

        console.log(
            `[Action] Assigned sound to category "${categoryName}" via API`,
        );
    },
);

// ============= Filter Steps =============

When(
    "I filter sounds by category {string}",
    async ({ page }, categoryName: string) => {
        // Click the category tab to filter
        const categoryTab = page
            .locator(".category-tab")
            .filter({ hasText: categoryName });
        await categoryTab.click();
        // Wait for the sound grid to update reactively
        await page.waitForLoadState("domcontentloaded");
        console.log(`[Action] Filtered sounds by category "${categoryName}"`);
    },
);

Then(
    "the sound {string} should be visible in the filtered results",
    async ({ page }, soundName: string) => {
        const sound = sharedState.getSound(soundName);
        const name = sound?.name || soundName;

        const soundCard = page.locator(".sound-card").filter({
            has: page.locator(".sound-name", { hasText: name }),
        });
        await expect(soundCard.first()).toBeVisible({ timeout: 10000 });
        console.log(
            `[Verify] Sound "${name}" is visible in filtered results ✓`,
        );
    },
);

// ============= Category Management Steps =============

When("I open the sound category management dialog", async ({ page }) => {
    await waitForSoundsUiReady(page);

    // Click "Add Category" button
    const addCategoryButton = page.locator("button:has-text('Add Category')");
    await expect(addCategoryButton).toBeVisible({ timeout: 10000 });
    await addCategoryButton.click();

    await expect(page.locator(".p-dialog")).toBeVisible({ timeout: 5000 });
    console.log("[Action] Opened sound category dialog");
});

When(
    "I create a sound category named {string} with description {string}",
    async ({ page }, name: string, description: string) => {
        await cleanupCategoryByName(page, name);

        // Wait for dialog to be fully visible
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

        await dialog
            .waitFor({ state: "hidden", timeout: 10000 })
            .catch(() => {});
        console.log(
            `[Action] Created sound category "${name}" with description "${description}"`,
        );
    },
);

When(
    "I create a sound category named {string}",
    async ({ page }, name: string) => {
        await cleanupCategoryByName(page, name);

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

        await dialog
            .waitFor({ state: "hidden", timeout: 10000 })
            .catch(() => {});
        console.log(`[Action] Created sound category "${name}"`);
    },
);

Then(
    "the sound category {string} should be visible in the category list",
    async ({ page }, categoryName: string) => {
        const categoryTab = page
            .locator(".category-tab")
            .filter({ hasText: categoryName });
        await expect(categoryTab).toBeVisible({ timeout: 5000 });
        console.log(
            `[Verify] Sound category "${categoryName}" is visible in category list ✓`,
        );
    },
);

Then(
    "I store the sound category {string} in shared state",
    async ({ page }, categoryName: string) => {
        // Get all categories from API and find the one by name
        const response = await page.request.get(`${API_BASE}/sound-categories`);
        const data = await response.json();

        const category = data.categories?.find(
            (c: any) => c.name === categoryName,
        );
        if (!category) {
            throw new Error(
                `Sound category "${categoryName}" not found in API response`,
            );
        }

        sharedState.saveSoundCategory(categoryName, {
            id: category.id,
            name: category.name,
            description: category.description,
        });

        console.log(
            `[State] Saved sound category "${categoryName}" (ID: ${category.id}) to shared state`,
        );
    },
);

Given(
    "the sound category {string} exists in shared state",
    async ({ page }, categoryName: string) => {
        let category = sharedState.getSoundCategory(categoryName);
        if (!category) {
            console.log(
                `[AutoProvision] Sound category "${categoryName}" not in shared state, looking up via API...`,
            );
            const response = await page.request.get(
                `${API_BASE}/sound-categories`,
            );
            const data = await response.json();
            const matches = (data.categories || []).filter(
                (c: any) => c.name === categoryName,
            );

            const found = matches[0];

            if (found) {
                for (const duplicate of matches.slice(1)) {
                    await page.request
                        .delete(`${API_BASE}/sound-categories/${duplicate.id}`)
                        .catch(() => {});
                }

                sharedState.saveSoundCategory(categoryName, {
                    id: found.id,
                    name: found.name,
                    description: found.description,
                });
                console.log(
                    `[AutoProvision] Found existing sound category "${categoryName}" (ID: ${found.id})`,
                );
            } else {
                // Create category via API
                console.log(
                    `[AutoProvision] Creating sound category "${categoryName}" via API...`,
                );
                const createResponse = await page.request.post(
                    `${API_BASE}/sound-categories`,
                    {
                        data: { name: categoryName, description: "" },
                    },
                );
                if (!createResponse.ok()) {
                    throw new Error(
                        `Failed to auto-provision sound category "${categoryName}": ${createResponse.status()}`,
                    );
                }
                const created = await createResponse.json();
                sharedState.saveSoundCategory(categoryName, {
                    id: created.id,
                    name: categoryName,
                    description: "",
                });
                console.log(
                    `[AutoProvision] Created sound category "${categoryName}" (ID: ${created.id})`,
                );
            }
        }
        console.log(
            `[Precondition] Sound category "${categoryName}" exists in shared state (ID: ${sharedState.getSoundCategory(categoryName)?.id})`,
        );
    },
);

When(
    "I edit the sound category {string}",
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

        // Click the edit (pencil) button on the category tab
        const editButton = categoryTab.locator("button:has(.pi-pencil)");
        await editButton.waitFor({ state: "visible", timeout: 3000 });
        await editButton.click();

        // Wait for dialog using data-testid
        const dialog = page.locator(
            '[data-testid="category-dialog"], .p-dialog',
        );
        await dialog.waitFor({ state: "visible", timeout: 5000 });
        console.log(
            `[Action] Opened edit dialog for sound category "${categoryName}"`,
        );
    },
);

When(
    "I change the sound category name to {string}",
    async ({ page }, newName: string) => {
        await cleanupCategoryByName(page, newName);

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
        console.log(`[Action] Changed sound category name to "${newName}"`);
    },
);

When("I save the sound category changes", async ({ page }) => {
    // Use data-testid for save button
    const dialog = page
        .locator('[data-testid="category-dialog"], .p-dialog')
        .first();
    const saveButton = dialog.locator(
        '[data-testid="category-dialog-save"], button:has-text("Save")',
    );
    await saveButton.click();

    // Dialog may close asynchronously or remain visible briefly while data updates
    await dialog.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    console.log("[Action] Saved sound category changes");
});

When(
    "I delete the sound category {string}",
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

        console.log(`[Action] Deleted sound category "${categoryName}"`);
    },
);

Then(
    "the sound category {string} should not be visible in the category list",
    async ({ page }, categoryName: string) => {
        const categoryTab = page
            .locator(".category-tab")
            .filter({ hasText: categoryName });
        await expect(categoryTab).not.toBeVisible({ timeout: 5000 });
        console.log(
            `[Verify] Sound category "${categoryName}" is not visible ✓`,
        );
    },
);

// ============= Visibility Assertions =============

Then(
    "the sound {string} should be visible in the sound list",
    async ({ page }, soundName: string) => {
        // First try to get from shared state
        const sound = sharedState.getSound(soundName);
        const name = sound?.name || soundName;

        const soundCard = page.locator(".sound-card").filter({
            has: page.locator(".sound-name", { hasText: name }),
        });
        await expect(soundCard.first()).toBeVisible({ timeout: 10000 });
        console.log(`[Verify] Sound "${name}" is visible in sound list ✓`);
    },
);

Then(
    "the sound {string} should not be visible",
    async ({ page }, soundName: string) => {
        // IMPORTANT: Use the literal Gherkin parameter, not the shared state name
        // After rename, shared state would have the NEW name, but we want to verify OLD name is gone
        const name = soundName;

        const soundCard = page.locator(".sound-card").filter({
            has: page.locator(".sound-name", { hasText: name }),
        });
        await expect(soundCard).not.toBeVisible({ timeout: 5000 });
        console.log(`[Verify] Sound "${name}" is not visible ✓`);
    },
);

// ============= Delete Steps =============

When(
    "I delete the sound {string} via API",
    async ({ page }, soundName: string) => {
        const sound = sharedState.getSound(soundName);
        if (!sound) {
            throw new Error(`Sound "${soundName}" not found in shared state`);
        }

        const response = await page.request.delete(
            `${API_BASE}/sounds/${sound.id}`,
        );

        if (!response.ok()) {
            throw new Error(
                `Failed to delete sound: ${response.status()} ${await response.text()}`,
            );
        }

        console.log(
            `[Action] Deleted sound "${soundName}" (ID: ${sound.id}) via API`,
        );

        // Wait for UI to reactively reflect deletion
        const soundCard = page.locator(`[data-sound-id="${sound.id}"]`);
        await soundCard
            .waitFor({ state: "hidden", timeout: 5000 })
            .catch(async () => {
                // Fallback: navigate to force refresh if card doesn't disappear
                const soundListPage = new SoundListPage(page);
                await soundListPage.goto();
            });
    },
);

// ============= Playback & Waveform Steps =============

Then("the waveform visualization should be rendered", async ({ page }) => {
    const waveformContainer = page.locator('[data-testid="sound-waveform"]');
    await expect(waveformContainer).toBeVisible({ timeout: 15000 });

    // WaveSurfer renders a canvas inside the waveform container
    // Wait for the canvas element and verify it has non-zero dimensions
    const canvas = waveformContainer.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 15000 });

    const dimensions = await canvas.evaluate((el) => ({
        width: (el as HTMLCanvasElement).width,
        height: (el as HTMLCanvasElement).height,
    }));

    expect(dimensions.width).toBeGreaterThan(0);
    expect(dimensions.height).toBeGreaterThan(0);
    console.log(
        `[Verify] Waveform rendered with canvas dimensions: ${dimensions.width}x${dimensions.height}`,
    );
});

When("I click the play button", async ({ page }) => {
    const playButton = page.locator('[data-testid="sound-play-pause"]');
    await expect(playButton).toBeVisible({ timeout: 10000 });
    await expect(playButton).toBeEnabled({ timeout: 10000 });
    await playButton.click();
    console.log("[Action] Clicked play button");
});

Then("the play button should change to a pause icon", async ({ page }) => {
    const playButton = page.locator('[data-testid="sound-play-pause"]');
    // After clicking play, the icon should change to pi-pause
    await expect(playButton.locator(".pi-pause")).toBeVisible({
        timeout: 10000,
    });
    console.log(
        "[Verify] Play button changed to pause icon (audio is playing)",
    );
});
