/**
 * Step definitions for Sound CRUD E2E tests
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { SoundListPage } from "../pages/SoundListPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

// currentSoundName is tracked via getScenarioState(page).getCustom<string>('currentSoundName')

async function waitForSoundsUiReady(page: any): Promise<void> {
    await page
        .waitForSelector(
            ".sound-list, .sound-grid, .sound-list-empty, .sound-list-loading, .sound-category-sidebar, input[type='file']",
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

async function waitForSoundCategoryTab(page: any, categoryName: string) {
    const soundListPage = new SoundListPage(page);

    for (let attempt = 0; attempt < 3; attempt += 1) {
        await waitForSoundsUiReady(page);

        // Category rows in the shared CategoryTreePanel sidebar (unassigned
        // bucket + tree nodes) — sounds no longer uses .category-tab tabs.
        const categoryTabs = page.locator(
            ".sound-category-sidebar .category-tree-unassigned, .sound-category-sidebar .category-tree .p-treenode-content",
        );
        const tabCount = await categoryTabs.count();

        for (let index = 0; index < tabCount; index += 1) {
            const categoryTab = categoryTabs.nth(index);
            const tabName = (await categoryTab
                .locator("span")
                .first()
                .textContent()
                .catch(() => null))?.trim();

            if (
                tabName === categoryName &&
                (await categoryTab.isVisible().catch(() => false))
            ) {
                return categoryTab;
            }
        }

        await soundListPage.goto();
        await page.waitForLoadState("domcontentloaded");
    }

    throw new Error(
        `Sound category "${categoryName}" was not visible after refreshing the sounds page.`,
    );
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

    const recycledResponse = await page.request
        .get(`${API_BASE}/recycled`)
        .catch(() => null);
    if (!recycledResponse?.ok()) {
        return;
    }

    const recycledData = await recycledResponse.json();
    const recycledMatches = (recycledData.sounds || []).filter(
        (sound: any) => sound.name === name && sound.id !== excludeId,
    );

    for (const sound of recycledMatches) {
        await page.request
            .delete(`${API_BASE}/recycled/sound/${sound.id}/permanent`)
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
        await cleanupSoundByName(page, soundName);

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

        // Wait for upload API response — must succeed before proceeding
        await uploadResponsePromise;
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

                const refreshedResponse = await page.request
                    .get(`${API_BASE}/sounds`)
                    .catch(() => null);
                if (refreshedResponse?.ok()) {
                    const refreshedData = await refreshedResponse.json();
                    const existingSound = (refreshedData.sounds || []).find(
                        (candidate: any) => candidate.name === soundName,
                    );
                    if (existingSound) {
                        sound = existingSound;
                        console.log(
                            `[Recovery] Reusing existing sound "${soundName}" (ID: ${existingSound.id})`,
                        );
                    }
                }
            }
        }

        // Save to shared state for use in subsequent steps
        if (sound) {
            getScenarioState(page).saveSound(soundName, {
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
        // After API rename, the UI may not update reactively — reload to ensure fresh state
        const soundListPage = new SoundListPage(page);
        await soundListPage.goto();
        await waitForSoundsUiReady(page);

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
                getScenarioState(page).saveSound(soundName, {
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

        getScenarioState(page).saveSound(soundName, {
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
        let sound = getScenarioState(page).getSound(soundName);
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
                getScenarioState(page).saveSound(soundName, {
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
                getScenarioState(page).saveSound(soundName, {
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
            `[Precondition] Sound "${soundName}" exists in shared state (ID: ${getScenarioState(page).getSound(soundName)?.id})`,
        );
    },
);

// ============= Update Steps =============

When(
    "I open the sound {string} for viewing",
    async ({ page }, soundName: string) => {
        const sound = getScenarioState(page).getSound(soundName);
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
        // Sound may have been auto-provisioned via API *after* the page loaded.
        // If the card isn't visible yet, navigate to the sounds page to refresh the list.
        if (!(await soundCard.isVisible().catch(() => false))) {
            const soundListPage = new SoundListPage(page);
            await soundListPage.goto();
            await waitForSoundsUiReady(page);
        }

        // The sounds list uses infinite scroll (50 items/page). If the target card is
        // not in the first page, click "Load More" repeatedly until it appears.
        const loadMoreSelector = 'button:has-text("Load More")';
        while (!(await soundCard.isVisible().catch(() => false))) {
            const loadMoreBtn = page.locator(loadMoreSelector).first();
            if (!(await loadMoreBtn.isVisible().catch(() => false))) {
                break; // No more pages to load
            }
            await loadMoreBtn.click();
            await page.waitForTimeout(500); // Wait for new items to render
        }

        await expect(soundCard).toBeVisible({ timeout: 10000 });
        await soundCard.scrollIntoViewIfNeeded();
        await soundCard.click();

        // Wait for the sound modal to appear
        await expect(page.locator(".p-dialog")).toBeVisible({ timeout: 5000 });
        getScenarioState(page).setCustom("currentSoundName", soundName);

        console.log(`[Action] Opened sound "${soundName}" for viewing`);
    },
);

When(
    "I change the sound name to {string}",
    async ({ page }, newName: string) => {
        const currentSoundName =
            getScenarioState(page).getCustom<string>("currentSoundName");
        const currentId = currentSoundName
            ? getScenarioState(page).getSound(currentSoundName)?.id
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

        // Update scenario state with new name
        const lookupName =
            getScenarioState(page).getCustom<string>("currentSoundName") ||
            "crud-test-sound";
        const sound = getScenarioState(page).getSound(lookupName);
        if (sound) {
            sound.name = newName;
            getScenarioState(page).saveSound(lookupName, sound);
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
        const category = getScenarioState(page).getSoundCategory(categoryName);
        if (!category) {
            throw new Error(
                `Category "${categoryName}" not found in shared state`,
            );
        }

        // Get the sound from scenario state
        const lookupName =
            getScenarioState(page).getCustom<string>("currentSoundName") ||
            "crud-test-sound";
        const sound = getScenarioState(page).getSound(lookupName);
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
        const categoryTab = await waitForSoundCategoryTab(page, categoryName);
        await categoryTab.click();
        // Wait for the sound grid to update reactively
        await page.waitForLoadState("domcontentloaded");
        console.log(`[Action] Filtered sounds by category "${categoryName}"`);
    },
);

Then(
    "the sound {string} should be visible in the filtered results",
    async ({ page }, soundName: string) => {
        const sound = getScenarioState(page).getSound(soundName);
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
// All category management happens inside the category tree sidebar via its
// right-click context menu (the manager dialog was removed): "Add category"
// on the panel buckets, "Add subcategory"/"Rename"/"Delete" on a node, and
// an inline input in the tree for typing names.

async function clickCategoryContextMenuItem(page: any, label: string) {
    // PrimeReact ContextMenu portals to document.body (.p-* is the accepted
    // exception for body-mounted overlays).
    const item = page
        .locator(".p-contextmenu .p-menuitem-text")
        .filter({ hasText: label })
        .first();
    await expect(item).toBeVisible({ timeout: 5000 });
    await item.click();
}

async function commitInlineCategoryName(page: any, name: string) {
    const input = page
        .locator(
            '.sound-category-sidebar [data-testid="category-tree-inline-input"]',
        )
        .first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(name);
    await input.press("Enter");
    await expect(input).toBeHidden({ timeout: 10000 });
}

When(
    "I create a sound category named {string} via the context menu",
    async ({ page }, name: string) => {
        await cleanupCategoryByName(page, name);
        await waitForSoundsUiReady(page);

        // Right-click a bucket row (not a category node) to get the
        // background menu with the root-level "Add category" item.
        await page
            .locator('.sound-category-sidebar [data-testid="category-tree-all"]')
            .click({ button: "right" });
        await clickCategoryContextMenuItem(page, "Add category");
        await commitInlineCategoryName(page, name);

        console.log(
            `[Action] Created sound category "${name}" via context menu`,
        );
    },
);

When(
    "I rename the sound category {string} to {string} via the context menu",
    async ({ page }, oldName: string, newName: string) => {
        await cleanupCategoryByName(page, newName);

        const categoryTab = await waitForSoundCategoryTab(page, oldName);
        await categoryTab.click({ button: "right" });
        await clickCategoryContextMenuItem(page, "Rename");
        await commitInlineCategoryName(page, newName);

        console.log(
            `[Action] Renamed sound category "${oldName}" to "${newName}" via context menu`,
        );
    },
);

When(
    "I add a subcategory named {string} under the sound category {string} via the context menu",
    async ({ page }, childName: string, parentName: string) => {
        await cleanupCategoryByName(page, childName);

        const parentTab = await waitForSoundCategoryTab(page, parentName);
        await parentTab.click({ button: "right" });
        await clickCategoryContextMenuItem(page, "Add subcategory");
        await commitInlineCategoryName(page, childName);

        console.log(
            `[Action] Added subcategory "${childName}" under "${parentName}" via context menu`,
        );
    },
);

async function deleteCategoryViaContextMenu(
    page: any,
    categoryName: string,
    expectBranchWarning: boolean,
) {
    const categoryTab = await waitForSoundCategoryTab(page, categoryName);
    await categoryTab.click({ button: "right" });
    await clickCategoryContextMenuItem(page, "Delete");

    const confirmDialog = page.locator(".p-confirm-dialog");
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    if (expectBranchWarning) {
        // The branch warning must spell out the consequences before the user
        // commits to deleting subcategories and unassigning their sounds.
        await expect(confirmDialog).toContainText("subcategor");
        await expect(confirmDialog).toContainText("uncategorized");
    }

    await confirmDialog.locator("button.p-button-danger").click();
    await expect(confirmDialog).toBeHidden({ timeout: 10000 });
}

When(
    "I delete the sound category {string} via the context menu",
    async ({ page }, categoryName: string) => {
        await deleteCategoryViaContextMenu(page, categoryName, false);
        console.log(
            `[Action] Deleted sound category "${categoryName}" via context menu`,
        );
    },
);

When(
    "I delete the sound category {string} via the context menu accepting the branch warning",
    async ({ page }, categoryName: string) => {
        await deleteCategoryViaContextMenu(page, categoryName, true);
        console.log(
            `[Action] Deleted sound category branch "${categoryName}" via context menu`,
        );
    },
);

Then(
    "the sound category {string} should be visible in the category list",
    async ({ page }, categoryName: string) => {
        // Create/rename update the tree reactively (query invalidation), so
        // a web-first assertion suffices — the reload-scan helper is only
        // needed to sync categories provisioned via API before the page
        // loaded.
        const categoryRow = page
            .locator(
                ".sound-category-sidebar .category-tree .p-treenode-content",
            )
            .filter({ has: page.getByText(categoryName, { exact: true }) })
            .first();
        await expect(categoryRow).toBeVisible({ timeout: 20000 });
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

        getScenarioState(page).saveSoundCategory(categoryName, {
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
        let category = getScenarioState(page).getSoundCategory(categoryName);
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

                getScenarioState(page).saveSoundCategory(categoryName, {
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
                getScenarioState(page).saveSoundCategory(categoryName, {
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
            `[Precondition] Sound category "${categoryName}" exists in shared state (ID: ${getScenarioState(page).getSoundCategory(categoryName)?.id})`,
        );
    },
);

Given(
    "the sound category {string} exists as a subcategory of {string}",
    async ({ page }, childName: string, parentName: string) => {
        const parent = getScenarioState(page).getSoundCategory(parentName);
        if (!parent) {
            throw new Error(
                `Parent sound category "${parentName}" must exist in shared state first`,
            );
        }

        await cleanupCategoryByName(page, childName);
        const createResponse = await page.request.post(
            `${API_BASE}/sound-categories`,
            {
                data: {
                    name: childName,
                    description: "",
                    parentId: parent.id,
                },
            },
        );
        if (!createResponse.ok()) {
            throw new Error(
                `Failed to provision subcategory "${childName}": ${createResponse.status()}`,
            );
        }
        const created = await createResponse.json();
        getScenarioState(page).saveSoundCategory(childName, {
            id: created.id,
            name: childName,
            description: "",
        });
        console.log(
            `[Precondition] Subcategory "${childName}" (ID: ${created.id}) exists under "${parentName}" (ID: ${parent.id})`,
        );
    },
);

Given(
    "a sound named {string} assigned to the category {string} exists",
    async ({ page }, soundName: string, categoryName: string) => {
        const category = getScenarioState(page).getSoundCategory(categoryName);
        if (!category) {
            throw new Error(
                `Sound category "${categoryName}" must exist in shared state first`,
            );
        }

        await cleanupSoundByName(page, soundName);
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
                `Failed to provision sound "${soundName}": ${createResponse.status()}`,
            );
        }
        const created = await createResponse.json();
        const soundId = created.soundId || created.id;

        const assignResponse = await page.request.put(
            `${API_BASE}/sounds/${soundId}`,
            { data: { categoryId: category.id } },
        );
        if (!assignResponse.ok()) {
            throw new Error(
                `Failed to assign sound "${soundName}" to category "${categoryName}": ${assignResponse.status()}`,
            );
        }

        getScenarioState(page).saveSound(soundName, {
            id: soundId,
            name: soundName,
            fileId: created.fileId,
            duration: created.duration,
            categoryId: category.id,
        });
        console.log(
            `[Precondition] Sound "${soundName}" (ID: ${soundId}) assigned to category "${categoryName}" (ID: ${category.id})`,
        );
    },
);

Then(
    "the sound {string} should be uncategorized via API",
    async ({ page }, soundName: string) => {
        const sound = getScenarioState(page).getSound(soundName);
        if (!sound) {
            throw new Error(`Sound "${soundName}" not found in shared state`);
        }

        const response = await page.request.get(`${API_BASE}/sounds`);
        const data = await response.json();
        const found = (data.sounds || []).find((s: any) => s.id === sound.id);
        if (!found) {
            throw new Error(
                `Sound "${soundName}" (ID: ${sound.id}) not found via API`,
            );
        }
        expect(found.categoryId).toBeNull();
        console.log(
            `[Verify] Sound "${soundName}" is uncategorized after branch delete ✓`,
        );
    },
);

Then(
    "the sound category {string} should not be visible in the category list",
    async ({ page }, categoryName: string) => {
        // Category rows live in the shared CategoryTreePanel sidebar; the
        // old .category-tab selector matched nothing and passed vacuously.
        // Exact label match — hasText is substring and would over-match.
        const categoryRow = page
            .locator(
                ".sound-category-sidebar .category-tree .p-treenode-content",
            )
            .filter({ has: page.getByText(categoryName, { exact: true }) });
        await expect(categoryRow).toHaveCount(0, { timeout: 10000 });
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
        const sound = getScenarioState(page).getSound(soundName);
        const name = sound?.name || soundName;

        // Poll with reload to handle async backend processing + UI refresh
        await expect(async () => {
            const soundCard = page.locator(".sound-card").filter({
                has: page.locator(".sound-name", { hasText: name }),
            });
            const visible = await soundCard
                .first()
                .isVisible()
                .catch(() => false);
            if (!visible) {
                await page.reload();
                await page.waitForLoadState("domcontentloaded");
            }
            await expect(soundCard.first()).toBeVisible({ timeout: 5000 });
        }).toPass({ timeout: 30000, intervals: [2000, 3000, 5000] });
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
        const sound = getScenarioState(page).getSound(soundName);
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

// ============= Duration Filter Steps =============

Given(
    "the sound {string} has an analyzed duration",
    async ({ page }, soundName: string) => {
        const sound = getScenarioState(page).getSound(soundName);
        if (!sound) {
            throw new Error(`Sound "${soundName}" not found in shared state`);
        }

        // The waveform worker job extracts the authoritative duration with
        // ffprobe and writes it back; poll until it lands so the filter
        // boundary is computed from a real value (deterministic, no fixed sleep).
        let duration = 0;
        await expect
            .poll(
                async () => {
                    const res = await page.request.get(
                        `${API_BASE}/sounds/${sound.id}`,
                    );
                    if (!res.ok()) return 0;
                    const body = await res.json();
                    duration = body.duration ?? 0;
                    return duration;
                },
                {
                    message: `Waiting for sound ${sound.id} duration to be analyzed`,
                    timeout: 60000,
                    intervals: [1000, 2000, 5000],
                },
            )
            .toBeGreaterThan(0);

        getScenarioState(page).saveSound(soundName, { ...sound, duration });
        console.log(
            `[Precondition] Sound "${soundName}" analyzed duration = ${duration}s`,
        );
    },
);

When(
    "I filter sounds by a minimum duration longer than {string}",
    async ({ page }, soundName: string) => {
        const sound = getScenarioState(page).getSound(soundName);
        if (!sound?.duration) {
            throw new Error(
                `Sound "${soundName}" has no analyzed duration in shared state`,
            );
        }
        const threshold = Math.ceil(sound.duration) + 10;
        const soundListPage = new SoundListPage(page);
        await soundListPage.setMinDuration(threshold);
        console.log(
            `[Action] Filtered sounds by minimum duration ${threshold}s`,
        );
    },
);

When("I clear the sound duration filter", async ({ page }) => {
    const soundListPage = new SoundListPage(page);
    await soundListPage.clearDurationFilter();
    console.log("[Action] Cleared sound duration filter");
});

Then(
    "the sounds list should not show {string}",
    async ({ page }, soundName: string) => {
        const sound = getScenarioState(page).getSound(soundName);
        if (!sound) {
            throw new Error(`Sound "${soundName}" not found in shared state`);
        }
        const soundListPage = new SoundListPage(page);
        await expect(
            soundListPage.getSoundCardById(sound.id),
        ).not.toBeVisible({ timeout: 10000 });
        console.log(`[UI] Sound "${soundName}" is not visible ✓`);
    },
);

Then(
    "the sounds list should show {string}",
    async ({ page }, soundName: string) => {
        const sound = getScenarioState(page).getSound(soundName);
        if (!sound) {
            throw new Error(`Sound "${soundName}" not found in shared state`);
        }
        const soundListPage = new SoundListPage(page);
        await expect(
            soundListPage.getSoundCardById(sound.id),
        ).toBeVisible({ timeout: 10000 });
        console.log(`[UI] Sound "${soundName}" is visible ✓`);
    },
);
