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
 * DOM until the *inner* container scrolls to them — the outer list shell no
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

    const scrollHeight = await container
        .evaluate((el) => el.scrollHeight)
        .catch(() => 0);
    for (let pos = 0; pos <= scrollHeight; pos += step) {
        await container.evaluate((el, y) => el.scrollTo(0, y), pos).catch(() => {});
        if (await card.isVisible().catch(() => false)) return true;
    }
    return card.isVisible().catch(() => false);
}
