import path from "path";
import { fileURLToPath } from "url";

import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

import { DbHelper } from "../fixtures/db-helper";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import {
    createUniqueSolidHdrPayload,
    createUploadFilePayloadFromPath,
    createUniqueSolidPngPayload,
    createUniqueUploadFilePayload,
} from "../helpers/file-payload-helper";
import { clickTab } from "../helpers/navigation-helper";
import { EnvironmentMapsPage } from "../pages/EnvironmentMapsPage";
import { RecycledFilesPage } from "../pages/RecycledFilesPage";
import { UploadProgressPage } from "../pages/UploadProgressPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const REAL_HDRI_FILE = path.join(
    REPO_ROOT,
    "src",
    "frontend",
    "public",
    "hdri",
    "potsdamer_platz_1k.hdr",
);
const ENVIRONMENT_MAP_THUMBNAIL_SIGNALR_TARGET =
    "EnvironmentMapThumbnailStatusChanged";

interface DataTable {
    hashes(): Array<Record<string, string>>;
}

interface EnvironmentMapThumbnailNotification {
    environmentMapId: number;
    status?: string | number | null;
    previewUrl?: string | null;
    thumbnailUrl?: string | null;
    timestamp?: string | null;
}

interface EnvironmentMapThumbnailSignalRRuntime {
    waitForHubConnection: Promise<void>;
    setTargetEnvironmentMapId: (environmentMapId: number) => void;
    waitForMatchingNotification: () => Promise<EnvironmentMapThumbnailNotification>;
}

interface EnvironmentMapCardTransitionState {
    exists: boolean;
    hasPlaceholder: boolean;
    hasImage: boolean;
    imageSrc: string | null;
    currentSrc: string | null;
    isLoaded: boolean;
    timestamp: number;
}

async function getEnvironmentMapDetail(page: any, environmentMapId: number) {
    const response = await page.request.get(
        `${API_BASE}/environment-maps/${environmentMapId}`,
    );
    expect(response.ok()).toBe(true);
    return response.json();
}

async function assertEnvironmentMapDbState(
    environmentMapId: number,
    isDeleted: boolean,
): Promise<void> {
    const db = new DbHelper();

    try {
        const result = await db.query(
            'SELECT "Id", "DeletedAt" FROM "EnvironmentMaps" WHERE "Id" = $1',
            [environmentMapId],
        );

        expect(result.rows.length).toBe(1);
        const deletedAt =
            result.rows[0].DeletedAt ??
            result.rows[0].deletedAt ??
            result.rows[0].deletedat ??
            null;

        if (isDeleted) {
            expect(deletedAt).not.toBeNull();
        } else {
            expect(deletedAt).toBeNull();
        }
    } finally {
        await db.close();
    }
}

async function getActiveVariantCountFromDb(
    environmentMapId: number,
): Promise<number> {
    const db = new DbHelper();

    try {
        const result = await db.query(
            'SELECT COUNT(*) AS count FROM "EnvironmentMapVariants" WHERE "EnvironmentMapId" = $1 AND "DeletedAt" IS NULL',
            [environmentMapId],
        );

        return Number(result.rows[0].count);
    } finally {
        await db.close();
    }
}

async function getCubeFaceCountFromDb(environmentMapId: number): Promise<number> {
    const db = new DbHelper();

    try {
        const result = await db.query(
            `SELECT COUNT(*) AS count
             FROM "EnvironmentMapVariantFaceFiles" face_files
             INNER JOIN "EnvironmentMapVariants" variants
                ON variants."Id" = face_files."EnvironmentMapVariantId"
             WHERE variants."EnvironmentMapId" = $1
               AND variants."DeletedAt" IS NULL`,
            [environmentMapId],
        );

        return Number(result.rows[0].count);
    } finally {
        await db.close();
    }
}

function getStoredEnvironmentMap(page: any, alias: string) {
    const environmentMap = getScenarioState(page).getEnvironmentMap(alias);
    expect(environmentMap, `Environment map "${alias}" not found in state`).toBeDefined();
    return environmentMap!;
}

function initializeEnvironmentMapThumbnailSignalRRuntime(page: any) {
    const scenarioState = getScenarioState(page);
    if (
        scenarioState.getCustom<EnvironmentMapThumbnailSignalRRuntime>(
            "environmentMapThumbnailSignalRRuntime",
        )
    ) {
        return;
    }

    const collectedNotifications: EnvironmentMapThumbnailNotification[] = [];
    let targetEnvironmentMapId: number | null = null;
    let hubConnected = false;
    let resolveHubConnection!: () => void;
    let resolveMatchingNotification!: (
        notification: EnvironmentMapThumbnailNotification,
    ) => void;

    const waitForHubConnection = new Promise<void>((resolve, reject) => {
        resolveHubConnection = resolve;
        setTimeout(() => {
            if (!hubConnected) {
                reject(
                    new Error(
                        "Timeout waiting for thumbnailHub WebSocket connection for environment map thumbnails",
                    ),
                );
            }
        }, 15000);
    });

    const waitForMatchingNotification = new Promise<EnvironmentMapThumbnailNotification>(
        (resolve, reject) => {
            resolveMatchingNotification = resolve;
            setTimeout(() => {
                reject(
                    new Error(
                        `Timeout waiting for ${ENVIRONMENT_MAP_THUMBNAIL_SIGNALR_TARGET} notification`,
                    ),
                );
            }, 180000);
        },
    );

    page.on("websocket", (ws: any) => {
        if (!ws.url().includes("thumbnailHub")) {
            return;
        }

        if (!hubConnected) {
            hubConnected = true;
            resolveHubConnection();
        }

        ws.on("framereceived", (frame: any) => {
            const payload = frame.payload as string | Buffer;
            const text = payload.toString();
            const messages = text.split("\x1e").filter((message) => message.length > 0);

            for (const message of messages) {
                try {
                    const json = JSON.parse(message);
                    if (
                        json.type !== 1 ||
                        json.target !== ENVIRONMENT_MAP_THUMBNAIL_SIGNALR_TARGET
                    ) {
                        continue;
                    }

                    const notification = json.arguments?.[0];
                    if (!notification || typeof notification.environmentMapId !== "number") {
                        continue;
                    }

                    collectedNotifications.push(notification);

                    if (
                        targetEnvironmentMapId !== null &&
                        notification.environmentMapId === targetEnvironmentMapId
                    ) {
                        resolveMatchingNotification(notification);
                    }
                } catch {
                    // Ignore non-JSON or partial SignalR frames.
                }
            }
        });
    });

    scenarioState.setCustom("environmentMapThumbnailSignalRRuntime", {
        waitForHubConnection,
        setTargetEnvironmentMapId: (environmentMapId: number) => {
            targetEnvironmentMapId = environmentMapId;

            const existingNotification = collectedNotifications.find(
                (notification) =>
                    notification.environmentMapId === targetEnvironmentMapId,
            );

            if (existingNotification) {
                resolveMatchingNotification(existingNotification);
            }
        },
        waitForMatchingNotification: () => waitForMatchingNotification,
    });
}

function getEnvironmentMapThumbnailSignalRRuntime(page: any) {
    const runtime = getScenarioState(page).getCustom<EnvironmentMapThumbnailSignalRRuntime>(
        "environmentMapThumbnailSignalRRuntime",
    );
    expect(
        runtime,
        "Environment map thumbnail SignalR listener is not initialized for this scenario",
    ).toBeDefined();
    return runtime!;
}

Given("I am on the environment maps page", async ({ page }) => {
    await new EnvironmentMapsPage(page).goto();
});

Given(
    "I start listening for environment map thumbnail SignalR notifications",
    async ({ page }) => {
        initializeEnvironmentMapThumbnailSignalRRuntime(page);
    },
);

When(
    "I upload an environment map {string} from {string}",
    async ({ page }, alias: string, filename: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const filePath = await UniqueFileGenerator.generate(filename, {
            uniqueFilename: true,
        });
        const actualName = path.parse(filePath).name;

        const { environmentMapId } =
            await environmentMapsPage.uploadSingleEnvironmentMapViaDialog({
                name: actualName,
                file: await createUploadFilePayloadFromPath(filePath),
            });

        await expect
            .poll(async () => (await getEnvironmentMapDetail(page, environmentMapId)).name)
            .toBe(actualName);

        await assertEnvironmentMapDbState(environmentMapId, false);

        getScenarioState(page).saveEnvironmentMap(alias, {
            id: environmentMapId,
            name: actualName,
            variantCount: 1,
        });
    },
);

When(
    "I drag and drop a generated {int}x{int} environment map {string}",
    async ({ page }, width: number, height: number, alias: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const payload = createUniqueSolidPngPayload({
            filenamePrefix: alias,
            width,
            height,
            rgb: [96, 144, 255],
        });

        const { environmentMapId } = await environmentMapsPage.dragAndDropUpload([
            payload,
        ]);
        let actualName = "";
        await expect
            .poll(async () => {
                actualName = (await getEnvironmentMapDetail(page, environmentMapId))
                    .name;
                return actualName;
            })
            .not.toBe("");

        await assertEnvironmentMapDbState(environmentMapId, false);

        getScenarioState(page).saveEnvironmentMap(alias, {
            id: environmentMapId,
            name: actualName,
            variantCount: 1,
        });
    },
);

When(
    "I drag and drop a generated {int}x{int} HDR environment map {string}",
    async ({ page }, width: number, height: number, alias: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const payload = createUniqueSolidHdrPayload({
            filenamePrefix: alias,
            width,
            height,
        });

        const { environmentMapId } = await environmentMapsPage.dragAndDropUpload([
            payload,
        ]);
        let actualName = "";
        await expect
            .poll(async () => {
                actualName = (await getEnvironmentMapDetail(page, environmentMapId))
                    .name;
                return actualName;
            })
            .not.toBe("");

        await assertEnvironmentMapDbState(environmentMapId, false);

        getScenarioState(page).saveEnvironmentMap(alias, {
            id: environmentMapId,
            name: actualName,
            variantCount: 1,
        });
    },
);

When(
    "I upload the cube environment map {string} with size label {string} and custom thumbnail {string} using:",
    async (
        { page },
        alias: string,
        sizeLabel: string,
        thumbnailFilename: string,
        dataTable: DataTable,
    ) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const cubeFaceFiles = dataTable.hashes();
        const uniqueName = `${alias}-${Math.random().toString(16).slice(2, 10)}`;
        const cubeFaces = {} as Record<
            "px" | "nx" | "py" | "ny" | "pz" | "nz",
            Awaited<ReturnType<typeof createUniqueUploadFilePayload>>
        >;

        for (const row of cubeFaceFiles) {
            const face = row.face?.trim().toLowerCase() as keyof typeof cubeFaces;
            cubeFaces[face] = await createUniqueUploadFilePayload(row.filename);
        }

        const { environmentMapId } =
            await environmentMapsPage.uploadCubeEnvironmentMapViaDialog({
                name: uniqueName,
                sizeLabel,
                cubeFaces,
                thumbnailFile:
                    await createUniqueUploadFilePayload(thumbnailFilename),
            });

        await expect
            .poll(async () => (await getEnvironmentMapDetail(page, environmentMapId)).name)
            .toBe(uniqueName);

        const detail = await getEnvironmentMapDetail(page, environmentMapId);
        expect(detail.variantCount).toBe(1);
        expect(detail.customThumbnailUrl).toBeTruthy();

        getScenarioState(page).saveEnvironmentMap(alias, {
            id: environmentMapId,
            name: uniqueName,
            variantCount: 1,
        });
    },
);

When("I open the environment map {string}", async ({ page }, alias: string) => {
    const environmentMap = getStoredEnvironmentMap(page, alias);
    await new EnvironmentMapsPage(page).openEnvironmentMapByName(
        environmentMap.name,
    );
});

When(
    "I upload a custom thumbnail for the environment map {string} from {string}",
    async ({ page }, alias: string, filename: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);

        await environmentMapsPage.waitForViewer(environmentMap.name);
        await environmentMapsPage.uploadCustomThumbnailInViewer(
            await createUniqueUploadFilePayload(filename),
        );

        await expect
            .poll(async () => {
                const detail = await getEnvironmentMapDetail(page, environmentMap.id);
                return detail.customThumbnailUrl;
            })
            .toBeTruthy();
    },
);

When(
    "I regenerate the thumbnail for the environment map {string}",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);

        await environmentMapsPage.waitForViewer(environmentMap.name);
        await environmentMapsPage.regenerateThumbnailInViewer();

        await expect
            .poll(async () => {
                const detail = await getEnvironmentMapDetail(page, environmentMap.id);
                return {
                    customThumbnailFileId: detail.customThumbnailFileId ?? null,
                    customThumbnailUrl: detail.customThumbnailUrl ?? null,
                    previewUrl: detail.previewUrl ?? null,
                };
            })
            .toEqual({
                customThumbnailFileId: null,
                customThumbnailUrl: null,
                previewUrl: expect.stringContaining(
                    `/environment-maps/${environmentMap.id}/preview`,
                ),
            });
    },
);

Then(
    "the environment maps toolbar should include:",
    async ({ page }, dataTable: DataTable) => {
        const actions = dataTable.hashes().map((row) => row.action);
        await new EnvironmentMapsPage(page).expectToolbarActions(actions);
    },
);

Then(
    "the environment maps toolbar counter should show {string}",
    async ({ page }, expectedLabel: string) => {
        await new EnvironmentMapsPage(page).waitForToolbarCountLabel(
            expectedLabel,
        );
    },
);

Then("I remember the current environment maps toolbar count", async ({ page }) => {
    getScenarioState(page).setCustom(
        "environmentMapToolbarCount",
        extractLeadingCount(
            await new EnvironmentMapsPage(page).getToolbarCountLabel(),
        ),
    );
});

Then(
    "the environment maps toolbar counter should increase by {int}",
    async ({ page }, increment: number) => {
        const beforeCount =
            getScenarioState(page).getCustom<number>("environmentMapToolbarCount") ??
            0;
        await expect
            .poll(
                async () =>
                    extractLeadingCount(
                        await new EnvironmentMapsPage(page).getToolbarCountLabel(),
                    ),
                { timeout: 15000 },
            )
            .toBe(beforeCount + increment);
    },
);

Then(
    "the environment map upload progress should complete",
    async ({ page }) => {
        const uploadProgressPage = new UploadProgressPage(page);
        await uploadProgressPage.waitForWindowVisible();
        await expect
            .poll(async () => (await uploadProgressPage.getSummaryText()) ?? "", {
                timeout: 30000,
            })
            .toMatch(/\d+ completed/i);
        await uploadProgressPage.closeWindowIfVisible();
    },
);

Then(
    "the environment map {string} should be visible in the environment map list",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        await new EnvironmentMapsPage(page).waitForEnvironmentMapByName(
            environmentMap.name,
        );
    },
);

Then(
    "the environment map viewer for {string} should be visible",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        await new EnvironmentMapsPage(page).waitForViewer(environmentMap.name);
    },
);

Then(
    "the environment map {string} should show the preview size option {string}",
    async ({ page }, alias: string, sizeLabel: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);

        await environmentMapsPage.waitForViewer(environmentMap.name);
        await environmentMapsPage.waitForPreviewSizeLabel(sizeLabel);

        await expect
            .poll(async () => {
                const detail = await getEnvironmentMapDetail(page, environmentMap.id);
                return (detail.variants ?? []).some(
                    (variant: any) => variant.sizeLabel === sizeLabel,
                );
            })
            .toBe(true);
    },
);

Then(
    "the environment map {string} should show {string} as the detail value for {string}",
    async ({ page }, alias: string, expectedValue: string, label: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);

        await environmentMapsPage.waitForViewer(environmentMap.name);
        await expect
            .poll(async () => environmentMapsPage.getDetailValue(label), {
                timeout: 45000,
            })
            .toBe(expectedValue);
    },
);

Then(
    "the environment map {string} should load a Three.js preview scene",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);

        await environmentMapsPage.waitForViewer(environmentMap.name);
        await environmentMapsPage.waitForThreeJsPreviewLoaded();
    },
);

Then(
    "the environment map {string} should expose all cube faces through the API and database",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const detail = await getEnvironmentMapDetail(page, environmentMap.id);
        const firstVariant = detail.variants?.[0];

        expect(detail.sourceType).toBe("cube");
        expect(detail.projectionType).toBe("cube");
        expect(firstVariant).toBeTruthy();
        expect(firstVariant.cubeFaces).toBeTruthy();

        for (const face of ["px", "nx", "py", "ny", "pz", "nz"]) {
            expect(firstVariant.cubeFaces[face]).toBeTruthy();
            expect(firstVariant.cubeFaces[face].fileUrl).toContain("/files/");
        }

        expect(await getActiveVariantCountFromDb(environmentMap.id)).toBe(1);
        expect(await getCubeFaceCountFromDb(environmentMap.id)).toBe(6);
    },
);

Then(
    "the environment map {string} should eventually have a generated thumbnail",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);

        await expect
            .poll(
                async () => {
                    const response = await page.request.get(
                        `${API_BASE}/environment-maps/${environmentMap.id}/preview`,
                    );
                    return {
                        ok: response.ok(),
                        contentType: response.headers()["content-type"] ?? "",
                    };
                },
                { timeout: 180000, intervals: [1000, 2000, 5000, 10000] },
            )
            .toEqual({
                ok: true,
                contentType: expect.stringContaining("image/png"),
            });
        await environmentMapsPage.waitForCardThumbnailLoaded(environmentMap.name, 180000);
    },
);

When(
    "I upload the real HDRI environment map {string} and watch for live thumbnail updates",
    async ({ page }, alias: string) => {
        initializeEnvironmentMapThumbnailSignalRRuntime(page);

        const environmentMapsPage = new EnvironmentMapsPage(page);
        const signalRRuntime = getEnvironmentMapThumbnailSignalRRuntime(page);

        await signalRRuntime.waitForHubConnection;

        const filePath = await UniqueFileGenerator.generate(REAL_HDRI_FILE, {
            uniqueFilename: true,
        });
        const actualName = path.parse(filePath).name;
        await environmentMapsPage.startCardThumbnailTransitionTracking(actualName);

        const { environmentMapId } =
            await environmentMapsPage.uploadSingleEnvironmentMapViaDialog({
                name: actualName,
                file: await createUploadFilePayloadFromPath(filePath),
            });

        await expect
            .poll(async () => (await getEnvironmentMapDetail(page, environmentMapId)).name)
            .toBe(actualName);

        await assertEnvironmentMapDbState(environmentMapId, false);
        await environmentMapsPage.waitForEnvironmentMapByName(actualName);

        getScenarioState(page).saveEnvironmentMap(alias, {
            id: environmentMapId,
            name: actualName,
            variantCount: 1,
        });

        signalRRuntime.setTargetEnvironmentMapId(environmentMapId);

        getScenarioState(page).setCustom("environmentMapListPageUrl", page.url());
    },
);

Then(
    "the environment map card for {string} should initially not use the generated preview thumbnail",
    async ({ page }, alias: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);

        const transitions =
            await environmentMapsPage.getTrackedCardThumbnailTransitions();
        getScenarioState(page).setCustom(
            "environmentMapCardThumbnailTransitions",
            transitions,
        );
        expect(transitions.length).toBeGreaterThan(0);
        expect(transitions.some((state) => state.exists)).toBe(true);
    },
);

Then(
    "I should receive an environment map thumbnail ready notification via WebSocket for {string}",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const notification =
            await getEnvironmentMapThumbnailSignalRRuntime(
                page,
            ).waitForMatchingNotification();

        getScenarioState(page).setCustom(
            "environmentMapThumbnailNotification",
            notification,
        );

        expect(notification.environmentMapId).toBe(environmentMap.id);
        if (notification.status != null) {
            expect(["Ready", "ready", 2]).toContain(notification.status);
        }
        if (notification.previewUrl || notification.thumbnailUrl) {
            expect(notification.previewUrl ?? notification.thumbnailUrl).toContain(
                `/environment-maps/${environmentMap.id}/preview`,
            );
        }
    },
);

Then(
    "the environment map card for {string} should switch to the generated thumbnail without refreshing",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const listPageUrl = getScenarioState(page).getCustom<string>(
            "environmentMapListPageUrl",
        );

        await environmentMapsPage.waitForCardThumbnailToUseGeneratedPreview(
            environmentMap.name,
            environmentMap.id,
        );

        // Retry reading transitions — the in-browser interval may need
        // one more tick to capture the final loaded state after the
        // Playwright poll above confirmed the thumbnail is visible.
        await expect
            .poll(
                async () => {
                    const transitions =
                        await environmentMapsPage.getTrackedCardThumbnailTransitions();
                    return transitions.some(
                        (state: EnvironmentMapCardTransitionState) =>
                            state.exists &&
                            state.hasImage &&
                            state.isLoaded &&
                            (state.currentSrc ?? state.imageSrc ?? "").includes(
                                `/environment-maps/${environmentMap.id}/preview`,
                            ),
                    );
                },
                { timeout: 15000, intervals: [500, 1000, 2000] },
            )
            .toBe(true);

        expect(page.url()).toBe(listPageUrl);
        await environmentMapsPage.stopCardThumbnailTransitionTracking();
    },
);

Then(
    "the environment map card for {string} should use the generated preview thumbnail",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const detail = await getEnvironmentMapDetail(page, environmentMap.id);

        await clickTab(page, "environmentMaps");
        await environmentMapsPage.waitForListReady();
        const src = await environmentMapsPage.getCardThumbnailSrc(environmentMap.name);

        expect(detail.customThumbnailUrl).toBeNull();
        expect(detail.previewUrl).toContain(
            `/environment-maps/${environmentMap.id}/preview`,
        );
        expect(src).toContain(`/environment-maps/${environmentMap.id}/preview`);
    },
);

Then(
    "the environment map card for {string} should use the custom thumbnail",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const detail = await getEnvironmentMapDetail(page, environmentMap.id);

        await clickTab(page, "environmentMaps");
        await environmentMapsPage.waitForListReady();

        expect(detail.customThumbnailFileId).toBeTruthy();
        expect(detail.customThumbnailUrl).toContain(
            `/files/${detail.customThumbnailFileId}/preview`,
        );
        // The card component uses /environment-maps/{id}/preview (which
        // serves the custom thumbnail when set), not the direct file URL.
        await expect
            .poll(
                async () =>
                    environmentMapsPage.getCardThumbnailSrc(environmentMap.name),
                { timeout: 30000, intervals: [250, 500, 1000, 2000] },
            )
            .toContain(`/environment-maps/${environmentMap.id}/preview`);
    },
);

Then(
    "the environment map viewer should show the custom thumbnail for {string}",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const detail = await getEnvironmentMapDetail(page, environmentMap.id);

        if (
            !(await page
                .locator(".environment-map-viewer")
                .isVisible()
                .catch(() => false))
        ) {
            await environmentMapsPage.openEnvironmentMapByName(environmentMap.name);
        } else {
            await environmentMapsPage.waitForViewer(environmentMap.name);
        }

        await environmentMapsPage.waitForViewerCustomThumbnailLoaded();
        expect(await environmentMapsPage.getViewerThumbnailSrc()).toContain(
            `/files/${detail.customThumbnailFileId}/preview`,
        );
    },
);

Then(
    "the environment map viewer should show the generated thumbnail for {string}",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);

        if (
            !(await page
                .locator(".environment-map-viewer")
                .isVisible()
                .catch(() => false))
        ) {
            await environmentMapsPage.openEnvironmentMapByName(environmentMap.name);
        } else {
            await environmentMapsPage.waitForViewer(environmentMap.name);
        }

        await environmentMapsPage.waitForViewerCustomThumbnailLoaded();
        expect(await environmentMapsPage.getViewerThumbnailSrc()).toContain(
            `/environment-maps/${environmentMap.id}/preview`,
        );
    },
);

When(
    "I recycle the environment map {string}",
    async ({ page }, alias: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const environmentMap = getStoredEnvironmentMap(page, alias);

        await environmentMapsPage.goto();
        await environmentMapsPage.recycleEnvironmentMapByName(environmentMap.name);

        await expect
            .poll(async () => {
                const response = await page.request.get(`${API_BASE}/recycled`);
                const recycled = await response.json();
                return (recycled.environmentMaps ?? []).some(
                    (item: any) => item.id === environmentMap.id,
                );
            })
            .toBe(true);

        await assertEnvironmentMapDbState(environmentMap.id, true);
    },
);

Then(
    "the environment map {string} should not be visible in the environment map list",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        await expect(
            new EnvironmentMapsPage(page).getEnvironmentMapCardByName(
                environmentMap.name,
            ),
        ).toBeHidden({ timeout: 15000 });
    },
);

Then(
    "the environment map {string} should be visible in recycled files",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const recycledFilesPage = new RecycledFilesPage(page);

        await expect
            .poll(async () => {
                const response = await page.request.get(`${API_BASE}/recycled`);
                const recycled = await response.json();
                return (recycled.environmentMaps ?? []).some(
                    (item: any) =>
                        item.id === environmentMap.id &&
                        item.name === environmentMap.name,
                );
            })
            .toBe(true);

        await expect(
            recycledFilesPage.getEnvironmentMapCardByName(environmentMap.name),
        ).toBeVisible({ timeout: 15000 });
    },
);

function extractLeadingCount(label: string): number {
    const countText = label.split("/")[0];
    const match = countText.match(/\d+/);
    return Number(match?.[0] ?? 0);
}
