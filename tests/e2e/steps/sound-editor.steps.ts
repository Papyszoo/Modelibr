/**
 * Step definitions for Sound Editor E2E tests
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";

const { Given, When, Then } = createBdd();

// Note: "I open the sound {string} for viewing" is defined in sounds.steps.ts
// and handles name lookup via shared state (avoiding issues with renamed sounds)

Then("the waveform should be rendered", async ({ page }) => {
    // Look for a canvas element (used by waveform libraries like wavesurfer.js)
    // or a waveform container
    const waveform = page.locator("canvas, .waveform, [data-waveform]").first();

    await expect(waveform).toBeVisible({ timeout: 15000 });
    console.log("[Verify] Waveform is rendered ✓");
});

Then("the playback controls should be visible", async ({ page }) => {
    // Look for play/pause buttons with PrimeIcons
    const playButton = page.locator(
        "button:has(.pi-play), button.p-button:has(.pi-play)",
    );
    const pauseButton = page.locator(
        "button:has(.pi-pause), button.p-button:has(.pi-pause)",
    );

    // At least one of play or pause should be visible
    const playVisible = await playButton
        .first()
        .isVisible()
        .catch(() => false);
    const pauseVisible = await pauseButton
        .first()
        .isVisible()
        .catch(() => false);

    expect(playVisible || pauseVisible).toBe(true);
    console.log("[Verify] Playback controls are visible ✓");
});

// Note: "I click the play button" is defined in sounds.steps.ts — avoid duplication

When("I click the pause button", async ({ page }) => {
    const pauseButton = page
        .locator("button:has(.pi-pause), button.p-button:has(.pi-pause)")
        .first();

    await expect(pauseButton).toBeVisible({ timeout: 10000 });
    await pauseButton.click();
    console.log("[Action] Clicked pause button");
});

Then("the pause button should be visible", async ({ page }) => {
    const pauseButton = page
        .locator("button:has(.pi-pause), button.p-button:has(.pi-pause)")
        .first();

    await expect(pauseButton).toBeVisible({ timeout: 10000 });
    console.log("[Verify] Pause button is visible ✓");
});

Then("the play button should be visible", async ({ page }) => {
    const playButton = page
        .locator("button:has(.pi-play), button.p-button:has(.pi-play)")
        .first();

    await expect(playButton).toBeVisible({ timeout: 10000 });
    console.log("[Verify] Play button is visible ✓");
});

Then("the duration display should show a valid time", async ({ page }) => {
    // Look for a time display element showing a pattern like "0:00 / 0:05" or "0:00"
    // Try multiple possible selectors
    const timeDisplay = page
        .locator(
            ".duration, .time-display, .sound-duration, [class*='duration'], [class*='time']",
        )
        .first();

    const timeVisible = await timeDisplay.isVisible().catch(() => false);

    if (timeVisible) {
        const text = await timeDisplay.textContent();
        // Verify it contains a time-like pattern (digits with colon)
        expect(text).toMatch(/\d+:\d{2}/);
        console.log(`[Verify] Duration display shows valid time: "${text}" ✓`);
    } else {
        // Fallback: search for any element containing a time pattern on the page
        const anyTimeElement = page
            .locator(":text-matches('\\\\d+:\\\\d{2}')")
            .first();
        await expect(anyTimeElement).toBeVisible({ timeout: 10000 });
        const text = await anyTimeElement.textContent();
        console.log(`[Verify] Duration display shows valid time: "${text}" ✓`);
    }
});
