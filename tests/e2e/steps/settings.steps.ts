/**
 * Step definitions for Settings E2E tests
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { SettingsPage } from "../pages/SettingsPage";

const { Given, When, Then } = createBdd();

// Background

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

Then("the camera angle field should have a value", async ({ page }) => {
    console.log("Checking camera angle field has a value...");
    const settingsPage = new SettingsPage(page);
    const value = await settingsPage.getCameraAngle();
    console.log(`Camera angle value: "${value}"`);
    expect(value).toBeTruthy();
});

Then("the thumbnail width field should have a value", async ({ page }) => {
    console.log("Checking thumbnail width field has a value...");
    const settingsPage = new SettingsPage(page);
    const value = await settingsPage.getThumbnailWidth();
    console.log(`Thumbnail width value: "${value}"`);
    expect(value).toBeTruthy();
});

Then("the thumbnail height field should have a value", async ({ page }) => {
    console.log("Checking thumbnail height field has a value...");
    const settingsPage = new SettingsPage(page);
    const value = await settingsPage.getThumbnailHeight();
    console.log(`Thumbnail height value: "${value}"`);
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
    "I change the thumbnail width to {string}",
    async ({ page }, value: string) => {
        console.log(`Changing thumbnail width to "${value}"...`);
        const settingsPage = new SettingsPage(page);
        await settingsPage.setThumbnailWidth(value);
        console.log(`Thumbnail width set to "${value}"`);
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
    "the thumbnail width should be {string}",
    async ({ page }, expectedValue: string) => {
        console.log(`Checking thumbnail width is "${expectedValue}"...`);
        const settingsPage = new SettingsPage(page);
        const value = await settingsPage.getThumbnailWidth();
        console.log(`Thumbnail width value: "${value}"`);
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
