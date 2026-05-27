import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";

import {
    ensureToolbarSearchOpen,
    narrowVirtualisedList,
} from "../helpers/list-toolbar-helper";

const { When, Then } = createBdd();

// ── Toolbar search shared steps ─────────────────────────────────────
//
// These are deliberately page-agnostic: any list page using the shared
// `.search-input` (Models, Texture Sets, Sounds, Sprites, Environment
// Maps) can reuse them. The matching `Given I am on the X page` step
// already exists per-page.

When("I open the toolbar search panel", async ({ page }) => {
    await ensureToolbarSearchOpen(page);
});

When(
    "I type {string} one character at a time into the toolbar search",
    async ({ page }, text: string) => {
        const input = await ensureToolbarSearchOpen(page);
        // `pressSequentially` mimics a human typing, including delay
        // between keystrokes. This is the key behaviour we're checking:
        // a 60ms inter-keystroke delay straddles the 300ms debounce in
        // useDebouncedValue and can trigger mid-typing query-key changes
        // which previously unmounted the input and dropped focus.
        await input.focus();
        await input.pressSequentially(text, { delay: 60 });
    },
);

Then("the toolbar search input should remain focused", async ({ page }) => {
    const focusedTagPlusClass = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return "<none>";
        return `${active.tagName.toLowerCase()}.${active.className}`;
    });
    expect(focusedTagPlusClass).toContain("search-input");
});

Then(
    "the toolbar search input value should equal {string}",
    async ({ page }, expected: string) => {
        const input = page.locator(".search-input").first();
        await expect(input).toHaveValue(expected);
    },
);

When(
    "I narrow the toolbar search to {string}",
    async ({ page }, text: string) => {
        await narrowVirtualisedList(page, text);
    },
);
