/**
 * Step definitions for SignalR real-time notification E2E tests (ISSUE-03)
 * Verifies that the SignalR WebSocket infrastructure actually delivers messages.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State for SignalR test
const signalRState = {
    receivedNotification: null as any,
    uploadedModelId: 0,
    uploadedVersionId: 0,
};

When(
    "I upload a model and listen for SignalR thumbnail notification",
    async ({ page }) => {
        // Collect ALL ThumbnailStatusChanged notifications — we'll filter by
        // version ID after the upload completes, to avoid race conditions
        // where notifications from prior tests arrive first.
        const collectedNotifications: any[] = [];
        let resolveMatchingNotification: (notification: any) => void;
        let targetVersionId: number | null = null;

        const matchingNotificationPromise = new Promise<any>(
            (resolve, reject) => {
                resolveMatchingNotification = resolve;
                setTimeout(() => {
                    reject(
                        new Error(
                            "Timeout waiting for matching SignalR ThumbnailStatusChanged notification (60s)",
                        ),
                    );
                }, 60000);
            },
        );

        // Listen for WebSocket connections to the thumbnailHub
        page.on("websocket", (ws) => {
            if (!ws.url().includes("thumbnailHub")) return;

            console.log(`[SignalR] WebSocket connected to: ${ws.url()}`);

            ws.on("framereceived", (frame) => {
                const payload = frame.payload as string | Buffer;
                const text = payload.toString();

                // SignalR messages are separated by \x1e (record separator)
                const messages = text.split("\x1e").filter((m) => m.length > 0);

                for (const msg of messages) {
                    try {
                        const json = JSON.parse(msg);
                        // SignalR invocation message: type=1, target=method name
                        if (
                            json.type === 1 &&
                            json.target === "ThumbnailStatusChanged"
                        ) {
                            const notification = json.arguments[0];
                            console.log(
                                `[SignalR] Received ThumbnailStatusChanged: versionId=${notification.modelVersionId}, status=${notification.status}`,
                            );
                            collectedNotifications.push(notification);

                            // If we already know the target version ID, check for match
                            if (
                                targetVersionId !== null &&
                                notification.modelVersionId === targetVersionId
                            ) {
                                console.log(
                                    `[SignalR] Matched target version ${targetVersionId} ✓`,
                                );
                                resolveMatchingNotification(notification);
                            }
                        }
                    } catch {
                        // Not JSON or incomplete message
                    }
                }
            });
        });

        // Navigate to model list to establish SignalR connection
        const { navigateToAppClean } =
            await import("../helpers/navigation-helper");

        // Set up a promise to wait for the SignalR WebSocket connection
        const wsConnected = page.waitForEvent("websocket", {
            predicate: (ws) => ws.url().includes("thumbnailHub"),
            timeout: 15000,
        });

        await navigateToAppClean(page);

        // Wait for SignalR WebSocket connection to thumbnailHub
        await wsConnected;

        // Upload a model to trigger thumbnail generation
        const filePath = await UniqueFileGenerator.generate("test-cube.glb");

        const fileInput = page.locator("input[type='file']");
        const uploadResponsePromise = page.waitForResponse(
            (resp) =>
                resp.url().includes("/models") &&
                resp.request().method() === "POST" &&
                resp.status() >= 200 &&
                resp.status() < 300,
        );
        await fileInput.setInputFiles(filePath);

        const uploadResponse = await uploadResponsePromise;
        const uploadData = await uploadResponse.json();
        signalRState.uploadedModelId = uploadData.id;
        console.log(
            `[Upload] Model uploaded (ID: ${signalRState.uploadedModelId})`,
        );

        // The upload response only returns { id, alreadyExists }.
        // Fetch the model details to get the activeVersionId.
        const modelDetailsResponse = await page.request.get(
            `${API_BASE}/models/${signalRState.uploadedModelId}`,
        );
        if (modelDetailsResponse.ok()) {
            const modelDetails = await modelDetailsResponse.json();
            signalRState.uploadedVersionId =
                modelDetails.activeVersionId ?? modelDetails.ActiveVersionId;
            console.log(
                `[Upload] Active version ID: ${signalRState.uploadedVersionId}`,
            );
        } else {
            console.log(
                `[Warning] Could not fetch model details: ${modelDetailsResponse.status()}`,
            );
        }

        // Now that we know the version ID, check if we already received it
        targetVersionId = signalRState.uploadedVersionId;
        const alreadyReceived = collectedNotifications.find(
            (n) => n.modelVersionId === targetVersionId,
        );
        if (alreadyReceived) {
            console.log(
                `[SignalR] Already received notification for version ${targetVersionId} ✓`,
            );
            signalRState.receivedNotification = alreadyReceived;
        } else {
            // Wait for the matching notification to arrive
            try {
                signalRState.receivedNotification =
                    await matchingNotificationPromise;
                console.log(
                    `[SignalR] Notification received for version ${targetVersionId} ✓`,
                );
            } catch (error) {
                console.log(`[SignalR] Warning: ${(error as Error).message}`);
                console.log(
                    `[SignalR] Collected ${collectedNotifications.length} notification(s): ${collectedNotifications.map((n) => n.modelVersionId).join(", ")}`,
                );
                signalRState.receivedNotification = null;
            }
        }
    },
);

Then(
    "I should receive a thumbnail status changed notification via WebSocket",
    async () => {
        expect(signalRState.receivedNotification).not.toBeNull();
        console.log(
            `[Verify] SignalR ThumbnailStatusChanged notification received ✓`,
        );
    },
);

Then(
    "the thumbnail notification should contain valid model version data",
    async () => {
        const notification = signalRState.receivedNotification;
        expect(notification).not.toBeNull();

        // The notification should contain modelVersionId and status fields
        // Status: 0=Pending, 1=Processing, 2=Ready, 3=Failed
        expect(notification).toHaveProperty("modelVersionId");
        expect(notification).toHaveProperty("status");
        expect(notification.modelVersionId).toBe(
            signalRState.uploadedVersionId,
        );

        console.log(
            `[Verify] Notification data: modelVersionId=${notification.modelVersionId}, status=${notification.status} ✓`,
        );
    },
);
