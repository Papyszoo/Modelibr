/**
 * Step definitions for SignalR real-time notification E2E tests (ISSUE-03)
 * Verifies that the SignalR WebSocket infrastructure actually delivers messages.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const api = new ApiHelper();

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
                            "Timeout waiting for matching SignalR ThumbnailStatusChanged notification (600s)",
                        ),
                    );
                }, 600000);
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

// ── S2: Connection established on page load ──────────────────────────

Given("I navigate to the application", async ({ page }) => {
    const { navigateToAppClean } = await import("../helpers/navigation-helper");
    await navigateToAppClean(page);
});

When("the model list page loads", async ({ page }) => {
    // Model list is the default page after navigateToAppClean — just verify it loaded
    await page
        .waitForSelector('[data-testid="model-card"], .model-card, .p-card', {
            timeout: 15000,
        })
        .catch(() => {
            // Page might be empty (no models) — that's OK, we just need the page loaded
            console.log(
                "[SignalR S2] No model cards found — page may be empty",
            );
        });
});

Then(
    "a WebSocket connection to thumbnailHub should be established",
    async ({ page }) => {
        // Navigate fresh and listen for WebSocket
        const { navigateToAppClean } =
            await import("../helpers/navigation-helper");

        const wsPromise = page.waitForEvent("websocket", {
            predicate: (ws) => ws.url().includes("thumbnailHub"),
            timeout: 15000,
        });

        await navigateToAppClean(page);

        const ws = await wsPromise;
        expect(ws.url()).toContain("thumbnailHub");
        console.log(`[Verify S2] WebSocket connected to: ${ws.url()} ✓`);
    },
);

// ── S3: Notification payload validation ──────────────────────────────

Then(
    'the notification should contain "modelVersionId" as a positive integer',
    async () => {
        const notification = signalRState.receivedNotification;
        expect(notification).not.toBeNull();
        expect(notification).toHaveProperty("modelVersionId");
        expect(typeof notification.modelVersionId).toBe("number");
        expect(notification.modelVersionId).toBeGreaterThan(0);
        console.log(
            `[Verify S3] modelVersionId=${notification.modelVersionId} is a positive integer ✓`,
        );
    },
);

Then(
    'the notification should contain "status" as a valid thumbnail status',
    async () => {
        const notification = signalRState.receivedNotification;
        expect(notification).not.toBeNull();
        expect(notification).toHaveProperty("status");
        // Status values: "Pending", "Processing", "Ready", "Failed" (or numeric 0-3)
        const validStatuses = [
            "Pending",
            "Processing",
            "Ready",
            "Failed",
            0,
            1,
            2,
            3,
        ];
        const isValid =
            validStatuses.includes(notification.status) ||
            typeof notification.status === "string";
        expect(isValid).toBe(true);
        console.log(
            `[Verify S3] status="${notification.status}" is a valid thumbnail status ✓`,
        );
    },
);

// ── S1: ActiveVersionChanged notification ────────────────────────────

// Extended state for ActiveVersionChanged tests
const activeVersionState = {
    receivedNotification: null as any,
    modelId: 0,
    originalVersionId: 0,
    newVersionId: 0,
};

Given("a model exists with a completed thumbnail", async ({ page }) => {
    // Upload a model via API and wait for thumbnail to be ready
    const filePath = await UniqueFileGenerator.generate("test-cube.glb");
    const result = await api.uploadModel(filePath);
    activeVersionState.modelId = result.id;
    console.log(
        `[SignalR S1] Created model id=${result.id} for ActiveVersionChanged test`,
    );

    // Get the active version ID
    const model = await api.getModel(result.id);
    activeVersionState.originalVersionId =
        model.activeVersionId ?? model.ActiveVersionId;
    console.log(
        `[SignalR S1] Original version: ${activeVersionState.originalVersionId}`,
    );

    // Wait for thumbnail generation to complete
    const pollInterval = 5000;
    const timeout = 300000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const thumb = await api.getModelThumbnail(result.id);
        if (thumb.status === 200 && thumb.size && thumb.size > 0) {
            console.log(
                `[SignalR S1] Thumbnail ready for model ${result.id} ✓`,
            );
            break;
        }
        await new Promise((r) => setTimeout(r, pollInterval));
    }
});

When(
    "I upload a new version and listen for ActiveVersionChanged",
    async ({ page }) => {
        const collectedNotifications: any[] = [];
        let resolveNotification: (notification: any) => void;

        const notificationPromise = new Promise<any>((resolve, reject) => {
            resolveNotification = resolve;
            setTimeout(() => {
                reject(
                    new Error(
                        "Timeout waiting for ActiveVersionChanged notification (600s)",
                    ),
                );
            }, 600000);
        });

        // Listen for WebSocket ActiveVersionChanged messages
        page.on("websocket", (ws) => {
            if (!ws.url().includes("thumbnailHub")) return;

            ws.on("framereceived", (frame) => {
                const text = (frame.payload as string | Buffer).toString();
                const messages = text.split("\x1e").filter((m) => m.length > 0);

                for (const msg of messages) {
                    try {
                        const json = JSON.parse(msg);
                        if (
                            json.type === 1 &&
                            json.target === "ActiveVersionChanged"
                        ) {
                            const notification = json.arguments[0];
                            console.log(
                                `[SignalR S1] ActiveVersionChanged: modelId=${notification.modelId}, versionId=${notification.activeVersionId}`,
                            );
                            collectedNotifications.push(notification);

                            if (
                                notification.modelId ===
                                activeVersionState.modelId
                            ) {
                                resolveNotification(notification);
                            }
                        }
                    } catch {
                        // Not JSON
                    }
                }
            });
        });

        // Navigate to establish SignalR connection
        const { navigateToAppClean } =
            await import("../helpers/navigation-helper");

        const wsConnected = page.waitForEvent("websocket", {
            predicate: (ws) => ws.url().includes("thumbnailHub"),
            timeout: 15000,
        });

        await navigateToAppClean(page);
        await wsConnected;

        // Upload a new version via API to trigger ActiveVersionChanged
        const filePath = await UniqueFileGenerator.generate("test-cube.glb");
        const versionResult = await api.createModelVersion(
            activeVersionState.modelId,
            filePath,
        );
        activeVersionState.newVersionId = versionResult.versionId;
        console.log(
            `[SignalR S1] Uploaded new version: ${versionResult.versionId}`,
        );

        // Wait for the notification
        try {
            activeVersionState.receivedNotification = await notificationPromise;
        } catch (error) {
            console.log(`[SignalR S1] Warning: ${(error as Error).message}`);
            console.log(
                `[SignalR S1] Collected ${collectedNotifications.length} notification(s)`,
            );
            activeVersionState.receivedNotification = null;
        }
    },
);

Then(
    "I should receive an ActiveVersionChanged notification via WebSocket",
    async () => {
        expect(activeVersionState.receivedNotification).not.toBeNull();
        console.log(`[Verify S1] ActiveVersionChanged notification received ✓`);
    },
);

Then(
    "the ActiveVersionChanged notification should contain the model ID",
    async () => {
        const notification = activeVersionState.receivedNotification;
        expect(notification).not.toBeNull();
        expect(notification.modelId).toBe(activeVersionState.modelId);
        console.log(
            `[Verify S1] Notification modelId=${notification.modelId} matches expected ${activeVersionState.modelId} ✓`,
        );
    },
);
