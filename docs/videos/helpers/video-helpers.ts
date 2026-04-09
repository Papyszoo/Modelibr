import {
    type Browser,
    type BrowserContext,
    type Page,
    type TestInfo,
} from "@playwright/test";

export const ciVideoTimeout = process.env.CI === "true" ? 30000 : 15000;
const videoPaceFactor = 0.65;
const LEGACY_NAVIGATION_HASH_KEY = "__docsVideoNavigation";
const initializedLegacyNavigationPages = new WeakSet<Page>();

type RecordedVideoPage = {
    context: BrowserContext;
    page: Page;
};

function paceDuration(ms: number) {
    return Math.max(120, Math.round(ms * videoPaceFactor));
}

async function waitForTabsToSettle(page: Page) {
    let lastError: unknown;
    for (const timeout of [8000, 13000, 18000]) {
        try {
            await page.waitForFunction(
                () =>
                    Array.from(document.querySelectorAll(".tab-loading")).every(
                        (element) =>
                            !(element instanceof HTMLElement) ||
                            element.offsetParent === null,
                    ),
                { timeout },
            );
            return;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        throw lastError;
    }
}

type VideoTab = {
    id: string;
    type: string;
    label: string;
    params: Record<string, string>;
    modelId?: string;
    setId?: string;
    packId?: string;
    projectId?: string;
    stageId?: string;
};

type LegacyNavigationSnapshot = {
    tabs: VideoTab[];
    activeTabId: string;
    activeRightTabId: string | null;
};

const STATIC_TAB_LABELS: Record<string, string> = {
    modelList: "Models",
    textureSets: "Texture Sets",
    packs: "Packs",
    projects: "Projects",
    sprites: "Sprites",
    sounds: "Sounds",
    stageList: "Stages",
    history: "History",
    settings: "Settings",
    recycledFiles: "Recycled Files",
};

function buildVideoTab(tabId: string, panel: "left" | "right"): VideoTab {
    const params: Record<string, string> = {};
    if (panel === "right") {
        params.panel = "right";
    }

    if (tabId.startsWith("model-")) {
        const modelId = tabId.substring(6);
        return {
            id: tabId,
            type: "modelViewer",
            label: `Model ${modelId}`,
            params: { ...params, modelId },
            modelId,
        };
    }

    if (tabId.startsWith("set-")) {
        const setId = tabId.substring(4);
        return {
            id: tabId,
            type: "textureSetViewer",
            label: `Set ${setId}`,
            params: { ...params, setId },
            setId,
        };
    }

    if (tabId.startsWith("pack-")) {
        const packId = tabId.substring(5);
        return {
            id: tabId,
            type: "packViewer",
            label: `Pack ${packId}`,
            params: { ...params, packId },
            packId,
        };
    }

    if (tabId.startsWith("project-")) {
        const projectId = tabId.substring(8);
        return {
            id: tabId,
            type: "projectViewer",
            label: `Project ${projectId}`,
            params: { ...params, projectId },
            projectId,
        };
    }

    if (tabId.startsWith("stage-")) {
        const stageId = tabId.substring(6);
        return {
            id: tabId,
            type: "stageEditor",
            label: `Stage ${stageId}`,
            params: { ...params, stageId },
            stageId,
        };
    }

    const label = STATIC_TAB_LABELS[tabId];
    if (!label) {
        throw new Error(`Unsupported docs video tab id: ${tabId}`);
    }

    return {
        id: tabId,
        type: tabId,
        label,
        params,
    };
}

function parseTabIds(value: string | null): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

async function ensureLegacyNavigationInitScript(page: Page) {
    if (initializedLegacyNavigationPages.has(page)) {
        return;
    }

    await page.addInitScript(
        ({ hashKey }) => {
            const hashPrefix = `#${hashKey}=`;
            if (!window.location.hash.startsWith(hashPrefix)) {
                return;
            }

            try {
                const rawSnapshot = window.location.hash.slice(hashPrefix.length);
                const snapshot = JSON.parse(
                    decodeURIComponent(rawSnapshot),
                ) as LegacyNavigationSnapshot;

                if (!snapshot || !Array.isArray(snapshot.tabs)) {
                    return;
                }

                const storageKey = "modelibr_navigation";
                const sessionWindowIdKey = "modelibr_windowId";
                const storedRaw = localStorage.getItem(storageKey);
                const stored = storedRaw
                    ? JSON.parse(storedRaw)
                    : {
                          state: {
                              activeWindows: {},
                              recentlyClosedTabs: [],
                              recentlyClosedWindows: [],
                          },
                          version: 0,
                      };

                let windowId = sessionStorage.getItem(sessionWindowIdKey);
                if (!windowId) {
                    windowId = crypto.randomUUID();
                    sessionStorage.setItem(sessionWindowIdKey, windowId);
                }

                stored.state = {
                    activeWindows: {
                        ...(stored.state?.activeWindows || {}),
                        [windowId]: {
                            tabs: snapshot.tabs,
                            activeTabId: snapshot.activeTabId,
                            activeRightTabId: snapshot.activeRightTabId,
                            splitterSize: 50,
                            lastActiveAt: new Date().toISOString(),
                        },
                    },
                    recentlyClosedTabs: stored.state?.recentlyClosedTabs || [],
                    recentlyClosedWindows:
                        stored.state?.recentlyClosedWindows || [],
                };

                localStorage.setItem(storageKey, JSON.stringify(stored));
                history.replaceState(
                    history.state,
                    "",
                    `${window.location.pathname}${window.location.search}`,
                );
            } catch {
                // Ignore malformed legacy navigation snapshots and let the app
                // fall back to its default state.
            }
        },
        { hashKey: LEGACY_NAVIGATION_HASH_KEY },
    );

    initializedLegacyNavigationPages.add(page);
}

async function applyLegacyNavigationState(
    page: Page,
    path: string,
    baseUrl: string,
) {
    const url = new URL(path, baseUrl);
    const leftTabIds = parseTabIds(url.searchParams.get("leftTabs"));
    const rightTabIds = parseTabIds(url.searchParams.get("rightTabs"));

    if (leftTabIds.length === 0 && rightTabIds.length === 0) {
        return false;
    }

    const leftTabs = (leftTabIds.length > 0 ? leftTabIds : ["modelList"]).map(
        (tabId) => buildVideoTab(tabId, "left"),
    );
    const rightTabs = rightTabIds.map((tabId) => buildVideoTab(tabId, "right"));

    let activeLeftTabId =
        url.searchParams.get("activeLeft") || leftTabs[0]?.id || "modelList";
    let activeRightTabId = url.searchParams.get("activeRight");

    if (!leftTabs.some((tab) => tab.id === activeLeftTabId)) {
        activeLeftTabId = leftTabs[0]?.id || "modelList";
    }

    if (!activeRightTabId || !rightTabs.some((tab) => tab.id === activeRightTabId)) {
        activeRightTabId = rightTabs[0]?.id || null;
    }

    await ensureLegacyNavigationInitScript(page);

    const snapshot: LegacyNavigationSnapshot = {
        tabs: [...leftTabs, ...rightTabs],
        activeTabId: activeLeftTabId,
        activeRightTabId,
    };

    url.hash = `${LEGACY_NAVIGATION_HASH_KEY}=${encodeURIComponent(
        JSON.stringify(snapshot),
    )}`;

    await page.goto(url.toString());
    return true;
}

/**
 * Human-like interaction helpers for documentation videos.
 * All timing is designed to look natural on screen so viewers can follow along.
 */

/** Pause so the viewer can see what just happened */
export async function viewerPause(page: Page, ms = 900) {
    await page.waitForTimeout(paceDuration(ms));
}

/** Short pause between rapid actions */
export async function shortPause(page: Page) {
    await page.waitForTimeout(paceDuration(300));
}

/** Medium pause to let viewer read/see a result */
export async function mediumPause(page: Page) {
    await page.waitForTimeout(paceDuration(700));
}

/** Long pause for important moments */
export async function longPause(page: Page) {
    await page.waitForTimeout(paceDuration(1300));
}

/**
 * Move mouse smoothly from current position to target element.
 * Creates a human-like cursor movement arc.
 */
export async function smoothMoveTo(
    page: Page,
    selector: string,
    options?: { offsetX?: number; offsetY?: number },
) {
    const element = page.locator(selector).first();
    const box = await element.boundingBox();
    if (!box) throw new Error(`Element not found: ${selector}`);

    const targetX = box.x + box.width / 2 + (options?.offsetX ?? 0);
    const targetY = box.y + box.height / 2 + (options?.offsetY ?? 0);

    // Move in steps for smooth visual
    await page.mouse.move(targetX, targetY, { steps: 20 });
    await shortPause(page);
}

/**
 * Human-like click: move to element, brief pause, then click.
 */
export async function humanClick(
    page: Page,
    selector: string,
    options?: { offsetX?: number; offsetY?: number },
) {
    await smoothMoveTo(page, selector, options);
    await page.waitForTimeout(paceDuration(180));
    const element = page.locator(selector).first();
    const box = await element.boundingBox();
    if (!box) throw new Error(`Element not found for click: ${selector}`);
    const x = box.x + box.width / 2 + (options?.offsetX ?? 0);
    const y = box.y + box.height / 2 + (options?.offsetY ?? 0);
    await page.mouse.click(x, y);
    await shortPause(page);
}

/**
 * Human-like right-click: move to element, brief pause, then right click.
 */
export async function humanRightClick(page: Page, selector: string) {
    await smoothMoveTo(page, selector);
    await page.waitForTimeout(paceDuration(180));
    const element = page.locator(selector).first();
    const box = await element.boundingBox();
    if (!box) throw new Error(`Element not found for right-click: ${selector}`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
        button: "right",
    });
    await shortPause(page);
}

/**
 * Perform a smooth drag from one position to another (for camera rotation, tab dragging, etc.)
 */
export async function smoothDrag(
    page: Page,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    steps = 30,
    button: "left" | "right" | "middle" = "left",
) {
    await page.mouse.move(startX, startY, { steps: 10 });
    await page.waitForTimeout(paceDuration(200));
    await page.mouse.down({ button });
    await page.waitForTimeout(paceDuration(100));
    await page.mouse.move(endX, endY, { steps });
    await page.waitForTimeout(paceDuration(200));
    await page.mouse.up({ button });
    await shortPause(page);
}

/**
 * Drag an element to a target position.
 */
export async function dragElementTo(
    page: Page,
    sourceSelector: string,
    targetSelector: string,
    steps = 30,
) {
    const source = page.locator(sourceSelector).first();
    const target = page.locator(targetSelector).first();
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox)
        throw new Error(`Cannot find elements for drag`);

    await smoothDrag(
        page,
        sourceBox.x + sourceBox.width / 2,
        sourceBox.y + sourceBox.height / 2,
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height / 2,
        steps,
    );
}

/**
 * Navigate to a page and wait for it to load fully.
 */
export async function navigateTo(page: Page, path: string) {
    // Use localhost (not 127.0.0.1) so browser origin matches CORS allowed origins
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
    const usedLegacyNavigation = await applyLegacyNavigationState(
        page,
        path,
        baseUrl,
    );
    if (!usedLegacyNavigation) {
        await page.goto(`${baseUrl}${path}`);
    }
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".p-splitter", {
        state: "visible",
        timeout: 15000,
    });
    await waitForTabsToSettle(page);
    await page.waitForTimeout(paceDuration(250));
    await mediumPause(page);
}

export async function createRecordedPage(
    browser: Browser,
    testInfo: TestInfo,
): Promise<RecordedVideoPage> {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        colorScheme: "dark",
        recordVideo: {
            dir: testInfo.outputDir,
            size: { width: 1280, height: 720 },
        },
    });

    const page = await context.newPage();
    return { context, page };
}

/**
 * Wait for model cards to appear in the grid.
 */
export async function waitForModelCards(
    page: Page,
    minCount = 1,
    timeout = 30000,
) {
    await page.waitForFunction(
        (min) => document.querySelectorAll(".model-card").length >= min,
        minCount,
        { timeout },
    );
    await shortPause(page);
}

/**
 * Wait for thumbnails to be generated (non-placeholder images in model cards).
 */
export async function waitForThumbnails(
    page: Page,
    cardCount: number,
    timeout = 60000,
) {
    await page.waitForFunction(
        (count) => {
            const cards = document.querySelectorAll(".model-card");
            if (cards.length < count) return false;
            let loaded = 0;
            cards.forEach((card) => {
                const img = card.querySelector(
                    ".model-card-thumbnail img",
                ) as HTMLImageElement;
                if (
                    img &&
                    img.naturalWidth > 0 &&
                    !img.src.includes("placeholder")
                ) {
                    loaded++;
                }
            });
            return loaded >= count;
        },
        cardCount,
        { timeout },
    );
    await mediumPause(page);
}

/**
 * Clear all data via API to start fresh.
 */
export async function clearAllData(page: Page) {
    const apiBase = process.env.API_BASE_URL || "http://127.0.0.1:8090";

    // Helper to permanently delete all items from the recycle bin
    async function cleanRecycleBin() {
        const recycledRes = await page.request.get(`${apiBase}/recycled`);
        if (recycledRes.ok()) {
            const recycled = await recycledRes.json();
            const entityTypes: [string, any[]][] = [
                ["model", recycled.models || []],
                ["modelVersion", recycled.modelVersions || []],
                ["file", recycled.files || []],
                ["textureSet", recycled.textureSets || []],
                ["texture", recycled.textures || []],
                ["sprite", recycled.sprites || []],
                ["sound", recycled.sounds || []],
            ];
            for (const [type, items] of entityTypes) {
                for (const item of items) {
                    await page.request.delete(
                        `${apiBase}/recycled/${type}/${item.id}/permanent`,
                    );
                }
            }
        }
    }

    // Step 1: Clean existing recycled items first
    await cleanRecycleBin();

    // Step 2: Hard-delete sprites and sounds (these have hard-delete endpoints)
    const spritesRes = await page.request.get(`${apiBase}/sprites`);
    if (spritesRes.ok()) {
        const data = await spritesRes.json();
        for (const sprite of data.sprites || []) {
            await page.request.delete(`${apiBase}/sprites/${sprite.id}`);
        }
    }
    const soundsRes = await page.request.get(`${apiBase}/sounds`);
    if (soundsRes.ok()) {
        const data = await soundsRes.json();
        for (const sound of data.sounds || []) {
            await page.request.delete(`${apiBase}/sounds/${sound.id}`);
        }
    }

    // Step 3: Soft-delete active texture sets so reruns do not accumulate duplicates
    const textureSetsRes = await page.request.get(`${apiBase}/texture-sets`);
    if (textureSetsRes.ok()) {
        const data = await textureSetsRes.json();
        for (const textureSet of data.textureSets || []) {
            await page.request.delete(`${apiBase}/texture-sets/${textureSet.id}`);
        }
    }

    // Step 4: Soft-delete all models (models only have soft-delete endpoint)
    const modelsRes = await page.request.get(`${apiBase}/models`);
    if (modelsRes.ok()) {
        const models = await modelsRes.json();
        for (const model of models) {
            await page.request.delete(`${apiBase}/models/${model.id}`);
        }
    }

    // Step 5: Delete packs and projects (hard delete)
    const packsRes = await page.request.get(`${apiBase}/packs`);
    if (packsRes.ok()) {
        const data = await packsRes.json();
        for (const pack of data.packs || []) {
            await page.request.delete(`${apiBase}/packs/${pack.id}`);
        }
    }
    const projectsRes = await page.request.get(`${apiBase}/projects`);
    if (projectsRes.ok()) {
        const data = await projectsRes.json();
        for (const project of data.projects || []) {
            await page.request.delete(`${apiBase}/projects/${project.id}`);
        }
    }

    // Step 6: Clean recycled bin again (models and texture sets were soft-deleted above)
    await cleanRecycleBin();

    // Step 7: Delete sprite and sound categories
    const spriteCatsRes = await page.request.get(
        `${apiBase}/sprite-categories`,
    );
    if (spriteCatsRes.ok()) {
        const data = await spriteCatsRes.json();
        for (const cat of data.categories || []) {
            await page.request.delete(`${apiBase}/sprite-categories/${cat.id}`);
        }
    }
    const soundCatsRes = await page.request.get(`${apiBase}/sound-categories`);
    if (soundCatsRes.ok()) {
        const data = await soundCatsRes.json();
        for (const cat of data.categories || []) {
            await page.request.delete(`${apiBase}/sound-categories/${cat.id}`);
        }
    }
}

/**
 * Upload a model file via API and return its ID.
 */
export async function uploadModelViaApi(
    page: Page,
    filePath: string,
): Promise<number> {
    const apiBase = process.env.API_BASE_URL || "http://127.0.0.1:8090";
    const fs = await import("fs");
    const path = await import("path");
    const FormData = (await import("form-data")).default;

    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), path.basename(filePath));

    const response = await page.request.post(`${apiBase}/models`, {
        multipart: {
            file: {
                name: path.basename(filePath),
                mimeType: "application/octet-stream",
                buffer: fs.readFileSync(filePath),
            },
        },
    });
    if (!response.ok()) return 0;
    const data = await response.json();
    return data.id || data.modelId;
}

/**
 * Get the path to a test asset file.
 */
export function getAssetPath(filename: string): string {
    const path = require("path");
    return path.resolve(__dirname, "../../../tests/e2e/assets", filename);
}

/**
 * Disable Playwright's highlight overlay by injecting CSS.
 * Call after every navigation.
 */
export async function disableHighlights(page: Page) {
    await page.addStyleTag({
        content: `
            /* Hide Playwright action highlights / blue borders */
            playwright-highlight,
            [data-playwright-highlight],
            .playwright-highlight {
                display: none !important;
                opacity: 0 !important;
            }
        `,
    });
}
