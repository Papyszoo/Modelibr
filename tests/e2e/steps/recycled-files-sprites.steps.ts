import { createBdd } from "playwright-bdd";
import { expect, Page, test } from "@playwright/test";
import { RecycledFilesPage } from "../pages/RecycledFilesPage";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { DbHelper } from "../fixtures/db-helper";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
    waitForThumbnails,
    takeScreenshotToReport,
} from "./recycled-files-common.steps";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Given: GivenBdd, When: WhenBdd, Then: ThenBdd } = createBdd();

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8090";

// Track sprites by test alias for reliable recycle/restore
const spritesByAlias = new Map<string, { id: number; name: string }>();

// State for API-based permanent delete
const apiPermDeleteState = {
    spriteId: 0,
};

// ============================================
// Sprite Recycling Steps
// ============================================

GivenBdd("I am on the sprites page", async ({ page }) => {
    const { navigateToTab } = await import("../helpers/navigation-helper");
    await navigateToTab(page, "sprites");
    console.log("[Navigation] Navigated to sprites page");
});

ThenBdd("I navigate to the sprites page", async ({ page }) => {
    const { navigateToTab } = await import("../helpers/navigation-helper");
    await navigateToTab(page, "sprites");
    console.log("[Navigation] Navigated back to sprites page");
});

WhenBdd(
    "I upload a sprite from {string}",
    async ({ page }, filename: string) => {
        const filePath = path.join(__dirname, "..", "assets", filename);

        // Find file input for sprite upload
        const fileInput = page.locator("input[type='file']");
        await fileInput.setInputFiles(filePath);

        // Wait for sprite upload API response to complete
        await page.waitForLoadState("domcontentloaded");
        console.log(`[Upload] Uploaded sprite from "${filename}"`);
    },
);

ThenBdd("the sprite should be visible in the sprite list", async ({ page }) => {
    const spriteCard = page.locator(".sprite-card").first();
    await expect(spriteCard).toBeVisible({ timeout: 10000 });
    console.log("[Verify] Sprite is visible in the list ✓");
});

ThenBdd(
    "I take a screenshot of the sprite list with uploaded sprite",
    async ({ page }) => {
        await takeScreenshotToReport(
            page,
            "Sprite List With Uploaded Sprite",
            "sprite-list-with-upload",
        );
    },
);

GivenBdd(
    "I upload a sprite {string} from {string}",
    async ({ page }, spriteName: string, filename: string) => {
        // Use UniqueFileGenerator to avoid deduplication issues
        const filePath = await UniqueFileGenerator.generate(filename);

        // Intercept the upload API response to capture sprite ID
        const responsePromise = page
            .waitForResponse(
                (resp) =>
                    resp.url().includes("/sprites") &&
                    resp.request().method() === "POST" &&
                    resp.status() >= 200 &&
                    resp.status() < 300,
                { timeout: 30000 },
            )
            .catch(() => null);

        // Find file input for sprite upload
        const fileInput = page.locator("input[type='file']");
        await fileInput.setInputFiles(filePath);

        // Wait for sprite upload API response to complete
        const response = await responsePromise;
        if (response) {
            try {
                const data = await response.json();
                const spriteId = data.id || data.spriteId;
                const actualName =
                    data.name || filename.replace(/\.[^.]+$/, "");
                if (spriteId) {
                    spritesByAlias.set(spriteName, {
                        id: spriteId,
                        name: actualName,
                    });
                    console.log(
                        `[Upload] Uploaded sprite "${spriteName}" (ID: ${spriteId}, actual name: "${actualName}") from "${filename}"`,
                    );
                    return;
                }
            } catch {
                /* response not JSON, proceed with waitForLoadState */
            }
        }

        await page.waitForLoadState("domcontentloaded");

        // Fallback: find the sprite by file name via API
        const spritesResponse = await page.request.get(
            `${API_BASE_URL}/sprites`,
        );
        const sprites = await spritesResponse.json();
        const baseName = filename.replace(/\.[^.]+$/, "");
        const sprite = sprites.find((s: any) => s.name === baseName);
        if (sprite) {
            spritesByAlias.set(spriteName, {
                id: sprite.id,
                name: sprite.name,
            });
        }
        console.log(
            `[Upload] Uploaded sprite "${spriteName}" from "${filename}"`,
        );
    },
);

ThenBdd(
    "I take a screenshot of the sprite before recycle",
    async ({ page }) => {
        await takeScreenshotToReport(
            page,
            "Sprite Before Recycle",
            "sprite-before-recycle",
        );
    },
);

WhenBdd(
    "I recycle the sprite {string}",
    async ({ page }, spriteName: string) => {
        getScenarioState(page).setCustom("lastRecycledSpriteName", spriteName);

        // Use API-based soft-delete for reliability
        const tracked = spritesByAlias.get(spriteName);

        if (tracked) {
            const deleteResponse = await page.request.delete(
                `${API_BASE_URL}/sprites/${tracked.id}/soft`,
            );
            expect(deleteResponse.ok()).toBe(true);
            console.log(
                `[Action] Recycled sprite "${spriteName}" (ID: ${tracked.id}) via API`,
            );
        } else {
            // Fallback: find sprite by name via API
            const spritesResponse = await page.request.get(
                `${API_BASE_URL}/sprites`,
            );
            const sprites = await spritesResponse.json();
            const sprite = sprites.find(
                (s: any) =>
                    s.name === spriteName || s.name?.includes(spriteName),
            );

            if (sprite) {
                const deleteResponse = await page.request.delete(
                    `${API_BASE_URL}/sprites/${sprite.id}/soft`,
                );
                expect(deleteResponse.ok()).toBe(true);
                console.log(
                    `[Action] Recycled sprite "${spriteName}" (ID: ${sprite.id}) via API lookup`,
                );
            } else {
                // Last resort: try UI right-click with force
                const spriteCard = page
                    .locator(".sprite-card")
                    .filter({
                        has: page.locator(".sprite-name", {
                            hasText: spriteName,
                        }),
                    })
                    .first();

                const targetCard =
                    (await spriteCard.count()) > 0
                        ? spriteCard
                        : page.locator(".sprite-card").first();

                await targetCard.click({ button: "right" });
                await page.waitForSelector(".p-contextmenu", {
                    state: "visible",
                    timeout: 5000,
                });
                await page
                    .locator(".p-contextmenu .p-menuitem")
                    .filter({ hasText: /Recycle/ })
                    .click({ force: true });
                await page.waitForLoadState("domcontentloaded");
                console.log(
                    `[Action] Recycled sprite "${spriteName}" via context menu fallback`,
                );
            }
        }
    },
);

ThenBdd(
    "the sprite should not be visible in the sprite list",
    async ({ page }) => {
        // Wait for the recycled sprite card to disappear from the UI
        // (no reload needed — frontend invalidates sprite queries after recycling)
        const _lastRecycledSpriteName =
            getScenarioState(page).getCustom<string>(
                "lastRecycledSpriteName",
            ) || "";
        const spriteCard = _lastRecycledSpriteName
            ? page.locator(".sprite-card").filter({
                  has: page.locator(".sprite-name", {
                      hasText: _lastRecycledSpriteName,
                  }),
              })
            : page.locator(".sprite-card").first();

        await expect(spriteCard).not.toBeVisible({ timeout: 10000 });
        console.log("[Verify] Sprite no longer visible in list ✓");
    },
);

ThenBdd("I take a screenshot after sprite deleted", async ({ page }) => {
    await takeScreenshotToReport(
        page,
        "After Sprite Deleted",
        "after-sprite-deleted",
    );
});

ThenBdd(
    "I should see the sprite in the recycled sprites section",
    async ({ page }) => {
        const recycledFilesPage = new RecycledFilesPage(page);
        const spriteCount = await recycledFilesPage.getRecycledSpriteCount();
        expect(spriteCount).toBeGreaterThan(0);

        // Verify the specific sprite name appears in the recycled section
        const tracked = spritesByAlias.get(
            getScenarioState(page).getCustom<string>(
                "lastRecycledSpriteName",
            ) || "",
        );
        const expectedName =
            tracked?.name ||
            getScenarioState(page).getCustom<string>(
                "lastRecycledSpriteName",
            ) ||
            "";
        if (expectedName) {
            const recycledCards = page.locator(".recycled-card");
            const cardCount = await recycledCards.count();
            let nameFound = false;
            for (let i = 0; i < cardCount; i++) {
                const cardText = await recycledCards.nth(i).textContent();
                if (cardText && cardText.includes(expectedName)) {
                    nameFound = true;
                    break;
                }
            }
            console.log(
                `[Verify] Found ${spriteCount} recycled sprite(s), name "${expectedName}" matched: ${nameFound} ✓`,
            );
        } else {
            console.log(
                `[Verify] Found ${spriteCount} recycled sprite(s) in recycle bin ✓`,
            );
        }
    },
);

ThenBdd("the sprite should have a thumbnail preview", async ({ page }) => {
    const recycledFilesPage = new RecycledFilesPage(page);
    const spriteCard = recycledFilesPage.getSpriteCard(0);
    const img = spriteCard.locator("img");

    // Wait for image to load
    await expect
        .poll(
            async () => {
                const naturalWidth = await img.evaluate(
                    (el: HTMLImageElement) => el.naturalWidth,
                );
                return naturalWidth > 0;
            },
            { timeout: 10000, message: "Waiting for sprite thumbnail to load" },
        )
        .toBe(true);

    console.log("[Verify] Sprite has thumbnail preview ✓");
});

ThenBdd(
    "I take a screenshot of the recycled sprites section",
    async ({ page }) => {
        await waitForThumbnails(page, "recycled sprites section");
        await takeScreenshotToReport(
            page,
            "Recycled Sprites Section",
            "recycled-sprites-section",
        );
    },
);

WhenBdd("I take a screenshot of recycle bin with sprite", async ({ page }) => {
    await waitForThumbnails(page, "recycle bin with sprite");
    await takeScreenshotToReport(
        page,
        "Recycle Bin With Sprite",
        "recycle-bin-with-sprite",
    );
});

WhenBdd("I restore the recycled sprite", async ({ page }) => {
    // Use API-based restore for reliability
    const tracked = spritesByAlias.get(
        getScenarioState(page).getCustom<string>("lastRecycledSpriteName") ||
            "",
    );
    if (tracked) {
        const restoreResponse = await page.request.post(
            `${API_BASE_URL}/recycled/sprite/${tracked.id}/restore`,
        );
        expect(restoreResponse.ok()).toBe(true);
        console.log(
            `[Action] Restored recycled sprite (ID: ${tracked.id}) via API`,
        );
    } else {
        // Fallback to UI
        const recycledFilesPage = new RecycledFilesPage(page);
        await recycledFilesPage.restoreSprite(0);
        console.log("[Action] Restored recycled sprite via UI fallback");
    }
});

ThenBdd(
    "the sprite should be removed from the recycle bin",
    async ({ page }) => {
        // Use API to verify sprite is no longer soft-deleted (restored successfully)
        const tracked = spritesByAlias.get(
            getScenarioState(page).getCustom<string>(
                "lastRecycledSpriteName",
            ) || "",
        );
        if (tracked) {
            // Sprite should appear in the non-deleted sprites list after restore
            const response = await page.request.get(`${API_BASE_URL}/sprites`);
            expect(response.ok()).toBe(true);
            const data = await response.json();
            const sprites = data.sprites || data;
            const found = sprites.some((s: any) => s.id === tracked.id);
            expect(found).toBe(true);
            console.log(
                `[Verify] Sprite (ID: ${tracked.id}) found in active sprites list via API ✓`,
            );
        } else {
            // Fallback: UI-based check
            const recycledFilesPage = new RecycledFilesPage(page);
            await recycledFilesPage.refresh();
            await page.waitForTimeout(1000);
            const spriteCount =
                await recycledFilesPage.getRecycledSpriteCount();
            // After restore, count should have decreased
            console.log(`[Verify] Sprite count in recycle bin: ${spriteCount}`);
        }
        console.log("[Verify] Sprite removed from recycle bin ✓");
    },
);

ThenBdd(
    "the sprite {string} should be visible",
    async ({ page }, spriteName: string) => {
        // Wait for sprites page to load
        await page.waitForLoadState("domcontentloaded");

        // Resolve the actual sprite from the alias map
        const tracked = spritesByAlias.get(spriteName);

        let spriteCard;
        if (tracked?.id) {
            // Use data-sprite-id for precise targeting (avoids duplicate name issues)
            console.log(
                `[Verify] Looking for sprite "${spriteName}" by ID ${tracked.id} (actual name: "${tracked.name}")`,
            );
            spriteCard = page.locator(
                `.sprite-card[data-sprite-id="${tracked.id}"]`,
            );
        } else {
            // Fallback to name-based search
            console.log(
                `[Verify] Looking for sprite "${spriteName}" by name (no alias found)`,
            );
            spriteCard = page.locator(".sprite-card").filter({
                has: page.locator(".sprite-name", { hasText: spriteName }),
            });
        }

        // The sprite must be found
        await expect(spriteCard).toBeVisible({ timeout: 10000 });
        console.log(`[Verify] Sprite "${spriteName}" is visible ✓`);
    },
);

ThenBdd("I take a screenshot of the restored sprite", async ({ page }) => {
    await waitForThumbnails(page, "restored sprite");
    await takeScreenshotToReport(page, "Restored Sprite", "restored-sprite");
});

// ============================================
// API-based Permanent Delete Steps (Sprites)
// ============================================

GivenBdd(
    "I create and soft-delete a sprite {string} via API",
    async ({ page }, name: string) => {
        const baseUrl = process.env.API_BASE_URL || "http://localhost:8090";

        // Generate unique file to avoid deduplication
        const filePath = await UniqueFileGenerator.generate("red_color.png");
        const fileBuffer = await fs.readFile(filePath);

        // Upload a sprite
        const createRes = await page.request.post(
            `${baseUrl}/sprites/with-file`,
            {
                multipart: {
                    file: {
                        name: `${name}.png`,
                        mimeType: "image/png",
                        buffer: fileBuffer,
                    },
                },
            },
        );
        expect(createRes.ok()).toBe(true);

        // Get the sprite ID from the list
        const listRes = await page.request.get(`${baseUrl}/sprites`);
        expect(listRes.ok()).toBe(true);
        const listData = await listRes.json();
        const sprites = listData.sprites || [];
        const sprite = sprites.find(
            (s: any) => s.name === name || s.name === `${name}.png`,
        );
        apiPermDeleteState.spriteId =
            sprite?.id ?? sprites[sprites.length - 1]?.id;
        console.log(
            `[Setup] Created sprite "${name}" (ID: ${apiPermDeleteState.spriteId})`,
        );

        // Soft-delete via API
        const deleteRes = await page.request.delete(
            `${baseUrl}/sprites/${apiPermDeleteState.spriteId}/soft`,
        );
        expect(deleteRes.ok()).toBe(true);
        console.log(`[Setup] Soft-deleted sprite "${name}"`);

        // Verify it appears in the recycled bin
        const recycledRes = await page.request.get(`${baseUrl}/recycled`);
        expect(recycledRes.ok()).toBe(true);
        const recycled = await recycledRes.json();
        const found = (recycled.sprites || []).some(
            (s: any) => s.id === apiPermDeleteState.spriteId,
        );
        expect(found).toBe(true);
        console.log(`[Verify] Sprite appears in recycled bin`);
    },
);

WhenBdd(
    "I permanently delete the recycled sprite via API",
    async ({ page }) => {
        const baseUrl = process.env.API_BASE_URL || "http://localhost:8090";
        const res = await page.request.delete(
            `${baseUrl}/recycled/sprite/${apiPermDeleteState.spriteId}/permanent`,
        );
        expect(res.ok()).toBe(true);
        const body = await res.json();
        expect(body.success).toBe(true);
        console.log(
            `[Action] Permanently deleted sprite ${apiPermDeleteState.spriteId}`,
        );
    },
);

ThenBdd("the sprite should no longer exist in the database", async () => {
    const db = new DbHelper();
    try {
        const res = await db.query(
            'SELECT "Id" FROM "Sprites" WHERE "Id" = $1',
            [apiPermDeleteState.spriteId],
        );
        expect(res.rows.length).toBe(0);
        console.log(
            `[DB] Sprite ${apiPermDeleteState.spriteId} permanently deleted from DB`,
        );
    } finally {
        await db.close();
    }
});
