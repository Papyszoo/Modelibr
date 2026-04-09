import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    ciVideoTimeout,
    createRecordedPage,
    shortPause,
    mediumPause,
    viewerPause,
    smoothDrag,
    navigateTo,
    waitForModelCards,
    waitForThumbnails,
    clearAllData,
    disableHighlights,
} from "../helpers/video-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../../../tests/e2e/assets");
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

test.describe("Model Management", () => {
    test("Model Management Video", async ({ browser, page: setupPage, request }, testInfo) => {
        const uploadModel = async (filename: string) => {
            const response = await request.post(`${API_BASE_URL}/models`, {
                multipart: {
                    file: {
                        name: filename,
                        mimeType: "application/octet-stream",
                        buffer: fs.readFileSync(path.join(assetsDir, filename)),
                    },
                },
            });

            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            return Number(body.id ?? body.modelId);
        };

        const waitForThumbnailReady = async (modelId: number) => {
            await expect
                .poll(
                    async () => {
                        const response = await request.get(
                            `${API_BASE_URL}/models/${modelId}/thumbnail`,
                        );
                        if (!response.ok()) {
                            return `HTTP ${response.status()}`;
                        }

                        const thumbnail = await response.json();
                        return thumbnail.status;
                    },
                    {
                        timeout: 30000,
                        intervals: [500, 1000, 1500],
                    },
                )
                .toBe("Ready");
        };

        const moveToAndClick = async (locator: ReturnType<typeof page.locator>) => {
            const box = await locator.boundingBox();
            if (!box) {
                throw new Error("Could not determine element position");
            }

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
                steps: 18,
            });
            await viewerPause(page, 250);
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            await shortPause(page);
        };

        // Off-camera setup: prepare a small, thumbnail-ready library.
        await clearAllData(setupPage);

        const [primaryModelId, comparisonModelId, thirdModelId] = await Promise.all([
            uploadModel("test-cube.glb"),
            uploadModel("test-cylinder.fbx"),
            uploadModel("test-cone.fbx"),
        ]);

        await Promise.all([
            waitForThumbnailReady(primaryModelId),
            waitForThumbnailReady(comparisonModelId),
            waitForThumbnailReady(thirdModelId),
        ]);

        const { context, page } = await createRecordedPage(browser, testInfo);

        // Start on a polished split view: library on the left, hero model on the right.
        await navigateTo(
            page,
            `/?leftTabs=modelList&rightTabs=model-${primaryModelId}&activeRight=model-${primaryModelId}`,
        );
        await disableHighlights(page);
        await waitForModelCards(page, 3);
        await waitForThumbnails(page, 3, 30000);

        const leftPanel = page.locator(".p-splitter-panel").first();
        const rightPanel = page.locator(".p-splitter-panel").nth(1);

        await expect(rightPanel.locator("canvas").first()).toBeVisible({
            timeout: ciVideoTimeout,
        });
        await viewerPause(page, 400);

        // Open a second model for an immediate side-by-side comparison.
        const comparisonCard = leftPanel
            .locator(`.model-card[data-model-id="${comparisonModelId}"]`)
            .first();
        await comparisonCard.waitFor({
            state: "visible",
            timeout: ciVideoTimeout,
        });
        await moveToAndClick(comparisonCard);

        const leftCanvas = leftPanel.locator("canvas").first();
        await leftCanvas.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await viewerPause(page, 250);

        // One quick orbit to show the viewer without lingering on it.
        const canvasBox = await leftCanvas.boundingBox();
        if (canvasBox) {
            const centerX = canvasBox.x + canvasBox.width / 2;
            const centerY = canvasBox.y + canvasBox.height / 2;

            await smoothDrag(
                page,
                centerX - 30,
                centerY + 10,
                centerX + 70,
                centerY - 55,
                24,
                "left",
            );
        }
        await mediumPause(page);

        // Add a new version to the hero model.
        const fileMenu = rightPanel
            .locator(
                '.p-menubar .p-menuitem-link:has(.p-menuitem-text:text-is("File"))',
            )
            .first();
        await fileMenu.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await moveToAndClick(fileMenu);

        const addVersionItem = rightPanel
            .getByTestId("viewer-menubar")
            .getByRole("menuitem", { name: "Add New Version" });
        await addVersionItem.waitFor({
            state: "visible",
            timeout: ciVideoTimeout,
        });
        await moveToAndClick(addVersionItem);

        const versionInput = rightPanel.locator('input[type="file"]').first();
        await versionInput.setInputFiles(path.join(assetsDir, "test-torus.fbx"));

        const uploadDialog = page.locator('.p-dialog:has-text("Upload File to Model")');
        await uploadDialog.waitFor({ state: "visible", timeout: ciVideoTimeout });

        await page.getByLabel("Create new version").click();
        await shortPause(page);

        const descriptionInput = uploadDialog.locator("#description");
        if (await descriptionInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            await descriptionInput.click();
            await descriptionInput.pressSequentially("Gameplay update", {
                delay: 35,
            });
            await shortPause(page);
        }

        await uploadDialog
            .locator(".p-dialog-footer button", { hasText: "Upload" })
            .first()
            .click();

        await uploadDialog.waitFor({ state: "hidden", timeout: 60000 });

        const versionDropdown = rightPanel.getByTestId("version-dropdown-trigger");
        await moveToAndClick(versionDropdown);
        const versionTwoItem = page.getByTestId("version-dropdown-item-2");
        await versionTwoItem.waitFor({ state: "visible", timeout: ciVideoTimeout });
        await moveToAndClick(versionTwoItem);
        await expect(versionDropdown).toContainText("v2", { timeout: 10000 });
        await page.mouse.move(1040, 300, { steps: 16 });
        await viewerPause(page, 900);
        await context.close();
    });
});
