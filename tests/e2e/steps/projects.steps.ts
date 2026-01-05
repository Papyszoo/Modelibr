import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { sharedState } from "../fixtures/shared-state";
import { ProjectsPage } from "../pages/ProjectsPage";

const { Given, When, Then } = createBdd();

// Navigation steps
Given("I am on the project list page", async ({ page }) => {
    const projectsPage = new ProjectsPage(page);
    await projectsPage.navigateToProjectList();
    console.log("[Navigation] On project list page");
});

Given("I navigate to the project list", async ({ page }) => {
    const projectsPage = new ProjectsPage(page);
    await projectsPage.navigateToProjectList();
    console.log("[Navigation] Navigated to Project List");
});

Given("I am on the project viewer for {string}", async ({ page }, projectName: string) => {
    const project = sharedState.getProject(projectName);
    
    if (!project) {
        throw new Error(`Project "${projectName}" not found in shared state`);
    }
    
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3002";
    await page.goto(`${baseUrl}/?leftTabs=project-${project.id}&activeLeft=project-${project.id}`);
    await page.waitForLoadState("networkidle");
    console.log(`[Navigation] Opened project viewer for "${projectName}" (ID: ${project.id})`);
});

// Project existence checks
Given("the project {string} exists", async ({ page }, projectName: string) => {
    if (!sharedState.hasProject(projectName)) {
        throw new Error(`Project "${projectName}" not found in shared state. Create it first.`);
    }
    console.log(`[SharedState] Verified project exists: ${projectName}`);
});

// Create project steps
When(
    "I create a project named {string} with description {string}",
    async ({ page }, name: string, description: string) => {
        const projectsPage = new ProjectsPage(page);
        const projectInfo = await projectsPage.createProject(name, description);
        sharedState.saveProject(name, projectInfo);
        console.log(`[Action] Created and stored project "${name}"`);
    }
);

When(
    "I create a project named {string} without description",
    async ({ page }, name: string) => {
        const projectsPage = new ProjectsPage(page);
        const projectInfo = await projectsPage.createProject(name);
        sharedState.saveProject(name, projectInfo);
        console.log(`[Action] Created and stored project "${name}" (no description)`);
    }
);

// Open project
When("I open the project {string}", async ({ page }, projectName: string) => {
    const projectsPage = new ProjectsPage(page);
    await projectsPage.openProject(projectName);
    console.log(`[Action] Opened project "${projectName}"`);
});

// Delete project
When("I delete the project {string}", async ({ page }, projectName: string) => {
    const projectsPage = new ProjectsPage(page);
    await projectsPage.deleteProject(projectName);
    console.log(`[Action] Deleted project "${projectName}"`);
});

// Add model to project
When(
    "I add model {string} to the project",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);
        
        if (!model) {
            throw new Error(`Model "${modelStateName}" not found in shared state`);
        }
        
        // Click "Add Model" card in project viewer
        const addModelCard = page.locator('.project-section:has-text("Models") .project-card-add').first();
        await addModelCard.waitFor({ state: 'visible', timeout: 10000 });
        await addModelCard.click();
        console.log('[Action] Clicked Add Model card');
        
        // Wait for dialog
        await page.waitForSelector('.p-dialog:has-text("Add Models to Project")', { state: 'visible', timeout: 5000 });
        console.log('[Action] Add Models dialog opened');
        
        // Find and click model item
        const modelItems = page.locator('.p-dialog div[data-pc-section="content"] > div').filter({
            hasText: model.name
        });
        
        const firstItem = modelItems.first();
        await firstItem.waitFor({ state: 'visible', timeout: 5000 });
        await firstItem.click();
        console.log(`[Action] Clicked model item: ${model.name}`);
        
        await page.waitForTimeout(300);
        const addButton = page.locator('.p-dialog-footer button:has-text("Add Selected")').first();
        await addButton.waitFor({ state: 'visible', timeout: 5000 });
        
        const buttonText = await addButton.textContent();
        console.log(`[Action] Add button text: ${buttonText}`);
        
        if (buttonText?.includes('(0)')) {
            const checkbox = firstItem.locator('input[type="checkbox"], .p-checkbox-box').first();
            await checkbox.click({ force: true });
            console.log('[Action] Clicked checkbox directly');
            await page.waitForTimeout(300);
        }
        
        await addButton.click();
        console.log('[Action] Clicked Add button');
        
        await page.waitForSelector('.p-dialog:has-text("Add Models to Project")', { state: 'hidden', timeout: 10000 });
        console.log('[Action] Dialog closed');
        
        await page.waitForTimeout(500);
        console.log(`[Action] Added model "${model.name}" to project`);
    }
);

// Remove model from project
When(
    "I remove model {string} from the project",
    async ({ page }, modelStateName: string) => {
        const model = sharedState.getModel(modelStateName);
        
        if (!model) {
            throw new Error(`Model "${modelStateName}" not found in shared state`);
        }
        
        // Find and right-click model card
        const modelCard = page.locator(`.project-section:has-text("Models") .project-card:has-text("${model.name}")`).first();
        await modelCard.click({ button: 'right' });
        console.log('[Action] Right-clicked on model card');
        
        // Click remove option
        const removeOption = page.locator('.p-contextmenu-item:has-text("Remove from project"), .p-menuitem:has-text("Remove")').first();
        await removeOption.waitFor({ state: 'visible', timeout: 3000 });
        await removeOption.click();
        console.log('[Action] Clicked Remove from project');
        
        await page.waitForTimeout(500);
        console.log(`[Action] Removed model "${model.name}" from project`);
    }
);

// Visibility assertions
Then("the project {string} should be visible", async ({ page }, projectName: string) => {
    const projectsPage = new ProjectsPage(page);
    const isVisible = await projectsPage.isProjectVisible(projectName);
    expect(isVisible).toBe(true);
    console.log(`[UI] Project "${projectName}" is visible ✓`);
});

Then("the project {string} should not be visible", async ({ page }, projectName: string) => {
    const projectsPage = new ProjectsPage(page);
    const isVisible = await projectsPage.isProjectVisible(projectName);
    expect(isVisible).toBe(false);
    console.log(`[UI] Project "${projectName}" is not visible ✓`);
});

Then("the project {string} should be stored in shared state", async ({ page }, projectName: string) => {
    expect(sharedState.hasProject(projectName)).toBe(true);
    console.log(`[SharedState] Project "${projectName}" stored ✓`);
});

Then("the project viewer should be visible", async ({ page }) => {
    const projectViewer = page.locator('.project-viewer, .project-content').first();
    await expect(projectViewer).toBeVisible({ timeout: 10000 });
    console.log('[UI] Project viewer is visible ✓');
});

Then("I should see the project name {string}", async ({ page }, projectName: string) => {
    const nameElement = page.locator(`h2:has-text("${projectName}"), .project-title:has-text("${projectName}")`).first();
    await expect(nameElement).toBeVisible({ timeout: 5000 });
    console.log(`[UI] Project name "${projectName}" is displayed ✓`);
});

// Model in project assertions
Then("the project should contain model {string}", async ({ page }, modelStateName: string) => {
    const model = sharedState.getModel(modelStateName);
    
    if (!model) {
        throw new Error(`Model "${modelStateName}" not found in shared state`);
    }
    
    const modelCard = page.locator(`.project-section:has-text("Models") .project-card:has-text("${model.name}")`).first();
    await expect(modelCard).toBeVisible({ timeout: 5000 });
    console.log(`[UI] Project contains model "${model.name}" ✓`);
});

Then("the project should not contain model {string}", async ({ page }, modelStateName: string) => {
    const model = sharedState.getModel(modelStateName);
    
    if (!model) {
        throw new Error(`Model "${modelStateName}" not found in shared state`);
    }
    
    const modelCard = page.locator(`.project-section:has-text("Models") .project-card:has-text("${model.name}")`).first();
    await expect(modelCard).not.toBeVisible({ timeout: 5000 });
    console.log(`[UI] Project does not contain model "${model.name}" ✓`);
});

// Precondition: project contains model
Given("the project contains model {string}", async ({ page }, modelStateName: string) => {
    const model = sharedState.getModel(modelStateName);
    
    if (!model) {
        throw new Error(`Model "${modelStateName}" not found in shared state`);
    }
    
    const modelCard = page.locator(`.project-section:has-text("Models") .project-card:has-text("${model.name}")`).first();
    const isPresent = await modelCard.isVisible().catch(() => false);
    
    if (!isPresent) {
        throw new Error(`Project does not contain model "${model.name}". Add it first.`);
    }
    console.log(`[Precondition] Project contains model "${model.name}" ✓`);
});

// ============= Texture Set Association Steps =============

When(
    "I add texture set {string} to the project",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);
        
        if (!textureSet) {
            throw new Error(`Texture set "${textureSetName}" not found in shared state`);
        }
        
        // Click "Add" card in Texture Sets section
        const addCard = page.locator('.project-section:has-text("Texture Sets") .project-card-add').first();
        await addCard.waitFor({ state: 'visible', timeout: 10000 });
        await addCard.click();
        console.log('[Action] Clicked Add Texture Set card');
        
        // Wait for dialog
        await page.waitForSelector('.p-dialog:has-text("Add Texture Sets")', { state: 'visible', timeout: 5000 });
        console.log('[Action] Add Texture Sets dialog opened');
        
        // Find and click texture set item
        const textureItems = page.locator('.p-dialog div[data-pc-section="content"] > div').filter({
            hasText: textureSet.name
        });
        
        const firstItem = textureItems.first();
        await firstItem.waitFor({ state: 'visible', timeout: 5000 });
        await firstItem.click();
        console.log(`[Action] Clicked texture set item: ${textureSet.name}`);
        
        await page.waitForTimeout(300);
        const addButton = page.locator('.p-dialog-footer button:has-text("Add Selected")').first();
        await addButton.waitFor({ state: 'visible', timeout: 5000 });
        
        const buttonText = await addButton.textContent();
        console.log(`[Action] Add button text: ${buttonText}`);
        
        if (buttonText?.includes('(0)')) {
            const checkbox = firstItem.locator('input[type="checkbox"], .p-checkbox-box').first();
            await checkbox.click({ force: true });
            console.log('[Action] Clicked checkbox directly');
            await page.waitForTimeout(300);
        }
        
        await addButton.click();
        console.log('[Action] Clicked Add button');
        
        await page.waitForSelector('.p-dialog:has-text("Add Texture Sets")', { state: 'hidden', timeout: 10000 });
        console.log('[Action] Dialog closed');
        
        await page.waitForTimeout(500);
        console.log(`[Action] Added texture set "${textureSet.name}" to project`);
    }
);

When(
    "I remove texture set {string} from the project",
    async ({ page }, textureSetName: string) => {
        const textureSet = sharedState.getTextureSet(textureSetName);
        
        if (!textureSet) {
            throw new Error(`Texture set "${textureSetName}" not found in shared state`);
        }
        
        // Find and right-click texture set card
        const textureCard = page.locator(`.project-section:has-text("Texture Sets") .project-card:has-text("${textureSet.name}")`).first();
        await textureCard.click({ button: 'right' });
        console.log('[Action] Right-clicked on texture set card');
        
        // Click remove option
        const removeOption = page.locator('.p-contextmenu-item:has-text("Remove from project"), .p-menuitem:has-text("Remove")').first();
        await removeOption.waitFor({ state: 'visible', timeout: 3000 });
        await removeOption.click();
        console.log('[Action] Clicked Remove from project');
        
        await page.waitForTimeout(500);
        console.log(`[Action] Removed texture set "${textureSet.name}" from project`);
    }
);

// Texture set in project assertions
Then("the project should contain texture set {string}", async ({ page }, textureSetName: string) => {
    const textureSet = sharedState.getTextureSet(textureSetName);
    
    if (!textureSet) {
        throw new Error(`Texture set "${textureSetName}" not found in shared state`);
    }
    
    const textureCard = page.locator(`.project-section:has-text("Texture Sets") .project-card:has-text("${textureSet.name}")`).first();
    await expect(textureCard).toBeVisible({ timeout: 5000 });
    console.log(`[UI] Project contains texture set "${textureSet.name}" ✓`);
});

Then("the project should not contain texture set {string}", async ({ page }, textureSetName: string) => {
    const textureSet = sharedState.getTextureSet(textureSetName);
    
    if (!textureSet) {
        throw new Error(`Texture set "${textureSetName}" not found in shared state`);
    }
    
    const textureCard = page.locator(`.project-section:has-text("Texture Sets") .project-card:has-text("${textureSet.name}")`).first();
    await expect(textureCard).not.toBeVisible({ timeout: 5000 });
    console.log(`[UI] Project does not contain texture set "${textureSet.name}" ✓`);
});

// Precondition: project contains texture set
Given("the project contains texture set {string}", async ({ page }, textureSetName: string) => {
    const textureSet = sharedState.getTextureSet(textureSetName);
    
    if (!textureSet) {
        throw new Error(`Texture set "${textureSetName}" not found in shared state`);
    }
    
    const textureCard = page.locator(`.project-section:has-text("Texture Sets") .project-card:has-text("${textureSet.name}")`).first();
    const isPresent = await textureCard.isVisible().catch(() => false);
    
    if (!isPresent) {
        throw new Error(`Project does not contain texture set "${textureSet.name}". Add it first.`);
    }
    console.log(`[Precondition] Project contains texture set "${textureSet.name}" ✓`);
});

// Texture set existence check
Given("the texture set {string} exists", async ({ page }, textureSetName: string) => {
    if (!sharedState.hasTextureSet(textureSetName)) {
        throw new Error(`Texture set "${textureSetName}" not found in shared state. Create it first.`);
    }
    console.log(`[SharedState] Verified texture set exists: ${textureSetName}`);
});

// ============= Project Sprite Association Steps =============

Then("I take a screenshot of project with sprite", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/project-with-sprite.png" });
    console.log("[Screenshot] Captured project with sprite");
});

Then("I take a screenshot of project after sprite removed", async ({ page }) => {
    await page.screenshot({ path: "test-results/screenshots/project-sprite-removed.png" });
    console.log("[Screenshot] Captured project after sprite removed");
});

Then("the project sprite count should be {int}", async ({ page }, expectedCount: number) => {
    // Check sprite count in project stats
    const statSpan = page.locator('.project-stats span:has-text("sprite")');
    const text = await statSpan.textContent() || "0";
    const count = parseInt(text.match(/\d+/)?.[0] || "0", 10);
    expect(count).toBe(expectedCount);
    console.log(`[UI] Project sprite count is ${count} ✓`);
});


Given("the project has at least {int} sprite", async ({ page }, minCount: number) => {
    const statSpan = page.locator('.project-stats span:has-text("sprite")');
    const text = await statSpan.textContent() || "0";
    const count = parseInt(text.match(/\d+/)?.[0] || "0", 10);
    if (count < minCount) {
        throw new Error(`Project has only ${count} sprites, but at least ${minCount} required`);
    }
    console.log(`[Precondition] Project has ${count} sprite(s) ✓`);
});

When("I remove the first sprite from the project", async ({ page }) => {
    // Right-click on first sprite card to open context menu
    const spriteCard = page.locator('.project-section:has(h3:has-text("Sprite")) .project-card:not(.project-card-add)').first();
    await spriteCard.click({ button: "right" });
    await page.waitForTimeout(300);
    
    // Click Remove from project option
    const removeOption = page.locator('.p-contextmenu .p-menuitem:has-text("Remove")');
    await removeOption.click();
    await page.waitForTimeout(500);
    console.log("[Action] Removed first sprite from project");
});
