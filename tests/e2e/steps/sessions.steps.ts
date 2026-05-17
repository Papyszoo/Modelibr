import { createBdd } from "playwright-bdd";
import { expect, type Page } from "@playwright/test";
import { navigateToAppClean } from "../helpers/navigation-helper";

const { Given, When, Then } = createBdd();

const STORAGE_KEY = "modelibr_navigation";

// Predefined tab payload used by the "demo" archived session — kept in one
// place so the assertions downstream can rely on the same labels.
const DEMO_TABS = {
    left: [
        {
            id: "modelList",
            type: "modelList",
            label: "Models",
            params: {},
            internalUiState: {},
        },
        {
            id: "sounds",
            type: "sounds",
            label: "Sounds",
            params: {},
            internalUiState: {},
        },
    ],
    right: [
        {
            id: "sprites",
            type: "sprites",
            label: "Sprites",
            params: { panel: "right" },
            internalUiState: {},
        },
    ],
};

/**
 * Reach into the persisted Zustand state and append a closed-window entry to
 * `recentlyClosedWindows`. Used by the "demo" + "peer" fixtures so the
 * Sessions section has something to render without driving real cross-tab
 * close events (which are timing-sensitive in Playwright).
 */
async function archiveSession(
    page: Page,
    options: {
        leftTabs?: Array<Record<string, unknown>>;
        rightTabs?: Array<Record<string, unknown>>;
        closedAt?: string;
    },
): Promise<void> {
    await page.evaluate(
        ({ storageKey, leftTabs, rightTabs, closedAt }) => {
            const raw = localStorage.getItem(storageKey);
            const parsed = raw
                ? JSON.parse(raw)
                : {
                      state: {
                          activeWindows: {},
                          recentlyClosedTabs: [],
                          recentlyClosedWindows: [],
                      },
                      version: 0,
                  };

            const tabs = [...leftTabs, ...rightTabs];
            const entry = {
                closedAt,
                state: {
                    tabs,
                    activeTabId: tabs[0]?.id ?? null,
                    activeRightTabId: rightTabs[0]?.id ?? null,
                    splitterSize: 50,
                    lastActiveAt: closedAt,
                },
            };

            parsed.state = {
                ...(parsed.state ?? {}),
                recentlyClosedWindows: [
                    entry,
                    ...(parsed.state?.recentlyClosedWindows ?? []),
                ],
            };

            localStorage.setItem(storageKey, JSON.stringify(parsed));
        },
        {
            storageKey: STORAGE_KEY,
            leftTabs: options.leftTabs ?? [],
            rightTabs: options.rightTabs ?? [],
            closedAt: options.closedAt ?? new Date().toISOString(),
        },
    );
}

Given("I am on the app with a clean slate", async ({ page }) => {
    await navigateToAppClean(page);
});

Given(
    'an archived session "demo" exists with 2 left tabs and 1 right tab',
    async ({ page }) => {
        await archiveSession(page, {
            leftTabs: DEMO_TABS.left,
            rightTabs: DEMO_TABS.right,
        });
        // Reload so the running app sees the injected state.
        await page.reload();
        await page.waitForSelector(".p-splitter", {
            state: "visible",
            timeout: 15000,
        });
    },
);

Given("a second browser page is opened", async ({ context, page }) => {
    // Open a peer page in the same browser context so localStorage is
    // shared. We deliberately keep a handle on it via the global so a later
    // step can drive it before this scope ends.
    const peer = await context.newPage();
    await peer.goto(page.url());
    await peer.waitForSelector(".p-splitter", {
        state: "visible",
        timeout: 15000,
    });
    // Hand the peer back through page-locals so the next step can find it.
    (page as unknown as { __peer__: Page }).__peer__ = peer;
});

When(
    'the second page archives an extra session "peer" with 1 left tab',
    async ({ page }) => {
        const peer = (page as unknown as { __peer__: Page }).__peer__;
        await archiveSession(peer, {
            leftTabs: [
                {
                    id: "history",
                    type: "history",
                    label: "Upload History",
                    params: {},
                    internalUiState: {},
                },
            ],
        });
        await peer.close();
    },
);

When("I reload the app", async ({ page }) => {
    await page.reload();
    await page.waitForSelector(".p-splitter", {
        state: "visible",
        timeout: 15000,
    });
});

When(
    "I open the New Tab page in the left panel",
    async ({ page }) => {
        const addButton = page
            .locator(".dock-bar-left .dock-add-button")
            .first();
        await expect(addButton).toBeVisible({ timeout: 10000 });
        await addButton.click();
        await page
            .locator(".newtab-page")
            .last()
            .waitFor({ state: "visible", timeout: 5000 });
    },
);

When("I click the session card", async ({ page }) => {
    const sessionsSection = page.locator(
        '[data-testid="newtab-sessions-section"]',
    );
    await expect(sessionsSection).toBeVisible({ timeout: 5000 });
    const card = sessionsSection
        .locator('button[aria-label^="Restore session"]')
        .first();
    await card.click();
    // Wait for the New Tab placeholder to collapse before assertions.
    await page.locator(".newtab-page").waitFor({
        state: "detached",
        timeout: 5000,
    });
});

Then("the Sessions section should be visible", async ({ page }) => {
    await expect(
        page.locator('[data-testid="newtab-sessions-section"]'),
    ).toBeVisible({ timeout: 5000 });
});

Then("the Sessions section should be gone", async ({ page }) => {
    await expect(
        page.locator('[data-testid="newtab-sessions-section"]'),
    ).toBeHidden({ timeout: 5000 });
});

Then(
    "the session card should show {int} on the left and {int} on the right",
    async ({ page }, leftCount: number, rightCount: number) => {
        const section = page.locator(
            '[data-testid="newtab-sessions-section"]',
        );
        const card = section
            .locator('button[aria-label^="Restore session"]')
            .first();
        const counts = card
            .locator(".newtab-session-count")
            .allTextContents();
        const values = await counts;
        expect(values).toEqual([String(leftCount), String(rightCount)]);
    },
);

Then(
    'the dock should contain the {string} tab on the {word}',
    async ({ page }, label: string, side: string) => {
        const icons: Record<string, string> = {
            Models: "pi-list",
            Sounds: "pi-volume-up",
            Sprites: "pi-image",
        };
        const iconClass = icons[label];
        if (!iconClass) {
            throw new Error(`No icon mapped for label "${label}"`);
        }
        const dockBar = page.locator(`.dock-bar-${side}`);
        const tab = dockBar
            .locator(`.draggable-tab:has(.${iconClass})`)
            .first();
        await expect(tab).toBeVisible({ timeout: 5000 });
    },
);

Then(
    "exactly {int} session card should be present",
    async ({ page }, expected: number) => {
        const section = page.locator(
            '[data-testid="newtab-sessions-section"]',
        );
        await expect(section).toBeVisible({ timeout: 5000 });
        const cards = section.locator('button[aria-label^="Restore session"]');
        await expect(cards).toHaveCount(expected, { timeout: 5000 });
    },
);

Then(
    "exactly {int} session cards should be present",
    async ({ page }, expected: number) => {
        const section = page.locator(
            '[data-testid="newtab-sessions-section"]',
        );
        await expect(section).toBeVisible({ timeout: 5000 });
        const cards = section.locator('button[aria-label^="Restore session"]');
        await expect(cards).toHaveCount(expected, { timeout: 5000 });
    },
);
