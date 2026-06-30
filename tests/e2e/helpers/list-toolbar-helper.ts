import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Open the collapsible Search panel of a shared list-toolbar (Models,
 * Texture Sets, Environment Maps, Sounds, Sprites).
 *
 * Returns the visible `.search-input` locator so callers can chain
 * `.fill(...)` without re-querying.
 *
 * Throws if:
 *  - the page does not expose a `.search-input` AND has no "Search"
 *    toolbar button (i.e. we're on the wrong page entirely), or
 *  - the Search button is present but clicking it does not reveal the
 *    `.search-input` within `timeout` ms (panel mechanism broken).
 *
 * Silent failure is *not* a valid outcome here — tests downstream of
 * this helper assume the input is usable.
 */
export async function ensureToolbarSearchOpen(
    page: Page,
    { timeout = 3000 }: { timeout?: number } = {},
): Promise<Locator> {
    const input = page.locator(".search-input").first();
    if (await input.isVisible().catch(() => false)) {
        return input;
    }

    const searchButton = page
        .getByRole("button", { name: /^search$/i })
        .first();
    const buttonVisible = await searchButton
        .isVisible()
        .catch(() => false);
    if (!buttonVisible) {
        throw new Error(
            "ensureToolbarSearchOpen: no `.search-input` and no `Search` toolbar button visible. " +
                "Verify the current page renders the shared list-toolbar before calling this helper.",
        );
    }

    await searchButton.click();
    await expect(input).toBeVisible({ timeout });
    return input;
}

/**
 * Wait for the toolbar `.list-toolbar-count` chip text to stop changing
 * (two equal reads `stableForMs` ms apart). Use this as a deterministic
 * proxy for "the list-data query has resolved" after a filter switch,
 * kind-tab click, or search-name change. Replaces `waitForTimeout(...)`
 * sleeps that assume a debounce delay.
 *
 * If the count chip is not visible (some pages render it elsewhere), the
 * caller is expected to pass an alternative `locator`.
 */
export async function waitForCountLabelStable(
    page: Page,
    {
        locator,
        stableForMs = 250,
        timeout = 10000,
        pollIntervalMs = 100,
    }: {
        locator?: Locator;
        stableForMs?: number;
        timeout?: number;
        pollIntervalMs?: number;
    } = {},
): Promise<string> {
    const target = locator ?? page.locator(".list-toolbar-count").first();
    await expect(target).toBeVisible({ timeout });

    const deadline = Date.now() + timeout;
    let lastValue = (await target.textContent()) ?? "";
    let stableSince = Date.now();
    while (Date.now() < deadline) {
        await page.waitForTimeout(pollIntervalMs);
        const value = (await target.textContent()) ?? "";
        if (value === lastValue) {
            if (Date.now() - stableSince >= stableForMs) {
                return value;
            }
        } else {
            lastValue = value;
            stableSince = Date.now();
        }
    }
    return lastValue;
}

/**
 * Narrow a virtualised list (VirtuosoGrid) to a single card by name
 * using the toolbar search panel, so the card is rendered in DOM even
 * if it would otherwise scroll off-screen.
 *
 * Returns the visible search input after the result count has stabilised
 * to its narrowed value. Internally uses `waitForCountLabelStable` rather
 * than a fixed sleep, so it adapts to slower CI or longer debounces.
 *
 * Use this anywhere a step asserts `getCardByName(...).toBeVisible()`
 * on a virtualised list that could contain dozens of items.
 */
export async function narrowVirtualisedList(
    page: Page,
    name: string,
    {
        countLocator,
        timeout = 10000,
    }: { countLocator?: Locator; timeout?: number } = {},
): Promise<Locator> {
    const input = await ensureToolbarSearchOpen(page, { timeout });
    await input.fill(name);
    await waitForCountLabelStable(page, { locator: countLocator, timeout });
    return input;
}

/**
 * Wait for an R3F (react-three-fiber) canvas to finish initialising its
 * WebGL drawing buffer inside the given container. R3F sets the
 * canvas's `width`/`height` drawing-buffer attributes as soon as the
 * WebGL context is created — these are a more stable readiness signal
 * than CSS visibility, because the canvas is briefly 0×0 while the
 * absolutely-positioned R3F wrapper waits for the flex parent to lay
 * out.
 *
 * Pass the container selector that holds the canvas (e.g.
 * `".texture-preview-canvas"`, `".environment-map-preview"`).
 *
 * Default budget is 60s, not 30s: the CI runner has no GPU, so the viewer
 * renders on software WebGL (SwiftShader). Decoding the source textures (EXR/
 * TIFF in particular) plus the first textured render genuinely takes longer
 * there than on a real GPU — the canvas provably mounts (failure call logs
 * resolve to a visible `<canvas data-engine="three.js r185">`), it's just
 * slower than the old 30s wait. 60s absorbs that without masking a crash; the
 * test-level timeout (300s for these specs) still bounds a genuine hang. On a
 * real user's GPU this resolves in well under a second.
 */
export async function waitForR3FCanvas(
    page: Page,
    containerSelector: string,
    { timeout = 60000 }: { timeout?: number } = {},
): Promise<void> {
    await page.waitForSelector(`${containerSelector} canvas`, {
        state: "attached",
        timeout,
    });
    await expect
        .poll(
            async () =>
                await page.evaluate((selector) => {
                    const c = document.querySelector(
                        `${selector} canvas`,
                    ) as HTMLCanvasElement | null;
                    if (!c) return 0;
                    return Math.min(c.width, c.height);
                }, containerSelector),
            {
                timeout,
                message: `R3F canvas under "${containerSelector}" never initialised drawing buffer`,
            },
        )
        .toBeGreaterThan(0);
}
