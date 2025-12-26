import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ModelListPage } from "../pages/ModelListPage";
import { SignalRHelper } from "../fixtures/signalr-helper";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Given, When, Then } = createBdd();

Given("I am on the model list page", async ({ page }) => {
    const modelList = new ModelListPage(page);
    await modelList.goto();
});

When("I upload a 3D model {string}", async ({ page }, fileName: string) => {
    const modelList = new ModelListPage(page);
    const filePath = path.join(__dirname, "..", "assets", fileName);
    await modelList.uploadModel(filePath);
});

Then(
    "I should see {string} in the model list",
    async ({ page }, modelName: string) => {
        const modelList = new ModelListPage(page);
        await modelList.expectModelVisible(modelName);
    }
);

Then(
    "I should receive a {string} notification via SignalR",
    async ({ page }, target: string) => {
        const signalR = new SignalRHelper(page);
        // We wait for the ThumbnailStatusChanged message on the thumbnailHub
        await signalR.waitForMessage("/thumbnailHub", target);
    }
);

Then(
    "the model status should eventually be {string}",
    async ({ page }, status: string) => {
        // The model grid doesn't show "Ready" text - it shows thumbnails when ready
        // Wait for a model card to appear with either a thumbnail image or placeholder
        // A "Ready" status means the thumbnail should be loaded
        if (status.toLowerCase() === "ready") {
            // Wait for a thumbnail image to appear in any model card
            await expect(
                page
                    .locator(".model-card .thumbnail-image, .model-card .thumbnail-image-container img")
                    .first()
            ).toBeVisible({
                timeout: 90000, // Give worker time to process
            });
        } else {
            // For other statuses, look for the thumbnail placeholder
            await expect(
                page
                    .locator(".model-card .thumbnail-placeholder")
                    .first()
            ).toBeVisible({
                timeout: 30000,
            });
        }
    }
);
