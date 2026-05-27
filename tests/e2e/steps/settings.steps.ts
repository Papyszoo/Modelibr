/**
 * Step definitions for Settings E2E tests
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import {
    SettingsPage,
    type SettingsSectionKey,
} from "../pages/SettingsPage";

const { Given, When, Then, After } = createBdd();

const SECTION_KEY_BY_LABEL: Record<string, SettingsSectionKey> = {
    Appearance: "appearance",
    "File Upload": "fileUpload",
    "Thumbnail Generation": "thumbnails",
    "Texture Proxy": "textureProxy",
    Blender: "blender",
    "SSL Certificate": "ssl",
    WebDAV: "webdav",
    "Backup & Restore": "backup",
};

function sectionKey(label: string): SettingsSectionKey {
    const key = SECTION_KEY_BY_LABEL[label];
    if (!key) {
        throw new Error(`Unknown settings section label: "${label}"`);
    }
    return key;
}

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
    // The button lives inside the Thumbnail Generation section detail —
    // openSection() first, then click without accepting the modal.
    await settingsPage.openRegenerateAllConfirmation();
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

// ── Grid + navigation ─────────────────────────────────────────────

Then("the settings grid should be visible", async ({ page }) => {
    const settingsPage = new SettingsPage(page);
    const onGrid = await settingsPage.isOnGrid();
    expect(onGrid).toBe(true);
});

Then(
    "the grid should show the following section cards:",
    async (
        { page },
        // playwright-bdd's data tables expose raw() => string[][]
        dataTable: { raw: () => string[][] },
    ) => {
        const settingsPage = new SettingsPage(page);
        const expectedLabels = dataTable.raw().map((row) => row[0].trim());
        const actualLabels = await settingsPage.getAllCardLabels();
        for (const expected of expectedLabels) {
            expect(actualLabels, `card "${expected}" missing`).toContain(
                expected,
            );
        }
    },
);

When(
    "I open the {string} section card",
    async ({ page }, label: string) => {
        const settingsPage = new SettingsPage(page);
        await settingsPage.openSection(sectionKey(label));
    },
);

Then(
    "I should be in the {string} section",
    async ({ page }, label: string) => {
        const settingsPage = new SettingsPage(page);
        const inSection = await settingsPage.isInSection(sectionKey(label));
        expect(inSection).toBe(true);
    },
);

When("I click the back button", async ({ page }) => {
    const settingsPage = new SettingsPage(page);
    await settingsPage.clickBack();
});

When("I click discard", async ({ page }) => {
    const settingsPage = new SettingsPage(page);
    await settingsPage.discard();
});

Then("the save button should be visible", async ({ page }) => {
    const settingsPage = new SettingsPage(page);
    const visible = await settingsPage.isSaveButtonVisible();
    expect(visible).toBe(true);
});

// ── Tab-switch persistence ────────────────────────────────────────

// Use clickTab (which clicks the existing tab in the dock bar) instead of
// navigateToTab — navigateToTab calls navigateToAppClean which wipes
// localStorage, defeating the per-tab UI-state persistence we're testing.

When("I switch to the model list tab", async ({ page }) => {
    const { clickTab } = await import("../helpers/navigation-helper");
    await clickTab(page, "modelList");
});

When("I return to the settings tab", async ({ page }) => {
    const { clickTab } = await import("../helpers/navigation-helper");
    await clickTab(page, "settings");
    const settingsPage = new SettingsPage(page);
    await settingsPage.waitForLoaded();
});

// ── Search ────────────────────────────────────────────────────────

When(
    "I search settings for {string}",
    async ({ page }, query: string) => {
        const settingsPage = new SettingsPage(page);
        await settingsPage.searchFor(query);
    },
);

When("I click the first search result", async ({ page }) => {
    const settingsPage = new SettingsPage(page);
    await settingsPage.clickFirstSearchResult();
});

Then("the search dropdown should be visible", async ({ page }) => {
    const settingsPage = new SettingsPage(page);
    const visible = await settingsPage.isSearchDropdownVisible();
    expect(visible).toBe(true);
});

Then(
    "the search results should include {string}",
    async ({ page }, expectedLabel: string) => {
        const settingsPage = new SettingsPage(page);
        const labels = await settingsPage.getSearchResultLabels();
        const found = labels.some((l) => l.includes(expectedLabel));
        expect(found, `expected "${expectedLabel}" in ${JSON.stringify(labels)}`)
            .toBe(true);
    },
);

Then(
    "the dimmed card labels should include {string}",
    async ({ page }, expectedLabel: string) => {
        const settingsPage = new SettingsPage(page);
        const dimmed = await settingsPage.getDimmedCardLabels();
        expect(dimmed).toContain(expectedLabel);
    },
);

Then(
    "the dimmed card labels should not include {string}",
    async ({ page }, label: string) => {
        const settingsPage = new SettingsPage(page);
        const dimmed = await settingsPage.getDimmedCardLabels();
        expect(dimmed).not.toContain(label);
    },
);

// ── Tab-switch persistence cleanup ────────────────────────────────

// Each scenario's Background runs `navigateToAppClean` which clears
// localStorage, so the per-tab formDraft is already wiped between
// scenarios. This After hook is a belt-and-suspenders cleanup for the
// dirty-draft scenario in case a future change removes that guarantee
// or one of the assertions throws before the in-line discard step runs.
After("@settings-dirty-draft-tab-persistence", async ({ page }) => {
    try {
        const settingsPage = new SettingsPage(page);
        if (!(await settingsPage.isVisible())) return;
        // Only click discard if it's actually enabled — the test's own
        // "I click discard" step may have already cleared the dirty state,
        // in which case the button stays visible but disabled and a plain
        // click() would wait for actionability until the test timeout.
        if (!(await settingsPage.hasUnsavedChanges())) return;
        await settingsPage.discard().catch(() => {});
    } catch {
        // Best-effort cleanup; never fail the scenario from a teardown.
    }
});

// ── File upload section ───────────────────────────────────────────

When(
    "I change the max thumbnail size to {string}",
    async ({ page }, value: string) => {
        const settingsPage = new SettingsPage(page);
        await settingsPage.setMaxThumbnailSize(value);
    },
);

Then(
    "the max thumbnail size should be {string}",
    async ({ page }, expected: string) => {
        const settingsPage = new SettingsPage(page);
        const value = await settingsPage.getMaxThumbnailSize();
        expect(value).toBe(expected);
    },
);

// ── Texture proxy ─────────────────────────────────────────────────

When(
    "I change the texture proxy size to {string}",
    async ({ page }, value: string) => {
        const settingsPage = new SettingsPage(page);
        await settingsPage.setTextureProxySize(value);
    },
);

Then(
    "the texture proxy size should be {string}",
    async ({ page }, expected: string) => {
        const settingsPage = new SettingsPage(page);
        const value = await settingsPage.getTextureProxySize();
        expect(value).toBe(expected);
    },
);

// ── Duplicate name policy ─────────────────────────────────────────

When(
    "I change the duplicate name policy to {string}",
    async ({ page }, value: string) => {
        const settingsPage = new SettingsPage(page);
        await settingsPage.setDuplicateNamePolicy(value);
        // The policy is persisted immediately via /settings/:key, no Save
        // button to press — wait a tick for the request to land.
        await page.waitForTimeout(500);
    },
);

Then(
    "the duplicate name policy should be {string}",
    async ({ page }, expected: string) => {
        const settingsPage = new SettingsPage(page);
        const value = await settingsPage.getDuplicateNamePolicy();
        expect(value).toBe(expected);
    },
);

// ── Mobile bar position ───────────────────────────────────────────

When(
    "I change the mobile tab bar position to {string}",
    async ({ page }, value: string) => {
        const settingsPage = new SettingsPage(page);
        await settingsPage.setMobileBarPosition(
            value as "top" | "bottom" | "left",
        );
    },
);

Then(
    "the mobile tab bar position should be {string}",
    async ({ page }, expected: string) => {
        const settingsPage = new SettingsPage(page);
        const value = await settingsPage.getMobileBarPosition();
        expect(value).toBe(expected);
    },
);

// ── SSL ───────────────────────────────────────────────────────────

Then("the SSL certificate download link should be visible", async ({ page }) => {
    const link = page.locator('a[download][href*="modelibr-cert.crt"]');
    await expect(link).toBeVisible();
});

Then(
    "the SSL certificate download link should point at {string}",
    async ({ page }, expectedSuffix: string) => {
        const settingsPage = new SettingsPage(page);
        const href = await settingsPage.getSslCertificateDownloadHref();
        expect(href, "download href missing").toBeTruthy();
        expect(href ?? "").toContain(expectedSuffix);
    },
);
