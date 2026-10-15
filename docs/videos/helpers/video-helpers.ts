import fs from "fs";
import path from "path";
import { type Locator, type Page, type TestInfo } from "@playwright/test";
import { getVideoSpec } from "../video-manifest.js";
import { getRawVideoPath } from "../video-paths.js";

export const ciVideoTimeout = process.env.CI === "true" ? 30000 : 15000;
const videoPaceFactor = 0.65;
const LEGACY_NAVIGATION_HASH_KEY = "__docsVideoNavigation";
const initializedLegacyNavigationPages = new WeakSet<Page>();
const recordingOverlayPages = new WeakSet<Page>();

/**
 * Recording-only presentation layer, injected into every document the
 * recording page loads. Nothing here touches the app's own styles on disk:
 *
 * - Playwright's screencast does not render the mouse pointer, so a synthetic
 *   arrow cursor follows mousemove events and dips on press, with one soft
 *   click ripple in the app's accent colour. This is the ONLY action
 *   indicator in the clips (Playwright's own showActions overlay is never
 *   enabled).
 * - The app's keyboard focus rings and hover tooltips are hidden. They are
 *   right for keyboard users of the real app, but in a mouse-driven clip
 *   they leave clicked pills and inputs looking permanently selected.
 */
async function ensureRecordingOverlayInitScript(page: Page) {
    if (recordingOverlayPages.has(page)) {
        return;
    }

    await page.addInitScript(() => {
        function attach() {
            if (!document.body || !document.head) {
                requestAnimationFrame(attach);
                return;
            }
            if (document.getElementById("__docsVideoCursor")) {
                return;
            }

            const style = document.createElement("style");
            style.id = "__docsVideoRecordingStyle";
            style.textContent = `
                *:focus, *:focus-visible { outline: none !important; }
                input:focus, textarea:focus, select:focus, button:focus, a:focus,
                [role="button"]:focus, [role="tab"]:focus, [role="menuitem"]:focus,
                [role="option"]:focus, [role="treeitem"]:focus, [tabindex]:focus:not([role="dialog"]),
                .p-focus, .p-inputtext:focus, .p-button:focus, .p-link:focus,
                .p-treenode-content:focus, .list-filters-search:focus-within {
                    box-shadow: none !important;
                }
                .p-tooltip { display: none !important; }
                #__docsVideoCursor {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 26px;
                    height: 26px;
                    pointer-events: none;
                    z-index: 2147483647;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                    will-change: transform;
                }
                #__docsVideoCursor.visible { opacity: 1; }
                #__docsVideoCursor svg {
                    position: absolute;
                    left: -3px;
                    top: -2px;
                    width: 26px;
                    height: 26px;
                    filter: drop-shadow(0 2px 3px rgba(15, 23, 42, 0.35));
                    transform-origin: 3px 2px;
                    transition: transform 0.12s ease;
                }
                #__docsVideoCursor.pressed svg { transform: scale(0.86); }
                #__docsVideoCursor .ripple {
                    position: absolute;
                    left: -18px;
                    top: -18px;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: rgba(var(--primary-color-rgb, 59, 130, 246), 0.18);
                    border: 2px solid rgba(var(--primary-color-rgb, 59, 130, 246), 0.55);
                    animation: __docsVideoRipple 0.5s ease-out forwards;
                }
                @keyframes __docsVideoRipple {
                    from { transform: scale(0.35); opacity: 1; }
                    to { transform: scale(1.5); opacity: 0; }
                }
            `;
            document.head.appendChild(style);

            const cursor = document.createElement("div");
            cursor.id = "__docsVideoCursor";
            cursor.innerHTML =
                '<svg viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M3 2 L3 20.5 L7.6 16.2 L10.6 23 L13.9 21.6 L10.9 14.9 L17.2 14.9 Z" ' +
                'fill="#ffffff" stroke="#1e293b" stroke-width="1.5" stroke-linejoin="round"/></svg>';
            document.body.appendChild(cursor);

            window.addEventListener(
                "mousemove",
                (event) => {
                    cursor.classList.add("visible");
                    cursor.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
                },
                { capture: true, passive: true },
            );
            window.addEventListener(
                "mousedown",
                () => {
                    cursor.classList.add("pressed");
                    const ripple = document.createElement("div");
                    ripple.className = "ripple";
                    cursor.appendChild(ripple);
                    setTimeout(() => ripple.remove(), 550);
                },
                { capture: true, passive: true },
            );
            window.addEventListener(
                "mouseup",
                () => cursor.classList.remove("pressed"),
                { capture: true, passive: true },
            );
        }

        attach();
    });

    recordingOverlayPages.add(page);
}

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
};

type LegacyNavigationSnapshot = {
    tabs: VideoTab[];
    activeTabId: string;
    activeRightTabId: string | null;
};

const STATIC_TAB_LABELS: Record<string, string> = {
    modelList: "Models",
    globalMaterials: "Global Materials",
    modelTextures: "Multi-Model Textures",
    packs: "Packs",
    projects: "Projects",
    sprites: "Sprites",
    sounds: "Sounds",
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

                // Drop any prior archive for the same windowId before
                // writing the new activeWindows entry. Between two
                // navigateTo() calls in the same recording, the previous
                // page fires `pagehide`, which self-archives the window
                // into `recentlyClosedWindows`. If we left that archive
                // in place, the app's `reclaimWindow(id)` on the next
                // mount would overwrite the snapshot we're seeding here
                // with the old tabs.
                const priorClosed = (
                    stored.state?.recentlyClosedWindows || []
                ).filter(
                    (entry: { windowId?: string } | null | undefined) =>
                        entry?.windowId !== windowId,
                );

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
                    recentlyClosedWindows: priorClosed,
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
 * Pacing helpers. All timing is designed to look natural on screen; the
 * post-processor (trim-videos.js) compresses any stretch where nothing moves,
 * so generous pauses cost nothing in the final cut.
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


type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

type CameraEvent = { t: number; box: Box | null; zoom?: number; auto?: boolean };

type Recording = {
    slug: string;
    title: string;
    outputPath: string;
    startedAt: number;
    scale: number;
    camera: CameraEvent[];
    captions: { t: number; text: string | null; position?: "top" | "bottom" }[];
    cuts: [number, number][];
    dwells: [number, number][];
    holdFrom: number | null;
};

const recordings = new WeakMap<Page, Recording>();
const cursorPositions = new WeakMap<Page, Point>();
const VIEWPORT = { width: 1280, height: 720 };

function elapsed(page: Page) {
    const recording = recordings.get(page);
    return recording ? (Date.now() - recording.startedAt) / 1000 : null;
}

function roundBox(box: Box): Box {
    return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
    };
}

function logCamera(page: Page, box: Box | null, options: { zoom?: number; auto?: boolean } = {}) {
    const recording = recordings.get(page);
    const t = elapsed(page);
    if (!recording || t === null) {
        return;
    }
    recording.camera.push({ t, box: box ? roundBox(box) : null, ...options });
}

async function visibleBox(locator: Locator): Promise<Box> {
    await locator.waitFor({ state: "visible", timeout: ciVideoTimeout });
    // Raw mouse events don't auto-scroll like locator.click does; an
    // off-screen target would put the cursor outside the frame.
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) {
        throw new Error(`No bounding box for ${locator}`);
    }
    return box;
}

type Anchor = { x?: number; y?: number };

function anchorPoint(box: Box, anchor?: Anchor): Point {
    return {
        x: box.x + box.width * (anchor?.x ?? 0.5),
        y: box.y + box.height * (anchor?.y ?? 0.5),
    };
}

function easeInOutCubic(u: number) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/**
 * Glide the pointer to a point along a gently curved, eased path - the
 * constant-velocity `mouse.move({ steps })` reads as robotic on screen.
 */
async function glidePointer(page: Page, to: Point, durationMs?: number, maxSteps = 60) {
    const from = cursorPositions.get(page) ?? {
        x: VIEWPORT.width * 0.62,
        y: VIEWPORT.height * 0.6,
    };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    cursorPositions.set(page, to);
    if (distance < 1) {
        await page.mouse.move(to.x, to.y);
        return;
    }

    const duration =
        durationMs ?? Math.min(780, Math.max(320, 260 + distance * 0.55));
    const steps = Math.min(maxSteps, Math.max(6, Math.round(duration / 18)));
    const bend = Math.min(48, distance * 0.1);
    const control = {
        x: (from.x + to.x) / 2 - (dy / distance) * bend,
        y: (from.y + to.y) / 2 + (dx / distance) * bend,
    };

    const start = Date.now();
    for (let i = 1; i <= steps; i++) {
        const e = easeInOutCubic(i / steps);
        const x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * control.x + e * e * to.x;
        const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * control.y + e * e * to.y;
        await page.mouse.move(x, y);
        const wait = start + (duration * i) / steps - Date.now();
        if (wait > 0) {
            await page.waitForTimeout(wait);
        }
    }
}

type GlideOptions = {
    /** Point inside the target, as fractions of its box (default centre). */
    anchor?: Anchor;
    /** Let the camera follow this move (default true). */
    follow?: boolean;
    durationMs?: number;
};

/** Move the cursor smoothly onto a target element (or a viewport point). */
function isPoint(target: Locator | Point): target is Point {
    return typeof (target as Point).x === "number" && typeof (target as Point).y === "number";
}

export async function glideTo(page: Page, target: Locator | Point, options: GlideOptions = {}) {
    if (isPoint(target)) {
        const point = target;
        if (options.follow !== false) {
            logCamera(page, { x: point.x - 20, y: point.y - 20, width: 40, height: 40 }, { auto: true });
        }
        await glidePointer(page, point, options.durationMs);
        return point;
    }

    const locator = target.first();
    const box = await visibleBox(locator);
    if (options.follow !== false) {
        logCamera(page, box, { auto: true });
    }
    const point = anchorPoint(box, options.anchor);
    await glidePointer(page, point, options.durationMs);
    return point;
}

/**
 * Glide onto a target, settle for a beat, then click it. The click goes
 * through `locator.click` at the exact glided-to position, so it keeps
 * Playwright's actionability checks without the pointer jumping.
 */
export async function glideClick(
    page: Page,
    target: Locator,
    options: GlideOptions & {
        button?: "left" | "right";
        settleMs?: number;
        /** Wait for this after the click and cut the wait (loader, fade) from the clip. */
        cutUntil?: () => Promise<unknown>;
    } = {},
) {
    const locator = target.first();
    await glideTo(page, locator, options);
    await page.waitForTimeout(paceDuration(options.settleMs ?? 200));

    const box = await visibleBox(locator);
    const point = anchorPoint(box, options.anchor);
    const current = cursorPositions.get(page);
    if (current && Math.hypot(point.x - current.x, point.y - current.y) > 3) {
        await glidePointer(page, point, 220);
    }
    // A cut starts as the click is issued: a loader can paint before
    // locator.click() returns.
    const clickedAt = elapsed(page);
    await locator.click({
        button: options.button ?? "left",
        position: { x: point.x - box.x, y: point.y - box.y },
    });
    cursorPositions.set(page, point);
    if (options.cutUntil) {
        await offCamera(page, options.cutUntil, clickedAt);
    } else {
        await shortPause(page);
    }
}

/** Click into a field and type, at a readable but brisk pace. */
export async function glideType(page: Page, field: Locator, text: string, delay = 45) {
    await glideClick(page, field);
    await page.keyboard.type(text, { delay });
}

/**
 * Drag with the pointer held down, between elements or viewport points.
 * `target` is resolved after the drag has started, because drop zones often
 * only appear once a drag is in flight.
 */
export async function glideDrag(
    page: Page,
    source: Locator | Point,
    target: () => Locator | Point,
    options: {
        follow?: boolean;
        /**
         * Cap on pointer steps. Over a WebGL canvas every step waits for a
         * render frame, so a long drag there crawls unless it is coarse.
         */
        maxSteps?: number;
    } = {},
) {
    await glideTo(page, source, options);
    await page.waitForTimeout(paceDuration(200));
    await page.mouse.down();
    const start = cursorPositions.get(page)!;
    await glidePointer(page, { x: start.x + 14, y: start.y + 6 }, 140);
    const drop = target();
    let point: Point;
    if (isPoint(drop)) {
        point = drop;
    } else {
        const dropBox = await visibleBox(drop.first());
        if (options.follow !== false) {
            logCamera(page, dropBox, { auto: true });
        }
        point = anchorPoint(dropBox);
    }
    await glidePointer(page, point, 900, options.maxSteps);
    await page.waitForTimeout(paceDuration(250));
    await page.mouse.up();
    await shortPause(page);
}

/**
 * The box around every visible match of a locator (e.g. a row of cards),
 * measured once it has stopped moving - dialogs and menus scale in, and a
 * box taken mid-animation frames the camera too tight.
 */
async function unionBox(locator: Locator): Promise<Box> {
    let previous = await measureUnion(locator);
    for (let i = 0; i < 10; i++) {
        await locator.page().waitForTimeout(60);
        const current = await measureUnion(locator);
        if (
            Math.abs(current.x - previous.x) < 1 &&
            Math.abs(current.y - previous.y) < 1 &&
            Math.abs(current.width - previous.width) < 1 &&
            Math.abs(current.height - previous.height) < 1
        ) {
            return current;
        }
        previous = current;
    }
    return previous;
}

async function measureUnion(locator: Locator): Promise<Box> {
    const first = await visibleBox(locator.first());
    const boxes = [first];
    const count = Math.min(await locator.count(), 24);
    for (let i = 1; i < count; i++) {
        const box = await locator.nth(i).boundingBox();
        if (box) boxes.push(box);
    }
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    return {
        x,
        y,
        width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
        height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
    };
}

/**
 * Point the camera at a region of the screen. `"full"` zooms all the way out.
 * Without a zoom, the region is framed with some padding. The post-processor
 * eases between camera targets, and clicks/glides add their own (weaker)
 * targets that only move the camera when the action leaves the frame.
 */
export async function focusOn(
    page: Page,
    target: Locator | Box | "full",
    options: { zoom?: number } = {},
) {
    if (target === "full") {
        logCamera(page, null);
        return;
    }
    const box = "width" in target && typeof target.width === "number"
        ? (target as Box)
        : await unionBox(target as Locator);
    logCamera(page, box, { zoom: options.zoom });
}

/**
 * Show a one-line step caption from now until the next caption (or the end);
 * `null` clears it. Captions are rendered after the recording in the app's
 * own colours and font, then composited by the post-processor, which keeps
 * them off whatever is being clicked unless `position` pins them.
 */
export function caption(
    page: Page,
    text: string | null,
    options: { position?: "top" | "bottom" } = {},
) {
    const recording = recordings.get(page);
    const t = elapsed(page);
    if (recording && t !== null) {
        recording.captions.push({ t, text, ...options });
    }
}

/**
 * Hold on the current state for `ms` and keep that span out of the dead-time
 * compression - for a screen the viewer needs a moment to take in.
 */
export async function dwell(page: Page, ms: number) {
    const start = elapsed(page);
    await page.waitForTimeout(ms);
    const end = elapsed(page);
    const recording = recordings.get(page);
    if (recording && start !== null && end !== null) {
        recording.dwells.push([start, end]);
    }
}

/** A box of the given size centred on an element - e.g. the model in a 3D canvas. */
export async function regionAround(locator: Locator, width: number, height: number): Promise<Box> {
    const box = await visibleBox(locator.first());
    return {
        x: box.x + box.width / 2 - width / 2,
        y: box.y + box.height / 2 - height / 2,
        width,
        height,
    };
}

/**
 * Run `work` (typically a wait for a loader or a page change) and cut its
 * span out of the final clip.
 */
export async function offCamera<T>(
    page: Page,
    work: () => Promise<T>,
    startedAt: number | null = elapsed(page),
): Promise<T> {
    const start = startedAt;
    const result = await work();
    // Let open/close transitions finish too (dialogs, menus, fades), so the
    // cut never ends on a half-faded ghost frame. Endless animations such as
    // spinners don't count.
    await page
        .waitForFunction(
            () =>
                document
                    .getAnimations()
                    .every(
                        (animation) =>
                            animation.playState !== "running" ||
                            animation.effect?.getTiming().iterations === Infinity,
                    ),
            null,
            { timeout: 1500 },
        )
        .catch(() => {});
    // The DOM can be ahead of the screen (a busy WebGL loop delays paint);
    // close the cut only once the new state has actually been painted.
    await page.evaluate(
        () =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
    );
    await page.waitForTimeout(80);
    const end = elapsed(page);
    const recording = recordings.get(page);
    if (recording && start !== null && end !== null && end > start) {
        recording.cuts.push([start, end]);
    }
    return result;
}

/**
 * Frame the finished result and hold on it. The hold is protected from the
 * dead-time compression, so every clip ends on a readable final state.
 */
export async function holdOn(
    page: Page,
    target: Locator | Box | "full",
    options: { zoom?: number; holdMs?: number } = {},
) {
    await focusOn(page, target, options);
    await page.waitForTimeout(800);
    const recording = recordings.get(page);
    const t = elapsed(page);
    if (recording && t !== null) {
        recording.holdFrom = t;
    }
    await page.waitForTimeout(options.holdMs ?? 1800);
}
/**
 * Navigate to a page and wait for it to load fully.
 */
const cpuThrottled = new WeakSet<Page>();

/**
 * VIDEO_CPU_THROTTLE=<rate> applies CDP CPU throttling, to check that a spec's
 * waits hold up on a slower machine than the one it was written on.
 */
async function applyCpuThrottle(page: Page) {
    const rate = Number(process.env.VIDEO_CPU_THROTTLE || "0");
    if (!rate || rate <= 1 || cpuThrottled.has(page)) {
        return;
    }
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate });
    cpuThrottled.add(page);
}

export async function navigateTo(page: Page, path: string) {
    // Use localhost (not 127.0.0.1) so browser origin matches CORS allowed origins
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
    await applyCpuThrottle(page);
    await ensureRecordingOverlayInitScript(page);
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


/**
 * Start the screencast at device resolution (the viewport is 1280x720 CSS
 * px at deviceScaleFactor 2), so the post-processor can zoom into the action
 * and the text stays sharp. There is no chapter card and no Playwright action
 * overlay: the clip opens directly on the feature with its first caption.
 */
export async function startFeatureRecording(
    page: Page,
    _testInfo: TestInfo,
    options: { slug: string; caption?: string; cursorAt?: Point },
) {
    const spec = getVideoSpec(options.slug);
    const outputPath = getRawVideoPath(spec.outputName);
    const scale = await page.evaluate(() => window.devicePixelRatio || 1);

    // Park the cursor before the first frame so it does not pop in mid-clip.
    const rest = options.cursorAt ?? { x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.6 };
    await page.mouse.move(rest.x, rest.y);
    cursorPositions.set(page, rest);
    await page.waitForTimeout(250);

    await page.screencast.start({
        path: outputPath,
        size: { width: VIEWPORT.width * scale, height: VIEWPORT.height * scale },
        quality: 90,
    });

    recordings.set(page, {
        slug: spec.slug,
        title: spec.title,
        outputPath,
        startedAt: Date.now(),
        scale,
        camera: [],
        captions: [],
        cuts: [],
        dwells: [],
        holdFrom: null,
    });
    if (options.caption) {
        caption(page, options.caption);
    }
    // Establishing shot: the whole screen and the first caption, before the
    // camera starts following the action.
    await page.waitForTimeout(900);

    return outputPath;
}

/**
 * A throwaway page for offscreen rendering (captions, demo art). It lives in
 * its own browser context: a second page in the recording context resizes the
 * headless window and shrinks the recording page's screencast frames.
 */
export async function withScratchPage<T>(page: Page, work: (scratch: Page) => Promise<T>) {
    const browser = page.context().browser();
    if (!browser) {
        throw new Error("No browser to open a scratch page in");
    }
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    try {
        return await work(await context.newPage());
    } finally {
        await context.close();
    }
}

/**
 * Render each caption as a transparent PNG in the app's own colours and
 * font (read from the page's CSS variables), on a blank page so nothing of
 * the app shows through.
 */
async function renderCaptionImages(page: Page, recording: Recording) {
    const theme = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const read = (name: string, fallback: string) =>
            css.getPropertyValue(name).trim() || fallback;
        return {
            card: read("--surface-card", "#ffffff"),
            border: read("--surface-border", "#dfe7ef"),
            text: read("--text-color", "#4b5563"),
            primary: read("--primary-color", "#3b82f6"),
            font: getComputedStyle(document.body).fontFamily,
        };
    });

    const escape = (value: string) =>
        value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    return withScratchPage(page, async (captionPage) => {
        const images: (string | null)[] = [];
        for (let i = 0; i < recording.captions.length; i++) {
            const text = recording.captions[i].text;
            if (!text) {
                images.push(null);
                continue;
            }
            await captionPage.setContent(`
                <style>
                    html, body { margin: 0; background: transparent; }
                    #wrap { display: inline-block; padding: 18px 26px 30px; }
                    .pill {
                        display: inline-flex;
                        align-items: center;
                        gap: 14px;
                        padding: 11px 20px 11px 16px;
                        background: ${theme.card};
                        border: 1px solid ${theme.border};
                        border-radius: 14px;
                        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16), 0 2px 6px rgba(15, 23, 42, 0.08);
                        font-family: ${theme.font};
                        color: ${theme.text};
                        white-space: nowrap;
                        -webkit-font-smoothing: antialiased;
                    }
                    .feature {
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        padding-right: 14px;
                        border-right: 1px solid ${theme.border};
                        color: ${theme.primary};
                        font-size: 13px;
                        font-weight: 700;
                        letter-spacing: 0.08em;
                        text-transform: uppercase;
                    }
                    .dot { width: 8px; height: 8px; border-radius: 50%; background: ${theme.primary}; }
                    .text { font-size: 21px; font-weight: 600; letter-spacing: -0.005em; }
                </style>
                <div id="wrap"><div class="pill">
                    <span class="feature"><span class="dot"></span>${escape(recording.title)}</span>
                    <span class="text">${escape(text)}</span>
                </div></div>
            `);
            const file = recording.outputPath.replace(/\.webm$/, `.caption-${i}.png`);
            await captionPage.locator("#wrap").screenshot({ path: file, omitBackground: true });
            // Relative to the raw clip, so the timeline carries no host paths.
            images.push(path.basename(file));
        }
        return images;
    });
}

/**
 * Stop the screencast and write the timeline the post-processor needs
 * (camera targets, captions, cut spans, final hold) next to the raw clip.
 */
export async function stopFeatureRecording(page: Page, holdMs = 250) {
    await viewerPause(page, holdMs);
    const recording = recordings.get(page);
    const duration = elapsed(page);
    await page.screencast.stop();
    if (!recording) {
        return;
    }
    recordings.delete(page);

    const captionImages = await renderCaptionImages(page, recording);
    const timeline = {
        slug: recording.slug,
        viewport: VIEWPORT,
        scale: recording.scale,
        duration,
        camera: recording.camera,
        captions: recording.captions.map((entry, i) => ({
            ...entry,
            image: captionImages[i],
        })),
        cuts: recording.cuts,
        dwells: recording.dwells,
        holdFrom: recording.holdFrom,
    };
    fs.writeFileSync(
        recording.outputPath.replace(/\.webm$/, ".timeline.json"),
        JSON.stringify(timeline, null, 2),
    );
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
 * Wait until the worker has rendered each model's thumbnail, so the grid is
 * complete before recording starts.
 */
export async function waitForThumbnailsReady(page: Page, modelIds: number[]) {
    const apiBase = process.env.API_BASE_URL || "http://127.0.0.1:8090";
    for (const modelId of modelIds) {
        const deadline = Date.now() + 60000;
        for (;;) {
            const response = await page.request.get(`${apiBase}/models/${modelId}/thumbnail`);
            if (response.ok() && (await response.json()).status === "Ready") {
                break;
            }
            if (Date.now() > deadline) {
                throw new Error(`Thumbnail for model ${modelId} never became ready`);
            }
            await page.waitForTimeout(500);
        }
    }
}

/**
 * Accept the automatic categorisation of freshly uploaded models off camera,
 * so its review banner does not sit across the top of every clip.
 */
export async function settleImportSuggestions(page: Page) {
    const apiBase = process.env.API_BASE_URL || "http://127.0.0.1:8090";
    for (let i = 0; i < 10; i++) {
        const response = await page.request.post(
            `${apiBase}/metadata/import-suggestions/review`,
            { data: { accept: true } },
        );
        if (!response.ok() || !(await response.json()).remaining) {
            return;
        }
    }
}

/** Open the New Tab page in a dock panel with its "+" button. */
export async function openNewTabPage(page: Page, panel: Locator) {
    await glideClick(page, panel.locator(".dock-add-button").first(), {
        cutUntil: () =>
            panel.locator(".newtab-page").last().waitFor({ state: "visible", timeout: 5000 }),
    });
    return panel.locator(".newtab-page").last();
}

/** Pick a tile on the New Tab page; the placeholder turns into that tab. */
export async function pickNewTabTile(
    page: Page,
    panel: Locator,
    tileTitle: RegExp,
    /** Something on the opened page that shows it has loaded. */
    ready?: Locator,
) {
    const newtab = panel.locator(".newtab-page").last();
    const tile = newtab
        .locator(".newtab-tile")
        .filter({ has: page.locator(".newtab-tile-title", { hasText: tileTitle }) })
        .first();
    await glideClick(page, tile, {
        cutUntil: async () => {
            await newtab.waitFor({ state: "hidden", timeout: 5000 });
            await ready?.first().waitFor({ state: "visible", timeout: ciVideoTimeout });
            await waitForTabsToSettle(page);
        },
    });
}
