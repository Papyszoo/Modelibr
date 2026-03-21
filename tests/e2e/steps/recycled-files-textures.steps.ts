import { createBdd } from "playwright-bdd";
import { expect, Page, test } from "@playwright/test";
import { RecycledFilesPage } from "../pages/RecycledFilesPage";
import { getScenarioState } from "../fixtures/shared-state";
import { DbHelper } from "../fixtures/db-helper";
import { takeScreenshotToReport } from "./recycled-files-common.steps";

const { Given: GivenBdd, When: WhenBdd, Then: ThenBdd } = createBdd();

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8090";

// State for API-based permanent delete
const apiPermDeleteState = {
    textureSetId: 0,
};

// ============================================
// Texture Set Recycling Steps
// ============================================

GivenBdd(
    "I create a texture set {string} with a color texture",
    async ({ page }, name: string) => {
        const baseUrl = process.env.API_BASE_URL || "http://localhost:8090";

        // Check if texture set already exists — hard delete it for clean state
        const listResponse = await page.request.get(`${baseUrl}/texture-sets`);
        if (listResponse.ok()) {
            const listData = await listResponse.json();
            const existing = (listData.textureSets || []).find(
                (t: any) => t.name === name,
            );
            if (existing) {
                // Hard delete to fully remove (avoids soft-delete → name collision)
                await page.request.delete(
                    `${baseUrl}/texture-sets/${existing.id}/hard`,
                );
                console.log(
                    `[Setup] Hard deleted existing texture set "${name}" (ID: ${existing.id})`,
                );
            }
        }

        // Also check recycled texture sets and permanently delete if found
        const recycledResponse = await page.request.get(
            `${baseUrl}/recycled-files`,
        );
        if (recycledResponse.ok()) {
            const recycledData = await recycledResponse.json();
            const recycledTs = (recycledData.textureSets || []).find(
                (t: any) => t.name === name,
            );
            if (recycledTs) {
                await page.request.delete(
                    `${baseUrl}/recycled/textureSet/${recycledTs.id}/permanent`,
                );
                console.log(
                    `[Setup] Permanently deleted recycled texture set "${name}" (ID: ${recycledTs.id})`,
                );
            }
        }

        // Create texture set via simple API
        const response = await page.request.post(`${baseUrl}/texture-sets`, {
            data: { Name: name },
        });

        if (response.ok()) {
            const data = await response.json();
            getScenarioState(page).setCustom(
                "lastTextureSetId",
                data.id || data.Id,
            );
            getScenarioState(page).setCustom("lastTextureSetName", name);
            console.log(
                `[Setup] Created texture set "${name}" (ID: ${getScenarioState(page).getCustom<number>("lastTextureSetId")})`,
            );
        } else {
            const errorText = await response.text();
            console.log(
                `[Error] Create texture set response: ${response.status()} - ${errorText}`,
            );
            throw new Error(
                `Failed to create texture set: ${response.status()} - ${errorText}`,
            );
        }
    },
);

ThenBdd("I take a screenshot of the texture sets list", async ({ page }) => {
    // Navigate to texture sets via UI
    const { navigateToTab } = await import("../helpers/navigation-helper");
    await navigateToTab(page, "textureSets");
    // Wait for texture sets page to fully load
    await page.waitForLoadState("domcontentloaded");
    await takeScreenshotToReport(
        page,
        "Texture Sets List",
        "texture-sets-list",
    );
});

WhenBdd("I delete the texture set {string}", async ({ page }, name: string) => {
    const baseUrl = process.env.API_BASE_URL || "http://localhost:8090";

    if (getScenarioState(page).getCustom<number>("lastTextureSetId")) {
        // Note: soft delete endpoint is /texture-sets/{id} - same as regular delete (DELETE method does soft delete)
        const response = await page.request.delete(
            `${baseUrl}/texture-sets/${getScenarioState(page).getCustom<number>("lastTextureSetId")}`,
        );
        if (response.ok()) {
            console.log(`[Action] Soft deleted texture set "${name}"`);
        } else {
            const errorText = await response.text();
            console.log(`[Error] Delete response: ${errorText}`);
            throw new Error(
                `Failed to delete texture set: ${response.status()}`,
            );
        }
    }
});

ThenBdd(
    "the texture set should not be visible in the texture sets list",
    async ({ page }) => {
        // Navigate to texture sets and verify not visible
        const { navigateToTab } = await import("../helpers/navigation-helper");
        await navigateToTab(page, "textureSets");
        // Wait for texture sets page to fully load
        await page.waitForLoadState("domcontentloaded");

        if (getScenarioState(page).getCustom<string>("lastTextureSetName")) {
            const tsName =
                getScenarioState(page).getCustom<string>("lastTextureSetName")!;
            const textureSetCard = page.locator(
                `.texture-set-card:has-text("${tsName}")`,
            );
            await expect(textureSetCard).not.toBeVisible({ timeout: 5000 });
            console.log(
                `[Verify] Texture set "${tsName}" not visible in list ✓`,
            );
        }
    },
);

ThenBdd("I take a screenshot after texture set deleted", async ({ page }) => {
    await takeScreenshotToReport(
        page,
        "After Texture Set Deleted",
        "after-texture-set-deleted",
    );
});

ThenBdd(
    "I should see the texture set in the recycled texture sets section",
    async ({ page }) => {
        const recycledFilesPage = new RecycledFilesPage(page);
        const count = await recycledFilesPage.getRecycledTextureSetCount();
        expect(count).toBeGreaterThan(0);
        console.log(`[Verify] Found ${count} recycled texture set(s) ✓`);
    },
);

ThenBdd("the texture set should have a thumbnail preview", async ({ page }) => {
    // Check for thumbnail in recycled texture sets section
    const thumbnail = page.locator(
        ".recycled-section:has(.pi-images) .recycled-card img, .recycled-section:has(.pi-images) .recycled-card .thumbnail",
    );
    const count = await thumbnail.count();
    expect(count).toBeGreaterThan(0);
    console.log(`[Verify] Texture set has ${count} thumbnail preview(s) ✓`);
});

ThenBdd(
    "I take a screenshot of the recycled texture sets section",
    async ({ page }) => {
        await takeScreenshotToReport(
            page,
            "Recycled Texture Sets Section",
            "recycled-texture-sets-section",
        );
    },
);

WhenBdd("I restore the recycled texture set", async ({ page }) => {
    // Use API-based restore for reliability (avoids index-based UI targeting ambiguity)
    if (getScenarioState(page).getCustom<number>("lastTextureSetId")) {
        const restoreResponse = await page.request.post(
            `${API_BASE_URL}/recycled/textureSet/${getScenarioState(page).getCustom<number>("lastTextureSetId")}/restore`,
        );
        expect(restoreResponse.ok()).toBe(true);
        console.log(
            `[Action] Restored recycled texture set (ID: ${getScenarioState(page).getCustom<number>("lastTextureSetId")}) via API`,
        );
    } else {
        // Fallback to UI
        const recycledFilesPage = new RecycledFilesPage(page);
        await recycledFilesPage.restoreTextureSet(0);
        console.log("[Action] Restored recycled texture set via UI fallback");
    }
    await page.waitForLoadState("domcontentloaded");
});

ThenBdd(
    "the texture set should be removed from the recycle bin",
    async ({ page }) => {
        // Verify via API that the texture set is no longer soft-deleted
        if (getScenarioState(page).getCustom<number>("lastTextureSetId")) {
            const response = await page.request.get(
                `${API_BASE_URL}/texture-sets/${getScenarioState(page).getCustom<number>("lastTextureSetId")}`,
            );
            // After restore, the texture set should be accessible (not 404)
            expect(response.ok()).toBe(true);
            console.log(
                `[API] Texture set (ID: ${getScenarioState(page).getCustom<number>("lastTextureSetId")}) restored successfully ✓`,
            );
        } else {
            // Fallback to UI check
            const recycledFilesPage = new RecycledFilesPage(page);
            await recycledFilesPage.refresh();
            const count = await recycledFilesPage.getRecycledTextureSetCount();
            let found = false;
            for (let i = 0; i < count; i++) {
                const name = await recycledFilesPage.getTextureSetName(i);
                if (name && name.includes("restore-test-texture")) {
                    found = true;
                    break;
                }
            }
            expect(found).toBe(false);
            console.log("[Verify] Texture set removed from recycle bin ✓");
        }
    },
);

WhenBdd("I navigate to the Texture Sets page", async ({ page }) => {
    const { navigateToTab } = await import("../helpers/navigation-helper");
    await navigateToTab(page, "textureSets");
    // Wait for texture sets page to fully load
    await page.waitForLoadState("domcontentloaded");
    console.log("[Navigation] Navigated to Texture Sets page");
});

ThenBdd(
    "the texture set {string} should be visible",
    async ({ page }, name: string) => {
        // Wait for the texture set list to load
        await page
            .waitForSelector(".texture-set-list", { timeout: 10000 })
            .catch(() => {
                console.log(
                    "[Warning] .texture-set-list not found, checking anyway",
                );
            });

        // Switch to Model-Specific tab (default tab is now Global Materials)
        const msTab = page
            .locator(".kind-filter-select .p-button")
            .filter({ hasText: "Model-Specific" });
        await msTab.waitFor({ state: "visible", timeout: 10000 });
        const isActive = await msTab.evaluate((el: Element) =>
            el.classList.contains("p-highlight"),
        );
        if (!isActive) {
            await msTab.click();
            await page.waitForTimeout(500);
        }

        // Look for the texture set by name in any card element
        const textureSetCard = page.locator(
            `.texture-set-card-name:has-text("${name}")`,
        );
        await expect(textureSetCard).toBeVisible({ timeout: 10000 });
        console.log(`[Verify] Texture set "${name}" is visible ✓`);
    },
);

ThenBdd("I take a screenshot of the restored texture set", async ({ page }) => {
    await takeScreenshotToReport(
        page,
        "Restored Texture Set",
        "restored-texture-set",
    );
});

// ============================================
// API-based Permanent Delete Steps (Texture Sets)
// ============================================

GivenBdd(
    "I create and soft-delete a texture set {string} via API",
    async ({ page }, name: string) => {
        const baseUrl = process.env.API_BASE_URL || "http://localhost:8090";

        // Create a texture set
        const createRes = await page.request.post(`${baseUrl}/texture-sets`, {
            data: { Name: name },
        });
        expect(createRes.ok()).toBe(true);
        const created = await createRes.json();
        apiPermDeleteState.textureSetId = created.id ?? created.Id;
        console.log(
            `[Setup] Created texture set "${name}" (ID: ${apiPermDeleteState.textureSetId})`,
        );

        // Soft-delete via API
        const deleteRes = await page.request.delete(
            `${baseUrl}/texture-sets/${apiPermDeleteState.textureSetId}`,
        );
        expect(deleteRes.ok()).toBe(true);
        console.log(`[Setup] Soft-deleted texture set "${name}"`);

        // Verify it appears in the recycled bin
        const recycledRes = await page.request.get(`${baseUrl}/recycled`);
        expect(recycledRes.ok()).toBe(true);
        const recycled = await recycledRes.json();
        const found = (recycled.textureSets || []).some(
            (ts: any) => ts.id === apiPermDeleteState.textureSetId,
        );
        expect(found).toBe(true);
        console.log(`[Verify] Texture set appears in recycled bin`);
    },
);

WhenBdd(
    "I permanently delete the recycled texture set via API",
    async ({ page }) => {
        const baseUrl = process.env.API_BASE_URL || "http://localhost:8090";
        const res = await page.request.delete(
            `${baseUrl}/recycled/textureSet/${apiPermDeleteState.textureSetId}/permanent`,
        );
        expect(res.ok()).toBe(true);
        const body = await res.json();
        expect(body.success).toBe(true);
        console.log(
            `[Action] Permanently deleted texture set ${apiPermDeleteState.textureSetId}`,
        );
    },
);

ThenBdd("the texture set should no longer exist in the database", async () => {
    const db = new DbHelper();
    try {
        const res = await db.query(
            'SELECT "Id" FROM "TextureSets" WHERE "Id" = $1',
            [apiPermDeleteState.textureSetId],
        );
        expect(res.rows.length).toBe(0);
        console.log(
            `[DB] Texture set ${apiPermDeleteState.textureSetId} permanently deleted from DB`,
        );
    } finally {
        await db.close();
    }
});
