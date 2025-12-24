import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { StageEditorPage } from "../pages/StageEditorPage";

const { Given, When, Then } = createBdd();

Given('I am on the stage list page', async ({ page }) => {
    const stageEditor = new StageEditorPage(page);
    await stageEditor.gotoList();
});

When('I create a new stage {string}', async ({ page }, name: string) => {
    const stageEditor = new StageEditorPage(page);
    await stageEditor.createStage(name);
});

Then('I should see {string} in the stage list', async ({ page }, name: string) => {
    // Already verified in createStage via waitForSelector, but can add explicit check
    const stageEditor = new StageEditorPage(page);
    // Assuming we implement a check method or reuse openStage locator logic
    await expect(page.locator(`.stage-list-item:has-text("${name}")`)).toBeVisible();
});

When('I open the stage {string}', async ({ page }, name: string) => {
    const stageEditor = new StageEditorPage(page);
    await stageEditor.openStage(name);
});

Then('I should see the stage editor canvas', async ({ page }) => {
    const stageEditor = new StageEditorPage(page);
    await expect(page.locator('.scene-editor-canvas')).toBeVisible();
});

When('I add a {string} from the component library', async ({ page }, componentName: string) => {
    const stageEditor = new StageEditorPage(page);
    await stageEditor.addComponent(componentName);
});

Then('I should see {string} in the stage hierarchy', async ({ page }, name: string) => {
    const stageEditor = new StageEditorPage(page);
    await stageEditor.expectHierarchyItem(name);
});

When('I select {string} in the hierarchy', async ({ page }, name: string) => {
    // Click item in hierarchy
    await page.locator(`.stage-hierarchy-item:has-text("${name}")`).click();
});

When('I change the {string} property to {string}', async ({ page }, propertyName: string, value: string) => {
    // Assume property panel has inputs by label
    await page.getByLabel(propertyName).fill(value);
});

Then('the {string} property should be {string}', async ({ page }, propertyName: string, value: string) => {
    await expect(page.getByLabel(propertyName)).toHaveValue(value);
});
