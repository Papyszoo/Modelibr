import { createBdd } from "playwright-bdd";
import { expect, Page } from "@playwright/test";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { ApiHelper } from "../helpers/api-helper";
import { ProjectsPage } from "../pages/ProjectsPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";
const apiHelper = new ApiHelper(API_BASE);

function getProjectThumbnailFileId(
    page: Page,
    projectName: string,
): number | null {
    return (
        getScenarioState(page).getCustom<number>(
            `projectThumbnailFileId:${projectName}`,
        ) ?? null
    );
}

/**
 * Resolves a model from shared state, falling back to DB lookup.
 * This handles the case where setup project created the model
 * but ScenarioState doesn't persist across Playwright projects.
 */
async function resolveModel(page: Page, modelStateName: string) {
    let model = getScenarioState(page).getModel(modelStateName);
    if (model) return model;

    console.log(
        `[AutoProvision] Model "${modelStateName}" not in shared state, looking up in DB...`,
    );
    const { DbHelper } = await import("../fixtures/db-helper");
    const db = new DbHelper();
    try {
        const result = await db.query(
            `SELECT m."Id", m."Name", mv."Id" as "VersionId"
             FROM "Models" m
             JOIN "ModelVersions" mv ON mv."ModelId" = m."Id"
             WHERE m."DeletedAt" IS NULL
             ORDER BY m."CreatedAt" DESC
             LIMIT 1`,
        );
        if (result.rows.length > 0) {
            model = {
                id: result.rows[0].Id,
                name: result.rows[0].Name,
                versionId: result.rows[0].VersionId,
            };
            getScenarioState(page).saveModel(modelStateName, model);
            console.log(
                `[AutoProvision] Found model "${model.name}" (ID: ${model.id}) in DB for "${modelStateName}"`,
            );
            return model;
        }
    } finally {
        await db.close();
    }
    return null;
}

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

Given(
    "I am on the project viewer for {string}",
    async ({ page }, projectName: string) => {
        const project = getScenarioState(page).getProject(projectName);

        if (!project) {
            throw new Error(
                `Project "${projectName}" not found in shared state`,
            );
        }

        // Navigate to project list with retry logic for lazy chunk loading
        const projectsPage = new ProjectsPage(page);
        await projectsPage.navigateToProjectList();

        // Find and double-click the project card to open viewer
        const projectCard = page.locator(
            `.project-grid-card[data-project-id="${project.id}"]`,
        );
        await projectCard.waitFor({ state: "visible", timeout: 30000 });
        await projectCard.dblclick();

        // Wait for project viewer content to fully load
        await page
            .locator(".container-viewer")
            .first()
            .waitFor({ state: "visible", timeout: 15000 });

        console.log(
            `[Navigation] Opened project viewer for "${projectName}" (ID: ${project.id})`,
        );
    },
);

// Project existence checks
Given("the project {string} exists", async ({ page }, projectName: string) => {
    if (!getScenarioState(page).hasProject(projectName)) {
        // Self-provision: create or find the project via API
        console.log(
            `[AutoProvision] Project "${projectName}" not in shared state, creating via API...`,
        );
        const API = process.env.API_BASE_URL || "http://localhost:8090";
        const response = await page.request.post(`${API}/projects`, {
            data: { name: projectName, description: "" },
        });
        if (response.ok()) {
            const data = await response.json();
            getScenarioState(page).saveProject(projectName, {
                id: data.id,
                name: projectName,
            });
            console.log(
                `[AutoProvision] Created project "${projectName}" (ID: ${data.id})`,
            );
        } else {
            // Project likely already exists (created by setup or another worker)
            const listResp = await page.request.get(`${API}/projects`);
            const projectsResp = await listResp.json();
            const projectList = Array.isArray(projectsResp)
                ? projectsResp
                : projectsResp.projects || projectsResp.items || [];
            const existing = projectList.find(
                (p: any) => p.name === projectName,
            );
            if (!existing) {
                throw new Error(
                    `Failed to auto-provision project "${projectName}": ${response.status()} and not found via GET`,
                );
            }
            getScenarioState(page).saveProject(projectName, {
                id: existing.id,
                name: projectName,
            });
            console.log(
                `[AutoProvision] Found existing project "${projectName}" (ID: ${existing.id})`,
            );
        }
    }
    console.log(`[SharedState] Verified project exists: ${projectName}`);
});

// Create project steps
When(
    "I create a project named {string} with description {string}",
    async ({ page }, name: string, description: string) => {
        const projectsPage = new ProjectsPage(page);
        const projectInfo = await projectsPage.createProject(name, description);
        getScenarioState(page).saveProject(name, projectInfo);
        console.log(`[Action] Created and stored project "${name}"`);
    },
);

When(
    "I create a project named {string} without description",
    async ({ page }, name: string) => {
        const projectsPage = new ProjectsPage(page);
        const projectInfo = await projectsPage.createProject(name);
        getScenarioState(page).saveProject(name, projectInfo);
        console.log(
            `[Action] Created and stored project "${name}" (no description)`,
        );
    },
);

When(
    "I create a project named {string} with description {string} and notes {string}",
    async ({ page }, name: string, description: string, notes: string) => {
        const projectsPage = new ProjectsPage(page);
        const projectInfo = await projectsPage.createProject(
            name,
            description,
            {
                notes,
            },
        );
        getScenarioState(page).saveProject(name, projectInfo);
        console.log(`[Action] Created and stored project "${name}" with notes`);
    },
);

// Open project
When("I open the project {string}", async ({ page }, projectName: string) => {
    const projectsPage = new ProjectsPage(page);
    const project = getScenarioState(page).getProject(projectName);
    await projectsPage.openProject(projectName, project?.id);
    console.log(
        `[Action] Opened project "${projectName}"${project?.id ? ` (id=${project.id})` : ""}`,
    );
});

// Delete project
When("I delete the project {string}", async ({ page }, projectName: string) => {
    const projectsPage = new ProjectsPage(page);
    const project = getScenarioState(page).getProject(projectName);
    await projectsPage.deleteProject(projectName, project?.id);
    console.log(`[Action] Deleted project "${projectName}"`);
});

When(
    "I upload the image {string} as the custom thumbnail for project {string}",
    async ({ page }, fileName: string, projectName: string) => {
        const project = getScenarioState(page).getProject(projectName);
        if (!project) {
            throw new Error(
                `Project "${projectName}" not found in shared state`,
            );
        }

        const filePath = await UniqueFileGenerator.generate(fileName);
        const { fileId } = await apiHelper.uploadFile(filePath);
        await apiHelper.setProjectCustomThumbnail(project.id, fileId);
        getScenarioState(page).setCustom(
            `projectThumbnailFileId:${projectName}`,
            fileId,
        );

        await expect
            .poll(
                async () => {
                    const response = await page.request.get(
                        `${API_BASE}/projects/${project.id}`,
                    );
                    if (!response.ok()) {
                        return "";
                    }
                    const data = await response.json();
                    return data.customThumbnailUrl ?? "";
                },
                {
                    message: `Waiting for project \"${projectName}\" thumbnail URL to update`,
                    timeout: 15000,
                    intervals: [500, 1000, 2000],
                },
            )
            .toContain(`/files/${fileId}`);

        console.log(
            `[Action] Uploaded custom thumbnail for project "${projectName}" (fileId: ${fileId})`,
        );
    },
);

// Add model to project
When(
    "I add model {string} to the project",
    async ({ page }, modelStateName: string) => {
        const model = await resolveModel(page, modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state or DB`,
            );
        }

        // Click Models tab first, then find Add Model card
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Models" })
            .click();

        const addModelCard = page.locator(".model-card-add").first();
        await addModelCard.waitFor({ state: "visible", timeout: 10000 });
        await addModelCard.click();
        console.log("[Action] Clicked Add Model card");

        // Wait for dialog  - could be "Add Models to Project" or "Add Models to Pack"
        await page.waitForSelector('.p-dialog:has-text("Add Models")', {
            state: "visible",
            timeout: 5000,
        });
        console.log("[Action] Add Models dialog opened");

        const modelName = model.name;

        // Click directly on model name text, then click its grandparent (the clickable container)
        // Use .first() because multiple models may share the same name (e.g. "test-cube")
        const modelText = page
            .locator(".p-dialog")
            .getByText(modelName, { exact: true })
            .first();
        await modelText.waitFor({ state: "visible", timeout: 5000 });

        try {
            // Click the text element's grandparent (the clickable container)
            await modelText.locator("..").locator("..").click();
            console.log(`[Action] Clicked container for model: ${modelName}`);
        } catch (e) {
            // Fallback: Click directly on the text
            await modelText.click();
            console.log(`[Action] Clicked model text: ${modelName}`);
        }

        // Wait for selection to register in the Add button
        const addButton = page
            .locator('.p-dialog-footer button:has-text("Add Selected")')
            .first();
        await expect(addButton).not.toContainText("(0)", { timeout: 5000 });

        const buttonText = await addButton.textContent();
        console.log(`[Action] Add button text: ${buttonText}`);

        await addButton.click();
        console.log("[Action] Clicked Add button");

        await page.waitForSelector('.p-dialog:has-text("Add Models")', {
            state: "hidden",
            timeout: 10000,
        });
        console.log("[Action] Dialog closed");

        // Wait for model card to appear in project after adding
        await expect(
            page.locator(`.model-card[data-model-id="${model.id}"]`),
        ).toBeVisible({ timeout: 10000 });
        console.log(`[Action] Added model "${model.name}" to project`);
    },
);

// Remove model from project
When(
    "I remove model {string} from the project",
    async ({ page }, modelStateName: string) => {
        const model = await resolveModel(page, modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state or DB`,
            );
        }

        // Click Models tab first, then find and right-click model card
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Models" })
            .click();

        const modelCard = page.locator(
            `.model-card[data-model-id="${model.id}"]`,
        );
        await modelCard.waitFor({ state: "visible", timeout: 5000 });
        await modelCard.click({ button: "right" });
        console.log("[Action] Right-clicked on model card");

        // Click remove option
        const removeOption = page
            .locator(
                '.p-contextmenu-item:has-text("Remove from project"), .p-menuitem:has-text("Remove")',
            )
            .first();
        await removeOption.waitFor({ state: "visible", timeout: 3000 });
        await removeOption.click();
        console.log("[Action] Clicked Remove from project");

        // Wait for model card to disappear after removal
        await expect(modelCard).not.toBeVisible({ timeout: 5000 });
        console.log(`[Action] Removed model "${model.name}" from project`);
    },
);

// Visibility assertions
Then(
    "the project {string} should be visible",
    async ({ page }, projectName: string) => {
        const projectsPage = new ProjectsPage(page);
        const isVisible = await projectsPage.isProjectVisible(projectName);
        expect(isVisible).toBe(true);
        console.log(`[UI] Project "${projectName}" is visible ✓`);
    },
);

Then(
    "the project {string} should not be visible",
    async ({ page }, projectName: string) => {
        const projectsPage = new ProjectsPage(page);
        // Poll for visibility since deletion may take time to propagate
        await expect
            .poll(
                async () => await projectsPage.isProjectVisible(projectName),
                {
                    message: `Waiting for project "${projectName}" to disappear`,
                    timeout: 15000,
                    intervals: [500, 1000, 2000],
                },
            )
            .toBe(false);
        console.log(`[UI] Project "${projectName}" is not visible ✓`);
    },
);

Then(
    "the project {string} should be stored in shared state",
    async ({ page }, projectName: string) => {
        expect(getScenarioState(page).hasProject(projectName)).toBe(true);
        console.log(`[SharedState] Project "${projectName}" stored ✓`);
    },
);

Then("the project viewer should be visible", async ({ page }) => {
    const projectViewer = page.locator(".container-viewer").first();
    await expect(projectViewer).toBeVisible({ timeout: 10000 });
    console.log("[UI] Project viewer is visible ✓");
});

Then(
    "I should see the project name {string}",
    async ({ page }, projectName: string) => {
        const nameElement = page
            .locator(
                `h2:has-text("${projectName}"), .project-title:has-text("${projectName}")`,
            )
            .first();
        await expect(nameElement).toBeVisible({ timeout: 5000 });
        console.log(`[UI] Project name "${projectName}" is displayed ✓`);
    },
);

Then(
    "the project {string} card should show notes {string}",
    async ({ page }, projectName: string, notes: string) => {
        const project = getScenarioState(page).getProject(projectName);
        const projectCard = new ProjectsPage(page).getProjectCard(
            projectName,
            project?.id,
        );
        await expect(projectCard).toContainText(notes, { timeout: 10000 });
        console.log(
            `[UI] Project card "${projectName}" shows notes "${notes}" ✓`,
        );
    },
);

Then(
    "the project details should show notes {string}",
    async ({ page }, notes: string) => {
        const viewer = page.locator(".container-viewer").first();
        await expect(viewer).toBeVisible({ timeout: 10000 });
        await expect(viewer.locator("#project-notes")).toHaveValue(notes, {
            timeout: 10000,
        });
        console.log(`[UI] Project details show notes "${notes}" ✓`);
    },
);

Then(
    "the project {string} card should render the uploaded custom thumbnail",
    async ({ page }, projectName: string) => {
        const project = getScenarioState(page).getProject(projectName);
        const fileId = getProjectThumbnailFileId(page, projectName);
        if (!project || fileId === null) {
            throw new Error(
                `Missing project or uploaded thumbnail state for "${projectName}"`,
            );
        }

        const projectsPage = new ProjectsPage(page);
        await projectsPage.navigateToProjectList();
        await projectsPage.assertProjectCardCustomThumbnailLoaded(
            projectName,
            fileId,
            project.id,
        );
    },
);

Then(
    "the project {string} details should render the uploaded custom thumbnail",
    async ({ page }, projectName: string) => {
        const fileId = getProjectThumbnailFileId(page, projectName);
        if (fileId === null) {
            throw new Error(
                `Missing uploaded thumbnail state for project "${projectName}"`,
            );
        }

        const projectsPage = new ProjectsPage(page);
        await projectsPage.assertProjectDetailCustomThumbnailLoaded(
            projectName,
            fileId,
        );
    },
);

// Model in project assertions
Then(
    "the project should contain model {string}",
    async ({ page }, modelStateName: string) => {
        const model = await resolveModel(page, modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state or DB`,
            );
        }

        // Click Models tab first
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Models" })
            .click();

        const modelCard = page.locator(
            `.model-card[data-model-id="${model.id}"]`,
        );
        await expect(modelCard).toBeVisible({ timeout: 5000 });
        console.log(`[UI] Project contains model "${model.name}" ✓`);
    },
);

Then(
    "the project should not contain model {string}",
    async ({ page }, modelStateName: string) => {
        const model = await resolveModel(page, modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state or DB`,
            );
        }

        // Click Models tab first
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Models" })
            .click();

        const modelCard = page.locator(
            `.model-card[data-model-id="${model.id}"]`,
        );
        await expect(modelCard).not.toBeVisible({ timeout: 5000 });
        console.log(`[UI] Project does not contain model "${model.name}" ✓`);
    },
);

// Precondition: project contains model
Given(
    "the project contains model {string}",
    async ({ page }, modelStateName: string) => {
        const model = await resolveModel(page, modelStateName);

        if (!model) {
            throw new Error(
                `Model "${modelStateName}" not found in shared state or DB`,
            );
        }

        // Click Models tab first
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Models" })
            .click();

        const modelCard = page.locator(
            `.model-card[data-model-id="${model.id}"]`,
        );
        // Wait for tab content to render, then check presence
        const isPresent = await modelCard
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false);

        if (!isPresent) {
            // Auto-provision: add the model to the project via API
            const project = getScenarioState(page).getProject("Test Project");
            if (!project) {
                throw new Error(
                    `Project "Test Project" not found in shared state. Cannot auto-add model.`,
                );
            }
            console.log(
                `[AutoProvision] Model "${model.name}" not in project, adding via API...`,
            );
            const addResp = await page.request.post(
                `${API_BASE}/projects/${project.id}/models/${model.id}`,
            );
            if (!addResp.ok()) {
                throw new Error(
                    `Failed to add model ${model.id} to project ${project.id}: ${addResp.status()}`,
                );
            }
            console.log(
                `[AutoProvision] Added model "${model.name}" (ID: ${model.id}) to project (ID: ${project.id}) via API`,
            );

            // Reload the project viewer to see the newly added model
            await page.reload();
            await page
                .locator(".container-viewer")
                .first()
                .waitFor({ state: "visible", timeout: 15000 });
            await page
                .locator(".p-tabview-nav li")
                .filter({ hasText: "Models" })
                .click();
            await modelCard.waitFor({ state: "visible", timeout: 10000 });
        }
        console.log(`[Precondition] Project contains model "${model.name}" ✓`);
    },
);

// ============= Texture Set Association Steps =============

When(
    "I add texture set {string} to the project",
    async ({ page }, textureSetName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Clean up: remove this texture set from the project if already present
        const project = getScenarioState(page).getProject("Test Project");
        if (project) {
            const projRes = await page.request.get(
                `${API_BASE}/projects/${project.id}`,
            );
            if (projRes.ok()) {
                const projData = await projRes.json();
                const existing = (projData.textureSets || []).filter(
                    (ts: any) => ts.name === textureSet.name,
                );
                for (const ts of existing) {
                    await page.request
                        .delete(
                            `${API_BASE}/projects/${project.id}/texture-sets/${ts.id}`,
                        )
                        .catch(() => {});
                    console.log(
                        `[Cleanup] Removed stale texture set "${ts.name}" (ID: ${ts.id}) from project`,
                    );
                }
                if (existing.length > 0) {
                    // Reload the project viewer to reflect changes
                    await page.reload({ waitUntil: "domcontentloaded" });
                    await page
                        .locator(".container-viewer")
                        .first()
                        .waitFor({ state: "visible", timeout: 15000 });
                }
            }
        }

        // Click Texture Sets tab first, then find Add card
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Texture Sets" })
            .click();

        const addCard = page.locator(".container-card-add").first();
        await addCard.waitFor({ state: "visible", timeout: 10000 });
        await addCard.click();
        console.log("[Action] Clicked Add Texture Set card");

        // Wait for dialog
        await page.waitForSelector('.p-dialog:has-text("Add Texture Sets")', {
            state: "visible",
            timeout: 5000,
        });
        console.log("[Action] Add Texture Sets dialog opened");

        // Find and click texture set item in the dialog grid
        const textureItems = page.locator(".p-dialog .container-card").filter({
            hasText: textureSet.name,
        });

        const firstItem = textureItems.first();
        await firstItem.waitFor({ state: "visible", timeout: 5000 });
        await firstItem.click();
        console.log(`[Action] Clicked texture set item: ${textureSet.name}`);

        // Wait for selection to register in the Add button
        const addButton = page
            .locator('.p-dialog-footer button:has-text("Add Selected")')
            .first();
        await addButton.waitFor({ state: "visible", timeout: 5000 });

        const buttonText = await addButton.textContent();
        console.log(`[Action] Add button text: ${buttonText}`);

        if (buttonText?.includes("(0)")) {
            const checkbox = firstItem
                .locator('input[type="checkbox"], .p-checkbox-box')
                .first();
            await checkbox.click({ force: true });
            console.log("[Action] Clicked checkbox directly");
            // Wait for selection count to update
            await expect(addButton).not.toContainText("(0)", { timeout: 5000 });
        }

        // Set up response interceptor before clicking Add
        const responsePromise = page.waitForResponse(
            (resp) =>
                resp.url().includes("/projects/") &&
                resp.url().includes("/texture-sets/") &&
                resp.request().method() === "POST",
            { timeout: 15000 },
        );

        await addButton.click();
        console.log("[Action] Clicked Add button");

        // Wait for the API response from the add operation
        try {
            const response = await responsePromise;
            console.log(
                `[API] Add texture set response: ${response.status()} ${response.url()}`,
            );
        } catch {
            console.log(
                "[API] No POST /projects/*/texture-sets/* response detected — add may have failed silently",
            );
        }

        await page.waitForSelector('.p-dialog:has-text("Add Texture Sets")', {
            state: "hidden",
            timeout: 10000,
        });
        console.log("[Action] Dialog closed");

        // Switch to Texture Sets tab to see the newly added card
        const textureSetTab = page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Texture Sets" });
        await textureSetTab.click();

        // Wait for the texture set card to appear (React Query refetch + render)
        const textureSetCard = page
            .locator(".container-card")
            .filter({ hasText: textureSet.name })
            .first();
        await expect(textureSetCard).toBeVisible({
            timeout: 15000,
        });
        console.log(
            `[Action] Added texture set "${textureSet.name}" to project`,
        );
    },
);

When(
    "I remove texture set {string} from the project",
    async ({ page }, textureSetName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Click Texture Sets tab first, then find and right-click texture set card
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Texture Sets" })
            .click();

        const textureCard = page.locator(
            `.container-card[data-texture-set-id="${textureSet.id}"]`,
        );
        await textureCard.waitFor({ state: "visible", timeout: 5000 });
        await textureCard.click({ button: "right" });
        console.log("[Action] Right-clicked on texture set card");

        // Click remove option
        const removeOption = page
            .locator(
                '.p-contextmenu-item:has-text("Remove from project"), .p-menuitem:has-text("Remove")',
            )
            .first();
        await removeOption.waitFor({ state: "visible", timeout: 3000 });
        await removeOption.click();
        console.log("[Action] Clicked Remove from project");

        // Wait for texture set card to disappear after removal
        await expect(textureCard).not.toBeVisible({ timeout: 5000 });
        console.log(
            `[Action] Removed texture set "${textureSet.name}" from project`,
        );
    },
);

// Texture set in project assertions
Then(
    "the project should contain texture set {string}",
    async ({ page }, textureSetName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Click Texture Sets tab first, then poll with reload until the card appears
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Texture Sets" })
            .click();

        await expect
            .poll(
                async () => {
                    const textureCard = page.locator(
                        `.container-card[data-texture-set-id="${textureSet.id}"]`,
                    );
                    return await textureCard.isVisible().catch(() => false);
                },
                {
                    message: `Waiting for texture set "${textureSet.name}" to appear in project`,
                    timeout: 10000,
                    intervals: [500, 1000, 2000],
                },
            )
            .toBe(true);
        console.log(`[UI] Project contains texture set "${textureSet.name}" ✓`);
    },
);

Then(
    "the project should not contain texture set {string}",
    async ({ page }, textureSetName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Click Texture Sets tab first
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Texture Sets" })
            .click();

        const textureCard = page.locator(
            `.container-card[data-texture-set-id="${textureSet.id}"]`,
        );
        await expect(textureCard).not.toBeVisible({ timeout: 5000 });
        console.log(
            `[UI] Project does not contain texture set "${textureSet.name}" ✓`,
        );
    },
);

// Precondition: project contains texture set
Given(
    "the project contains texture set {string}",
    async ({ page }, textureSetName: string) => {
        const textureSet = getScenarioState(page).getTextureSet(textureSetName);

        if (!textureSet) {
            throw new Error(
                `Texture set "${textureSetName}" not found in shared state`,
            );
        }

        // Click Texture Sets tab first
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Texture Sets" })
            .click();

        const textureCard = page.locator(
            `.container-card[data-texture-set-id="${textureSet.id}"]`,
        );
        // Wait for tab content to render, then check presence
        const isPresent = await textureCard
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false);

        if (!isPresent) {
            // Self-provision: add texture set to project via API
            console.log(
                `[AutoProvision] Texture set "${textureSet.name}" not in project, adding via API...`,
            );
            const currentUrl = page.url();
            // Extract project ID from shared state
            const projectMatch = currentUrl.match(/project[=/](\d+)/);
            const projectState =
                getScenarioState(page).getProject("Test Project");
            const projectId = projectState?.id || projectMatch?.[1];

            if (projectId && textureSet.id) {
                const API = process.env.API_BASE_URL || "http://localhost:8090";
                const response = await page.request.post(
                    `${API}/projects/${projectId}/texture-sets/${textureSet.id}`,
                );
                if (response.ok()) {
                    console.log(`[AutoProvision] Added texture set via API ✓`);
                    await page.reload({ waitUntil: "domcontentloaded" });
                    // Wait for page content to render after reload
                    await page
                        .locator(".container-viewer")
                        .first()
                        .waitFor({ state: "visible", timeout: 10000 });
                } else {
                    throw new Error(
                        `Failed to auto-provision texture set association: ${response.status()}`,
                    );
                }
            } else {
                throw new Error(
                    `Project does not contain texture set "${textureSet.name}". Add it first.`,
                );
            }
        }
        console.log(
            `[Precondition] Project contains texture set "${textureSet.name}" ✓`,
        );
    },
);

// Texture set existence check
Given(
    "the texture set {string} exists",
    async ({ page }, textureSetName: string) => {
        if (!getScenarioState(page).hasTextureSet(textureSetName)) {
            // Self-provision: create or find the texture set via API
            console.log(
                `[AutoProvision] Texture set "${textureSetName}" not in shared state, creating via API...`,
            );
            const API = process.env.API_BASE_URL || "http://localhost:8090";
            const response = await page.request.post(`${API}/texture-sets`, {
                data: { name: textureSetName },
            });
            if (response.ok()) {
                const data = await response.json();
                getScenarioState(page).saveTextureSet(textureSetName, {
                    id: data.id,
                    name: textureSetName,
                });
                console.log(
                    `[AutoProvision] Created texture set "${textureSetName}" (ID: ${data.id})`,
                );
            } else {
                // Texture set likely already exists — look up via GET
                const listResp = await page.request.get(`${API}/texture-sets`);
                const textureSetsResp = await listResp.json();
                const tsList = Array.isArray(textureSetsResp)
                    ? textureSetsResp
                    : textureSetsResp.textureSets ||
                      textureSetsResp.items ||
                      [];
                const existing = tsList.find(
                    (ts: any) => ts.name === textureSetName,
                );
                if (!existing) {
                    throw new Error(
                        `Failed to auto-provision texture set "${textureSetName}": ${response.status()} and not found via GET`,
                    );
                }
                getScenarioState(page).saveTextureSet(textureSetName, {
                    id: existing.id,
                    name: textureSetName,
                });
                console.log(
                    `[AutoProvision] Found existing texture set "${textureSetName}" (ID: ${existing.id})`,
                );
            }
        }
        console.log(
            `[SharedState] Verified texture set exists: ${textureSetName}`,
        );
    },
);

// ============= Project Sprite Association Steps =============

Then("I take a screenshot of project with sprite", async ({ page }) => {
    await page.screenshot({
        path: "test-results/screenshots/project-with-sprite.png",
    });
    console.log("[Screenshot] Captured project with sprite");
});

Then(
    "I take a screenshot of project after sprite removed",
    async ({ page }) => {
        await page.screenshot({
            path: "test-results/screenshots/project-sprite-removed.png",
        });
        console.log("[Screenshot] Captured project after sprite removed");
    },
);

Then(
    "the project sprite count should be {int}",
    async ({ page }, expectedCount: number) => {
        // Click Details tab to see stats
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Details" })
            .click();

        // Use retrying assertion — the count may take a moment to update
        // after a sprite is removed (React Query cache invalidation)
        const statSpan = page.locator(
            '.container-detail-assets span:has-text("sprite")',
        );
        await expect(async () => {
            await statSpan.waitFor({ state: "visible", timeout: 5000 });
            const text = (await statSpan.textContent()) || "0";
            const count = parseInt(text.match(/\d+/)?.[0] || "0", 10);
            expect(count).toBe(expectedCount);
        }).toPass({ timeout: 15000, intervals: [500, 1000, 2000] });
        console.log(`[UI] Project sprite count is ${expectedCount} ✓`);
    },
);

Given(
    "the project has at least {int} sprite",
    async ({ page }, minCount: number) => {
        // Click Details tab to see stats
        await page
            .locator(".p-tabview-nav li")
            .filter({ hasText: "Details" })
            .click();

        // Wait for Details tab content to render
        const statSpan = page.locator(
            '.container-detail-assets span:has-text("sprite")',
        );
        await statSpan.waitFor({ state: "visible", timeout: 5000 });
        const text = (await statSpan.textContent()) || "0";
        const count = parseInt(text.match(/\d+/)?.[0] || "0", 10);
        if (count < minCount) {
            throw new Error(
                `Project has only ${count} sprites, but at least ${minCount} required`,
            );
        }
        console.log(`[Precondition] Project has ${count} sprite(s) ✓`);
    },
);

When("I remove the first sprite from the project", async ({ page }) => {
    // Click Sprites tab first, then right-click on first sprite card
    await page
        .locator(".p-tabview-nav li")
        .filter({ hasText: "Sprites" })
        .click();

    const spriteCard = page
        .locator(".container-section .container-card:not(.container-card-add)")
        .first();
    await spriteCard.waitFor({ state: "visible", timeout: 5000 });
    await spriteCard.click({ button: "right" });

    // Click Remove from project option
    const removeOption = page.locator(
        '.p-contextmenu .p-menuitem:has-text("Remove")',
    );
    await removeOption.waitFor({ state: "visible", timeout: 5000 });

    // Wait for the removal API response after clicking
    const removeResponsePromise = page.waitForResponse(
        (resp) =>
            resp.url().includes("/sprites") &&
            (resp.request().method() === "DELETE" ||
                resp.request().method() === "PUT"),
        { timeout: 15000 },
    );
    await removeOption.click();
    await removeResponsePromise;

    // Wait for sprite card to disappear after removal
    await expect(spriteCard).not.toBeVisible({ timeout: 15000 });
    console.log("[Action] Removed first sprite from project");
});
