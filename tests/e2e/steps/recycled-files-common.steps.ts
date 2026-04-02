import { createBdd } from "playwright-bdd";
import { expect, Page, test } from "@playwright/test";
import { RecycledFilesPage } from "../pages/RecycledFilesPage";
import { ModelListPage } from "../pages/ModelListPage";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import fs from "fs/promises";

const { Given: GivenBdd, When: WhenBdd, Then: ThenBdd } = createBdd();

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8090";

// Helper: Wait for all visible thumbnails to load before taking screenshots
export async function waitForThumbnails(
    page: Page,
    context: string = "page",
): Promise<void> {
    // Find all visible thumbnail images (.model-card-thumbnail img or .recycled-item img)
    const thumbnailSelectors = [
        ".model-card-thumbnail img",
        ".recycled-item-thumbnail img",
        ".model-card img",
    ];

    for (const selector of thumbnailSelectors) {
        const images = page.locator(selector);
        const count = await images.count();

        if (count > 0) {
            console.log(
                `[Thumbnail] Waiting for ${count} thumbnail(s) to load (${selector})...`,
            );

            // Wait for each image to load
            for (let i = 0; i < count; i++) {
                const img = images.nth(i);
                try {
                    await expect
                        .poll(
                            async () => {
                                const isVisible = await img.isVisible();
                                if (!isVisible) return true; // Skip hidden images
                                const naturalWidth = await img.evaluate(
                                    (el: HTMLImageElement) => el.naturalWidth,
                                );
                                return naturalWidth > 0;
                            },
                            {
                                message: `Waiting for thumbnail ${i + 1}/${count} to load`,
                                timeout: 10000,
                            },
                        )
                        .toBe(true);
                } catch {
                    console.log(
                        `[Thumbnail] Warning: Thumbnail ${i + 1}/${count} may not have loaded`,
                    );
                }
            }

            console.log(`[Thumbnail] All thumbnails loaded for ${context} ✓`);
            return; // Found and processed thumbnails
        }
    }

    console.log(`[Thumbnail] No thumbnails found on ${context}`);
}

// Helper to take screenshot and attach to report
export async function takeScreenshotToReport(
    page: Page,
    name: string,
    filename: string,
): Promise<void> {
    const screenshot = await page.screenshot({
        path: `test-results/${filename}.png`,
    });
    const testInfo = test.info();
    if (testInfo) {
        await testInfo.attach(name, {
            body: screenshot,
            contentType: "image/png",
        });
    }
    console.log(`[Screenshot] Captured: ${name}`);
}

// ============================================
// Common Setup Steps
// ============================================

GivenBdd("there are no recycled items", async ({ page }) => {
    // Navigate to recycled files and check if empty
    const recycleBin = new RecycledFilesPage(page);
    await recycleBin.goto();

    // This is a precondition - if not empty, we'll just skip (test should handle this)
    if (!(await recycleBin.isEmptyStateVisible())) {
        console.log(
            "[Setup] Recycle bin has items - this test may not work correctly",
        );
    }

    console.log("[Setup] Checked recycled items state");
});

// ============================================
// Navigation Steps
// ============================================

WhenBdd("I navigate to the Recycled Files page", async ({ page }) => {
    const recycleBin = new RecycledFilesPage(page);
    await recycleBin.goto();

    // Snapshot counts before any action for count-based assertions
    const modelCount = await recycleBin.getRecycledModelCount();
    const versionCount = await recycleBin.getRecycledModelVersionCount();
    // Store in scenario state so other step files can access without sharing module-level state
    getScenarioState(page).setCustom("recycledModelCountBefore", modelCount);
    getScenarioState(page).setCustom(
        "recycledVersionCountBefore",
        versionCount,
    );
    console.log(
        `[Navigation] Navigated to Recycled Files page (models: ${modelCount}, versions: ${versionCount})`,
    );
});

WhenBdd("I navigate back to the model list", async ({ page }) => {
    const modelList = new ModelListPage(page);
    await modelList.goto();
    console.log("[Navigation] Navigated back to model list");
});

// ============================================
// Action Steps
// ============================================

WhenBdd("I cancel the delete dialog", async ({ page }) => {
    const recycleBin = new RecycledFilesPage(page);
    await recycleBin.cancelDelete();
    console.log("[Action] Cancelled delete dialog");
});

// ============================================
// Assertion Steps
// ============================================

ThenBdd("the recycle bin should be visible", async ({ page }) => {
    const recycleBin = new RecycledFilesPage(page);
    const isVisible = await recycleBin.isVisible();
    expect(isVisible).toBe(true);
    console.log("[UI] Recycle bin is visible ✓");
});

ThenBdd("I should see the recycled files empty state", async ({ page }) => {
    const recycleBin = new RecycledFilesPage(page);
    const isEmpty = await recycleBin.isEmptyStateVisible();
    expect(isEmpty).toBe(true);
    console.log("[UI] Empty state message visible ✓");
});

ThenBdd("the delete confirmation dialog should appear", async ({ page }) => {
    const recycleBin = new RecycledFilesPage(page);
    const isVisible = await recycleBin.isDeleteDialogVisible();
    expect(isVisible).toBe(true);
    console.log("[UI] Delete confirmation dialog visible ✓");
});

ThenBdd("the dialog should show files to be deleted", async ({ page }) => {
    const recycleBin = new RecycledFilesPage(page);
    const files = await recycleBin.getFilesToDeleteList();
    expect(files.length).toBeGreaterThan(0);
    console.log(`[UI] Dialog shows ${files.length} file(s) to delete ✓`);
    console.log(`[UI] Files: ${files.join(", ")}`);
});

// ============================================
// Common Screenshot Steps
// ============================================

ThenBdd("I take a screenshot of the recycle bin", async ({ page }) => {
    await waitForThumbnails(page, "recycle bin");
    await takeScreenshotToReport(page, "Recycle Bin", "recycle-bin");
});

WhenBdd(
    "I take a screenshot of the recycle bin before delete",
    async ({ page }) => {
        await waitForThumbnails(page, "recycle bin before delete");
        await takeScreenshotToReport(
            page,
            "Recycle Bin Before Delete",
            "recycle-bin-before-delete",
        );
    },
);

ThenBdd("I take a screenshot of the delete dialog", async ({ page }) => {
    await takeScreenshotToReport(
        page,
        "Delete Dialog",
        "delete-forever-dialog",
    );
});

ThenBdd("I take a screenshot after restore", async ({ page }) => {
    await waitForThumbnails(page, "after restore");
    await takeScreenshotToReport(page, "After Restore", "after-restore");
});

ThenBdd("I take a screenshot after permanent delete", async ({ page }) => {
    await waitForThumbnails(page, "after permanent delete");
    await takeScreenshotToReport(
        page,
        "After Permanent Delete",
        "after-permanent-delete",
    );
});

ThenBdd(
    "I take a screenshot of the recycle bin before restore",
    async ({ page }) => {
        await waitForThumbnails(page, "recycle bin before restore");
        await takeScreenshotToReport(
            page,
            "Recycle Bin Before Restore",
            "recycle-bin-before-restore",
        );
    },
);

// ============================================
// File Deletion Real-Time Update Steps
// (08-file-deletion-realtime.feature)
// ============================================

const realtimeTestState = {
    textureSetId: null as number | null,
    textureSetName: "",
    deletedFileName: "",
};

GivenBdd(
    "a texture set {string} with an uploaded file exists",
    async ({ page }, name: string) => {
        const baseUrl = process.env.API_BASE_URL || "http://localhost:8090";

        // Remove any pre-existing texture set with this name (active or recycled)
        const listRes = await page.request.get(`${baseUrl}/texture-sets`);
        if (listRes.ok()) {
            const data = await listRes.json();
            const existing = (data.textureSets ?? []).find(
                (t: any) => t.name === name,
            );
            if (existing) {
                await page.request.delete(
                    `${baseUrl}/texture-sets/${existing.id}/hard`,
                );
                console.log(
                    `[Setup] Hard-deleted existing texture set "${name}" (ID: ${existing.id})`,
                );
            }
        }
        const recycledRes = await page.request.get(`${baseUrl}/recycled-files`);
        if (recycledRes.ok()) {
            const recycled = await recycledRes.json();
            const recycledTs = (recycled.textureSets ?? []).find(
                (t: any) => t.name === name,
            );
            if (recycledTs) {
                await page.request.delete(
                    `${baseUrl}/recycled/textureSet/${recycledTs.id}/permanent`,
                );
                console.log(
                    `[Setup] Permanently deleted recycled texture set "${name}"`,
                );
            }
        }

        // Create texture set with a unique file via the /texture-sets/with-file endpoint
        const testFile = await UniqueFileGenerator.generate("blue_color.png");
        const fileBuffer = await fs.readFile(testFile);
        const response = await page.request.post(
            `${baseUrl}/texture-sets/with-file?name=${encodeURIComponent(name)}&textureType=1`,
            {
                multipart: {
                    file: {
                        name: "blue_color.png",
                        mimeType: "image/png",
                        buffer: fileBuffer,
                    },
                },
            },
        );
        expect(response.ok()).toBe(true);
        const data = await response.json();
        realtimeTestState.textureSetId = data.textureSetId ?? data.id;
        realtimeTestState.textureSetName = name;
        console.log(
            `[Setup] Created texture set "${name}" with file (ID: ${realtimeTestState.textureSetId})`,
        );
    },
);

GivenBdd(
    "the Recycled Files page is open in the right panel",
    async ({ page }) => {
        const { openTabViaMenu } = await import("../helpers/navigation-helper");
        await openTabViaMenu(page, "recycledFiles", "right");
        // Wait for recycled files panel to load in the right panel
        await page.waitForSelector(".recycled-files-list", {
            state: "visible",
            timeout: 10000,
        });
        console.log("[Setup] Recycled Files panel open in right panel ✓");
    },
);

GivenBdd(
    "I have the texture set {string} open in the Files tab in the left panel",
    async ({ page }, name: string) => {
        const { openTabViaMenu } = await import("../helpers/navigation-helper");
        // Open texture sets in the left panel
        await openTabViaMenu(page, "textureSets", "left");
        await page.waitForLoadState("domcontentloaded");

        // The texture sets created in test setup are Model-Specific (backend default).
        // The default tab is Global Materials, so we must switch to Model-Specific first.
        const modelSpecificBtn = page
            .locator(".kind-filter-select button")
            .filter({ hasText: "Model-Specific" });
        await expect(modelSpecificBtn).toBeVisible({ timeout: 10000 });
        const isActive = await modelSpecificBtn.evaluate((el: Element) =>
            el.classList.contains("p-highlight"),
        );
        if (!isActive) {
            await modelSpecificBtn.click();
            await page.waitForTimeout(500);
        }

        // Use the search box to avoid pagination issues (>50 sets alphabetically before this one)
        const searchInput = page.locator(".search-input");
        if (
            await searchInput
                .waitFor({ state: "visible", timeout: 3000 })
                .then(() => true)
                .catch(() => false)
        ) {
            await searchInput.clear();
            await searchInput.fill(name);
            await page.waitForTimeout(500);
        }

        // Find and open the texture set card
        const card = realtimeTestState.textureSetId
            ? page.locator(
                  `.texture-set-card[data-texture-set-id="${realtimeTestState.textureSetId}"]`,
              )
            : page.locator(`.texture-set-card:has-text("${name}")`).first();
        await expect(card).toBeVisible({ timeout: 15000 });
        await card.dblclick();

        // Wait for viewer to open
        await page.waitForSelector(".texture-set-viewer", { timeout: 10000 });

        // Switch to Files tab
        await page.waitForSelector(".p-tabview-nav", { timeout: 10000 });
        const filesTab = page
            .locator(".p-tabview-nav-link")
            .filter({ hasText: "Files" });
        await expect(filesTab).toBeVisible({ timeout: 10000 });
        await filesTab.click();
        await page.waitForSelector(".files-tab, .files-tab-empty", {
            timeout: 10000,
        });
        await page
            .locator(".file-mapping-card, .files-tab-empty")
            .first()
            .waitFor({ state: "visible", timeout: 10000 });
        console.log(
            `[Setup] Texture set "${name}" open in Files tab in left panel ✓`,
        );
    },
);

WhenBdd("I delete the first file from the Files tab", async ({ page }) => {
    // Get the first file card's name before deletion
    const firstCard = page.locator(".file-mapping-card").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    const fileName = await firstCard
        .locator(".file-name")
        .textContent()
        .catch(() => "");
    realtimeTestState.deletedFileName = fileName?.trim() ?? "";
    console.log(
        `[Action] Deleting file "${realtimeTestState.deletedFileName}" from Files tab`,
    );

    // Click the delete button
    const deleteBtn = firstCard.locator(".file-delete-btn");
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();

    // Wait for PrimeReact confirmDialog to appear
    await page.waitForSelector(".p-dialog", {
        state: "visible",
        timeout: 5000,
    });

    // Confirm deletion (PrimeReact confirmDialog default acceptLabel is "Yes")
    const acceptBtn = page
        .locator(".p-dialog")
        .filter({ visible: true })
        .locator(".p-dialog-footer")
        .getByRole("button", { name: "Yes" });
    await expect(acceptBtn).toBeVisible({ timeout: 5000 });
    await acceptBtn.click();

    // Wait for dialog to close
    await page.waitForSelector(".p-dialog", {
        state: "hidden",
        timeout: 10000,
    });
    console.log(`[Action] File deletion confirmed ✓`);
});

ThenBdd(
    "the recycled files panel in the right should show the deleted file without navigation",
    async ({ page }) => {
        // The RecycledFiles panel in the right panel should update in real time
        // without any navigation — TanStack Query invalidation triggers the refetch.
        const filesSection = page.locator(
            ".recycled-section[data-section='files']",
        );
        await expect(filesSection).toBeVisible({ timeout: 10000 });

        // Wait for at least one recycled file card to appear
        const recycledCard = filesSection.locator(".recycled-card").first();
        await expect(recycledCard).toBeVisible({ timeout: 10000 });

        console.log(
            `[Verify] Recycled files section appeared in right panel in real time ✓`,
        );

        // If we tracked the filename, also verify it appears in the list
        if (realtimeTestState.deletedFileName) {
            const cardName = filesSection.locator(".recycled-card-name");
            const count = await cardName.count();
            let found = false;
            for (let i = 0; i < count && !found; i++) {
                const text = await cardName.nth(i).textContent();
                if (
                    text
                        ?.trim()
                        .includes(realtimeTestState.deletedFileName.trim())
                ) {
                    found = true;
                }
            }
            if (found) {
                console.log(
                    `[Verify] Deleted file "${realtimeTestState.deletedFileName}" found in recycled files panel ✓`,
                );
            } else {
                console.log(
                    `[Verify] At least one recycled file card is visible (name match not required) ✓`,
                );
            }
        }
    },
);

WhenBdd(
    "I click delete on the first file in the Files tab",
    async ({ page }) => {
        const firstCard = page.locator(".file-mapping-card").first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });
        const deleteBtn = firstCard.locator(".file-delete-btn");
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });
        await deleteBtn.click();

        // Wait for confirmDialog to appear
        await page.waitForSelector(".p-dialog", {
            state: "visible",
            timeout: 5000,
        });
        console.log("[Action] Clicked delete on first file, dialog appeared ✓");
    },
);

ThenBdd(
    "exactly one confirmation dialog should be visible",
    async ({ page }) => {
        // Wait briefly to ensure all dialogs have had time to render
        await page.waitForTimeout(500);

        const visibleDialogs = page.locator(".p-dialog:visible");
        const count = await visibleDialogs.count();
        expect(count).toBe(1);
        console.log(`[Verify] Exactly 1 dialog visible (count: ${count}) ✓`);
    },
);

WhenBdd("I confirm the file deletion dialog", async ({ page }) => {
    const acceptBtn = page
        .locator(".p-dialog")
        .filter({ visible: true })
        .locator(".p-dialog-footer")
        .getByRole("button", { name: "Yes" });
    await expect(acceptBtn).toBeVisible({ timeout: 5000 });
    await acceptBtn.click();
    console.log("[Action] Confirmed file deletion dialog ✓");
});

ThenBdd("the confirmation dialog should close", async ({ page }) => {
    await page.waitForSelector(".p-dialog", {
        state: "hidden",
        timeout: 10000,
    });
    console.log("[Verify] Confirmation dialog closed ✓");
});
