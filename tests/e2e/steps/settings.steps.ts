/**
 * Step definitions for Settings E2E tests
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { SettingsPage } from "../pages/SettingsPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

// Background

Given("settings are reset to defaults via API", async ({ page }) => {
    const response = await page.request.put(`${API_BASE}/settings`, {
        data: {
            maxFileSizeBytes: 1073741824,
            maxThumbnailSizeBytes: 10485760,
            thumbnailFrameCount: 30,
            thumbnailSize: 256,
            generateThumbnailOnUpload: true,
            generateAnimatedThumbnail: true,
            textureProxySize: 512,
        },
    });
    expect(response.ok()).toBeTruthy();
    console.log("[API] Settings reset to defaults");
});

Given("I am on the settings page", async ({ page }) => {
    console.log("Navigating to settings page...");
    const settingsPage = new SettingsPage(page);
    await settingsPage.navigateToSettings();
    await settingsPage.waitForLoaded();
    const visible = await settingsPage.isVisible();
    console.log(`Settings page visible: ${visible}`);
    expect(visible).toBe(true);
});

// Display

Then(
    "the settings page title should be {string}",
    async ({ page }, expectedTitle: string) => {
        console.log(`Checking settings page title is "${expectedTitle}"...`);
        const settingsPage = new SettingsPage(page);
        const title = await settingsPage.getTitle();
        console.log(`Settings page title: "${title}"`);
        expect(title).toContain(expectedTitle);
    },
);

Then("the max file size field should have a value", async ({ page }) => {
    console.log("Checking max file size field has a value...");
    const settingsPage = new SettingsPage(page);
    const value = await settingsPage.getMaxFileSize();
    console.log(`Max file size value: "${value}"`);
    expect(value).toBeTruthy();
});

Then("the max thumbnail size field should have a value", async ({ page }) => {
    console.log("Checking max thumbnail size field has a value...");
    const settingsPage = new SettingsPage(page);
    const value = await settingsPage.getMaxThumbnailSize();
    console.log(`Max thumbnail size value: "${value}"`);
    expect(value).toBeTruthy();
});

Then("the frame count field should have a value", async ({ page }) => {
    console.log("Checking frame count field has a value...");
    const settingsPage = new SettingsPage(page);
    const value = await settingsPage.getFrameCount();
    console.log(`Frame count value: "${value}"`);
    expect(value).toBeTruthy();
});

Then("the thumbnail size field should have a value", async ({ page }) => {
    console.log("Checking thumbnail size field has a value...");
    const settingsPage = new SettingsPage(page);
    const value = await settingsPage.getThumbnailSize();
    console.log(`Thumbnail size value: "${value}"`);
    expect(value).toBeTruthy();
});

Then("the save button should be disabled", async ({ page }) => {
    console.log("Checking save button is disabled...");
    const settingsPage = new SettingsPage(page);
    const enabled = await settingsPage.isSaveEnabled();
    console.log(`Save button enabled: ${enabled}`);
    expect(enabled).toBe(false);
});

// Modify

When(
    "I change the thumbnail size to {string}",
    async ({ page }, value: string) => {
        console.log(`Changing thumbnail size to "${value}"...`);
        const settingsPage = new SettingsPage(page);
        await settingsPage.setThumbnailSize(value);
        console.log(`Thumbnail size set to "${value}"`);
    },
);

Then("the save button should be enabled", async ({ page }) => {
    console.log("Checking save button is enabled...");
    const settingsPage = new SettingsPage(page);
    const enabled = await settingsPage.isSaveEnabled();
    console.log(`Save button enabled: ${enabled}`);
    expect(enabled).toBe(true);
});

Then("the unsaved changes indicator should be visible", async ({ page }) => {
    console.log("Checking unsaved changes indicator is visible...");
    const settingsPage = new SettingsPage(page);
    const hasChanges = await settingsPage.hasUnsavedChanges();
    console.log(`Unsaved changes visible: ${hasChanges}`);
    expect(hasChanges).toBe(true);
});

// Save

When("I save the settings", async ({ page }) => {
    console.log("Saving settings...");
    const settingsPage = new SettingsPage(page);
    await settingsPage.save();
    // Wait briefly for save to complete
    await page.waitForTimeout(1000);
    console.log("Settings saved");
});

Then("the success message should be visible", async ({ page }) => {
    console.log("Checking success message is visible...");
    const settingsPage = new SettingsPage(page);
    const visible = await settingsPage.isSuccessVisible();
    const message = await settingsPage.getSuccessMessage();
    console.log(`Success visible: ${visible}, message: "${message}"`);
    expect(visible).toBe(true);
});

When("I reload the settings page", async ({ page }) => {
    console.log("Reloading settings page...");
    const settingsPage = new SettingsPage(page);
    await page.reload();
    await settingsPage.waitForLoaded();
    console.log("Settings page reloaded");
});

Then(
    "the thumbnail size should be {string}",
    async ({ page }, expectedValue: string) => {
        console.log(`Checking thumbnail size is "${expectedValue}"...`);
        const settingsPage = new SettingsPage(page);
        const value = await settingsPage.getThumbnailSize();
        console.log(`Thumbnail size value: "${value}"`);
        expect(value).toBe(expectedValue);
    },
);

// Validation

When(
    "I change the max file size to {string}",
    async ({ page }, value: string) => {
        console.log(`Changing max file size to "${value}"...`);
        const settingsPage = new SettingsPage(page);
        await settingsPage.setMaxFileSize(value);
        console.log(`Max file size set to "${value}"`);
    },
);

Then("a validation error should be visible", async ({ page }) => {
    console.log("Checking for validation errors...");
    const settingsPage = new SettingsPage(page);
    const hasErrors = await settingsPage.hasValidationErrors();
    const errors = await settingsPage.getValidationErrors();
    console.log(
        `Has validation errors: ${hasErrors}, errors: ${JSON.stringify(errors)}`,
    );
    expect(hasErrors).toBe(true);
});

// Animated Thumbnail

Then(
    "the generate animated thumbnail checkbox should be checked",
    async ({ page }) => {
        console.log("Checking generate animated thumbnail is checked...");
        const settingsPage = new SettingsPage(page);
        const checked = await settingsPage.isGenerateAnimatedThumbnailChecked();
        console.log(`Generate animated thumbnail checked: ${checked}`);
        expect(checked).toBe(true);
    },
);

Then(
    "the generate animated thumbnail checkbox should be unchecked",
    async ({ page }) => {
        console.log("Checking generate animated thumbnail is unchecked...");
        const settingsPage = new SettingsPage(page);
        const checked = await settingsPage.isGenerateAnimatedThumbnailChecked();
        console.log(`Generate animated thumbnail checked: ${checked}`);
        expect(checked).toBe(false);
    },
);

When("I toggle generate animated thumbnail", async ({ page }) => {
    console.log("Toggling generate animated thumbnail...");
    const settingsPage = new SettingsPage(page);
    await settingsPage.toggleGenerateAnimatedThumbnail();
    console.log("Toggled generate animated thumbnail");
});

Then("the frame count field should be visible", async ({ page }) => {
    console.log("Checking frame count field is visible...");
    const settingsPage = new SettingsPage(page);
    const visible = await settingsPage.isFrameCountVisible();
    console.log(`Frame count visible: ${visible}`);
    expect(visible).toBe(true);
});

Then("the frame count field should not be visible", async ({ page }) => {
    console.log("Checking frame count field is hidden...");
    const settingsPage = new SettingsPage(page);
    const visible = await settingsPage.isFrameCountVisible();
    console.log(`Frame count visible: ${visible}`);
    expect(visible).toBe(false);
});

// Regenerate All Thumbnails

Then("the regenerate all thumbnails button should be visible", async ({ page }) => {
    console.log("Checking regenerate-all button is visible...");
    const settingsPage = new SettingsPage(page);
    const visible = await settingsPage.isRegenerateAllButtonVisible();
    console.log(`Regenerate-all button visible: ${visible}`);
    expect(visible).toBe(true);
});

When("I click the regenerate all thumbnails button", async ({ page }) => {
    console.log("Clicking regenerate-all and accepting modal...");
    const settingsPage = new SettingsPage(page);
    await settingsPage.clickRegenerateAll();
    console.log("Regenerate-all confirmed");
});

When("I open the regenerate all thumbnails confirmation", async ({ page }) => {
    console.log("Opening regenerate-all confirmation modal...");
    const settingsPage = new SettingsPage(page);
    // Click the underlying button — leaves the modal open without accepting.
    await page
        .locator('button:has-text("Regenerate All Thumbnails")')
        .click();
});

Then("the regenerate confirmation dialog should be visible", async ({ page }) => {
    console.log("Checking regenerate confirmation dialog is visible...");
    const settingsPage = new SettingsPage(page);
    const visible = await settingsPage.isRegenerateConfirmDialogVisible();
    console.log(`Regenerate confirmation visible: ${visible}`);
    expect(visible).toBe(true);
});

When("I cancel the regenerate confirmation", async ({ page }) => {
    console.log("Cancelling regenerate confirmation...");
    const settingsPage = new SettingsPage(page);
    await settingsPage.cancelRegenerateConfirmDialog();
});

Then("a regenerate success message should not be visible", async ({ page }) => {
    console.log("Verifying no regenerate success message appears...");
    // Brief settle window — the API call would resolve quickly if it had fired.
    await page.waitForTimeout(500);
    const banner = page.locator(".settings-success");
    const visible = await banner.isVisible();
    if (visible) {
        const text = (await banner.textContent()) ?? "";
        expect(text).not.toMatch(/Queued \d+ thumbnail regeneration/);
    } else {
        expect(visible).toBe(false);
    }
});

Then("a regenerate success message should be visible", async ({ page }) => {
    console.log("Checking regenerate success message...");
    const settingsPage = new SettingsPage(page);
    const visible = await settingsPage.isSuccessVisible();
    const message = await settingsPage.getSuccessMessage();
    console.log(`Regenerate success visible: ${visible}, message: "${message}"`);
    expect(visible).toBe(true);
    // The success message includes "Queued N thumbnail regeneration..." (N may be 0)
    expect(message ?? "").toMatch(/Queued \d+ thumbnail regeneration/);
});

// Theme

When("I change the theme to {string}", async ({ page }, value: string) => {
    console.log(`Changing theme to "${value}"...`);
    const settingsPage = new SettingsPage(page);
    await settingsPage.setTheme(value as "light" | "dark");
    console.log(`Theme set to "${value}"`);
});

Then(
    "the theme should be {string}",
    async ({ page }, expectedValue: string) => {
        console.log(`Checking theme is "${expectedValue}"...`);
        const settingsPage = new SettingsPage(page);
        const value = await settingsPage.getTheme();
        console.log(`Theme value: "${value}"`);
        expect(value).toBe(expectedValue);
    },
);
