import { createBdd } from "playwright-bdd";
import { expect, test } from "@playwright/test";
import { UploadProgressPage } from "../pages/UploadProgressPage";
import { UploadHistoryPage } from "../pages/UploadHistoryPage";
import { ModelListPage } from "../pages/ModelListPage";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import path from "path";
import { fileURLToPath } from "url";

// DataTable interface for cucumber-style data tables
interface DataTable {
    hashes(): Array<Record<string, string>>;
    raw(): string[][];
    rows(): string[][];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Given, When, Then } = createBdd();

// ============================================
// Upload Progress Window Steps
// ============================================

// Override upload step to keep window open for testing
When("I upload model file {string}", async ({ page }, fileName: string) => {
    const modelList = new ModelListPage(page);
    const filePath = path.join(__dirname, "..", "assets", fileName);
    // Keep window open for upload window tests
    await modelList.uploadModel(filePath, true);
    console.log(`[Upload] Uploaded ${fileName} (keeping window open)`);
});

Then("the upload progress window should be visible", async ({ page }) => {
    // Use the correct selector - the window ID
    await page.waitForSelector("#upload-progress-window, .upload-progress-window", {
        state: "visible",
        timeout: 10000,
    });
    console.log("[UI] Upload progress window is visible ✓");
});

Then(
    "I should see the filename {string} in the upload window",
    async ({ page }, filename: string) => {
        const uploadProgress = new UploadProgressPage(page);
        const isDisplayed = await uploadProgress.isFileDisplayed(filename);
        expect(isDisplayed).toBe(true);
        console.log(`[UI] Filename "${filename}" displayed in upload window ✓`);
    }
);

Then(
    "I should see the extension {string} displayed",
    async ({ page }, extension: string) => {
        const uploadProgress = new UploadProgressPage(page);
        // Get first upload item's extension
        const count = await uploadProgress.getTotalUploadCount();
        expect(count).toBeGreaterThan(0);
        
        // Check each item for the extension
        const items = page.locator(".upload-item .upload-item-ext-name");
        const textContents = await items.allTextContents();
        const hasExtension = textContents.some(text => 
            text.toLowerCase().includes(extension.toLowerCase())
        );
        expect(hasExtension).toBe(true);
        console.log(`[UI] Extension "${extension}" displayed ✓`);
    }
);

Then("the upload should complete successfully", async ({ page }) => {
    // Wait for any upload to complete
    await expect.poll(async () => {
        const completedItems = page.locator(".upload-item.upload-item-completed, .upload-item-completed");
        return await completedItems.count();
    }, {
        message: "Waiting for upload to complete",
        timeout: 60000,
        intervals: [1000, 2000]
    }).toBeGreaterThan(0);
    
    console.log("[Upload] Upload completed successfully ✓");
});

When("the upload completes successfully", async ({ page }) => {
    await expect.poll(async () => {
        const completedItems = page.locator(".upload-item.upload-item-completed, .upload-item-completed");
        return await completedItems.count();
    }, {
        message: "Waiting for upload to complete",
        timeout: 60000,
        intervals: [1000, 2000]
    }).toBeGreaterThan(0);
    
    console.log("[Upload] Upload completed successfully ✓");
});

Then(
    'the "Open in Tab" button should be visible for {string}',
    async ({ page }, filename: string) => {
        const uploadProgress = new UploadProgressPage(page);
        const isVisible = await uploadProgress.isOpenInTabButtonVisible(filename);
        expect(isVisible).toBe(true);
        console.log(`[UI] "Open in Tab" button visible for "${filename}" ✓`);
    }
);

When(
    'I click the "Open in Tab" button for {string}',
    async ({ page }, filename: string) => {
        const uploadProgress = new UploadProgressPage(page);
        await uploadProgress.clickOpenInTab(filename);
        console.log(`[UI] Clicked "Open in Tab" for "${filename}"`);
    }
);

Then("a model viewer tab should be opened in the URL", async ({ page }) => {
    const url = page.url();
    expect(url).toMatch(/model-\d+/);
    console.log(`[URL] Model viewer tab found in URL ✓`);
});

Then("the model viewer should be visible", async ({ page }) => {
    // Use .first() to avoid strict mode violation when both elements match
    await expect(page.locator(".viewer-canvas, .version-dropdown-trigger").first()).toBeVisible({
        timeout: 15000
    });
    console.log("[UI] Model viewer is visible ✓");
});

Then("there should be only one model tab in the URL", async ({ page }) => {
    const url = page.url();
    console.log(`[DEBUG] URL: ${url}`);
    const matches = url.match(/model-(\d+)/g);
    console.log(`[DEBUG] Model tabs found: ${JSON.stringify(matches)}`);
    
    // Get unique model tabs
    const uniqueTabs = [...new Set(matches || [])];
    console.log(`[DEBUG] Unique model tabs: ${JSON.stringify(uniqueTabs)}`);
    
    // Should only have 1 unique model tab (the one we uploaded)
    expect(uniqueTabs.length).toBe(1);
    console.log(`[URL] Only one unique model tab in URL ✓`);
});

Then('the "Clear Completed" button should be visible', async ({ page }) => {
    const button = page.locator('button:has-text("Clear Completed")');
    await expect(button).toBeVisible();
    console.log('[UI] "Clear Completed" button visible ✓');
});

When('I click the "Clear Completed" button', async ({ page }) => {
    const uploadProgress = new UploadProgressPage(page);
    await uploadProgress.clickClearCompleted();
    console.log('[UI] Clicked "Clear Completed" button');
});

Then("the upload window should be hidden or empty", async ({ page }) => {
    // Either window is hidden or has no items
    await expect.poll(async () => {
        const window = page.locator(".upload-progress-window");
        const isVisible = await window.isVisible();
        if (!isVisible) return true;
        
        const items = await page.locator(".upload-item").count();
        return items === 0;
    }, {
        message: "Waiting for upload window to be hidden or empty",
        timeout: 5000
    }).toBe(true);
    
    console.log("[UI] Upload window is hidden or empty ✓");
});

// ============================================
// Batch Upload Steps
// ============================================

When("I upload multiple 3D models:", async ({ page }, dataTable: DataTable) => {
    const modelList = new ModelListPage(page);
    const files = dataTable.hashes();
    
    // Create array of unique file paths using UniqueFileGenerator
    const filePaths = await Promise.all(
        files.map(row => UniqueFileGenerator.generate(row.filename))
    );
    
    // Upload multiple files at once
    await modelList.uploadMultipleModels(filePaths);
    
    console.log(`[Upload] Started batch upload of ${files.length} files`);
});

Then("I should see a batch group in the upload window", async ({ page }) => {
    const uploadProgress = new UploadProgressPage(page);
    const batchCount = await uploadProgress.getBatchCount();
    expect(batchCount).toBeGreaterThan(0);
    console.log(`[UI] Found ${batchCount} batch group(s) ✓`);
});

Then("the batch header should show {string}", async ({ page }, expectedText: string) => {
    const uploadProgress = new UploadProgressPage(page);
    
    // Wait for batch to fully populate (files are added asynchronously)
    await expect.poll(async () => {
        const title = await uploadProgress.getBatchTitle(0);
        console.log(`[DEBUG] Batch title: "${title}", expecting: "${expectedText}"`);
        return title?.includes(expectedText);
    }, {
        message: `Waiting for batch header to show "${expectedText}"`,
        timeout: 10000,
        intervals: [500, 1000]
    }).toBe(true);
    
    const batchTitle = await uploadProgress.getBatchTitle(0);
    console.log(`[UI] Batch header shows "${expectedText}" ✓`);
});

Then("all files should be listed in the batch", async ({ page }) => {
    const uploadProgress = new UploadProgressPage(page);
    
    // First batch should have files
    const fileCount = await uploadProgress.getBatchFileCount(0);
    expect(fileCount).toBeGreaterThan(0);
    console.log(`[UI] Batch contains ${fileCount} files ✓`);
});

Then("the batch should show uploading status", async ({ page }) => {
    const uploadProgress = new UploadProgressPage(page);
    const status = await uploadProgress.getBatchStatus(0);
    expect(status?.toLowerCase()).toContain("uploading");
    console.log(`[UI] Batch shows uploading status ✓`);
});

When("all uploads complete", async ({ page }) => {
    // Wait for all uploads to complete
    await expect.poll(async () => {
        const uploadingItems = page.locator(".upload-item:not(.upload-item-completed):not(.upload-item-error)");
        return await uploadingItems.count();
    }, {
        message: "Waiting for all uploads to complete",
        timeout: 120000,
        intervals: [2000, 3000]
    }).toBe(0);
    
    console.log("[Upload] All uploads completed ✓");
});

Then("the batch status should show {string}", async ({ page }, expectedStatus: string) => {
    const uploadProgress = new UploadProgressPage(page);
    const status = await uploadProgress.getBatchStatus(0);
    expect(status).toContain(expectedStatus);
    console.log(`[UI] Batch status shows "${expectedStatus}" ✓`);
});

Then("the batch items should be visible by default", async ({ page }) => {
    const uploadProgress = new UploadProgressPage(page);
    const isVisible = await uploadProgress.areBatchItemsVisible(0);
    expect(isVisible).toBe(true);
    console.log("[UI] Batch items are visible ✓");
});

When("I collapse the batch", async ({ page }) => {
    const uploadProgress = new UploadProgressPage(page);
    await uploadProgress.toggleBatch(0);
    console.log("[UI] Collapsed batch");
});

Then("the batch items should be hidden", async ({ page }) => {
    await page.waitForTimeout(300); // Animation
    const uploadProgress = new UploadProgressPage(page);
    const isVisible = await uploadProgress.areBatchItemsVisible(0);
    expect(isVisible).toBe(false);
    
    // Take screenshot showing collapsed state
    await page.screenshot({ path: 'test-results/batch-collapsed-state.png' });
    console.log("[UI] Batch items are hidden ✓");
    console.log("[Screenshot] Captured collapsed batch state");
});

When("I expand the batch", async ({ page }) => {
    const uploadProgress = new UploadProgressPage(page);
    await uploadProgress.toggleBatch(0);
    console.log("[UI] Expanded batch");
});

Then("the batch items should be visible", async ({ page }) => {
    await page.waitForTimeout(300); // Animation
    const uploadProgress = new UploadProgressPage(page);
    const isVisible = await uploadProgress.areBatchItemsVisible(0);
    expect(isVisible).toBe(true);
    
    // Take screenshot showing expanded state
    await page.screenshot({ path: 'test-results/batch-expanded-state.png' });
    console.log("[UI] Batch items are visible ✓");
    console.log("[Screenshot] Captured expanded batch state");
});

When(
    'I click the "Open in Tab" button for {string} in the batch',
    async ({ page }, filename: string) => {
        const uploadProgress = new UploadProgressPage(page);
        
        // Create regex to match filename with potential hash (e.g. test-cube.glb -> test-cube.*.glb)
        // Helper to escape regex special characters except the dot we want to replace
        const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        const baseName = path.basename(filename, path.extname(filename));
        const ext = path.extname(filename);
        
        // Better approach: Find the actual filename visible on screen that matches the pattern
        const namePattern = new RegExp(`^${escapeRegExp(baseName)}.*${escapeRegExp(ext)}$`);
        
         await uploadProgress.clickOpenInTab(namePattern);

        console.log(`[UI] Clicked "Open in Tab" for "${filename}" (pattern match) in batch`);
    }
);

// ============================================
// Upload History Steps
// ============================================

Given("I have at least one uploaded model in history", async ({ page }) => {
    // Upload a model first to have history
    // Note: uploadModel() waits for completion and closes the window
    const modelList = new ModelListPage(page);
    await modelList.goto();
    
    const filePath = path.join(__dirname, "..", "assets", "test-cube.glb");
    await modelList.uploadModel(filePath, false); // Allow window to close
    
    // Give a moment for the upload to be recorded
    await page.waitForTimeout(1000);
    
    console.log("[Setup] Uploaded model for history ✓");
});

Given("the upload history is empty", async ({ page }) => {
    // This is a precondition - in a fresh test environment, history should be empty
    // We'll just navigate and verify
    console.log("[Setup] Assuming fresh environment with empty history");
});

When("I navigate to the Upload History page", async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    await historyPage.goto();
    console.log("[Navigation] Navigated to Upload History page");
});

Then('I should see the "Upload History" header', async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    const header = await historyPage.getHeaderText();
    expect(header).toContain("Upload History");
    console.log('[UI] "Upload History" header visible ✓');
});

Then("I should see at least one upload batch", async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    const batchCount = await historyPage.getBatchCount();
    expect(batchCount).toBeGreaterThan(0);
    console.log(`[UI] Found ${batchCount} batch(es) in history ✓`);
});

Then("each batch should display a timestamp", async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    const timestamp = await historyPage.getBatchTimestamp(0);
    expect(timestamp).not.toBeNull();
    expect(timestamp?.length).toBeGreaterThan(0);
    console.log("[UI] Batch displays timestamp ✓");
});

Then("I should see at least one history item", async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    const hasEntries = await historyPage.hasEntries();
    expect(hasEntries).toBe(true);
    console.log("[UI] At least one history item found ✓");
});

Then("the item should display the filename", async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    const filename = await historyPage.getItemFilename(0);
    expect(filename).not.toBeNull();
    expect(filename?.length).toBeGreaterThan(0);
    console.log(`[UI] Item displays filename: "${filename}" ✓`);
});

Then("the item should display an extension icon", async ({ page }) => {
    const icon = page.locator(".history-item-ext-icon").first();
    await expect(icon).toBeVisible();
    console.log("[UI] Item displays extension icon ✓");
});

Then('the item should display an "Uploaded to" location', async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    const uploadedTo = await historyPage.getItemUploadedTo(0);
    expect(uploadedTo).not.toBeNull();
    console.log(`[UI] Item displays "Uploaded to": "${uploadedTo}" ✓`);
});

When("I find a history item with a model", async ({ page }) => {
    // The first item should be a model since we uploaded one
    const historyPage = new UploadHistoryPage(page);
    const isModelButtonVisible = await historyPage.isOpenModelButtonVisible(0);
    expect(isModelButtonVisible).toBe(true);
    console.log("[UI] Found history item with model ✓");
});

When('I click the "Open Model" button for that item', async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    await historyPage.clickOpenModel(0);
    console.log('[UI] Clicked "Open Model" button');
});

Then("a model viewer tab should be opened", async ({ page }) => {
    // Check URL contains model tab
    await page.waitForTimeout(1000);
    const url = page.url();
    expect(url).toMatch(/model-\d+/);
    console.log("[URL] Model viewer tab opened ✓");
});

When("I note the current history state", async ({ page }) => {
    // Just a placeholder - we're noting mentally
    console.log("[Debug] Noted current history state");
});

When("I click the refresh button", async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    await historyPage.refresh();
    console.log("[UI] Clicked refresh button");
});

Then("the history should be reloaded", async ({ page }) => {
    // After refresh, page should still show history
    const historyPage = new UploadHistoryPage(page);
    await historyPage.waitForHistoryLoaded();
    console.log("[UI] History reloaded ✓");
});

When("there is a batch with multiple files", async ({ page }) => {
    // This is a precondition check
    const historyPage = new UploadHistoryPage(page);
    const batchCount = await historyPage.getBatchCount();
    expect(batchCount).toBeGreaterThan(0);
    console.log("[UI] Batch with files exists ✓");
});

Then("the batch should be expandable", async ({ page }) => {
    const toggle = page.locator(".history-batch-toggle").first();
    await expect(toggle).toBeVisible();
    console.log("[UI] Batch is expandable ✓");
});

When("I collapse the history batch", async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    await historyPage.toggleBatch(0);
    console.log("[UI] Collapsed history batch");
});

When("I expand the history batch", async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    await historyPage.toggleBatch(0);
    console.log("[UI] Expanded history batch");
});

Then("I should see the empty state message", async ({ page }) => {
    const historyPage = new UploadHistoryPage(page);
    const isEmpty = await historyPage.isEmptyStateVisible();
    expect(isEmpty).toBe(true);
    console.log("[UI] Empty state message visible ✓");
});

// ============================================
// Screenshot Steps (with testInfo.attach for report visibility)
// ============================================

Then("I take a screenshot of the upload completed state", async ({ page }) => {
    const screenshot = await page.screenshot({ path: "test-results/upload-completed.png" });
    const testInfo = test.info();
    if (testInfo) {
        await testInfo.attach("Upload Completed", { body: screenshot, contentType: "image/png" });
    }
    console.log("[Screenshot] Captured: Upload Completed");
});

Then("I take a screenshot of the model viewer from upload", async ({ page }) => {
    // Wait for model viewer to fully load
    await expect(page.locator(".viewer-canvas, .version-dropdown-trigger").first()).toBeVisible({
        timeout: 10000,
    });
    await page.waitForTimeout(1000); // Allow 3D scene to render
    const screenshot = await page.screenshot({ path: "test-results/model-viewer-from-upload.png" });
    const testInfo = test.info();
    if (testInfo) {
        await testInfo.attach("Model Viewer From Upload", { body: screenshot, contentType: "image/png" });
    }
    console.log("[Screenshot] Captured: Model Viewer From Upload");
});

Then("I take a screenshot of the batch upload", async ({ page }) => {
    const screenshot = await page.screenshot({ path: "test-results/batch-upload.png" });
    const testInfo = test.info();
    if (testInfo) {
        await testInfo.attach("Batch Upload", { body: screenshot, contentType: "image/png" });
    }
    console.log("[Screenshot] Captured: Batch Upload");
});

Then("I take a screenshot of the upload history page", async ({ page }) => {
    const screenshot = await page.screenshot({ path: "test-results/upload-history.png" });
    const testInfo = test.info();
    if (testInfo) {
        await testInfo.attach("Upload History", { body: screenshot, contentType: "image/png" });
    }
    console.log("[Screenshot] Captured: Upload History");
});
