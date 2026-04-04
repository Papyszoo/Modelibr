import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ModelListPage } from "../pages/ModelListPage";
import { SignalRHelper } from "../fixtures/signalr-helper";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Given, When, Then } = createBdd();

Given("I am on the model list page", async ({ page }) => {
    // Cleanup now runs once in global-setup.ts (before any workers start)
    const modelList = new ModelListPage(page);
    await modelList.goto();
});

When("I upload a 3D model {string}", async ({ page }, fileName: string) => {
    const modelList = new ModelListPage(page);
    // Use UniqueFileGenerator to get a unique copy (avoids deduplication)
    const filePath = await UniqueFileGenerator.generate(fileName);
    await modelList.uploadModel(filePath);
});

Then(
    "I should see {string} in the model list",
    async ({ page }, modelName: string) => {
        const modelList = new ModelListPage(page);
        await modelList.expectModelVisible(modelName);
    },
);

Then(
    "I should receive a {string} notification via SignalR",
    async ({ page }, target: string) => {
        const signalR = new SignalRHelper(page);
        // We wait for the ThumbnailStatusChanged message on the thumbnailHub
        await signalR.waitForMessage("/thumbnailHub", target);
    },
);

Then(
    "the model status should eventually be {string}",
    async ({ page }, status: string) => {
        // The model grid doesn't show "Ready" text - it shows thumbnails when ready
        // Wait for a model card to appear with either a thumbnail image or placeholder
        // A "Ready" status means the thumbnail should be loaded
        if (status.toLowerCase() === "ready") {
            const thumbnailSelector =
                ".model-card .thumbnail-image, .model-card .thumbnail-image-container img";

            // With VirtuosoGrid only visible model cards have DOM elements.
            // First try: wait for SignalR to push the thumbnail status update
            // into the React Query cache, which triggers a re-render.
            const found = await page
                .locator(thumbnailSelector)
                .first()
                .waitFor({ state: "visible", timeout: 120000 })
                .then(() => true)
                .catch(() => false);

            if (!found) {
                // Fallback: SignalR may have missed the event or React Query
                // cache still holds stale "Pending" status. Reload the page so
                // useThumbnail fetches fresh data from the API.
                console.log(
                    "[Fallback] Thumbnail not visible after 120s via SignalR, refreshing page...",
                );
                await page.reload({ waitUntil: "domcontentloaded" });
                await page.waitForSelector(
                    ".model-card, .no-results, .empty-state",
                    { state: "visible", timeout: 15000 },
                );
                await expect(
                    page.locator(thumbnailSelector).first(),
                ).toBeVisible({
                    timeout: 60000,
                });
            }
        } else {
            // For other statuses, look for the thumbnail placeholder
            await expect(
                page.locator(".model-card .thumbnail-placeholder").first(),
            ).toBeVisible({
                timeout: 30000,
            });
        }
    },
);
