import { Locator, Page } from "@playwright/test";

/**
 * Progressively scroll a VirtuosoGrid's scroll container so an off-viewport
 * card is rendered into the DOM, resolving once the card is visible (or the
 * container is exhausted).
 *
 * Why this exists: the category-sidebar rework put every asset list behind a
 * `<sidebar> + <main>` split and moved the scrollable region onto the
 * `*-list-main` / `*-grid-main` element. That also narrows the grid (fewer
 * columns), so cards past the first viewport rows are virtualised out of the
 * DOM until the *inner* container scrolls to them - the outer list shell no
 * longer scrolls. Locators that assume every card is rendered now need to
 * reveal it first.
 *
 * @param scrollSelector the inner scroll container, e.g. `.model-grid-main`,
 *        `.texture-set-list-main`, `.environment-map-list-main`.
 */
export async function revealVirtualizedCard(
    page: Page,
    scrollSelector: string,
    card: Locator,
    { step = 300 }: { step?: number } = {},
): Promise<boolean> {
    if (await card.isVisible().catch(() => false)) return true;

    const container = page.locator(scrollSelector).first();
    if (!(await container.count())) {
        return card.isVisible().catch(() => false);
    }

    // Run-before-load guard: when called right after navigation the list is
    // still fetching, so the container is empty/short and the scroll loop below
    // would find nothing and leave the list pinned at the top. Wait until the
    // content has settled - scrollHeight stable across two consecutive reads -
    // so the loop scrolls a fully-rendered grid.
    await waitForStableScrollHeight(page, container);

    const scrollHeight = await container
        .evaluate((el) => el.scrollHeight)
        .catch(() => 0);
    for (let pos = 0; pos <= scrollHeight; pos += step) {
        await container.evaluate((el, y) => el.scrollTo(0, y), pos).catch(() => {});
        if (await card.isVisible().catch(() => false)) return true;
    }
    return card.isVisible().catch(() => false);
}

async function waitForStableScrollHeight(
    page: Page,
    container: Locator,
    { timeout = 6000, interval = 100 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
    const deadline = Date.now() + timeout;
    let previous = -1;
    let stableReads = 0;
    while (Date.now() < deadline) {
        const current = await container
            .evaluate((el) => el.scrollHeight)
            .catch(() => 0);
        // Two equal reads = the grid stopped growing (loaded, or an empty
        // result set that never grows). Require two to avoid a false "settled"
        // on the single read that lands before the fetch's first render.
        if (current === previous) {
            if (++stableReads >= 1) return;
        } else {
            stableReads = 0;
            previous = current;
        }
        // Bounded poll interval that absorbs the async list fetch + render;
        // this is the documented sleep exception (fixed interval inside a
        // bounded loop), not a "let React settle" blind wait.
        await page.waitForTimeout(interval);
    }
}
