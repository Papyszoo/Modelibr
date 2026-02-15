import { Page, expect } from "@playwright/test";

/**
 * Navigation Helper for E2E tests
 *
 * Provides UI-based tab navigation — all actions simulate real user input.
 * The app uses a Zustand store persisted to localStorage for tab state,
 * so there are no URL query params for tab management.
 *
 * Tab icons in the dock bar:
 *   Models List  → pi-list       | Texture Sets → pi-folder
 *   Sprites      → pi-image      | Sounds       → pi-volume-up
 *   Packs        → pi-inbox      | Projects     → pi-briefcase
 *   Stages       → pi-th-large   | History      → pi-history
 *   Recycled     → pi-trash      | Settings     → pi-cog
 *   ModelViewer  → pi-box        | PackViewer   → pi-folder-open
 */

const MENU_LABELS: Record<string, string> = {
    modelList: "Models List",
    textureSets: "Texture Sets",
    sprites: "Sprites",
    sounds: "Sounds",
    packs: "Packs",
    projects: "Projects",
    stageList: "Stages",
    history: "History",
    recycledFiles: "Recycled Files",
    settings: "Settings",
};

const TAB_ICONS: Record<string, string> = {
    modelList: "pi-list",
    modelViewer: "pi-box",
    textureSets: "pi-folder",
    textureSetViewer: "pi-image",
    sprites: "pi-image",
    sounds: "pi-volume-up",
    packs: "pi-inbox",
    packViewer: "pi-folder-open",
    projects: "pi-briefcase",
    projectViewer: "pi-briefcase",
    settings: "pi-cog",
    history: "pi-history",
    recycledFiles: "pi-trash",
    stageList: "pi-th-large",
    stageEditor: "pi-th-large",
};

/**
 * Navigate to the app with a clean slate (cleared localStorage/sessionStorage).
 * After loading, the default state is a single "Models List" tab.
 */
export async function navigateToAppClean(page: Page): Promise<void> {
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";

    // First load to inject clear-storage script
    await page.goto(baseUrl);
    await page.evaluate(() => {
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch (_e) {
            /* ignore */
        }
    });

    // Reload so app initialises with fresh default state (modelList tab)
    await page.goto(baseUrl);
    await page.waitForSelector(".p-splitter", {
        state: "visible",
        timeout: 15000,
    });
}

/**
 * Navigate to the app preserving any existing persisted state.
 */
export async function navigateToApp(page: Page): Promise<void> {
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
    await page.goto(baseUrl);
    await page.waitForSelector(".p-splitter", {
        state: "visible",
        timeout: 15000,
    });
}

/**
 * Open a tab from the "+" (Add tab) context menu in the dock bar.
 *
 * @param side  Which panel's dock bar to use ('left' | 'right')
 * @param tabType  The tab type key (e.g. 'textureSets', 'packs')
 */
export async function openTabViaMenu(
    page: Page,
    tabType: string,
    side: "left" | "right" = "left",
): Promise<void> {
    const menuLabel = MENU_LABELS[tabType];
    if (!menuLabel) {
        throw new Error(`Unknown tab type "${tabType}" for menu navigation`);
    }

    // Click the "+" button in the target dock bar
    const dockBar = page.locator(`.dock-bar-${side}`);
    const addButton = dockBar.locator(".dock-add-button");
    await addButton.click();

    // Wait for the context menu to appear
    await page.waitForSelector(".dock-add-menu", {
        state: "visible",
        timeout: 5000,
    });

    // Click the menu item
    await page.locator(".dock-add-menu").getByText(menuLabel).click();

    // Wait for the context menu to close and the new tab to appear
    await expect(page.locator(".dock-add-menu")).toBeHidden({ timeout: 5000 });
    console.log(`[Nav] Opened "${menuLabel}" tab in ${side} panel via menu ✓`);
}

/**
 * Click on an existing tab in the dock bar to activate it.
 *
 * Uses the tab icon class for identification.
 */
export async function clickTab(
    page: Page,
    tabType: string,
    side?: "left" | "right",
): Promise<void> {
    const iconClass = TAB_ICONS[tabType];
    if (!iconClass) {
        throw new Error(`Unknown tab type "${tabType}"`);
    }

    let tabLocator;
    if (side) {
        tabLocator = page
            .locator(`.dock-bar-${side}`)
            .locator(`.draggable-tab:has(.${iconClass})`)
            .first();
    } else {
        tabLocator = page.locator(`.draggable-tab:has(.${iconClass})`).first();
    }

    await tabLocator.click();

    // Wait for the tab to become active
    const activeSelector = side
        ? `.dock-bar-${side} .draggable-tab.active:has(.${iconClass})`
        : `.draggable-tab.active:has(.${iconClass})`;
    await expect(page.locator(activeSelector).first()).toBeVisible({
        timeout: 5000,
    });
}

/**
 * Count how many tabs of a given type exist across all dock bars (or in a specific panel).
 */
export async function countTabsByType(
    page: Page,
    tabType: string,
    side?: "left" | "right",
): Promise<number> {
    const iconClass = TAB_ICONS[tabType];
    if (!iconClass) {
        throw new Error(`Unknown tab type "${tabType}"`);
    }

    if (side) {
        return page
            .locator(`.dock-bar-${side}`)
            .locator(`.draggable-tab:has(.${iconClass})`)
            .count();
    }
    return page.locator(`.draggable-tab:has(.${iconClass})`).count();
}

/**
 * Count how many tabs match a given tooltip text (substring match).
 * Useful for model viewer tabs whose tooltip contains the model name.
 */
export async function countTabsByTooltip(
    page: Page,
    tooltipSubstring: string,
    side?: "left" | "right",
): Promise<number> {
    const selector = `.draggable-tab[data-pr-tooltip*="${tooltipSubstring}"]`;
    if (side) {
        return page.locator(`.dock-bar-${side}`).locator(selector).count();
    }
    return page.locator(selector).count();
}

/**
 * Click a tab identified by its tooltip text (substring match).
 */
export async function clickTabByTooltip(
    page: Page,
    tooltipSubstring: string,
    side?: "left" | "right",
): Promise<void> {
    const selector = `.draggable-tab[data-pr-tooltip*="${tooltipSubstring}"]`;

    let tabLocator;
    if (side) {
        tabLocator = page
            .locator(`.dock-bar-${side}`)
            .locator(selector)
            .first();
    } else {
        tabLocator = page.locator(selector).first();
    }

    await tabLocator.click();

    // Wait for the tab to become active
    const activeSelector = side
        ? `.dock-bar-${side} .draggable-tab.active[data-pr-tooltip*="${tooltipSubstring}"]`
        : `.draggable-tab.active[data-pr-tooltip*="${tooltipSubstring}"]`;
    await expect(page.locator(activeSelector).first()).toBeVisible({
        timeout: 5000,
    });
}

/**
 * Close a tab identified by its tooltip text.
 */
export async function closeTabByTooltip(
    page: Page,
    tooltipSubstring: string,
): Promise<void> {
    const tab = page
        .locator(`.draggable-tab[data-pr-tooltip*="${tooltipSubstring}"]`)
        .first();
    const closeBtn = tab.locator(".tab-close-btn");
    await closeBtn.click();

    // Wait for the tab to disappear
    await expect(tab).toBeHidden({ timeout: 5000 });
}

/**
 * Close a tab identified by its tab type icon.
 */
export async function closeTabByType(
    page: Page,
    tabType: string,
): Promise<void> {
    const iconClass = TAB_ICONS[tabType];
    if (!iconClass) {
        throw new Error(`Unknown tab type "${tabType}"`);
    }

    const tab = page.locator(`.draggable-tab:has(.${iconClass})`).first();
    const closeBtn = tab.locator(".tab-close-btn");
    await closeBtn.click();

    // Wait for the tab to disappear
    await expect(tab).toBeHidden({ timeout: 5000 });
}

/**
 * Check whether a tab of the given type is currently active.
 */
export async function isTabActive(
    page: Page,
    tabType: string,
    side?: "left" | "right",
): Promise<boolean> {
    const iconClass = TAB_ICONS[tabType];
    if (!iconClass) {
        throw new Error(`Unknown tab type "${tabType}"`);
    }

    const selector = `.draggable-tab.active:has(.${iconClass})`;
    if (side) {
        return page
            .locator(`.dock-bar-${side}`)
            .locator(selector)
            .isVisible({ timeout: 2000 })
            .catch(() => false);
    }
    return page
        .locator(selector)
        .isVisible({ timeout: 2000 })
        .catch(() => false);
}

/**
 * Get the total number of tabs across all dock bars.
 */
export async function getTotalTabCount(page: Page): Promise<number> {
    return page.locator(".draggable-tab").count();
}

/**
 * Navigate to app clean, then open a specific tab type.
 * Convenience wrapper combining navigateToAppClean + openTabViaMenu.
 */
export async function navigateToTab(
    page: Page,
    tabType: string,
): Promise<void> {
    await navigateToAppClean(page);

    // Default state already has modelList — skip if that's the target
    if (tabType === "modelList") {
        return;
    }

    await openTabViaMenu(page, tabType, "left");
}

/**
 * Open a model viewer by navigating to the model list and double-clicking
 * on the model card. This simulates real user interaction.
 *
 * @param modelName  Display name of the model to find in the grid
 */
export async function openModelViewer(
    page: Page,
    modelName: string,
): Promise<void> {
    // Ensure we're on the model list
    const modelListTab = page.locator(
        ".dock-bar-left .draggable-tab:has(.pi-list)",
    );
    if (await modelListTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await modelListTab.click();
        // Wait for model list content to load
        await page.waitForSelector(".model-card, .no-results, .empty-state", {
            state: "visible",
            timeout: 10000,
        });
    }

    // Wait for model list to finish loading (cards or empty state)
    await page.waitForSelector(".model-card, .no-results, .empty-state", {
        state: "visible",
        timeout: 10000,
    });

    // Find and double-click the model card
    const clickTarget = page.locator(`text="${modelName}"`).first();
    if (await clickTarget.isVisible({ timeout: 5000 }).catch(() => false)) {
        await clickTarget.dblclick();
    } else {
        // Fall back to partial match
        const card = page
            .locator(`.model-card:has-text("${modelName}")`)
            .first();
        await card.dblclick();
    }

    // Wait for the model viewer to load
    await page.waitForSelector(
        ".viewer-canvas canvas, .version-dropdown-trigger",
        { state: "visible", timeout: 30000 },
    );
    console.log(`[Nav] Opened model viewer for "${modelName}" ✓`);
}
