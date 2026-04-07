import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { ModelListPage } from "../pages/ModelListPage";
import { SignalRHelper } from "../fixtures/signalr-helper";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { getScenarioState } from "../fixtures/shared-state";
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
    getScenarioState(page).uploadTrackerModelName = path.parse(fileName).name;
    getScenarioState(page).uploadTrackerVersionId = 0;
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
        if (status.toLowerCase() === "ready") {
            const { DbHelper } = await import("../fixtures/db-helper");
            const db = new DbHelper();
            const trackedModelName =
                getScenarioState(page).uploadTrackerModelName;

            if (!trackedModelName) {
                throw new Error(
                    "No uploaded model name tracked for readiness verification",
                );
            }

            const query = `SELECT t."Status", m."Id" as "ModelId", m."Name" as "ModelName", mv."Id" as "VersionId"
                           FROM "ModelVersions" mv
                           JOIN "Models" m ON m."Id" = mv."ModelId"
                           LEFT JOIN "Thumbnails" t ON t."Id" = mv."ThumbnailId"
                           WHERE m."DeletedAt" IS NULL AND m."Name" = $1
                           ORDER BY mv."CreatedAt" DESC
                           LIMIT 1`;

            let trackedModelId: number | null = null;

            await expect
                .poll(
                    async () => {
                        const result = await db.query(query, [
                            trackedModelName,
                        ]);
                        if (result.rows.length === 0) {
                            console.log(
                                `[Status] Waiting for uploaded model \"${trackedModelName}\" to appear in database...`,
                            );
                            return -1;
                        }

                        const row = result.rows[0];
                        trackedModelId = row.ModelId;

                        if (row.Status === 3) {
                            throw new Error(
                                `Thumbnail generation failed for \"${row.ModelName}\" (model=${row.ModelId}, version=${row.VersionId})`,
                            );
                        }

                        console.log(
                            `[Status] Model \"${row.ModelName}\" thumbnail status=${row.Status ?? "null"} (model=${row.ModelId}, version=${row.VersionId})`,
                        );
                        return row.Status ?? -1;
                    },
                    {
                        message: `Waiting for model \"${trackedModelName}\" to reach thumbnail Ready state`,
                        timeout: 240000,
                        intervals: [3000],
                    },
                )
                .toBe(2);

            await page.reload({ waitUntil: "domcontentloaded" });
            await page.waitForSelector(
                ".model-card, .no-results, .empty-state",
                {
                    state: "visible",
                    timeout: 15000,
                },
            );

            const modelCard = trackedModelId
                ? page
                      .locator(`.model-card[data-model-id="${trackedModelId}"]`)
                      .first()
                : page
                      .locator(".model-card")
                      .filter({ hasText: trackedModelName })
                      .first();

            await expect(modelCard).toBeVisible({ timeout: 15000 });

            const readyThumbnail = modelCard.locator(
                ".thumbnail-image, .thumbnail-image-container img, .thumbnail-placeholder[aria-label='No thumbnail available']",
            );

            await expect(readyThumbnail.first()).toBeVisible({
                timeout: 15000,
            });
            console.log(
                `[Verify] Model \"${trackedModelName}\" reached Ready status and rendered its final thumbnail state ✓`,
            );

            getScenarioState(page).uploadTrackerModelName = null;
            getScenarioState(page).uploadTrackerVersionId = 0;
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
